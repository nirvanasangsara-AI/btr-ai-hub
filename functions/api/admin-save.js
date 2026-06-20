export async function onRequestPost({ request, env }) {
  const adminToken = request.headers.get('X-Admin-Token');
  const expected = btoa(env.ADMIN_PASSWORD + ':' + env.ADMIN_SECRET);
  if (adminToken !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }
  const services = await request.json();
  await env.HUB_CONFIG.put('services', JSON.stringify(services));
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
