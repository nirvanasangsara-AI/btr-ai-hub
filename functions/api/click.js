// POST /api/click — 서비스 클릭 1회 기록 (날짜별 누적)
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const { id, date } = await request.json();
  if (!id || !date) return new Response('Bad Request', { status: 400 });

  // 기존 통계 읽기
  const raw = await env.HUB_CONFIG.get('click_stats');
  const stats = raw ? JSON.parse(raw) : {};

  // id 별 날짜별 카운트
  if (!stats[id]) stats[id] = {};
  stats[id][date] = (stats[id][date] || 0) + 1;

  // 60일 이상 된 데이터 정리
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const svcId of Object.keys(stats)) {
    for (const d of Object.keys(stats[svcId])) {
      if (d < cutoffStr) delete stats[svcId][d];
    }
  }

  await env.HUB_CONFIG.put('click_stats', JSON.stringify(stats));
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
