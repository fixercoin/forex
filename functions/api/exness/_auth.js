// functions/api/exness/_auth.js
// Exness Ed25519 signed request authentication.
// Cloudflare Workers does NOT support raw import of Ed25519 private keys [citation:4].
// The 32-byte seed must be wrapped in a PKCS#8 DER structure before import.

/**
 * Build signed headers for an Exness API request.
 */
export async function buildExnessAuthHeaders(method, path, body, env) {
  const apiKey = env.EXNESS_API_KEY;
  const secretKey = env.EXNESS_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('EXNESS_CREDENTIALS_MISSING');
  }

  const clockOffsetMs = Number(env.EXNESS_CLOCK_OFFSET_MS || '0');
  const timestamp = Date.now() + clockOffsetMs;

  const upperMethod = method.toUpperCase();
  const idempotencyKey = upperMethod === 'GET' ? '' : generateIdempotencyKey();

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
    timestamp: timestamp,
    sign_version: 1,
    method: upperMethod,
    path: path,
    body_hash: bodyHash,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  // Decode 128-hex-char key → first 32 bytes = Ed25519 seed
  const seed = decodeSeed(secretKey);

  // Import as PKCS#8 (Workers does not support raw private key import [citation:4])
  const cryptoKey = await importEd25519PrivateKey(seed);

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
 * Import a 32-byte Ed25519 seed as a PKCS#8 private key.
 * PKCS#8 prefix for Ed25519: 16-byte fixed header + 32-byte seed.
 */
async function importEd25519PrivateKey(seed) {
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20
  ]);

  const pkcs8 = new Uint8Array(pkcs8Prefix.length + seed.length);
  pkcs8.set(pkcs8Prefix, 0);
  pkcs8.set(seed, pkcs8Prefix.length);

  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8.buffer,
    { name: 'Ed25519' },
    false,
    ['sign']
  );
}

/**
 * Decode Secret Key into 32-byte Ed25519 seed.
 * Handles: 128 hex (64-byte key → first 32), 64 hex (32-byte seed),
 * PEM PKCS#8, base64url, and raw.
 */
function decodeSeed(secretKey) {
  const key = secretKey.trim();

  // Hex: 64 chars = seed, 128 chars = private key (take first 32 bytes)
  const hex = key.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length === 64) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }
  if (hex.length === 128) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }

  // PEM / PKCS#8
  if (key.includes('-----BEGIN')) {
    const b64Body = key
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');
    try {
      const derBytes = Uint8Array.from(atob(b64Body), c => c.charCodeAt(0));
      if (derBytes.length >= 32) return derBytes.slice(-32);
    } catch {
      throw new Error('EXNESS_PEM_DECODE_FAILED');
    }
  }

  // base64url
  try {
    const b64 = key.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    if (bytes.length === 32) return bytes;
  } catch { /* fall through */ }

  throw new Error(
    'EXNESS_SECRET_KEY_DECODE_FAILED: Length ' + key.length +
    '. Supported: 64/128 hex, PEM, base64url.'
  );
}

function generateIdempotencyKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

function base64urlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
