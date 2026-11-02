// functions/api/exness/trade.js
import { exnessFetch } from './_auth.js';
import { verifySessionToken } from './auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { symbol, type, quantity, leverage, takeProfit, stopLoss, accountId, sessionToken } = body;

    // Verify session token instead of raw password
    const valid = await verifySessionToken(sessionToken, env);
    if (!valid) {
      return new Response(JSON.stringify({
        error: 'SESSION_INVALID_OR_EXPIRED'
      }), { status: 403, headers: corsHeaders });
    }

    if (!symbol || !type || !quantity || !leverage) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: symbol, type, quantity, leverage'
      }), { status: 400, headers: corsHeaders });
    }

    const payload = {
      symbol,
      type: type.toLowerCase(),
      quantity: Number(quantity),
      leverage: Number(leverage),
      ...(takeProfit != null && { takeProfit: Number(takeProfit) }),
      ...(stopLoss != null && { stopLoss: Number(stopLoss) }),
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
