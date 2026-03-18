// ── orderbook.js ──  호가창 + 주문 시스템
// 의존: constants.js → state(G) 전역


// ── 호가창 ──
function obBaseVol(st) {
  return Math.max(10, Math.round(st.def.baseVol / MINS_PER_DAY * 0.5));
}



function initOrderBook(st) {
  const p    = displayPrice(st.priceF || st.price);
  const tick = getTickSize(p);
  const base = obBaseVol(st);
  const asks = [], bids = [];
  for (let i = 1; i <= 5; i++) {
    asks.push({ price: p + tick*i, vol: Math.max(1, Math.round(base*(0.8+Math.random()*0.8+i*0.12))) });
  }
  for (let i = 1; i <= 5; i++) {
    bids.push({ price: Math.max(tick, p - tick*i), vol: Math.max(1, Math.round(base*(0.8+Math.random()*0.8+i*0.12))) });
  }
  st.ob = { asks, bids };
}



function syncOrderBook(st, dispPrice) {
  const tick = getTickSize(dispPrice);
  const base = obBaseVol(st);
  const ob   = st.ob;
  ob.asks = ob.asks.filter(a => a.price > dispPrice);
  ob.bids = ob.bids.filter(b => b.price < dispPrice);
  while (ob.asks.length < 5) {
    const top = ob.asks.length > 0 ? ob.asks[ob.asks.length-1].price : dispPrice;
    ob.asks.push({ price: top + tick, vol: Math.max(1, Math.round(base*(0.6+Math.random()*1.2))) });
  }
  while (ob.bids.length < 5) {
    const bot = ob.bids.length > 0 ? ob.bids[ob.bids.length-1].price : dispPrice;
    ob.bids.push({ price: Math.max(tick, bot - tick), vol: Math.max(1, Math.round(base*(0.6+Math.random()*1.2))) });
  }
  ob.asks.forEach(a => { a.vol = Math.max(1, a.vol + Math.round((Math.random()-0.4)*base*0.15)); });
  ob.bids.forEach(b => { b.vol = Math.max(1, b.vol + Math.round((Math.random()-0.4)*base*0.15)); });
}



// 하위 호환
function buildOrderBook(st) {
  if (!st.ob) initOrderBook(st);
  return st.ob;
}



// 호가창 렌더
function renderOrderBook() {
  const el = document.getElementById('orderBook');
  if (!el) return;
  const st = activeStock();
  if (!st || !st.listed) {
    el.innerHTML = '<div style="padding:8px;text-align:center;font-family:var(--mono);font-size:10px;color:var(--text3)">─</div>';
    return;
  }
  if (!st.ob) initOrderBook(st);
  const ob  = st.ob;
  const chg = st.dayOpen > 0 ? (st.price-st.dayOpen)/st.dayOpen*100 : 0;
  const midCls = chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
  const maxVol = Math.max(...ob.asks.map(a=>a.vol), ...ob.bids.map(b=>b.vol), 1);

  const askRows = [...ob.asks].reverse().map(a => {
    const barW = Math.round(a.vol/maxVol*100);
    return `<div class="ob-row ob-ask" onclick="document.getElementById('limitPrice').value=${a.price};setOrderType('limit')">
      <div class="ob-bar-wrap"><div class="ob-bar ob-ask-bar" style="width:${barW}%"></div>
        <span class="ob-vol" style="position:relative">${fmtN(a.vol)}</span></div>
      <div class="ob-price down">${fmtN(a.price)}</div>
      <div></div></div>`;
  }).join('');

  const midRow = `<div class="ob-row ob-mid">
    <div></div>
    <div class="ob-price ${midCls}" style="font-size:12px;font-weight:600">${fmtN(st.price)}</div>
    <div style="text-align:right;padding-right:5px;font-size:9px;color:var(--text3)">${chg>=0?'+':''}${chg.toFixed(2)}%</div>
  </div>`;

  const bidRows = ob.bids.map(b => {
    const barW = Math.round(b.vol/maxVol*100);
    return `<div class="ob-row ob-bid" onclick="document.getElementById('limitPrice').value=${b.price};setOrderType('limit')">
      <div></div>
      <div class="ob-price up">${fmtN(b.price)}</div>
      <div class="ob-bar-wrap"><div class="ob-bar ob-bid-bar" style="width:${barW}%"></div>
        <span class="ob-vol" style="position:relative;text-align:right;width:100%;display:block">${fmtN(b.vol)}</span>
      </div></div>`;
  }).join('');

  el.innerHTML = askRows + midRow + bidRows;
}

