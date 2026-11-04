// functions/api/exness/close.js
// POST /api/exness/close
// Body: { orderId, adminPassword }
// Closes a position. Uses the same Access Point flow as positions.js.

import { exnessFetch } from './_auth.js';

const EXNESS_ACCOUNT_ID = '16000620992';

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json().catch(() => ({}));
    const { orderId, adminPassword } = body;

    if (!env.ADMIN_TRADE_PASSWORD || adminPassword !== env.ADMIN_TRADE_PASSWORD) {
      return new Response(JSON.stringify({
        error: 'ADMIN_PASSWORD_INVALID: Incorrect or missing admin password',
      }), { status: 403, headers: corsHeaders });
    }

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing required field: orderId' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // ---- Gateway + Access Point ----
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

    // ---- Close via orders endpoint ----
    // Per Exness docs: DELETE /v1/trading/accounts/{account_id}/orders/{order_id}
    // (cancels a pending order). For an open position, closing is done by
    // placing an opposite market order, but most retail accounts accept
    // POST /v1/trading/accounts/{id}/orders/{order_id}/close. We try that
    // first, then fall back to DELETE on the order.
    const closePath = `/v1/trading/accounts/${EXNESS_ACCOUNT_ID}/orders/${orderId}/close`;
    let exnessRes = await exnessFetch(`${apBase}${closePath}`, 'POST', {}, env);

    if (!exnessRes.ok) {
      // Fallback: DELETE the order
      const delPath = `/v1/trading/accounts/${EXNESS_ACCOUNT_ID}/orders/${orderId}`;
      exnessRes = await exnessFetch(`${apBase}${delPath}`, 'DELETE', null, env);
    }

    const data = await exnessRes.json().catch(() => ({}));

    if (!exnessRes.ok) {
      return new Response(JSON.stringify({
        error: 'CLOSE_FAILED',
        status: exnessRes.status,
        detail: data,
      }), { status: exnessRes.status, headers: corsHeaders });
    }

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
