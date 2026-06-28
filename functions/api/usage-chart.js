export async function onRequestGet({ env }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  // KV에서 사용량 데이터 읽기
  const raw = await env.HUB_CONFIG.get('usage_chart');
  if (!raw) {
    // 샘플 데이터 (실제론 Python 스크립트가 KV에 푸시)
    const sample = {
      labels: ['06-15', '06-16', '06-17', '06-18', '06-19', '06-20', '06-21', '06-22', '06-23', '06-24', '06-25', '06-26', '06-27', '06-28'],
      datasets: [
        {
          label: 'Haiku 4.5',
          data: [1120, 4044, 15040, 8205, 17011, 4621, 1436, 1399, 2040, 2625, 8918, 16981, 14503, 15039],
          backgroundColor: 'rgba(34, 197, 94, 0.6)',
          borderColor: 'rgba(34, 197, 94, 1)',
          borderWidth: 1,
          fill: true
        },
        {
          label: 'Sonnet 4.5',
          data: [1819, 0, 16841, 1037, 8828, 550, 3046, 3025, 3630, 3289, 2509, 19684, 10133, 20262],
          backgroundColor: 'rgba(99, 102, 241, 0.6)',
          borderColor: 'rgba(99, 102, 241, 1)',
          borderWidth: 1,
          fill: true
        },
        {
          label: 'Opus 3.5',
          data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 850, 0, 1240],
          backgroundColor: 'rgba(236, 72, 153, 0.6)',
          borderColor: 'rgba(236, 72, 153, 1)',
          borderWidth: 1,
          fill: true
        }
      ]
    };
    return new Response(JSON.stringify(sample), { headers: cors });
  }

  return new Response(raw, { headers: cors });
}
