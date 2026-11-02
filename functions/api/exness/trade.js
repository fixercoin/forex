// functions/api/exness/trade.js
// POST /api/exness/trade
// Creates a new order on Exness.
// Endpoint documented in search results: POST /api/v1/trade/create [citation:3][citation:7]

import { exnessFetch } from './_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { symbol, type, quantity, leverage, takeProfit, stopLoss } = body;

    if (!symbol || !type || !quantity || !leverage) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: symbol, type, quantity, leverage'
      }), { status: 400, headers: corsHeaders });
    }

    const payload = {
      symbol,
      type: type.toLowerCase(), // Exness expects "buy" or "sell" [citation:7]
      quantity,
      leverage,
      ...(takeProfit != null && { takeProfit }),
      ...(stopLoss != null && { stopLoss }),
    };

    const exnessRes = await exnessFetch(
      'https://api.exness.com/api/v1/trade/create',
      'POST',
      payload,
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
