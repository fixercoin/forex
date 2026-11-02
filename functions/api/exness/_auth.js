// functions/api/exness/_auth.js
// Exness Ed25519 signed request authentication.
// Based on official Exness signing flow (Ed25519, not JWT) and community SDK references.
//
// Required headers: EXN-API-KEY, EXN-IDEMPOTENCY-KEY, EXN-TIMESTAMP,
// EXN-SIGN-VERSION, EXN-DATA, EXN-SIGN.
//
// Key format note: Exness Secret Key may be a 32-byte seed (64 hex chars)
// or a 64-byte private key (128 hex chars). The decoder below handles both.

/**
 * Build signed headers for an Exness API request.
 * @param {string} method   - HTTP method (GET/POST)
 * @param {string} path     - Request path with query string exactly as sent
 * @param {string|null} body - Exact request body string, or null for GET
 * @param {Object} env      - Cloudflare env (EXNESS_API_KEY, EXNESS_SECRET_KEY, EXNESS_CLOCK_OFFSET_MS)
 * @returns {Promise<Object>} headers
 */
export async function buildExnessAuthHeaders(method, path, body, env) {
  const apiKey = env.EXNESS_API_KEY;
  const secretKey = env.EXNESS_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('EXNESS_CREDENTIALS_MISSING');
  }

  // Clock offset correction. Exness timestamp tolerance is asymmetric:
  // 0 <= server_now_ms - signed_timestamp_ms <= 3000.
  // If the Worker clock is ahead of Exness server, requests fail.
  // Set EXNESS_CLOCK_OFFSET_MS to a negative value if your clock is ahead.
  const clockOffsetMs = Number(env.EXNESS_CLOCK_OFFSET_MS || '0');
  const timestamp = Date.now() + clockOffsetMs;

  const upperMethod = method.toUpperCase();
  // For signed GET requests, idempotency key must be empty string.
  // For mutating requests, it must be non-empty.
  const idempotencyKey = upperMethod === 'GET' ? '' : generateIdempotencyKey();

  // body_hash: SHA-256 of exact request body, base64url without padding.
  // Empty body hash is the standard SHA-256 of empty string.
  let bodyHash;
  if (body && body.length > 0) {
    const bodyBytes = new TextEncoder().encode(body);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes);
    bodyHash = base64urlEncode(new Uint8Array(hashBuffer));
  } else {
    bodyHash = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
  }

  // Build the EXN-DATA payload object. Timestamp and sign_version are JSON numbers,
  // not strings, per official examples.
  const payload = {
    api_key: apiKey,
    idempotency_key: idempotencyKey,
    timestamp: timestamp,
    sign_version: 1,
    method: upperMethod,
    path: path,
    body_hash: bodyHash,
  };

  // Serialize once; sign these exact bytes.
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  // Decode Secret Key into 32-byte Ed25519 seed.
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
 * Handles:
 * - 128 hex chars (64-byte private key: seed + public key) → take first 32 bytes
 * - 64 hex chars (32-byte seed) → use directly
 * - PEM (PKCS#8) → strip headers, base64-decode, extract last 32 bytes
 * - base64url (32 bytes) → use directly
 */
function decodeSeed(secretKey) {
  const key = secretKey.trim();

  // 1. Hex format (most likely for your key)
  const hex = key.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length === 64) {
    // 32-byte seed
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
  if (hex.length === 128) {
    // 64-byte private key (seed + public key): take first 32 bytes as seed
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  // 2. PEM / PKCS#8 format
  if (key.includes('-----BEGIN')) {
    const b64Body = key
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');
    try {
      const derBytes = Uint8Array.from(atob(b64Body), c => c.charCodeAt(0));
      if (derBytes.length >= 32) {
        return derBytes.slice(-32);
      }
    } catch {
      throw new Error('EXNESS_PEM_DECODE_FAILED: Invalid base64 inside PEM');
    }
  }

  // 3. Base64url (with or without padding)
  try {
    const b64 = key.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    if (bytes.length === 32) return bytes;
  } catch {
    // fall through
  }

  throw new Error(
    'EXNESS_SECRET_KEY_DECODE_FAILED: Could not decode Secret Key as a 32-byte ' +
    'Ed25519 seed. Length after hex cleanup: ' + hex.length + ' hex chars. ' +
    'Supported: 64 hex (seed), 128 hex (private key), PEM, base64url.'
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
 * @param {string} url     - Full URL
 * @param {string} method  - HTTP method
 * @param {Object|null} bodyObj - Body object (will be JSON.stringify'd), or null
 * @param {Object} env     - Cloudflare env
 */
export async function exnessFetch(url, method, bodyObj, env) {
  const urlObj = new URL(url);
  // Sign path AND query string exactly as sent.
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
