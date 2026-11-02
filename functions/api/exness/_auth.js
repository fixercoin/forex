// functions/api/exness/_auth.js
// Exness Ed25519 signed request authentication.
// Based on official docs and community SDK references.
//
// Signed headers required by Exness:
//   EXN-API-KEY, EXN-IDEMPOTENCY-KEY, EXN-TIMESTAMP,
//   EXN-SIGN-VERSION (1), EXN-DATA (base64url JSON payload),
//   EXN-SIGN (Ed25519 signature of payload bytes, base64url)
//
// Important notes from exness-sdk :
// - Timestamp tolerance is asymmetric: 0 <= server_now - signed_timestamp <= 3000ms.
//   If your clock is ahead, requests fail with AUTH_INVALID_API_KEY.
// - Prices must be normalized to instrument precision (point_digits) before
//   sending stop_loss/take_profit, or you get REQUEST_INVALID_PRICE.
// - Trading access point must be discovered per account.

/**
 * Build signed headers for an Exness API request.
 */
export async function buildExnessAuthHeaders(method, path, body, env) {
  const apiKey = env.EXNESS_API_KEY;
  const secretKey = env.EXNESS_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('EXNESS_CREDENTIALS_MISSING');
  }

  // Clock offset: Exness is strict about client clock being ahead.
  // The SDK uses clockOffsetMs to correct this . 
  // If you get AUTH_INVALID_API_KEY with timestamp tolerance errors,
  // set EXNESS_CLOCK_OFFSET_MS in your env (negative value if your clock is ahead).
  const clockOffsetMs = Number(env.EXNESS_CLOCK_OFFSET_MS || '0');
  const timestamp = Date.now() + clockOffsetMs;

  const upperMethod = method.toUpperCase();
  const idempotencyKey = upperMethod === 'GET' ? '' : generateIdempotencyKey();

  // body_hash: SHA-256 of exact request body, base64url without padding.
  // For empty body: 47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU
  let bodyHash;
  if (body && body.length > 0) {
    const bodyBytes = new TextEncoder().encode(body);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes);
    bodyHash = base64urlEncode(new Uint8Array(hashBuffer));
  } else {
    bodyHash = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
  }

  const payload = {
    api_key: apiKey,
    idempotency_key: idempotencyKey,
    timestamp: timestamp,       // JSON number, not string 
    sign_version: 1,            // JSON number
    method: upperMethod,
    path: path,                 // path with query, exactly as sent
    body_hash: bodyHash,
  };

  // Serialize once; sign these exact bytes
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  // Decode Secret Key into 32-byte Ed25519 seed
  const seed = decodeSeed(secretKey);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    seed,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'Ed25519',
    cryptoKey,
    payloadBytes
  );
  const signature = base64urlEncode(new Uint8Array(signatureBuffer));

  return {
    'EXN-API-KEY': apiKey,
    'EXN-IDEMPOTENCY-KEY': idempotencyKey,
    'EXN-TIMESTAMP': String(timestamp),
    'EXN-SIGN-VERSION': '1',
    'EXN-DATA': base64urlEncode(payloadBytes),
    'EXN-SIGN': signature,
  };
}

/**
 * Decode Secret Key into 32-byte Ed25519 seed.
 * Handles PEM (PKCS#8), base64url, hex, and raw formats.
 */
function decodeSeed(secretKey) {
  const key = secretKey.trim();

  // 1. PEM / PKCS#8 format (-----BEGIN PRIVATE KEY-----)
  if (key.includes('-----BEGIN')) {
    const b64Body = key
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');

    let derBytes;
    try {
      derBytes = Uint8Array.from(atob(b64Body), c => c.charCodeAt(0));
    } catch {
      throw new Error('EXNESS_PEM_DECODE_FAILED: Invalid base64 inside PEM');
    }

    // PKCS#8 Ed25519 private key DER:
    // SEQUENCE { INTEGER version, SEQUENCE algorithm, OCTET STRING privateKey }
    // The OCTET STRING (tag 0x04) contains a nested OCTET STRING (tag 0x04)
    // whose value is the 32-byte seed.
    // Simplified extraction: take the last 32 bytes (works for standard PKCS#8).
    if (derBytes.length >= 32) {
      return derBytes.slice(-32);
    }
    throw new Error('EXNESS_PEM_TOO_SHORT: DER length ' + derBytes.length);
  }

  // 2. Try base64url (with or without padding)
  try {
    const b64 = key.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    if (bytes.length === 32) return bytes;
  } catch {
    // fall through
  }

  // 3. Try hex (64 hex chars = 32 bytes)
  const hex = key.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length === 64) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  // 4. Raw string (unlikely, but check)
  const raw = new TextEncoder().encode(key);
  if (raw.length === 32) return raw;

  throw new Error(
    'EXNESS_SECRET_KEY_DECODE_FAILED: Could not decode Secret Key as a 32-byte ' +
    'Ed25519 seed. Got length ' + raw.length + '. ' +
    'Your key appears to be in an unsupported format. ' +
    'Check your Exness Personal Area API page for the key format.'
  );
}

/**
 * Generate a non-empty idempotency key for mutating requests.
 */
function generateIdempotencyKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

/**
 * Base64url encode without = padding.
 */
function base64urlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Wrapper: fetch with Exness signed headers.
 */
export async function exnessFetch(url, method, bodyObj, env) {
  const urlObj = new URL(url);
  const pathWithQuery = urlObj.pathname + urlObj.search;
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;

  const authHeaders = await buildExnessAuthHeaders(
    method,
    pathWithQuery,
    bodyStr,
    env
  );

  const headers = {
    ...authHeaders,
    'Content-Type': 'application/json',
  };

  const options = { method, headers };
  if (bodyStr) options.body = bodyStr;

  return fetch(url, options);
}
