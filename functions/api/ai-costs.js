// functions/api/ai-costs.js
// CF Pages Function — GET /api/ai-costs
// 오너 전용. X-Admin-Token 인증 필요.
// 자동조회: OpenRouter(OPENROUTER_API_KEY), Anthropic(ANTHROPIC_API_KEY), DeepSeek(DEEPSEEK_API_KEY)
// 고정값: 11Labs $2/월 구독, DeepSeek 잔액 $9(API 없을 때 fallback)

export async function onRequestGet({ request, env }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token',
  };
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  // 인증
  const adminToken = request.headers.get('X-Admin-Token');
  const expected = btoa((env.ADMIN_PASSWORD || '') + ':' + (env.ADMIN_SECRET || ''));
  if (adminToken !== expected) return json({ error: 'unauthorized' }, 401);

  // KV 캐시 (1시간)
  const CACHE_KEY = 'ai_costs_v2';
  const cached = await env.HUB_CONFIG.get(CACHE_KEY);
  if (cached) {
    const p = JSON.parse(cached);
    if (Date.now() - (p._ts || 0) < 3_600_000) {
      return new Response(cached, {
        headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      });
    }
  }

  // ── KST 이달 start/end ─────────────────────────────────
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = nowKST.getUTCFullYear();
  const m = String(nowKST.getUTCMonth() + 1).padStart(2, '0');
  const month = `${y}-${m}`;
  const startDate = `${month}-01`;
  // 다음 달 1일
  const nextM = nowKST.getUTCMonth() + 2;
  const nextY = nextM > 12 ? y + 1 : y;
  const endDate = `${nextY}-${String(nextM > 12 ? 1 : nextM).padStart(2, '0')}-01`;

  const services = {};

  // ── 1. OpenRouter (OPENROUTER_API_KEY) ────────────────
  try {
    if (env.OPENROUTER_API_KEY) {
      const r = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      });
      if (r.ok) {
        const d = await r.json();
        const data = d.data || d;
        services.openrouter = {
          usage_usd: typeof data.usage === 'number' ? data.usage : null,
          limit_usd: data.limit || null,
          label: data.label || null,
          source: 'api',
        };
      } else {
        services.openrouter = { error: `HTTP ${r.status}`, source: 'api' };
      }
    } else {
      services.openrouter = { error: 'OPENROUTER_API_KEY 미설정', source: 'none' };
    }
  } catch (e) {
    services.openrouter = { error: e.message, source: 'api' };
  }

  // ── 2. Anthropic (ANTHROPIC_API_KEY) — Usage API ──────
  try {
    if (env.ANTHROPIC_API_KEY) {
      const r = await fetch(
        `https://api.anthropic.com/v1/usage?start_date=${startDate}&end_date=${endDate}&limit=100`,
        {
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
        },
      );
      if (r.ok) {
        const d = await r.json();
        const rows = d.data || [];
        // 토큰 합산 (모델별 가격 평균 추정: $3/M input, $15/M output)
        let totalIn = 0, totalOut = 0, totalCacheIn = 0;
        for (const row of rows) {
          totalIn += row.input_tokens || 0;
          totalOut += row.output_tokens || 0;
          totalCacheIn += row.cache_creation_input_tokens || 0;
        }
        const estimatedUsd = totalIn / 1e6 * 3 + totalOut / 1e6 * 15 + totalCacheIn / 1e6 * 3.75;
        services.anthropic = {
          input_tokens: totalIn,
          output_tokens: totalOut,
          estimated_usd: parseFloat(estimatedUsd.toFixed(4)),
          note: '토큰→비용 추정 (avg $3/$15 per M)',
          source: 'api',
        };
      } else {
        const errText = await r.text().catch(() => '');
        services.anthropic = { error: `HTTP ${r.status}`, detail: errText.slice(0, 120), source: 'api' };
      }
    } else {
      services.anthropic = { error: 'ANTHROPIC_API_KEY 미설정', source: 'none' };
    }
  } catch (e) {
    services.anthropic = { error: e.message, source: 'api' };
  }

  // ── 3. DeepSeek — API 자동조회, fallback 고정잔액 $9 ──
  try {
    if (env.DEEPSEEK_API_KEY) {
      const r = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, Accept: 'application/json' },
      });
      if (r.ok) {
        const d = await r.json();
        const info = d.balance_infos || [];
        const usd = info.find(x => x.currency === 'USD');
        const cny = info.find(x => x.currency === 'CNY');
        services.deepseek = {
          balance_usd: usd ? parseFloat(usd.balance) : null,
          balance_cny: cny ? parseFloat(cny.balance) : null,
          source: 'api',
        };
      } else {
        // API 실패 — 고정 잔액 표시
        services.deepseek = { balance_usd: 9, balance_cny: null, source: 'fixed', note: 'API 실패, 고정값' };
      }
    } else {
      // 키 없음 — 고정 잔액 $9
      services.deepseek = { balance_usd: 9, balance_cny: null, source: 'fixed', note: '고정 잔액' };
    }
  } catch (e) {
    services.deepseek = { balance_usd: 9, balance_cny: null, source: 'fixed', note: `오류 fallback: ${e.message}` };
  }

  // ── 4. 11Labs — 고정 구독 $2/월 ───────────────────────
  services.elevenlabs = {
    subscription_usd: 2,
    plan: 'Starter',
    source: 'fixed',
    note: '$2/월 고정 구독',
  };

  // ── Hermes KV 저장 비용 읽기 ──────────────────────────
  const hermesRaw = await env.HUB_CONFIG.get('hermes_cost');
  services.hermes = hermesRaw
    ? JSON.parse(hermesRaw)
    : { manual: false, note: '크론 미실행 또는 데이터 없음' };

  const result = { _ts: Date.now(), _month: month, services };
  await env.HUB_CONFIG.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: 3600 });

  return new Response(JSON.stringify(result), {
    headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token',
    },
  });
}
