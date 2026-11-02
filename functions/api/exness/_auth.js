// functions/api/exness/_auth.js
// Exness Ed25519 signed request authentication.
// Based on official Exness Authentication documentation:
// - Headers: EXN-API-KEY, EXN-IDEMPOTENCY-KEY, EXN-TIMESTAMP, EXN-SIGN-VERSION, EXN-DATA, EXN-SIGN
// - EXN-DATA is base64url(JSON payload) without padding
// - EXN-SIGN is Ed25519 signature of the decoded EXN-DATA payload bytes, base64url without padding
// - body_hash is SHA-256 of exact request body, base64url without padding
// - Empty body hash: 47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU
// - Timestamp in Unix milliseconds, must match timestamp inside EXN-DATA
// - Fresh timestamp and signature for every request

/**
 * Build signed headers for an Exness API request.
 * @param {string} method   - HTTP method (GET/POST)
 * @param {string} path     - Request path with query string exactly as sent (e.g. "/v1/trade/orders")
 * @param {string|null} body - Exact request body string, or null for GET
 * @param {Object} env      - Cloudflare env (EXNESS_API_KEY, EXNESS_SECRET_KEY)
 * @returns {Promise<Object>} headers
 */
export async function buildExnessAuthHeaders(method, path, body, env) {
  const apiKey = env.EXNESS_API_KEY;
  const secretKey = env.EXNESS_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('EXNESS_CREDENTIALS_MISSING');
  }

  const timestamp = Date.now();

  // For signed GET requests, idempotency key must be empty string.
  // For mutating requests (POST/PUT/DELETE), it must be non-empty.
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

  // Build the EXN-DATA payload object exactly as specified
  const payload = {
    api_key: apiKey,
    idempotency_key: idempotencyKey,
    timestamp: timestamp,
    sign_version: 1,
    method: upperMethod,
    path: path,
    body_hash: bodyHash,
  };

  // Serialize to JSON bytes (this exact byte sequence is what gets signed)
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  // Decode the secret key as an Ed25519 seed.
  // The official docs say "Ed25519 private key" but do not specify encoding.
  // Common Exness format is base64url-encoded 32-byte seed.
  const seed = decodeSeed(secretKey);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    seed,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  // Sign the decoded EXN-DATA payload bytes (NOT the base64url string)
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
 * Decode the Secret Key into a 32-byte Ed25519 seed.
 * Exness does not document the encoding explicitly.
 * Try base64url first (most likely), then hex, then raw.
 */
function decodeSeed(secretKey) {
  // Try base64url (with or without padding)
  try {
    const b64 = secretKey.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    if (bytes.length === 32) return bytes;
  } catch (e) {
    // fall through
  }

  // Try hex (64 hex chars = 32 bytes)
  try {
    const hex = secretKey.replace(/[^0-9a-fA-F]/g, '');
    if (hex.length === 64) {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      }
      return bytes;
    }
  } catch (e) {
    // fall through
  }

  // Last resort: raw string bytes
  const raw = new TextEncoder().encode(secretKey);
  if (raw.length === 32) return raw;

  throw new Error(
    'EXNESS_SECRET_KEY_DECODE_FAILED: Could not decode Secret Key as a 32-byte ' +
    'Ed25519 seed. Got length ' + raw.length + '. Check the key format in your ' +
    'Exness Personal Area.'
  );
}

/**
 * Generate a non-empty idempotency key for mutating requests.
 * Must be unique per request.
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
  // Sign the path AND query string exactly as sent
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
