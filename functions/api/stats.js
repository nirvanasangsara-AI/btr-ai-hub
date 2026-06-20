// GET /api/stats — HUB_STATS(전용 KV)에서 클릭 통계 반환 — 배포와 무관하게 영구 보존
export async function onRequest({ env }) {
  const data = await env.HUB_STATS.get('click_stats');
  return new Response(data || '{}', {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }
  });
}
