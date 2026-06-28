export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // GET /services.json
    if (url.pathname === '/services.json') {
      const data = await env.HUB_CONFIG.get('services');
      if (!data) return new Response('[]', { headers: { ...cors, 'Content-Type': 'application/json' } });
      return new Response(data, { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // POST /api/admin-login
    if (url.pathname === '/api/admin-login' && request.method === 'POST') {
      const { password } = await request.json();
      if (password === env.ADMIN_PASSWORD) {
        const encoded = btoa(env.ADMIN_PASSWORD + ':' + env.ADMIN_SECRET);
        return new Response(JSON.stringify({ ok: true, token: encoded }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ ok: false }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/admin-save
    if (url.pathname === '/api/admin-save' && request.method === 'POST') {
      const adminToken = request.headers.get('X-Admin-Token');
      const expected = btoa(env.ADMIN_PASSWORD + ':' + env.ADMIN_SECRET);
      if (adminToken !== expected) return new Response('Unauthorized', { status: 401, headers: cors });
      const services = await request.json();
      await env.HUB_CONFIG.put('services', JSON.stringify(services));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/ai-costs — AI 비용 집계 (KV 1시간 캐시)
    if (url.pathname === '/api/ai-costs') {
      // 인증 확인 (오너만)
      const adminToken = request.headers.get('X-Admin-Token');
      const expected = btoa((env.ADMIN_PASSWORD || '') + ':' + (env.ADMIN_SECRET || ''));
      if (adminToken !== expected) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      // KV 캐시 확인 (1시간)
      const cacheKey = 'ai_costs_v1';
      const cached = await env.HUB_CONFIG.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed._ts || 0);
        if (age < 3600_000) {
          return new Response(cached, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
        }
      }

      // 구독 고정비 config (수동 관리)
      const SUBSCRIPTIONS = {
        chatgpt_pro:  { name: 'ChatGPT Pro', usd: 200, currency: 'USD' },
        claude_pro:   { name: 'Claude Pro', usd: 20, currency: 'USD' },
        gemini:       { name: 'Gemini Advanced', usd: 20, currency: 'USD' },
        perplexity:   { name: 'Perplexity Pro', usd: 20, currency: 'USD' },
        elevenlabs:   { name: 'ElevenLabs Creator', usd: 22, currency: 'USD' },
        manus:        { name: 'Manus Pro', usd: 0, currency: 'USD', note: '크레딧제' },
        railway:      { name: 'Railway', usd: 0, currency: 'USD', note: 'Trial' },
        cloudflare:   { name: 'Cloudflare', usd: 0, currency: 'USD', note: 'Free' },
      };

      // API 사용량 조회
      const apiCosts = {};

      // 1. DeepSeek — 잔액 조회
      try {
        if (env.DEEPSEEK_API_KEY) {
          const r = await fetch('https://api.deepseek.com/user/balance', {
            headers: { 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`, 'Accept': 'application/json' }
          });
          if (r.ok) {
            const d = await r.json();
            // balance_infos 배열, currency "CNY" or "USD"
            const info = d.balance_infos || [];
            const usd = info.find(x => x.currency === 'USD');
            const cny = info.find(x => x.currency === 'CNY');
            apiCosts.deepseek = {
              balance_usd: usd ? parseFloat(usd.balance) : null,
              balance_cny: cny ? parseFloat(cny.balance) : null,
              source: 'api'
            };
          }
        }
      } catch(e) { apiCosts.deepseek = { error: e.message, source: 'api' }; }

      // 2. OpenAI — 이달 사용량
      try {
        if (env.OPENAI_API_KEY) {
          const now = new Date();
          const y = now.getUTCFullYear(), m = String(now.getUTCMonth()+1).padStart(2,'0');
          const startDate = `${y}-${m}-01`;
          const tomorrow = new Date(now.getTime()+86400000);
          const endDate = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth()+1).padStart(2,'0')}-${String(tomorrow.getUTCDate()).padStart(2,'0')}`;
          const r = await fetch(`https://api.openai.com/v1/usage?date=${startDate}`, {
            headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` }
          });
          if (r.ok) {
            const d = await r.json();
            // context_tokens_total, generated_tokens_total 합산 → 비용 추정
            const ctxTotal = (d.data || []).reduce((s,x) => s+(x.n_context_tokens_total||0), 0);
            const genTotal = (d.data || []).reduce((s,x) => s+(x.n_generated_tokens_total||0), 0);
            apiCosts.openai = { ctx_tokens: ctxTotal, gen_tokens: genTotal, source: 'api', note: '토큰→비용 추정 필요' };
          } else {
            // /v1/usage 실패 시 billing credit grants 시도
            const r2 = await fetch('https://api.openai.com/dashboard/billing/credit_grants', {
              headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` }
            });
            if (r2.ok) {
              const d2 = await r2.json();
              apiCosts.openai = { total_granted: d2.total_granted, total_used: d2.total_used, source: 'billing' };
            } else {
              apiCosts.openai = { error: `HTTP ${r.status}`, source: 'api' };
            }
          }
        }
      } catch(e) { apiCosts.openai = { error: e.message, source: 'api' }; }

      // 3. Anthropic — 공개 Usage API 없음, 수동 입력 필드만
      apiCosts.anthropic = { manual: true, note: 'console.anthropic.com 수동 확인' };

      // 4. Gemini — GCP Billing API (복잡), 현재는 수동
      apiCosts.gemini = { manual: true, note: 'console.cloud.google.com 수동 확인' };

      // 5. OpenRouter — 크레딧+사용량 (Pareto Code 라우팅 포함)
      try {
        if (env.OPENROUTER_API_KEY) {
          const r = await fetch('https://openrouter.ai/api/v1/auth/key', {
            headers: { 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` }
          });
          if (r.ok) {
            const d = await r.json();
            const data = d.data || d;
            apiCosts.openrouter = {
              usage_monthly: data.usage_monthly || data.usage || 0,
              credits: data.credits || null,
              limit: data.limit,
              source: 'api'
            };
          }
        }
      } catch(e) { apiCosts.openrouter = { error: e.message, source: 'api' }; }

      // 6. Hermes — KV에 크론이 저장한 값 읽기
      const hermesRaw = await env.HUB_CONFIG.get('hermes_cost');
      if (hermesRaw) {
        apiCosts.hermes = JSON.parse(hermesRaw);  // { month, total_usd, detail: {...} }
      } else {
        apiCosts.hermes = { manual: false, note: '크론 미실행 또는 데이터 없음' };
      }

      // 결과 조합
      const result = {
        _ts: Date.now(),
        _month: new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,7),
        services: {
          hermes:    { label: 'Hermes / Claude API',  sub: { name: null, usd: 0 },              api: apiCosts.hermes,    dashboard: 'https://console.anthropic.com/settings/usage' },
          openrouter:{ label: 'OpenRouter (Pareto)', sub: { name: null, usd: 0 },              api: apiCosts.openrouter, dashboard: 'https://openrouter.ai/settings/credits' },
          anthropic: { label: 'Anthropic (Claude)',   sub: SUBSCRIPTIONS.anthropic, api: apiCosts.anthropic, dashboard: 'https://console.anthropic.com/settings/usage' },
          openai:    { label: 'OpenAI (GPT)',         sub: SUBSCRIPTIONS.openai,    api: apiCosts.openai,    dashboard: 'https://platform.openai.com/settings/organization/billing' },
          deepseek:  { label: 'DeepSeek',             sub: SUBSCRIPTIONS.deepseek,  api: apiCosts.deepseek,  dashboard: 'https://platform.deepseek.com/usage' },
          gemini:    { label: 'Google (Gemini)',       sub: SUBSCRIPTIONS.gemini,    api: apiCosts.gemini,    dashboard: 'https://console.cloud.google.com/billing' },
          perplexity:{ label: 'Perplexity Pro',        sub: SUBSCRIPTIONS.perplexity, api: null,             dashboard: 'https://www.perplexity.ai/settings/api' },
          railway:   { label: 'Railway',               sub: SUBSCRIPTIONS.railway,   api: null,               dashboard: 'https://railway.app/dashboard' },
          cloudflare:{ label: 'Cloudflare',            sub: SUBSCRIPTIONS.cloudflare, api: null,              dashboard: 'https://dash.cloudflare.com' },
        }
      };

      await env.HUB_CONFIG.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 });
      return new Response(JSON.stringify(result), {
        headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'MISS' }
      });
    }

    // POST /api/ai-costs-manual — 수동 금액 업데이트 (Anthropic API비 등)
    if (url.pathname === '/api/ai-costs-manual' && request.method === 'POST') {
      const adminToken = request.headers.get('X-Admin-Token');
      const expected = btoa((env.ADMIN_PASSWORD || '') + ':' + (env.ADMIN_SECRET || ''));
      if (adminToken !== expected) return new Response('Unauthorized', { status: 401, headers: cors });
      const body = await request.json(); // { service: 'anthropic', api_usd: 5.40 }
      const manualKey = 'ai_costs_manual';
      const existing = JSON.parse(await env.HUB_CONFIG.get(manualKey) || '{}');
      existing[body.service] = { api_usd: body.api_usd, updated: new Date().toISOString().slice(0,10) };
      await env.HUB_CONFIG.put(manualKey, JSON.stringify(existing));
      // 캐시 무효화
      await env.HUB_CONFIG.delete('ai_costs_v1');
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response('Not found', { status: 404 });
  }
};
