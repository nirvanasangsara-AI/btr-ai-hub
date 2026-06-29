// 기본 서비스 목록 (KV 없을 때 폴백)
// 2026-06-29: 기존 KV 데이터 기반으로 하드코딩 (배포 시 초기화 방지)
const DEFAULT_SERVICES = [
  {
    id: "sales-sync",
    name: "SalesSync2",
    icon: "📊",
    url: "https://btr-sales-v2.pages.dev",
    desc: "영업 목표·활동·지도 통합 플랫폼",
    visible: true
  },
  {
    id: "elevator-db",
    name: "승강기설치현황",
    icon: "🏢",
    url: "https://btr-elevator-dashboard.nirvana-sangsara.workers.dev",
    desc: "전국 908,691건 승강기 DB 조회",
    visible: true
  },
  {
    id: "atlas",
    name: "Atlas",
    icon: "🌐",
    url: "https://elevator-industry-network-atlas.pages.dev",
    desc: "엘리베이터 산업 네트워크 지도",
    visible: true
  },
  {
    id: "products",
    name: "모터사양 DB",
    icon: "⚙️",
    url: "https://btr-products.pages.dev",
    desc: "권상기 모델별 전기·기계 사양 DB",
    visible: false
  },
  {
    id: "as-pro",
    name: "AS Pro",
    icon: "🔧",
    url: "https://elevator-as-pro.pages.dev",
    desc: "AS 접수·배정·완료 통합 관리",
    visible: true
  },
  {
    id: "bid",
    name: "승강기입찰정보",
    icon: "🔔",
    url: "https://btr-web-production.up.railway.app",
    desc: "나라장터·K-apt·LH 입찰 자동 추적",
    visible: true
  },
  {
    id: "cn-docs",
    name: "중문기술매뉴얼",
    icon: "📖",
    url: "https://btr-cn-docs.pages.dev",
    desc: "Innovance 제어반 기술문서 한국어 번역 뷰어",
    visible: false
  },
  {
    id: "certification",
    name: "AI 인증검토",
    icon: "📋",
    url: "https://btraicertification-production.up.railway.app",
    desc: "KC·해외인증 요건 자동 분석",
    visible: false
  },
  {
    id: "gov-support",
    name: "정부지원사업",
    icon: "🏛️",
    url: "https://btr-government-support.pages.dev",
    desc: "R&D·수출·인증·융자 지원 검색",
    visible: true
  },
  {
    id: "expo",
    name: "전시회 현장관리",
    icon: "🌏",
    url: "https://btr-expo-field-manager.pages.dev",
    desc: "WEE 2026 광저우 전시회 업체 조사",
    visible: false
  },
  {
    id: "flood-alert",
    name: "승강기 침수경보",
    icon: "🌊",
    url: "https://elevator-flood-alert.pages.dev",
    desc: "실시간 강수량 기반 침수위험 모니터링",
    visible: true
  },
  {
    id: "vnea",
    name: "VNEA 베트남전략",
    icon: "🇻🇳",
    url: "https://vnea-vietnam-strategy.pages.dev",
    desc: "베트남 전략 대시보드 — 교신이력·법령·문서 통합",
    visible: false
  },
  {
    id: "asset-manager",
    name: "자산관리",
    icon: "📦",
    url: "https://btr-asset-manager.pages.dev",
    desc: "사무용품·장비·공구 교부 이력 추적",
    visible: true
  },
  {
    id: "ccis",
    name: "거래처 신용평가",
    icon: "🔍",
    url: "https://btr-credit-eval.pages.dev",
    desc: "BTR 거래처 신용도 평가 — 국세청·금융위 기반 721건 관리",
    visible: true
  }
];

export async function onRequest({ env }) {
  // KV에서 조회
  let data = await env.HUB_CONFIG.get('services');
  
  // KV 없으면 기본값 사용 + 자동 저장
  if (!data) {
    console.log('[services.json] KV empty, using DEFAULT_SERVICES + auto-saving');
    const defaultJson = JSON.stringify(DEFAULT_SERVICES);
    
    // 자동 저장 (fire-and-forget)
    env.HUB_CONFIG.put('services', defaultJson).catch(err => 
      console.error('[services.json] auto-save failed:', err)
    );
    
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
