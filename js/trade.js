// ── trade.js ──  주문 입력 UI, 체결, 미체결 관리
// 의존: constants.js → state(G) 전역


// tradeInfo 업데이트
function updateTradeInfo() {
  const st  = activeStock();
  const el  = document.getElementById('tradeInfo');
  if (!el || !st) return;
  const qty = parseInt(document.getElementById('qtyInput').value) || 0;
  const price = G_orderType === 'limit'
    ? (parseInt(document.getElementById('limitPrice').value) || st.price)
    : st.price;
  const cost = price * qty;
  const fee  = Math.round(cost * FEE_RATE);
  const tax  = Math.round(cost * TAX_RATE);
  if (st.isUpperLimit) { el.textContent = '⚠ 상한가 — 매수 전용'; return; }
  if (st.isLowerLimit) { el.textContent = '⚠ 하한가 — 매도 전용'; return; }
  if (st.vi)           { el.textContent = `⏸ VI 발동 중`; return; }
  if (G.marketCB)      { el.textContent = `⛔ CB ${G.marketCB.stage}단계 — 거래 정지`; return; }
  el.textContent = qty > 0
    ? `매수 ${fmt(cost+fee)} / 매도세금 ${fmt(tax)}`
    : '수량을 입력하세요';
}



function setOrderType(type) {
  G_orderType = type;
  document.getElementById('otabMarket').classList.toggle('active', type === 'market');
  document.getElementById('otabLimit').classList.toggle('active',  type === 'limit');
  document.getElementById('limitPriceRow').style.display = type === 'limit' ? '' : 'none';
  updateTradeInfo();
}



function setLimitToCurrent() {
  const st = activeStock();
  if (st) document.getElementById('limitPrice').value = st.price;
}



function setQtyRatio(ratio) {
  const st = activeStock();
  if (!st) return;
  const price = G_orderType === 'limit'
    ? (parseInt(document.getElementById('limitPrice').value) || st.price)
    : st.price;
  const isSellMode = !document.getElementById('btnSell').disabled && st.shares > 0;
  let qty;
  if (isSellMode && st.shares > 0) {
    qty = Math.max(1, Math.floor(st.shares * ratio));
  } else {
    const maxBuy = Math.floor(G.cash / (price * (1 + FEE_RATE)));
    qty = Math.max(1, Math.floor(maxBuy * ratio));
  }
  document.getElementById('qtyInput').value = qty;
  updateTradeInfo();
}



// 체결 실행 — 호가창 잔량도 소화
function execOrder(side, stockId, qty, price) {
  const st = G.stocks[stockId];
  if (!st) return false;
  if (side === 'buy') {
    const principal = price * qty;
    const fee = Math.round(principal * FEE_RATE);
    if (principal + fee > G.cash) return false;
    st.avgBuy = st.shares > 0
      ? (st.avgBuy * st.shares + principal) / (st.shares + qty)
      : price;
    G.cash -= (principal + fee);
    st.shares += qty;
    G.totalFee += fee;
    // 호가창에서 매도잔량 소화
    if (st.ob) {
      let rem = qty;
      while (rem > 0 && st.ob.asks.length > 0 && st.ob.asks[0].price <= price) {
        const ask = st.ob.asks[0];
        if (rem >= ask.vol) { rem -= ask.vol; st.ob.asks.shift(); }
        else { ask.vol -= rem; rem = 0; }
      }
      syncOrderBook(st, st.price);
    }
    addLog(`[매수체결] ${stockId} ${qty}주 @${fmt(price)} 수수료${fmt(fee)}`, 'buy');
    setMsg(`✅ ${stockId} ${qty}주 매수 @${fmt(price)}`);
  } else {
    if (qty > st.shares) return false;
    const principal = price * qty;
    const fee = Math.round(principal * FEE_RATE);
    const tax = Math.round(principal * TAX_RATE);
    G.cash += principal - fee - tax;
    st.shares -= qty;
    G.totalFee += fee + tax;
    if (st.shares === 0) st.avgBuy = 0;
    // 호가창에서 매수잔량 소화
    if (st.ob) {
      let rem = qty;
      while (rem > 0 && st.ob.bids.length > 0 && st.ob.bids[0].price >= price) {
        const bid = st.ob.bids[0];
        if (rem >= bid.vol) { rem -= bid.vol; st.ob.bids.shift(); }
        else { bid.vol -= rem; rem = 0; }
      }
      syncOrderBook(st, st.price);
    }
    addLog(`[매도체결] ${stockId} ${qty}주 @${fmt(price)} 비용${fmt(fee+tax)}`, 'sell');
    setMsg(`✅ ${stockId} ${qty}주 매도 @${fmt(price)}`);
  }
  return true;
}



function checkOrderValid(side) {
  if (marketStatus() === 'closed') { setMsg('⛔ 장이 닫혀 있어 거래할 수 없습니다.'); return false; }
  const st = activeStock();
  if (!st || st.delisted) { setMsg('⛔ 상장폐지된 종목입니다.'); return false; }
  if (G.marketCB) { setMsg(`⛔ 서킷브레이커 ${G.marketCB.stage}단계 — 거래 불가`); return false; }
  if (st.vi)      { setMsg(`⛔ VI 발동 중 — 거래 일시 정지`); return false; }
  if (side === 'buy'  && st.isLowerLimit) { setMsg('⛔ 하한가 — 매수 불가'); return false; }
  if (side === 'sell' && st.isUpperLimit) { setMsg('⛔ 상한가 — 매도 불가'); return false; }
  return true;
}



function submitOrder(side) {
  if (!checkOrderValid(side)) return;
  const st  = activeStock();
  const qty = parseInt(document.getElementById('qtyInput').value) || 0;
  if (qty <= 0) { setMsg('⚠ 수량을 입력하세요.'); return; }

  if (G_orderType === 'market') {
    const ok = execOrder(side, G.activeId, qty, st.price);
    if (!ok) setMsg(side === 'buy' ? '💸 현금이 부족합니다.' : '📦 보유 수량이 부족합니다.');
  } else {
    const limitPrice = parseInt(document.getElementById('limitPrice').value) || 0;
    if (limitPrice <= 0) { setMsg('⚠ 지정가를 입력하세요.'); return; }
    if (G.pendingOrderList.length >= 10) { setMsg('⚠ 미체결 주문은 최대 10개까지 가능합니다.'); return; }
    const canFillNow = (side === 'buy' && limitPrice >= st.price) ||
                       (side === 'sell' && limitPrice <= st.price);
    if (canFillNow) {
      const ok = execOrder(side, G.activeId, qty, side === 'buy' ? st.price : limitPrice);
      if (!ok) setMsg(side === 'buy' ? '💸 현금이 부족합니다.' : '📦 보유 수량이 부족합니다.');
    } else {
      G.pendingOrderList.push({
        id: G.activeId, side, qty, limitPrice,
        orderedAt: `${G.hour}:${String(G.minute).padStart(2,'0')}`
      });
      addLog(`[${side==='buy'?'매수':'매도'}주문] ${G.activeId} ${qty}주 @${fmt(limitPrice)} 지정가`, side==='buy'?'buy':'sell');
      setMsg(`📋 ${G.activeId} ${qty}주 @${fmt(limitPrice)} 지정가 ${side==='buy'?'매수':'매도'} 등록`);
    }
  }
  updateHoldings(); updateFlowUI(); updateUI(); renderPendingOrders();
}



function cancelOrder(idx) {
  const o = G.pendingOrderList[idx];
  if (!o) return;
  G.pendingOrderList.splice(idx, 1);
  addLog(`[주문취소] ${o.id} ${o.side==='buy'?'매수':'매도'} ${o.qty}주 @${fmt(o.limitPrice)}`, 'sys');
  renderPendingOrders();
  updateUI();
}



function checkPendingOrders() {
  if (G.pendingOrderList.length === 0) return;
  const toRemove = [];
  G.pendingOrderList.forEach((o, idx) => {
    const st = G.stocks[o.id];
    if (!st || st.delisted) { toRemove.push(idx); return; }
    const canFill = (o.side === 'buy'  && st.price <= o.limitPrice) ||
                    (o.side === 'sell' && st.price >= o.limitPrice);
    if (!canFill) return;
    const ok = execOrder(o.side, o.id, o.qty, o.limitPrice);
    if (ok) {
      toRemove.push(idx);
      updateHoldings(); updateFlowUI(); updateUI();
    } else if (o.side === 'buy' && G.cash < o.limitPrice) {
      toRemove.push(idx);
      addLog(`[주문자동취소] ${o.id} 현금 부족`, 'sys');
    }
  });
  toRemove.sort((a,b)=>b-a).forEach(i => G.pendingOrderList.splice(i,1));
  if (toRemove.length > 0) renderPendingOrders();
}



function renderPendingOrders() {
  const el = document.getElementById('pendingOrders');
  if (!el) return;
  if (G.pendingOrderList.length === 0) {
    el.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--text3);text-align:center;padding:4px">없음</div>';
    return;
  }
  el.innerHTML = G.pendingOrderList.map((o, i) => `
    <div class="pending-row">
      <span class="${o.side==='buy'?'pend-buy':'pend-sell'}">${o.side==='buy'?'매수':'매도'}</span>
      <span style="color:var(--text2)">${o.id}</span>
      <span style="color:var(--text3)">${o.qty}주</span>
      <span style="color:var(--text)">${fmtN(o.limitPrice)}</span>
      <span style="color:var(--text3);font-size:8px">${o.orderedAt}</span>
      <button class="pend-cancel" onclick="cancelOrder(${i})">취소</button>
    </div>`).join('');
}



// 하위 호환
function trade(type) { submitOrder(type); }


