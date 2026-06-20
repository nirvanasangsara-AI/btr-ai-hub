export async function onRequest({ env }) {
  const data = await env.HUB_CONFIG.get('services');
  return new Response(data || '[]', {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }
  });
}
