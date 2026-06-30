export async function onRequestGet({ env }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  const raw = await env.HUB_CONFIG.get('usage_by_source');
  if (!raw) {
    return new Response(JSON.stringify({sources: [], updated: null}), { headers: cors });
  }
  return new Response(raw, { headers: cors });
}
