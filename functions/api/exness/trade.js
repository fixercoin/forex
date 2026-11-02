// functions/api/exness/trade.js
// POST /api/exness/trade
// Official flow:
// 1. Discover Access Point via Gateway host
// 2. POST /v1/trading/accounts/{account_id}/positions
//    Body: instrument, side, volume, take_profit_price, stop_loss_price
// 3. Return ACK (operation_id, client_request_id, status)

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
    const { instrument, side, volume, takeProfitPrice, stopLossPrice } = body;

    if (!instrument || !side || !volume) {
      return new Response(JSON.stringify({ error: 'Missing instrument, side, or volume' }), {
        status: 400, headers: corsHeaders,
      });
    }

    // 1. Gateway host
    const gateway = (env.EXNESS_GATEWAY_HOST || 'https://api.exness.com').replace(/\/+$/, '');

    // 2. Discover Access Point
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

    // 3. Create position.
    // Official path: /v1/trading/accounts/{account_id}/positions
    // Body fields: instrument, side, volume.
    // TP/SL field names (take_profit_price, stop_loss_price) are confirmed
    // by the Modify Order endpoint schema. Whether position creation accepts
    // them inline is UNCONFIRMED — if Exness rejects unknown fields, remove
    // them here and PATCH the order after ACK.
    const payload = {
      instrument,
      side,                     // "buy" or "sell"
      volume: String(volume),   // decimal string
    };
    if (takeProfitPrice != null) payload.take_profit_price = String(takeProfitPrice);
    if (stopLossPrice != null) payload.stop_loss_price = String(stopLossPrice);

    const orderPath = `/v1/trading/accounts/${EXNESS_ACCOUNT_ID}/positions`;
    const orderRes = await exnessFetch(`${apBase}${orderPath}`, 'POST', payload, env);
    const orderData = await orderRes.json().catch(() => ({}));

    if (!orderRes.ok) {
      return new Response(JSON.stringify({
        error: 'ORDER_FAILED',
        status: orderRes.status,
        detail: orderData,
      }), { status: orderRes.status, headers: corsHeaders });
    }

    // ACK response: { operation_id, client_request_id, status: "accepted" }
    return new Response(JSON.stringify(orderData), {
      status: 200, headers: corsHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'UNCAUGHT', message: err.message }), {
      status: 500, headers: corsHeaders,
    });
  }
}
