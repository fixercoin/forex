// functions/api/exness/diag.js
// Probes every /api/exness/* route and returns a consolidated report.

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;

  const routes = [
    { method: 'GET', path: '/api/exness/diag' },
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

      // Try to parse as JSON for cleaner output
      try { result.json = JSON.parse(text); } catch { /* not JSON */ }
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
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
