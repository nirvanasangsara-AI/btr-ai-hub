/**
 * API: /api/billing-history
 * 특정 서비스의 거래 내역 조회
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  
  // 인증 체크
  const token = request.headers.get('X-Admin-Token');
  const validToken = await env.HUB_CONFIG.get('ADMIN_TOKEN');
  
  if (!validToken || token !== validToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 서비스명 파라미터
  const url = new URL(request.url);
  const service = url.searchParams.get('service');
  
  if (!service) {
    return new Response(JSON.stringify({ error: 'service parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // D1 DB 조회
    const db = env.BILLING_DB;
    
    if (!db) {
      // DB 없으면 빈 배열 반환
      return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { results } = await db.prepare(`
      SELECT 
        transaction_date,
        amount_usd,
        currency,
        description,
        status
      FROM billing_history
      WHERE service = ?
      ORDER BY transaction_date DESC
      LIMIT 100
    `).bind(service).all();
    
    return new Response(JSON.stringify(results || []), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (error) {
    console.error('billing-history error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
