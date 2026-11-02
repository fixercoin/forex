// functions/api/exness/trade.js
// POST /api/exness/trade
// Admin-password-protected order creation.
// Endpoint: POST /api/v1/trade/create [citation:2][citation:6]

import { exnessFetch } from './_auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { symbol, type, quantity, leverage, takeProfit, stopLoss, adminPassword } = body;

    // 1. Admin password verification
    if (!env.ADMIN_TRADE_PASSWORD || adminPassword !== env.ADMIN_TRADE_PASSWORD) {
      return new Response(JSON.stringify({
        error: 'ADMIN_PASSWORD_INVALID: Incorrect or missing admin password'
      }), { status: 403, headers: corsHeaders });
    }

    // 2. Required fields
    if (!symbol || !type || !quantity || !leverage) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: symbol, type, quantity, leverage'
      }), { status: 400, headers: corsHeaders });
    }

    // 3. Build payload
    // Exness expects type as lowercase "buy" or "sell"[citation:6][citation:21]
    const payload = {
      symbol,
      type: type.toLowerCase(),
      quantity: Number(quantity),
      leverage: Number(leverage),
      ...(takeProfit != null && { takeProfit: Number(takeProfit) }),
      ...(stopLoss != null && { stopLoss: Number(stopLoss) }),
    };

    // 4. Call Exness
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
