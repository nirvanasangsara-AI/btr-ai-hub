export async function onRequestGet({ env, request }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const url = new URL(request.url);

  // /api/usage-source 처리 (하이픈 라우팅 버그 우회)
  if (url.pathname.endsWith('/usage-source') || url.searchParams.get('type') === 'source') {
    const raw = await env.HUB_CONFIG.get('usage_by_source');
    if (!raw) return new Response(JSON.stringify({sources: [], updated: null}), { headers: cors });
    return new Response(raw, { headers: cors });
  }

  // 구독 활용도(ROI) — 실사용 토큰의 API 환산가치 vs 구독료
  if (url.searchParams.get('type') === 'roi') {
    const raw = await env.HUB_CONFIG.get('usage_roi');
    if (raw) return new Response(raw, { headers: cors });
    return new Response(JSON.stringify(buildRoiSample()), { headers: cors });
  }

  const today = kstToday();

  // KV에서 사용량 데이터 읽기
  const raw = await env.HUB_CONFIG.get('usage_chart');
  if (raw) {
    try {
      const d = JSON.parse(raw);
      // 오늘 기준 30일 롤링 윈도우로 재정렬 + 색상 보정 + 모델순 정렬
      const windowed = rewindowTo30Days(d, today);
      windowed.datasets = attachPricing(ensureColors(sortDatasets(windowed.datasets)));
      return new Response(JSON.stringify(windowed), { headers: cors });
    } catch(e) {
      return new Response(raw, { headers: cors });
    }
  }

  // 샘플 데이터 (실제론 Hermes 트래킹 스크립트가 KV에 푸시)
  // KV가 비어있을 때만 사용 — 오늘 기준 30일 롤링, 사용 모델 전체를 리본으로 표현
  const sample = buildSample(today);
  sample.datasets = attachPricing(ensureColors(sortDatasets(sample.datasets)));
  return new Response(JSON.stringify(sample), { headers: cors });
}

// ── 날짜 유틸 ──────────────────────────────────────────────
function pad2(n){ return String(n).padStart(2, '0'); }
function mmdd(d){ return pad2(d.getUTCMonth()+1) + '-' + pad2(d.getUTCDate()); }

// KST(UTC+9) 자정 기준 오늘
function kstToday() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// 오늘 포함 최근 30일의 'MM-DD' 라벨
function last30Labels(today) {
  const out = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(mmdd(d));
  }
  return out;
}

// 'YYYY-MM-DD' / 'MM-DD' 어떤 형식이든 'MM-DD'로 정규화
function toMMDD(label) {
  const s = String(label || '');
  const m = s.match(/(\d{1,2})-(\d{1,2})$/);
  return m ? pad2(m[1]) + '-' + pad2(m[2]) : s;
}

// 데이터를 오늘 기준 30일 윈도우에 매핑 (없는 날은 0, 오래된 날은 자동 탈락)
function rewindowTo30Days(data, today) {
  const labels = last30Labels(today);
  const oldLabels = (data.labels || []).map(toMMDD);
  const idxByLabel = {};
  oldLabels.forEach((l, i) => { idxByLabel[l] = i; });
  const datasets = (data.datasets || []).map(ds => {
    const src = ds.data || [];
    const newData = labels.map(l => {
      const i = idxByLabel[l];
      const v = (i !== undefined) ? src[i] : 0;
      return (v == null || isNaN(v)) ? 0 : v;
    });
    return { ...ds, data: newData };
  });
  return { ...data, labels, datasets, _window: '30d', _today: mmdd(today) };
}

// ── 모델 정렬 (비싼 모델이 위 리본) ───────────────────────
const MODEL_COST_RANK = {
  'opus': 100, 'gpt-4': 70, 'gpt-5': 80, 'o1': 75, 'o3': 78,
  'sonnet': 60, 'gemini': 55, 'grok': 50,
  'haiku': 20, 'deepseek': 15, 'mini': 18, 'flash': 25,
  'other': 40
};
function getRank(label) {
  const l = (label || '').toLowerCase();
  let best = null;
  for (const [key, rank] of Object.entries(MODEL_COST_RANK)) {
    if (key !== 'other' && l.includes(key)) { if (best === null || rank > best) best = rank; }
  }
  return best === null ? MODEL_COST_RANK.other : best;
}
function sortDatasets(datasets) {
  const sorted = [...datasets].sort((a, b) => getRank(b.label) - getRank(a.label));
  return sorted.map((ds, i) => ({ ...ds, fill: true, order: i + 1 }));
}

// ── 색상: 알려진 모델은 고정색, 그 외는 팔레트로 자동 배정 ──
const MODEL_HUES = [
  { key: 'opus',     rgb: '236,72,153'  },  // 핑크
  { key: 'sonnet',   rgb: '139,92,246'  },  // 퍼플
  { key: 'haiku',    rgb: '34,197,94'   },  // 그린
  { key: 'gpt',      rgb: '16,163,127'  },  // OpenAI 그린
  { key: 'o1',       rgb: '16,163,127'  },
  { key: 'o3',       rgb: '16,163,127'  },
  { key: 'gemini',   rgb: '66,133,244'  },  // 구글 블루
  { key: 'grok',     rgb: '148,163,184' },  // xAI 그레이
  { key: 'deepseek', rgb: '26,110,232'  },  // 딥시크 블루
  { key: 'perplexity', rgb: '32,184,205' },
];
const PALETTE = [
  '236,72,153', '139,92,246', '34,197,94', '59,130,246', '245,158,11',
  '20,184,166', '244,63,94', '168,85,247', '250,204,21', '96,165,250',
  '251,113,133', '52,211,153', '129,140,248', '253,164,175', '45,212,191'
];
function hueFor(label) {
  const l = (label || '').toLowerCase();
  for (const h of MODEL_HUES) if (l.includes(h.key)) return h.rgb;
  return null;
}
function ensureColors(datasets) {
  // 고정색(알려진 모델)을 먼저 확보한 뒤, 나머지는 겹치지 않는 팔레트색을 배정
  const used = new Set();
  const resolved = datasets.map(ds => {
    const rgb = hueFor(ds.label);
    if (rgb) used.add(rgb);
    return { ds, rgb };
  });
  let p = 0;
  const nextPalette = () => {
    for (let k = 0; k < PALETTE.length; k++) {
      const c = PALETTE[(p + k) % PALETTE.length];
      if (!used.has(c)) { p = (p + k + 1) % PALETTE.length; used.add(c); return c; }
    }
    return PALETTE[(p++) % PALETTE.length]; // 팔레트 소진 시 순환 허용
  };
  return resolved.map(({ ds, rgb }) => {
    const c = rgb || nextPalette();
    return {
      ...ds,
      backgroundColor: `rgba(${c},0.72)`,
      borderColor: `rgba(${c},1)`,
      borderWidth: ds.borderWidth ?? 1,
    };
  });
}

// ── 샘플 (KV 비었을 때 데모) — 결정적 패턴, 모델 다수 ──────
function buildSample(today) {
  const labels = last30Labels(today);
  const N = labels.length;
  const models = [
    { label: 'Opus 4.8',   base: 4200, amp: 3800, phase: 0.0,  spike: 6 },
    { label: 'Sonnet 5',   base: 12000, amp: 9000, phase: 1.1, spike: 0 },
    { label: 'Haiku 4.5',  base: 8000,  amp: 6500, phase: 2.2, spike: 0 },
    { label: 'GPT-5',      base: 3000,  amp: 2600, phase: 0.7, spike: 0 },
    { label: 'Gemini 2.5', base: 2200,  amp: 2000, phase: 3.0, spike: 0 },
    { label: 'Grok-3',     base: 1400,  amp: 1300, phase: 1.7, spike: 0 },
    { label: 'DeepSeek',   base: 1800,  amp: 1600, phase: 2.6, spike: 0 },
  ];
  const datasets = models.map(m => {
    const data = [];
    for (let i = 0; i < N; i++) {
      // 결정적 파형 (주중 상승 느낌) + 가끔 스파이크
      const wave = Math.sin(i * 0.45 + m.phase) * 0.5 + 0.5;
      let v = Math.round(m.base + m.amp * wave);
      if (m.spike && i % 9 === m.spike % 9) v += m.amp; // 간헐 스파이크
      if (i > N - 2 && m.label.includes('Opus')) v = 0; // 최근 미사용 예시
      data.push(v);
    }
    return { label: m.label, data, fill: true };
  });
  return { labels, datasets, _window: '30d', _today: mmdd(today), _sample: true };
}

// ── 모델 단가 (USD / 1M 토큰) — 비용축 토글·ROI 환산용 ──────
// in/out + 혼합단가(에이전트 사용 가정: 입력 0.7 · 출력 0.3 가중)
const MODEL_PRICE = {
  'opus':     { in: 5,    out: 25 },
  'sonnet':   { in: 3,    out: 15 },
  'haiku':    { in: 1,    out: 5 },
  'gpt':      { in: 1.25, out: 10 },
  'o1':       { in: 15,   out: 60 },
  'o3':       { in: 2,    out: 8 },
  'gemini':   { in: 1.25, out: 10 },
  'grok':     { in: 3,    out: 15 },
  'deepseek': { in: 0.27, out: 1.10 },
  'perplexity': { in: 1, out: 1 },
};
function priceFor(label) {
  const l = (label || '').toLowerCase();
  for (const [k, p] of Object.entries(MODEL_PRICE)) if (l.includes(k)) return p;
  return { in: 3, out: 15 };
}
function blendedPer1M(label) {
  const p = priceFor(label);
  return Math.round((p.in * 0.7 + p.out * 0.3) * 100) / 100;
}
// 각 데이터셋에 혼합단가($/1M)를 붙여 프론트에서 토큰→비용 환산 가능
function attachPricing(datasets) {
  return datasets.map(ds => ({ ...ds, blendedPer1M: blendedPer1M(ds.label) }));
}

// ── ROI 샘플 (KV usage_roi 비었을 때) — 구독별 API 환산가치 ──
function buildRoiSample() {
  // tokens: {in, out} 이달 실사용(데모). api_equiv_usd는 서버에서 계산.
  const rows = [
    { key: 'anthropic', model: 'Opus 4.8',  in: 42_000_000, out: 7_800_000, cache_read: 120_000_000 },
    { key: 'openai',    model: 'GPT-5',     in: 5_200_000,  out: 900_000,   cache_read: 0 },
    { key: 'gemini',    model: 'Gemini 2.5', in: 3_100_000, out: 620_000,   cache_read: 0 },
  ];
  const subscriptions = {};
  for (const r of rows) {
    const p = priceFor(r.model);
    // 캐시 읽기는 입력가의 ~0.1배로 환산
    const api_equiv_usd = (r.in / 1e6) * p.in + (r.out / 1e6) * p.out + (r.cache_read / 1e6) * p.in * 0.1;
    subscriptions[r.key] = {
      tokens_in: r.in, tokens_out: r.out, cache_read: r.cache_read,
      top_model: r.model,
      api_equiv_usd: Math.round(api_equiv_usd * 100) / 100,
    };
  }
  return { subscriptions, month: null, updated: null, _sample: true };
}
