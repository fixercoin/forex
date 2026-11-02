// functions/api/exness/auth.js
// POST /api/exness/auth
// Verifies admin password and returns a short-lived session token.
// The token is HMAC-signed using a server-side secret, so it cannot be forged.

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { adminPassword } = body;

    if (!env.ADMIN_TRADE_PASSWORD) {
      return new Response(JSON.stringify({
        error: 'ADMIN_PASSWORD_NOT_CONFIGURED'
      }), { status: 500, headers: corsHeaders });
    }

    if (!adminPassword || adminPassword !== env.ADMIN_TRADE_PASSWORD) {
      return new Response(JSON.stringify({
        error: 'ADMIN_PASSWORD_INVALID'
      }), { status: 403, headers: corsHeaders });
    }

    // Issue a session token valid for 15 minutes
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const payload = JSON.stringify({ exp: expiresAt });
    const token = await signSessionToken(payload, env);

    return new Response(JSON.stringify({
      ok: true,
      token,
      expiresAt,
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

/**
 * Sign a session payload with HMAC-SHA256 using ADMIN_TRADE_PASSWORD as the key.
 * Returns base64url(payload) + "." + base64url(signature)
 */
async function signSessionToken(payload, env) {
  const keyBytes = new TextEncoder().encode(env.ADMIN_TRADE_PASSWORD + ':session');
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const payloadBytes = new TextEncoder().encode(payload);
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, payloadBytes);

  return base64urlEncode(payloadBytes) + '.' + base64urlEncode(new Uint8Array(sigBuffer));
}

/**
 * Verify a session token. Returns true if valid and not expired.
 * Exported so trade.js / accounts.js / close.js can reuse it.
 */
export async function verifySessionToken(token, env) {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  try {
    const payloadBytes = base64urlDecode(parts[0]);
    const expectedSig = parts[1];

    const keyBytes = new TextEncoder().encode(env.ADMIN_TRADE_PASSWORD + ':session');
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );

    const sigBytes = base64urlDecode(expectedSig);
    const valid = await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, payloadBytes);
    if (!valid) return false;

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (payload.exp < Date.now()) return false;

    return true;
  } catch {
    return false;
  }
}

function base64urlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
