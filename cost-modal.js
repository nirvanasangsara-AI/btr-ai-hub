// AI 비용 상세 모달 JavaScript

async function showCostDetail(serviceKey) {
  const cfg = COST_CONFIG.find(c => c.key === serviceKey);
  if (!cfg) return;
  
  // 모달 열기
  const modal = document.getElementById('cost-detail-modal');
  const title = document.getElementById('cost-detail-title');
  const body = document.getElementById('cost-detail-body');
  
  title.innerHTML = `${cfg.logo ? `<img src="${cfg.logo}" style="width:24px;height:24px;border-radius:4px">` : (cfg.emoji || '')} ${cfg.label}`;
  body.innerHTML = '<div class="no-data">거래 내역을 불러오는 중...</div>';
  modal.classList.add('open');
  
  // DB에서 거래 내역 조회
  try {
    const r = await fetch(`/api/billing-history?service=${encodeURIComponent(cfg.label)}`, {
      headers: { 'X-Admin-Token': OWNER_TOKEN }
    });
    
    if (!r.ok) throw new Error('API 실패');
    
    const transactions = await r.json();
    
    if (!transactions || transactions.length === 0) {
      body.innerHTML = `<div class="no-data">
        <div style="font-size:2rem;margin-bottom:12px">📭</div>
        <div>거래 내역이 없습니다</div>
        <div style="font-size:.7rem;color:#334155;margin-top:8px">API 연동 후 자동 수집됩니다</div>
      </div>`;
      return;
    }
    
    // 최신순 정렬
    transactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    
    // 총액 계산
    const total = transactions.reduce((sum, t) => sum + parseFloat(t.amount_usd || 0), 0);
    
    // 렌더링
    const rows = transactions.map(t => {
      const date = new Date(t.transaction_date).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      return `<div class="transaction-item">
        <div>
          <div class="transaction-date">${date}</div>
          ${t.description ? `<div class="transaction-desc">${t.description}</div>` : ''}
        </div>
        <div class="transaction-amount">$${parseFloat(t.amount_usd).toFixed(2)}</div>
      </div>`;
    }).join('');
    
    body.innerHTML = `
      <div style="background:#0f172a;border:1px solid#22c55e;border-radius:8px;padding:12px 16px;margin-bottom:16px">
        <div style="font-size:.7rem;color:#64748b;margin-bottom:4px">총 ${transactions.length}건</div>
        <div style="font-size:1.3rem;font-weight:800;color:#4ade80">$${total.toFixed(2)}</div>
      </div>
      <div class="transaction-list">${rows}</div>
    `;
    
  } catch (e) {
    console.error('거래 내역 조회 실패:', e);
    body.innerHTML = `<div class="no-data">
      <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
      <div>데이터를 불러올 수 없습니다</div>
      <div style="font-size:.7rem;color:#334155;margin-top:8px">${e.message}</div>
    </div>`;
  }
}

function closeCostDetail() {
  document.getElementById('cost-detail-modal').classList.remove('open');
}

// ESC 키로 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCostDetail();
});
