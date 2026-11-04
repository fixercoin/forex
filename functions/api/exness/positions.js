// functions/api/exness/positions.js
// GET /api/exness/positions?adminPassword=...   (or ?sessionToken=...)
// Returns open positions from the Exness Access Point.

import { exnessFetch } from './_auth.js';
import { verifySessionToken } from './auth.js';

const EXNESS_ACCOUNT_ID = '16000620992';

export async function onRequestGet(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const url = new URL(request.url);

    // ---- AUTH GATE ----
    const sessionToken = url.searchParams.get('sessionToken');
    const adminPassword = url.searchParams.get('adminPassword');

    const sessionOk = sessionToken ? await verifySessionToken(sessionToken, env) : false;
    const adminOk = !!env.ADMIN_TRADE_PASSWORD && adminPassword === env.ADMIN_TRADE_PASSWORD;

    if (!sessionOk && !adminOk) {
      return new Response(JSON.stringify({ error: 'SESSION_INVALID_OR_EXPIRED' }), {
        status: 403,
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

    // ---- Positions ----
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

    // Normalize: Exness may return { positions: [...] } or a bare array.
    let list = posData;
    if (!Array.isArray(list)) list = posData.positions || posData.data || posData.items || [];

    return new Response(JSON.stringify({ positions: list }), {
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
