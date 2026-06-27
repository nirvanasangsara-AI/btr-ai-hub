// POST /api/kanban-push — Kanban 태스크 상태 저장 (Mac mini cron → CF KV)
// 인증: X-Admin-Token: btoa(ADMIN_PASSWORD + ':' + ADMIN_SECRET)
export async function onRequestPost({ request, env }) {
  const adminToken = request.headers.get('X-Admin-Token');
  const expected = btoa(env.ADMIN_PASSWORD + ':' + env.ADMIN_SECRET);
  if (adminToken !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json();
  // { tasks: [...], updated_at: "ISO" }
  await env.HUB_CONFIG.put('kanban_state', JSON.stringify(body));

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    },
  });
}
