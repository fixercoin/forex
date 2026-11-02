// functions/api/exness/[[path]].js
// Cloudflare Pages Function — Exness trading proxy
// Security: EXNESS_SECRET_KEY must be stored in Cloudflare Secrets, never in this file.

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/exness', ''); // e.g. "/trade", "/positions"

  // CORS (same-origin requests typically don't need this, but harmless)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Secrets (set via Cloudflare Dashboard > Settings > Variables and Secrets) ---
  const EXNESS_API_KEY = env.EXNESS_API_KEY;
  const EXNESS_SECRET_KEY = env.EXNESS_SECRET_KEY;

  if (!EXNESS_API_KEY || !EXNESS_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Exness credentials not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Route to the appropriate Exness endpoint
    if (path === '/trade' && request.method === 'POST') {
      return await handleCreateTrade(request, EXNESS_API_KEY, EXNESS_SECRET_KEY, corsHeaders);
    }
    if (path === '/positions' && request.method === 'GET') {
      return await handleGetPositions(EXNESS_API_KEY, EXNESS_SECRET_KEY, corsHeaders);
    }
    if (path === '/close' && request.method === 'POST') {
      return await handleCloseTrade(request, EXNESS_API_KEY, EXNESS_SECRET_KEY, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Build the signed request headers for Exness API.
 *
 * ⚠️ TODO: Replace the placeholder below with the actual signing logic.
 * Exness API authentication details (timestamp format, signature string construction,
 * required headers) are NOT fully documented in public search results.
 * You must consult the Exness API documentation you obtained when generating the keys.
 *
 * If Exness uses JWT (as the doc search results suggest), the flow is:
 *   1. Use API Key + Secret Key to obtain a JWT token (via an auth endpoint)
 *   2. Send the JWT in `Authorization: Bearer <token>` header
 *   3. Cache the token until expiry
 */
async function buildSignedHeaders(apiKey, secretKey, method, path, body) {
  // --- PLACEHOLDER: replace with real Exness signing logic ---
  // Typical Ed25519 signing pattern in Cloudflare Workers:
  //
  // const encoder = new TextEncoder();
  // const keyData = /* decode secretKey from base64/hex */;
  // const privateKey = await crypto.subtle.importKey(
  //   'raw', keyData, { name: 'Ed25519' }, false, ['sign']
  // );
  // const payload = encoder.encode(`${timestamp}${method}${path}${body || ''}`);
  // const signature = await crypto.subtle.sign('Ed25519', privateKey, payload);
  // const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  //
  // return {
  //   'X-API-KEY': apiKey,
  //   'X-SIGNATURE': signatureBase64,
  //   'X-TIMESTAMP': timestamp.toString(),
  //   'Content-Type': 'application/json',
  // };

  throw new Error(
    'Exness signing logic not implemented. ' +
    'Replace buildSignedHeaders() with the signing method from your Exness API documentation.'
  );
}

async function handleCreateTrade(request, apiKey, secretKey, corsHeaders) {
  const body = await request.json();
  const { symbol, type, quantity, leverage, takeProfit, stopLoss } = body;

  if (!symbol || !type || !quantity || !leverage) {
    return new Response(JSON.stringify({ error: 'Missing required fields: symbol, type, quantity, leverage' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Exness create order endpoint (per public doc snippets)
  const exnessUrl = 'https://api.exness.com/api/v1/trade/create';
  const payload = {
    symbol,
    type: type.toLowerCase(), // Exness expects "buy" or "sell" per doc examples
    quantity,
    leverage,
    ...(takeProfit != null && { takeProfit }),
    ...(stopLoss != null && { stopLoss }),
  };

  const headers = await buildSignedHeaders(apiKey, secretKey, 'POST', '/api/v1/trade/create', JSON.stringify(payload));

  const exnessRes = await fetch(exnessUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await exnessRes.json();
  return new Response(JSON.stringify(data), {
    status: exnessRes.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGetPositions(apiKey, secretKey, corsHeaders) {
  const exnessUrl = 'https://api.exness.com/api/v1/trade/open';
  const headers = await buildSignedHeaders(apiKey, secretKey, 'GET', '/api/v1/trade/open', null);

  const exnessRes = await fetch(exnessUrl, { headers });
  const data = await exnessRes.json();
  return new Response(JSON.stringify(data), {
    status: exnessRes.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleCloseTrade(request, apiKey, secretKey, corsHeaders) {
  const body = await request.json();
  const { orderId } = body;

  if (!orderId) {
    return new Response(JSON.stringify({ error: 'Missing orderId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const exnessUrl = 'https://api.exness.com/api/v1/trade/close';
  const payload = { orderId };
  const headers = await buildSignedHeaders(apiKey, secretKey, 'POST', '/api/v1/trade/close', JSON.stringify(payload));

  const exnessRes = await fetch(exnessUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await exnessRes.json();
  return new Response(JSON.stringify(data), {
    status: exnessRes.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
