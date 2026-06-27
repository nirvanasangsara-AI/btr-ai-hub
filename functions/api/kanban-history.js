// GET /api/kanban-history — CF KV에서 일별 히스토리 반환
export async function onRequestGet({ env }) {
  const val = await env.HUB_CONFIG.get('kanban_history');
  const data = val ? JSON.parse(val) : { daily: [] };
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
