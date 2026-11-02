// functions/api/exness/accounts.js
// GET /api/exness/accounts?sessionToken=...
// Flow: Gateway discovery -> Access Point -> account config.

import { exnessFetch } from './_auth.js';
import { verifySessionToken } from './auth.js';

const EXNESS_ACCOUNT_ID = '11724101';

export async function onRequestGet(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Session gate
    const url = new URL(request.url);
    const sessionToken = url.searchParams.get('sessionToken');
    const valid = await verifySessionToken(sessionToken, env);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'SESSION_INVALID_OR_EXPIRED' }), {
        status: 403, headers: corsHeaders,
      });
    }

    // 2. Gateway host (from Cloudflare Secrets)
    const gateway = (env.EXNESS_GATEWAY_HOST || 'https://api.exness.com').replace(/\/+$/, '');

    // 3. Discover Access Point
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

    // 4. Fetch account config from Access Point
    const accountPath = `/v1/configuration/accounts/${EXNESS_ACCOUNT_ID}/account`;
    const accRes = await exnessFetch(`${apBase}${accountPath}`, 'GET', null, env);
    const accData = await accRes.json().catch(() => ({}));

    if (!accRes.ok) {
      return new Response(JSON.stringify({
        error: 'ACCOUNT_FETCH_FAILED',
        status: accRes.status,
        detail: accData,
      }), { status: accRes.status, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      accounts: [{
        id: accData.account_id || EXNESS_ACCOUNT_ID,
        currency: accData.currency || 'USD',
        leverage: accData.leverage || '—',
        marginCallLevel: accData.margin_call_level || '—',
        stopOutLevel: accData.stop_out_level || '—',
        balance: '—', // config endpoint does not return balance
        equity: '—',
        margin: '—',
        freeMargin: '—',
      }],
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({
      error: 'UNCAUGHT',
      message: err.message,
    }), { status: 500, headers: corsHeaders });
  }
}
