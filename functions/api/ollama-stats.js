export async function onRequestGet({ env }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  const data = await env.HUB_CONFIG.get('ollama_stats_v1');
  if (!data) {
    return new Response(JSON.stringify({ models: {}, updated: null }), { headers: cors });
  }
  return new Response(data, { headers: cors });
}

export async function onRequestPost({ request, env }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  const adminToken = request.headers.get('X-Admin-Token');
  const expected = btoa((env.ADMIN_PASSWORD || '') + ':' + (env.ADMIN_SECRET || ''));
  if (adminToken !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }
  const body = await request.json();
  body.updated = new Date().toISOString();
  await env.HUB_CONFIG.put('ollama_stats_v1', JSON.stringify(body));
  return new Response(JSON.stringify({ ok: true }), { headers: cors });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token',
    },
  });
}
