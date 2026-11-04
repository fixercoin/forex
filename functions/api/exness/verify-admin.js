// functions/api/exness/verify-admin.js
// POST /api/exness/verify-admin
// Body: { adminPassword }
// Returns 200 { ok: true } if the password matches env.ADMIN_TRADE_PASSWORD,
// otherwise 403.

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json().catch(() => ({}));
    const { adminPassword } = body;

    if (!env.ADMIN_TRADE_PASSWORD || adminPassword !== env.ADMIN_TRADE_PASSWORD) {
      return new Response(JSON.stringify({ error: 'ADMIN_PASSWORD_INVALID' }), {
        status: 403,
        headers: cors,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: cors,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: cors,
    });
  }
}
