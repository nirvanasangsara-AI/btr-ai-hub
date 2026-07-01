// POST /api/usage-push — 실사용 토큰/비용 집계 저장 (로컬 수집 스크립트 → CF KV)
// 인증: X-Admin-Token: btoa(ADMIN_PASSWORD + ':' + ADMIN_SECRET)
// body: { usage_chart?:{labels,datasets}, usage_roi?:{subscriptions}, usage_by_source?:{sources} }
export async function onRequestPost({ request, env }) {
  const adminToken = request.headers.get('X-Admin-Token');
  const expected = btoa((env.ADMIN_PASSWORD || '') + ':' + (env.ADMIN_SECRET || ''));
  if (adminToken !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return new Response('Bad JSON', { status: 400 }); }

  const wrote = [];
  const putIf = async (key, val) => {
    if (val && typeof val === 'object') { await env.HUB_CONFIG.put(key, JSON.stringify(val)); wrote.push(key); }
  };
  await putIf('usage_chart', body.usage_chart);
  await putIf('usage_roi', body.usage_roi);
  await putIf('usage_by_source', body.usage_by_source);

  return new Response(JSON.stringify({ ok: true, wrote }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
