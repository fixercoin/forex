// functions/_middleware.js
export async function onRequest(context) {
  try {
    return await context.next();
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'MIDDLEWARE_CAUGHT',
      message: err.message,
      stack: err.stack?.slice(0, 500)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
