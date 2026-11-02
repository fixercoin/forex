// functions/api/exness/positions.js
// GET /api/exness/positions
// Flow: Gateway discovery -> Access Point -> positions.
// Correct path: /v1/trading/accounts/{account_id}/positions

import { exnessFetch } from './_auth.js';

const EXNESS_ACCOUNT_ID = '16000620992';

export async function onRequestGet(context) {
  const { env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
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

    // 3. Fetch positions from Access Point
    // Correct path: /v1/trading/accounts/{account_id}/positions
    const positionsPath = `/v1/trading/accounts/${EXNESS_ACCOUNT_ID}/positions`;
    const posRes = await exnessFetch(`${apBase}${positionsPath}`, 'GET', null, env);
    const posData = await posRes.json().catch(() => ({}));

    if (!posRes.ok) {
      return new Response(JSON.stringify({
        error: 'POSITIONS_FETCH_FAILED',
        status: posRes.status,
        detail: posData,
      }), { status: posRes.status, headers: corsHeaders });
    }

    return new Response(JSON.stringify(posData), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: 'UNCAUGHT',
      message: err.message,
    }), { status: 500, headers: corsHeaders });
  }
}
