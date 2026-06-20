export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // GET /services.json — KV에서 읽어서 반환
    if (url.pathname === '/services.json') {
      const data = await env.HUB_CONFIG.get('services');
      if (!data) return new Response('[]', { headers: { ...cors, 'Content-Type': 'application/json' } });
      return new Response(data, { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // POST /api/admin-login
    if (url.pathname === '/api/admin-login' && request.method === 'POST') {
      const { password } = await request.json();
      if (password === env.ADMIN_PASSWORD) {
        // 단순 토큰: HMAC 대신 서버 시크릿 포함 해시
        const token = env.ADMIN_PASSWORD + ':' + env.ADMIN_SECRET;
        const encoded = btoa(token);
        return new Response(JSON.stringify({ ok: true, token: encoded }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/admin-save — 서비스 설정 저장
    if (url.pathname === '/api/admin-save' && request.method === 'POST') {
      const adminToken = request.headers.get('X-Admin-Token');
      const expected = btoa(env.ADMIN_PASSWORD + ':' + env.ADMIN_SECRET);
      if (adminToken !== expected) {
        return new Response('Unauthorized', { status: 401, headers: cors });
      }
      const services = await request.json();
      await env.HUB_CONFIG.put('services', JSON.stringify(services));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 나머지는 정적 파일 (Pages가 처리)
    return new Response('Not found', { status: 404 });
  }
};
