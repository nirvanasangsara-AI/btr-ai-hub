export async function onRequestGet({ env }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  // KV에서 최근 100개 히스토리 조회
  const raw = await env.HUB_CONFIG.get('agent_health_history');
  const history = raw ? JSON.parse(raw) : [];
  
  return new Response(JSON.stringify({
    current: history[0] || null,
    history: history.slice(0, 100)
  }), { headers: cors });
}

export async function onRequestPost({ request, env }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  
  // 인증 (간단히 ADMIN_PASSWORD로)
  const adminToken = request.headers.get('X-Admin-Token');
  const expected = btoa((env.ADMIN_PASSWORD || '') + ':' + (env.ADMIN_SECRET || ''));
  if (adminToken !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });
  }
  
  const data = await request.json();
  
  // 히스토리 추가 (최대 100개)
  const raw = await env.HUB_CONFIG.get('agent_health_history');
  let history = raw ? JSON.parse(raw) : [];
  history.unshift(data);  // 최신이 앞
  history = history.slice(0, 100);
  
  await env.HUB_CONFIG.put('agent_health_history', JSON.stringify(history));
  
  return new Response(JSON.stringify({ ok: true, count: history.length }), { headers: cors });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token'
    }
  });
}
