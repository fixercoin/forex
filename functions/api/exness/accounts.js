// functions/api/exness/accounts.js
// GET /api/exness/accounts?sessionToken=...
//
// Official flow (Access Point / Host Discovery):
// 1. Gateway host: GET /v1/trading/access-point?account_id=11724101
// 2. Read access_point from response (it is a full URL)
// 3. Use that URL as base for /v1/configuration/accounts/{id}/account

import { exnessFetch } from './_auth.js';
import { verifySessionToken } from './auth.js';

const EXNESS_ACCOUNT_ID = '11724101';

// Set this in Cloudflare Secrets as EXNESS_GATEWAY_HOST.
// It is the Gateway host from the DNS widget in Key Management.
// Example: https://gateway.exness.com  (NO trailing slash)
// Do NOT guess this value — copy it from your Exness PA DNS widget.
const FALLBACK_GATEWAY = '';

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

    // 2. Gateway host from secrets
    const gateway = (env.EXNESS_GATEWAY_HOST || FALLBACK_GATEWAY).replace(/\/+$/, '');
    if (!gateway) {
      return new Response(JSON.stringify({
        error: 'GATEWAY_HOST_MISSING',
        message: 'Set EXNESS_GATEWAY_HOST in Cloudflare Secrets (from the DNS widget in Key Management).'
      }), { status: 500, headers: corsHeaders });
    }

    // 3. Discover Access Point.
    // Path + query must be signed exactly as sent.
    const discoveryPath = `/v1/trading/access-point?account_id=${EXNESS_ACCOUNT_ID}`;

    const apRes = await exnessFetch(
      `${gateway}${discoveryPath}`,
      'GET',
      null,
      env
    );

    const apData = await apRes.json().catch(() => ({}));

    if (!apRes.ok) {
      return new Response(JSON.stringify({
        error: 'ACCESS_POINT_DISCOVERY_FAILED',
        status: apRes.status,
        detail: apData,
      }), { status: 502, headers: corsHeaders });
    }

    // access_point is a full URL, e.g. "https://access-point.example"
    const accessPoint = apData.access_point;
    if (!accessPoint) {
      return new Response(JSON.stringify({
        error: 'ACCESS_POINT_MISSING',
        detail: apData,
      }), { status: 502, headers: corsHeaders });
    }

    const apBase = accessPoint.replace(/\/+$/, '');

    // 4. Fetch account configuration from the Access Point.
    // Official example path: /v1/configuration/accounts/{id}/account
    const accountPath = `/v1/configuration/accounts/${EXNESS_ACCOUNT_ID}/account`;
    const accRes = await exnessFetch(
      `${apBase}${accountPath}`,
      'GET',
      null,
      env
    );

    const accData = await accRes.json().catch(() => ({}));

    if (!accRes.ok) {
      return new Response(JSON.stringify({
        error: 'ACCOUNT_FETCH_FAILED',
        status: accRes.status,
        detail: accData,
      }), { status: accRes.status, headers: corsHeaders });
    }

    // 5. Return accounts array for the frontend dialog.
    // Configuration endpoint returns: account_id, currency, leverage,
    // margin_call_level, stop_out_level. It does NOT return balance.
    return new Response(JSON.stringify({
      accounts: [{
        id: accData.account_id || EXNESS_ACCOUNT_ID,
        currency: accData.currency || 'USD',
        leverage: accData.leverage || '—',
        marginCallLevel: accData.margin_call_level || '—',
        stopOutLevel: accData.stop_out_level || '—',
        balance: '—',      // balance comes from a separate endpoint
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
