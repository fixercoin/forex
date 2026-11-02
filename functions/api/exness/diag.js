// functions/api/exness/diag.js
// Probes every /api/exness/* route EXCEPT itself to avoid 1019 recursion.
// Also reports whether trade.js is loadable.

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;

  // ⚠️ Do NOT include /api/exness/diag here — that causes 1019 recursion.
  const routes = [
    { method: 'GET', path: '/api/exness/positions' },
    { method: 'GET', path: '/api/exness/accounts' },
    { method: 'POST', path: '/api/exness/trade', body: {
        accountId: '16000620992',
        instrument: 'EURUSD',
        side: 'buy',
        volume: '0.01',
      } },
    { method: 'POST', path: '/api/exness/execute', body: {
        accountId: '16000620992',
        instrument: 'EURUSD',
        side: 'buy',
        volume: '0.01',
      } },
  ];

  const results = [];

  for (const r of routes) {
    const result = { method: r.method, path: r.path };
    try {
      const opts = {
        method: r.method,
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      };
      if (r.body) opts.body = JSON.stringify(r.body);

      const res = await fetch(origin + r.path, opts);
      const text = await res.text();

      result.status = res.status;
      result.contentType = res.headers.get('content-type');
      result.bodyPreview = text.slice(0, 400);

      // Parse JSON if possible
      try { result.json = JSON.parse(text); } catch { /* not JSON */ }

      // Flag the HTML fallback explicitly
      if (result.contentType && result.contentType.includes('text/html')) {
        result.note = 'HTML fallback — route not matched to a Function';
      }
    } catch (err) {
      result.error = err.message;
    }
    results.push(result);
  }

  // Environment snapshot
  const envSnapshot = {
    hasApiKey: !!env.EXNESS_API_KEY,
    hasSecretKey: !!env.EXNESS_SECRET_KEY,
    hasGatewayHost: !!env.EXNESS_GATEWAY_HOST,
    gatewayHost: env.EXNESS_GATEWAY_HOST || '(not set)',
    hasClockOffset: !!env.EXNESS_CLOCK_OFFSET_MS,
    clockOffset: env.EXNESS_CLOCK_OFFSET_MS || '(not set)',
    hasAdminPassword: !!env.ADMIN_TRADE_PASSWORD,
  };

  return new Response(JSON.stringify({
    ok: true,
    origin,
    timestamp: new Date().toISOString(),
    env: envSnapshot,
    routes: results,
    hint: 'If /api/exness/trade returns 404 or text/html, the trade.js Function is not loading. Check its file location and export name.',
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
