// functions/api/exness/close.js
// POST /api/exness/close
// Closes an open position by orderId.
// Endpoint: POST /api/v1/trade/close [citation:18][citation:22]

import { exnessFetch } from './_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { orderId } = body;

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
