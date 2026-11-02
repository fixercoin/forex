// functions/api/exness/_auth.js
// Exness uses Ed25519 signed requests (NOT JWT). SDK confirms auth.type = 'signed' [citation:1][citation:16].

export async function buildExnessAuthHeaders(method, path, body, env) {
  const apiKey = env.EXNESS_API_KEY;
  const secretKey = env.EXNESS_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('EXNESS_CREDENTIALS_MISSING');
  }

  // ⚠️ Clock offset: if your Worker clock is ahead of Exness server, requests will fail.
  // The SDK solves this by reading the Date header from a first request.
  // You need to implement a similar offset, or ensure your Worker clock is accurate.
  const timestamp = Date.now(); // may need adjustment based on clockOffsetMs

  // Decode secretKey as Ed25519 seed (32 bytes).
  // The SDK calls it "privateKeySeed" but doesn't specify encoding.
  // Try base64url first, then hex, then raw.
  const seed = decodeSeed(secretKey);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', seed, { name: 'Ed25519' }, false, ['sign']
  );

  // ⚠️ SIGNATURE STRING CONSTRUCTION — NOT IN SEARCH RESULTS
  // You must find the exact format from your Exness OpenAPI spec.
  // Common patterns to try:
  //   `${timestamp}${method}${path}${body || ''}`
  //   JSON.stringify({ timestamp, method, path, body })
  // Check the OpenAPI spec in your Exness developer portal.
  const message = buildSignatureMessage(timestamp, method, path, body);
  const messageBytes = new TextEncoder().encode(message);

  const signatureBuffer = await crypto.subtle.sign('Ed25519', cryptoKey, messageBytes);
  const signature = base64urlEncode(new Uint8Array(signatureBuffer));

  return {
    'EXN-API-KEY': apiKey,
    'EXN-TIMESTAMP': String(timestamp),
    'EXN-SIGN': signature,
    // 'EXN-IDEMPOTENCY-KEY': '' — required for some endpoints [citation:1]
  };
}

function buildSignatureMessage(timestamp, method, path, body) {
  // ⚠️ REPLACE THIS with the actual format from your Exness OpenAPI spec
  throw new Error('EXNESS_SIGNATURE_FORMAT_UNKNOWN: Check your Exness developer portal OpenAPI spec.');
}
