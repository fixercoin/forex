// functions/api/exness/accounts.js
// GET /api/exness/accounts
// Returns your account's configuration by:
// 1. Discovering the Access Point host for your account
// 2. Calling /v1/configuration/accounts/{accountId}/account on that host
//
// Account ID is hardcoded as 11724101 since you have a single trading account.

import { exnessFetch } from './_auth.js';
import { verifySessionToken } from './auth.js';

const EXNESS_ACCOUNT_ID = '11724101';

export async function onRequestGet(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // Session gate
  const url = new URL(request.url);
  const sessionToken = url.searchParams.get('sessionToken');
  const valid = await verifySessionToken(sessionToken, env);
  if (!valid) {
    return new Response(JSON.stringify({
      error: 'SESSION_INVALID_OR_EXPIRED'
    }), { status: 403, headers: corsHeaders });
  }

  try {
    // Step 1: Discover the Access Point for this account.
    // The SDK calls this getTradingAccessPoint(accountId) [citation:1].
    // The path is likely /v1/configuration/accounts/{accountId}/access-point
    // or similar — verify in your Exness developer portal OpenAPI spec.
    const accessPointRes = await exnessFetch(
      `https://api.exness.com/v1/configuration/accounts/${EXNESS_ACCOUNT_ID}/access-point`,
      'GET',
      null,
      env
    );

    if (!accessPointRes.ok) {
      const errData = await accessPointRes.json().catch(() => ({}));
      return new Response(JSON.stringify({
        error: 'ACCESS_POINT_DISCOVERY_FAILED',
        detail: errData
      }), { status: 502, headers: corsHeaders });
    }

    const accessPointData = await accessPointRes.json();
    // Expected field: access_point (a hostname like "ap-xxxx.exness.com")
    const accessPointHost = accessPointData.access_point;
    if (!accessPointHost) {
      return new Response(JSON.stringify({
        error: 'ACCESS_POINT_MISSING',
        detail: accessPointData
      }), { status: 502, headers: corsHeaders });
    }

    // Step 2: Fetch account configuration from the Access Point host.
    // Official example path: /v1/configuration/accounts/{id}/account [citation:1]
    const accountRes = await exnessFetch(
      `https://${accessPointHost}/v1/configuration/accounts/${EXNESS_ACCOUNT_ID}/account`,
      'GET',
      null,
      env
    );

    const accountData = await accountRes.json();

    if (!accountRes.ok) {
      return new Response(JSON.stringify({
        error: 'ACCOUNT_FETCH_FAILED',
        detail: accountData
      }), { status: accountRes.status, headers: corsHeaders });
    }

    // The official example response shape:
    // { account_id, currency, leverage, margin_call_level, stop_out_level } [citation:1]
    // We wrap it in an "accounts" array so the frontend dialog can iterate.
    return new Response(JSON.stringify({
      accounts: [{
        id: accountData.account_id || EXNESS_ACCOUNT_ID,
        currency: accountData.currency || 'USD',
        leverage: accountData.leverage || '—',
        // The configuration endpoint does NOT return balance/equity.
        // Balance/equity must be fetched separately from a trading/account-summary endpoint.
        // Placeholder until you find the correct balance endpoint.
        balance: '—',
        equity: '—',
        margin: '—',
        freeMargin: '—',
      }]
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
