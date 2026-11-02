// functions/api/exness/accounts.js
// GET /api/exness/accounts
// Returns list of trading accounts with balance details.
// ⚠️ The exact Exness endpoint for account details is NOT in search results.
// Official docs confirm the API supports this [citation:4] but do not give the path.
// Adjust the URL below to match your Exness developer portal docs.

import { exnessFetch } from './_auth.js';

export async function onRequestGet(context) {
  const { env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // ⚠️ PLACEHOLDER ENDPOINT — verify in your Exness developer portal
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
