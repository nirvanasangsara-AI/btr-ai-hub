// GET /api/kanban-state — CF KV에서 kanban 상태 반환 (브라우저 폴링용)
export async function onRequest({ env, request }) {
  const raw = await env.HUB_CONFIG.get('kanban_state');
  const state = raw ? JSON.parse(raw) : { tasks: [], updated_at: null };
  
  // 현재 세션 정보 추가 (활성 작업 실시간 표시)
  const sessionRaw = await env.HUB_CONFIG.get('current_session');
  if (sessionRaw) {
    try {
      state.current_session = JSON.parse(sessionRaw);
    } catch (e) {
      console.error('current_session parse error:', e);
    }
  }
  
  return new Response(JSON.stringify(state), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}
