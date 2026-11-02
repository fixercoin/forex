// functions/api/exness/positions.js
// GET /api/exness/positions
// Correct flow: discover Access Point, then fetch positions from that host.
// Every error path returns JSON — never HTML.

import { exnessFetch } from './_auth.js';

const EXNESS_ACCOUNT_ID = '11724101';

export async function onRequestGet(context) {
  const { env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Gateway host for discovery
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

    // 3. Fetch positions from Access Point.
    // ⚠️ ENDPOINT PATH NOT CONFIRMED — verify in your Exness OpenAPI spec.
    // Possible paths to try: /v1/trading/positions, /v1/positions,
    // /v1/accounts/{id}/positions
    const positionsPath = `/v1/trading/positions?account_id=${EXNESS_ACCOUNT_ID}`;
    const posRes = await exnessFetch(`${apBase}${positionsPath}`, 'GET', null, env);
    const posData = await posRes.json().catch(() => ({}));

    if (!posRes.ok) {
      return new Response(JSON.stringify({
        error: 'POSITIONS_FETCH_FAILED',
        status: posRes.status,
        detail: posData,
        hint: posRes.status === 403
          ? 'API key may lack Trading scope. Check Key Management in Exness PA.'
          : undefined,
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
