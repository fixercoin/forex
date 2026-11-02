// functions/api/exness/accounts.js
import { exnessFetch } from './_auth.js';
import { verifySessionToken } from './auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  const url = new URL(request.url);
  const sessionToken = url.searchParams.get('sessionToken');

  const valid = await verifySessionToken(sessionToken, env);
  if (!valid) {
    return new Response(JSON.stringify({
      error: 'SESSION_INVALID_OR_EXPIRED'
    }), { status: 403, headers: corsHeaders });
  }

  try {
    const exnessRes = await exnessFetch(
      'https://api.exness.com/api/v1/account/accounts',
      'GET',
      null,
      env
    );
    const data = await exnessRes.json();
    return new Response(JSON.stringify(data), {
      status: exnessRes.status,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
