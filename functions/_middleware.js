// functions/_middleware.js
// Catches ALL uncaught errors in /api/exness/* and returns JSON.
// Without this, Cloudflare serves its own 502 HTML page.

export async function onRequest(context) {
  try {
    return await context.next();
  } catch (err) {
    const isApi = context.request.url.includes('/api/');
    if (isApi) {
      return new Response(JSON.stringify({
        error: 'MIDDLEWARE_CAUGHT',
        message: err.message,
        stack: err.stack?.slice(0, 800),
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    // Non-API routes: return plain HTML
    return new Response(`<h1>Error</h1><pre>${err.message}</pre>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
