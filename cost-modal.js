// AI 비용 상세 모달 JavaScript

async function showCostDetail(serviceKey) {
  const cfg = COST_CONFIG.find(c => c.key === serviceKey);
  if (!cfg) return;
  
  // 모달 열기
  const modal = document.getElementById('cost-detail-modal');
  const title = document.getElementById('cost-detail-title');
  const body = document.getElementById('cost-detail-body');
  
  title.innerHTML = `${cfg.logo ? `<img src="${cfg.logo}" style="width:24px;height:24px;border-radius:4px;object-fit:contain">` : (cfg.emoji || '')} ${cfg.label}`;
  body.innerHTML = '<div class="no-data">거래 내역을 불러오는 중...</div>';
  modal.classList.add('open');

  // 서비스 기본 정보 카드
  const cs = cfg.card ? (CARD_STYLES[cfg.card] || CARD_STYLES.unknown) : null;
  const cardHtml = cs ? `
    <div style="background:${cs.bg};border-radius:10px;padding:14px 16px;margin-bottom:14px;border:1px solid rgba(255,255,255,.12);position:relative;overflow:hidden">
      <div style="position:absolute;right:12px;top:10px;width:26px;height:18px;border-radius:3px;background:${cs.chip};opacity:.85"></div>
      <div style="font-size:.62rem;color:rgba(255,255,255,.55);margin-bottom:6px">결제 카드</div>
      <div style="font-size:.82rem;font-weight:700;color:rgba(255,255,255,.9)">${cs.name}</div>
      ${cfg.billingType === 'monthly' && cfg.billingDay ? `<div style="font-size:.68rem;color:rgba(255,255,255,.55);margin-top:4px">매월 ${cfg.billingDay}일 결제</div>` : ''}
      ${cfg.billingType === 'annual' && cfg.nextDate ? `<div style="font-size:.68rem;color:rgba(255,255,255,.55);margin-top:4px">다음 갱신: ${cfg.nextDate}</div>` : ''}
    </div>` : '';

  const planHtml = `
    <div style="background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:12px 14px;margin-bottom:14px">
      ${cfg.sub > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:.72rem;color:#64748b">월 구독</span>
        <span style="font-size:1.1rem;font-weight:800;color:#4ade80">$${cfg.sub.toFixed(2)}</span>
      </div>` : ''}
      ${cfg.subName ? `<div style="font-size:.7rem;color:#94a3b8;margin-bottom:4px">${cfg.subName}</div>` : ''}
      ${cfg.note ? `<div style="font-size:.68rem;color:#475569">${cfg.note}</div>` : ''}
      ${cfg.dashboard ? `<a href="${cfg.dashboard}" target="_blank" style="display:inline-block;margin-top:8px;font-size:.68rem;color:#38bdf8;text-decoration:none">→ 대시보드 열기</a>` : ''}
    </div>`;

  // DB에서 거래 내역 조회
  try {
    const r = await fetch(`/api/billing-history?service=${encodeURIComponent(cfg.label)}`, {
      headers: { 'X-Admin-Token': OWNER_TOKEN }
    });
    
    if (!r.ok) throw new Error(`${r.status}`);
    
    const transactions = await r.json();
    
    if (!transactions || transactions.length === 0) {
      body.innerHTML = cardHtml + planHtml + `
        <div style="text-align:center;padding:20px 0;color:#334155;font-size:.75rem">
          <div style="font-size:1.5rem;margin-bottom:8px">📭</div>
          <div>거래 내역이 없습니다</div>
          <div style="font-size:.65rem;margin-top:4px;color:#1e3a5f">결제 이력은 수동 또는 크론으로 자동 수집됩니다</div>
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
        year: 'numeric', month: 'short', day: 'numeric'
      });
      return `<div class="transaction-item">
        <div>
          <div class="transaction-date">${date}</div>
          ${t.description ? `<div class="transaction-desc">${t.description}</div>` : ''}
        </div>
        <div class="transaction-amount">$${parseFloat(t.amount_usd).toFixed(2)}</div>
      </div>`;
    }).join('');
    
    body.innerHTML = cardHtml + planHtml + `
      <div style="background:#0f172a;border:1px solid#22c55e;border-radius:8px;padding:12px 16px;margin-bottom:12px">
        <div style="font-size:.7rem;color:#64748b;margin-bottom:4px">누적 결제 ${transactions.length}건</div>
        <div style="font-size:1.3rem;font-weight:800;color:#4ade80">$${total.toFixed(2)}</div>
      </div>
      <div class="transaction-list">${rows}</div>`;
    
  } catch (e) {
    console.error('거래 내역 조회 실패:', e);
    // 에러여도 서비스 기본 정보는 보여줌
    body.innerHTML = cardHtml + planHtml + `
      <div style="text-align:center;padding:16px 0;color:#475569;font-size:.72rem">
        <div>거래 내역 조회 실패 (${e.message})</div>
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
