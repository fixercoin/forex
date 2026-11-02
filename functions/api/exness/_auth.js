// functions/api/exness/_auth.js
// Shared authentication helper for Exness API.
//
// ⚠️ CRITICAL: Exness official API uses JWT (Authorization: Bearer <token>)[citation:2][citation:6].
// The search results do NOT contain the JWT generation logic (how to obtain a token
// from API Key + Secret Key). An unofficial SDK suggests Ed25519 signing[citation:5][citation:16],
// but the exact algorithm is not documented in the search results.
//
// You MUST replace the TODO below with the authentication flow from your
// Exness Developer Portal documentation.

/**
 * Build the Authorization header for Exness API requests.
 *
 * @param {string} apiKey    - Exness API Key (from Cloudflare Secrets)
 * @param {string} secretKey - Exness Secret Key (from Cloudflare Secrets)
 * @returns {Promise<Object>} - Headers object including Authorization
 */
export async function buildExnessAuthHeaders(apiKey, secretKey) {
  // ============================================================
  // TODO: REPLACE THIS ENTIRE SECTION WITH REAL EXNESS AUTH
  // ============================================================
  //
  // Option A: JWT flow (per official API docs[citation:2][citation:6])
  //   1. Call the Exness authentication endpoint with apiKey + secretKey
  //   2. Receive a JWT token
  //   3. Return { 'Authorization': `Bearer ${token}` }
  //
  // Option B: Ed25519 signed flow (per unofficial SDK[citation:5])
  //   The SDK mentions:
  //   - Headers: EXN-API-KEY, EXN-TIMESTAMP, EXN-SIGN
  //   - Timestamp tolerance: 0 <= server_now_ms - signed_timestamp_ms <= 3000
  //   - Private key is Ed25519 seed
  //   - You need to sign the request payload
  //
  // Example Ed25519 approach (pseudo-code, NOT verified):
  //   const timestamp = Date.now().toString();
  //   const message = `${timestamp}${method}${path}${body || ''}`;
  //   const privateKeyBytes = /* decode secretKey */;
  //   const cryptoKey = await crypto.subtle.importKey(
  //     'raw', privateKeyBytes, { name: 'Ed25519' }, false, ['sign']
  //   );
  //   const signature = await crypto.subtle.sign(
  //     'Ed25519', cryptoKey, new TextEncoder().encode(message)
  //   );
  //   return {
  //     'EXN-API-KEY': apiKey,
  //     'EXN-TIMESTAMP': timestamp,
  //     'EXN-SIGN': btoa(String.fromCharCode(...new Uint8Array(signature))),
  //   };
  //
  // ============================================================

  throw new Error(
    'EXNESS_AUTH_NOT_IMPLEMENTED: ' +
    'Replace buildExnessAuthHeaders() with the authentication flow from your ' +
    'Exness Developer Portal documentation. Official API uses JWT[citation:2], ' +
    'but the token generation method is not in search results.'
  );
}

/**
 * Wrapper: fetch with Exness authentication.
 * Reads credentials from env (Cloudflare Secrets).
 */
export async function exnessFetch(url, method, body, env) {
  const apiKey = env.EXNESS_API_KEY;
  const secretKey = env.EXNESS_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('EXNESS_CREDENTIALS_MISSING: Set EXNESS_API_KEY and EXNESS_SECRET_KEY in Cloudflare Secrets.');
  }

  const authHeaders = await buildExnessAuthHeaders(apiKey, secretKey);

  const headers = {
    ...authHeaders,
    'Content-Type': 'application/json',
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  return fetch(url, options);
}
