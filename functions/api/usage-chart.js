export async function onRequestGet({ env }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  // KV에서 사용량 데이터 읽기
  const raw = await env.HUB_CONFIG.get('usage_chart');
  if (raw) {
    // KV 데이터가 있으면 순서 재정렬 + fill 보정 후 반환
    try {
      const d = JSON.parse(raw);
      d.datasets = sortAndFixDatasets(d.datasets);
      return new Response(JSON.stringify(d), { headers: cors });
    } catch(e) {
      return new Response(raw, { headers: cors });
    }
  }

  // 샘플 데이터 (실제론 Python 스크립트가 KV에 푸시)
  // 모델 비용 순서: Opus(최고가) → Sonnet → Haiku(최저가)
  // stacked area: fill: '+1' 방식 (아래 dataset 기준 채움)
  const sample = {
    labels: ['06-15','06-16','06-17','06-18','06-19','06-20','06-21','06-22','06-23','06-24','06-25','06-26','06-27','06-28','06-29','06-30'],
    datasets: [
      // 1위 (가장 비쌈): Opus — 맨 위 리본
      {
        label: 'Opus 3.5',
        data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 850, 0, 1240, 0, 0],
        backgroundColor: 'rgba(236, 72, 153, 0.75)',
        borderColor: 'rgba(236, 72, 153, 1)',
        borderWidth: 1,
        fill: true,
        order: 1
      },
      // 2위: Sonnet
      {
        label: 'Sonnet 4.5',
        data: [1819, 0, 16841, 1037, 8828, 550, 3046, 3025, 3630, 3289, 2509, 19684, 10133, 20262, 18540, 12300],
        backgroundColor: 'rgba(139, 92, 246, 0.75)',
        borderColor: 'rgba(139, 92, 246, 1)',
        borderWidth: 1,
        fill: true,
        order: 2
      },
      // 3위 (최저가): Haiku — 맨 아래 리본
      {
        label: 'Haiku 4.5',
        data: [1120, 4044, 15040, 8205, 17011, 4621, 1436, 1399, 2040, 2625, 8918, 16981, 14503, 15039, 22100, 18500],
        backgroundColor: 'rgba(34, 197, 94, 0.75)',
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 1,
        fill: true,
        order: 3
      }
    ]
  };

  return new Response(JSON.stringify(sample), { headers: cors });
}

// 모델 비용 우선순위 (높을수록 위)
const MODEL_COST_RANK = {
  'opus': 10, 'claude-3-opus': 10,
  'sonnet': 5, 'claude-sonnet': 5,
  'haiku': 1, 'claude-haiku': 1,
  'other': 3
};

function getRank(label) {
  const l = (label || '').toLowerCase();
  for (const [key, rank] of Object.entries(MODEL_COST_RANK)) {
    if (l.includes(key)) return rank;
  }
  return 3;
}

function sortAndFixDatasets(datasets) {
  // 비싼 모델이 먼저(위에), 저렴한 모델이 나중(아래)
  const sorted = [...datasets].sort((a, b) => getRank(b.label) - getRank(a.label));
  // fill: true로 통일 (Chart.js stacked mode에서 누적됨)
  return sorted.map((ds, i) => ({
    ...ds,
    fill: true,
    order: i + 1
  }));
}
