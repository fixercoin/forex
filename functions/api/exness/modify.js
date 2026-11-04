// functions/api/exness/modify.js
// PATCH /api/exness/modify
//
// Proxies to Exness:
//   PATCH /v1/trading/accounts/{account_id}/orders/{order_id}
//
// Body (from frontend):
//   { orderId, stopLoss?, takeProfit?, price?, adminPassword }
//
// Behaviour per Exness spec:
//   - omitted field  = not changed
//   - string value   = set new price
//   - null           = remove SL/TP
//   - returns 202 ACK with operation_id (result arrives via Server Events)

import { exnessFetch } from './_auth.js';

const EXNESS_ACCOUNT_ID = '16000620992';

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { orderId, stopLoss, takeProfit, price, comment, adminPassword } = body;

    // 1. Admin password gate (same as close.js)
    if (!env.ADMIN_TRADE_PASSWORD || adminPassword !== env.ADMIN_TRADE_PASSWORD) {
      return new Response(JSON.stringify({
        error: 'ADMIN_PASSWORD_INVALID: Incorrect or missing admin password',
      }), { status: 403, headers: corsHeaders });
    }

    if (!orderId) {
      return new Response(JSON.stringify({
        error: 'Missing required field: orderId',
      }), { status: 400, headers: corsHeaders });
    }

    // 2. Build request body — only include fields the client actually sent.
    //    Omitted = unchanged; null = remove SL/TP.
    const exnessBody = {};
    if (price !== undefined)      exnessBody.price = price;
    if (stopLoss !== undefined)   exnessBody.stop_loss_price = stopLoss;   // string or null
    if (takeProfit !== undefined) exnessBody.take_profit_price = takeProfit;
    if (comment !== undefined)    exnessBody.comment = comment;

    if (Object.keys(exnessBody).length === 0) {
      return new Response(JSON.stringify({
        error: 'Nothing to modify: provide at least one of price, stopLoss, takeProfit',
      }), { status: 400, headers: corsHeaders });
    }

    // 3. Gateway + Access Point discovery (same flow as positions.js)
    const gateway = (env.EXNESS_GATEWAY_HOST || 'https://api.exness.com').replace(/\/+$/, '');
    const discoveryPath = `/v1/trading/access-point?account_id=${EXNESS_ACCOUNT_ID}`;
    const apRes = await exnessFetch(`${gateway}${discoveryPath}`, 'GET', null, env);
    const apData = await apRes.json().catch(() => ({}));

    if (!apRes.ok || !apData.access_point) {
      return new Response(JSON.stringify({
        error: 'ACCESS_POINT_DISCOVERY_FAILED',
        status: apRes.status,
        detail: apData,
      }), { status: 502, headers: corsHeaders });
    }

    const apBase = apData.access_point.replace(/\/+$/, '');

    // 4. PATCH the order
    const modifyPath = `/v1/trading/accounts/${EXNESS_ACCOUNT_ID}/orders/${orderId}`;
    const exnessRes = await exnessFetch(`${apBase}${modifyPath}`, 'PATCH', exnessBody, env);
    const data = await exnessRes.json().catch(() => ({}));

    if (!exnessRes.ok) {
      return new Response(JSON.stringify({
        error: 'MODIFY_FAILED',
        status: exnessRes.status,
        detail: data,
      }), { status: exnessRes.status, headers: corsHeaders });
    }

    // 5. 202 ACK — operation is async. Return operation_id so the frontend
    //    can correlate it with the Server Events stream / re-poll positions.
    return new Response(JSON.stringify({
      ok: true,
      operation_id: data.operation_id || null,
      status: data.status || 'accepted',
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
