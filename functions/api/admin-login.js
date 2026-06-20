export async function onRequestPost({ request, env }) {
  const { password } = await request.json();
  if (password !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const token = btoa(env.ADMIN_PASSWORD + ':' + env.ADMIN_SECRET);
  return new Response(JSON.stringify({ ok: true, token }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
