// GET /api/stats — 전체 서비스 클릭 통계 반환
export async function onRequest({ env }) {
  const data = await env.HUB_CONFIG.get('click_stats');
  return new Response(data || '{}', {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }
  });
}
