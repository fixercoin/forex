// functions/api/exness/accounts.js
// GET /api/exness/accounts?adminPassword=...   (or ?sessionToken=...)
// Returns balance / equity / freeMargin for the Exness account.

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

    // ---- AUTH GATE: session OR admin password ----
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

    // ---- Gateway + Access Point discovery ----
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

    // ---- Try to fetch account summary (contains money fields) ----
    // The /configuration/... endpoint does NOT return balance. We try
    // several plausible summary paths until one returns balance-ish data.
    const candidates = [
      `/v1/trading/accounts/${EXNESS_ACCOUNT_ID}/summary`,
      `/v1/trading/accounts/${EXNESS_ACCOUNT_ID}`,
      `/v1/trading/accounts/${EXNESS_ACCOUNT_ID}/balance`,
      `/v1/trading/accounts/${EXNESS_ACCOUNT_ID}/account`,
    ];

    let summaryData = null;
    let lastError = null;
    for (const p of candidates) {
      try {
        const r = await exnessFetch(`${apBase}${p}`, 'GET', null, env);
        if (!r.ok) {
          lastError = { path: p, status: r.status };
          continue;
        }
        const d = await r.json().catch(() => ({}));
        if (d && (
          d.balance !== undefined ||
          d.equity !== undefined ||
          d.account_balance !== undefined ||
          d.margin_free !== undefined ||
          d.free_margin !== undefined
        )) {
          summaryData = d;
          break;
        }
        // Keep first non-empty response as a fallback
        if (!summaryData) summaryData = d;
      } catch (e) {
        lastError = { path: p, message: e.message };
      }
    }

    const s = summaryData || {};
    const pick = (...keys) => {
      for (const k of keys) if (s[k] !== undefined && s[k] !== null) return s[k];
      return null;
    };

    return new Response(JSON.stringify({
      accounts: [{
        id: pick('account_id', 'id') || EXNESS_ACCOUNT_ID,
        currency: pick('currency', 'account_currency') || 'USD',
        leverage: pick('leverage') || '—',
        marginCallLevel: pick('margin_call_level') || '—',
        stopOutLevel: pick('stop_out_level') || '—',
        balance: pick('balance', 'account_balance') ?? '—',
        equity: pick('equity', 'account_equity') ?? '—',
        margin: pick('margin', 'account_margin') ?? '—',
        freeMargin: pick('free_margin', 'margin_free', 'freeMargin') ?? '—',
      }],
      _debug: lastError && !summaryData ? { lastError } : undefined,
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({
      error: 'UNCAUGHT',
      message: err.message,
    }), { status: 500, headers: corsHeaders });
  }
}
