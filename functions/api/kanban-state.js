// GET /api/kanban-state — CF KV에서 kanban 상태 반환 (브라우저 폴링용)
export async function onRequest({ env }) {
  const raw = await env.HUB_CONFIG.get('kanban_state');
  return new Response(raw || '{"tasks":[],"updated_at":null}', {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}
