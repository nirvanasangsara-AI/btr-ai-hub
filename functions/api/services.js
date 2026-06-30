const DEFAULT_SERVICES = [
  {
    "id": "salessync",
    "name": "SalesSync2",
    "icon": "📊",
    "url": "https://btr-ai-hub.pages.dev/salessync",
    "desc": "BTR 영업 관리 — 거래처·수주·AR 통합",
    "visible": true
  },
  {
    "id": "elevator-status",
    "name": "승강기설치현황",
    "icon": "🏗️",
    "url": "https://btr-ai-hub.pages.dev/elevator-status",
    "desc": "전국 승강기 설치·점검 현황",
    "visible": true
  },
  {
    "id": "atlas",
    "name": "업계 네트워크 Atlas",
    "icon": "🗺️",
    "url": "https://elevator-industry-network-atlas.pages.dev",
    "desc": "승강기 업계 인맥·거래 네트워크 지도",
    "visible": true
  },
  {
    "id": "as-pro",
    "name": "AS Pro",
    "icon": "🔧",
    "url": "https://btr-ai-hub.pages.dev/as-pro",
    "desc": "BTR 엘리베이터 A/S 관리 시스템",
    "visible": true
  },
  {
    "id": "bid-intelligence",
    "name": "승강기 입찰정보",
    "icon": "📋",
    "url": "https://btr-ai-hub.pages.dev/bid",
    "desc": "나라장터 승강기 입찰 자동 수집·분석",
    "visible": true
  },
  {
    "id": "ai-cert-review",
    "name": "AI 인증검토",
    "icon": "🤖",
    "url": "https://btr-ai-hub.pages.dev/ai-cert",
    "desc": "승강기 인증·규격 AI 검토 보조",
    "visible": true
  },
  {
    "id": "gov-support",
    "name": "정부지원사업",
    "icon": "🏛️",
    "url": "https://btr-ai-hub.pages.dev/gov-support",
    "desc": "BTR 적합 정부지원사업 자동 탐색",
    "visible": true
  },
  {
    "id": "ai-order",
    "name": "AI발주서입력",
    "icon": "📝",
    "url": "https://btr-ai-hub.pages.dev/ai-order",
    "desc": "발주서 AI 자동 입력·분류",
    "visible": true
  }
];

export async function onRequest({ env }) {
  let data = null;

  try {
    data = await env.HUB_CONFIG.get('services');
  } catch (e) {
    // KV 접근 실패 시 기본값 사용
  }

  // KV가 비어있거나 빈 배열이면 DEFAULT_SERVICES로 복구 후 저장
  if (!data || data === '[]' || data === 'null') {
    const defaultJson = JSON.stringify(DEFAULT_SERVICES);
    try {
      await env.HUB_CONFIG.put('services', defaultJson);
    } catch (e) {
      // KV 저장 실패해도 응답은 정상 반환
    }
    data = defaultJson;
  }

  return new Response(data, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }
  });
}
