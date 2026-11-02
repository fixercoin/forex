// functions/api/exness/accounts.js
// GET /api/exness/accounts?sessionToken=...
// Returns account config for account 11724101 via Access Point discovery.
// Every error path returns JSON — never HTML.

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

    // 2. Discover Access Point for this account
    // SDK uses client.configuration.getTradingAccessPoint(accountId) 
    // Verify exact path in your Exness OpenAPI spec.
    const apRes = await exnessFetch(
      `https://api.exness.com/v1/configuration/accounts/${EXNESS_ACCOUNT_ID}/access-point`,
      'GET', null, env
    );

    if (!apRes.ok) {
      const detail = await apRes.json().catch(() => ({}));
      return new Response(JSON.stringify({
        error: 'ACCESS_POINT_DISCOVERY_FAILED', status: apRes.status, detail,
      }), { status: 502, headers: corsHeaders });
    }

    const apData = await apRes.json();
    const host = apData.access_point;
    if (!host) {
      return new Response(JSON.stringify({
        error: 'ACCESS_POINT_MISSING', detail: apData,
      }), { status: 502, headers: corsHeaders });
    }

    // 3. Fetch account config from Access Point host
    // Official example path: /v1/configuration/accounts/{id}/account
    const accRes = await exnessFetch(
      `https://${host}/v1/configuration/accounts/${EXNESS_ACCOUNT_ID}/account`,
      'GET', null, env
    );

    const accData = await accRes.json().catch(() => ({}));

    if (!accRes.ok) {
      return new Response(JSON.stringify({
        error: 'ACCOUNT_FETCH_FAILED', status: accRes.status, detail: accData,
      }), { status: accRes.status, headers: corsHeaders });
    }

    // 4. Return as accounts array for the frontend dialog
    return new Response(JSON.stringify({
      accounts: [{
        id: accData.account_id || EXNESS_ACCOUNT_ID,
        currency: accData.currency || 'USD',
        leverage: accData.leverage || '—',
        balance: '—',   // config endpoint has no balance; separate endpoint needed
        equity: '—',
        margin: '—',
        freeMargin: '—',
      }],
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    // Global catch: any uncaught error becomes a JSON 500, not a 502 HTML page
    return new Response(JSON.stringify({
      error: 'UNCAUGHT', message: err.message,
    }), { status: 500, headers: corsHeaders });
  }
}
