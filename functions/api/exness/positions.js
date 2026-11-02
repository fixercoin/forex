// functions/api/exness/positions.js
// GET /api/exness/positions
// Returns open positions. No admin password required for read-only access.
// Every error path returns JSON — never HTML.

import { exnessFetch } from './_auth.js';

export async function onRequestGet(context) {
  const { env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // ⚠️ You must replace this host with your discovered Access Point.
    // For now, using the Gateway host may return 404 for trading endpoints.
    // The official flow requires: discover access_point, then use it here.
    const exnessRes = await exnessFetch(
      'https://api.exness.com/v1/trading/positions',
      'GET',
      null,
      env
    );

    const data = await exnessRes.json().catch(() => ({}));

    if (!exnessRes.ok) {
      return new Response(JSON.stringify({
        error: 'POSITIONS_FETCH_FAILED',
        status: exnessRes.status,
        detail: data,
      }), { status: exnessRes.status, headers: corsHeaders });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err) {
    // Global catch: any uncaught error becomes JSON, not a 502 HTML page
    return new Response(JSON.stringify({
      error: 'UNCAUGHT',
      message: err.message,
    }), { status: 500, headers: corsHeaders });
  }
}
