// functions/api/exness/positions.js
// GET /api/exness/positions
// Returns open orders. No admin password required for read-only access.
// Endpoint: GET /api/v1/trade/open [citation:3][citation:26]

import { exnessFetch } from './_auth.js';

export async function onRequestGet(context) {
  const { env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const exnessRes = await exnessFetch(
      'https://api.exness.com/api/v1/trade/open',
      'GET',
      null,
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
