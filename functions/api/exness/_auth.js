// functions/api/exness/_auth.js
// Shared authentication helper for Exness API.
// Exness API requires signed requests using API Key + Secret Key [citation:1].
// The exact signing algorithm is NOT in public search results — fill in the TODO.

/**
 * Build signed headers for an Exness API request.
 *
 * Known facts from search results:
 * - Exness uses Ed25519-style signing (unofficial SDK evidence) [citation:5][citation:16]
 * - Timestamp tolerance: server_now_ms - signed_timestamp_ms must be 0-3000ms [citation:5]
 * - API Key + Secret Key are used for authentication [citation:1]
 *
 * @param {string} apiKey       - Exness API Key (from env)
 * @param {string} secretKey    - Exness Secret Key (from env)
 * @param {string} method       - HTTP method (GET/POST)
 * @param {string} path         - API path, e.g. "/api/v1/trade/create"
 * @param {string|null} body    - JSON string body or null for GET
 * @returns {Promise<Object>}   - Headers object to merge into fetch()
 */
export async function buildExnessHeaders(apiKey, secretKey, method, path, body = null) {
  // ============================================================
  // TODO: REPLACE THIS ENTIRE SECTION WITH REAL EXNESS SIGNING
  // ============================================================
  //
  // The search results do not provide the exact signature construction.
  // Based on the unofficial SDK hints [citation:5][citation:16], the flow likely is:
  //
  // 1. Get current timestamp in milliseconds
  //    const timestamp = Date.now().toString();
  //
  // 2. Build the message to sign. Common patterns include:
  //    - `${timestamp}${method}${path}${body || ''}`
  //    - `${method}${path}${timestamp}${body || ''}`
  //    - JSON with sorted keys
  //    Check your Exness API documentation for the exact format.
  //
  // 3. Decode the Secret Key. It may be:
  //    - Base64-encoded Ed25519 private key seed
  //    - Hex-encoded
  //    - Raw string
  //    Check your Exness documentation.
  //
  // 4. Sign with Ed25519 using Web Crypto:
  //    const encoder = new TextEncoder();
  //    const privateKeyBytes = /* decode secretKey */;
  //    const cryptoKey = await crypto.subtle.importKey(
  //      'raw', privateKeyBytes, { name: 'Ed25519' }, false, ['sign']
  //    );
  //    const signatureBuffer = await crypto.subtle.sign(
  //      'Ed25519', cryptoKey, encoder.encode(message)
  //    );
  //    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  //
  // 5. Return headers. Common header names (verify with your docs):
  //    return {
  //      'X-API-KEY': apiKey,
  //      'X-SIGNATURE': signature,
  //      'X-TIMESTAMP': timestamp,
  //      'Content-Type': 'application/json',
  //    };
  //
  // ============================================================

  throw new Error(
    'EXNESS_SIGNING_NOT_IMPLEMENTED: ' +
    'Replace buildExnessHeaders() in _auth.js with the signing logic ' +
    'from your Exness API documentation. Search results confirm API Key/Secret Key ' +
    'are used [citation:1] and Ed25519 is likely involved [citation:5], ' +
    'but the exact algorithm is not documented in public search results.'
  );
}

/**
 * Wrapper: fetch with Exness signed headers.
 */
export async function exnessFetch(url, method, body, env) {
  const apiKey = env.EXNESS_API_KEY;
  const secretKey = env.EXNESS_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('EXNESS_CREDENTIALS_MISSING: Set EXNESS_API_KEY and EXNESS_SECRET_KEY in Cloudflare Secrets.');
  }

  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const bodyStr = body ? JSON.stringify(body) : null;

  const authHeaders = await buildExnessHeaders(apiKey, secretKey, method, path, bodyStr);

  const headers = {
    ...authHeaders,
    'Content-Type': 'application/json',
  };

  const options = { method, headers };
  if (bodyStr) options.body = bodyStr;

  return fetch(url, options);
}
