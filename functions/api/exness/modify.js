// functions/api/exness/modify.js
// POST /api/exness/modify
//
// ⚠️ WARNING: The search results do NOT contain a documented "modify order"
// endpoint for Exness. Only create [citation:3] and close [citation:22] are found.
// This file uses a placeholder path and will likely fail until you verify
// the correct endpoint in your Exness API documentation.

import { exnessFetch } from './_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { orderId, takeProfit, stopLoss } = body;

    if (!orderId) {
      return new Response(JSON.stringify({
        error: 'Missing required field: orderId'
      }), { status: 400, headers: corsHeaders });
    }

    // ⚠️ PLACEHOLDER ENDPOINT — verify in your Exness API docs
    // The search results do not document a modify endpoint.
    const exnessRes = await exnessFetch(
      'https://api.exness.com/api/v1/trade/modify',
      'POST',
      { orderId, takeProfit, stopLoss },
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
