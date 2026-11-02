// functions/api/exness/close.js
// POST /api/exness/close
// Admin-password-protected position closing.
// Endpoint: POST /api/v1/trade/close [citation:13]

import { exnessFetch } from './_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { orderId, adminPassword } = body;

    // Admin password verification
    if (!env.ADMIN_TRADE_PASSWORD || adminPassword !== env.ADMIN_TRADE_PASSWORD) {
      return new Response(JSON.stringify({
        error: 'ADMIN_PASSWORD_INVALID: Incorrect or missing admin password'
      }), { status: 403, headers: corsHeaders });
    }

    if (!orderId) {
      return new Response(JSON.stringify({
        error: 'Missing required field: orderId'
      }), { status: 400, headers: corsHeaders });
    }

    const exnessRes = await exnessFetch(
      'https://api.exness.com/api/v1/trade/close',
      'POST',
      { orderId },
      env
    );

    const data = await exnessRes.json();

    return new Response(JSON.stringify(data), {
      status: exnessRes.status,
      headers: corsHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
