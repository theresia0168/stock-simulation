// ── ui.js ──  UI 렌더링 — 주식 정보, 포트폴리오, 캔들차트, 경제 대시보드
// 의존: constants.js → state(G) 전역


function addLog(text, cls) {
  const d = G.date, h = String(G.hour).padStart(2,'0');
  G.logs.unshift({ text: `${d.getMonth()+1}/${d.getDate()} ${h}:00 ${text}`, cls });
  if (G.logs.length > 50) G.logs.pop();
  document.getElementById('logPanel').innerHTML =
    G.logs.map(l => `<div class="log-item log-${l.cls}">${l.text}</div>`).join('');
}

function setMsg(m) { document.getElementById('msgBar').textContent = m; }

function showEventBar(text, type) {
  const bar = document.getElementById('eventBar');
  bar.className = `event-bar show event-${type}`;
  const icon = type==='bull'?'▲':type==='bear'?'▼':type==='special'?'✨':'⚠';
  bar.textContent = icon + ' ' + text;
  clearTimeout(bar._t);
  bar._t = setTimeout(() => bar.classList.remove('show'), 10000);
}


// ════════════════════════════════════════════════════
// 경제 대시보드 업데이트
// ════════════════════════════════════════════════════
function updateMacroDashboard() {
  const mktPER = calcMarketPER();

  const set = (id, val, unit='%', decimals=1) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val.toFixed(decimals) + unit;
  };
  set('econGdp',    G.gdpGrowth);
  set('econInfl',   G.inflation);
  set('econUnemp',  G.unemployment);
  set('econBubble', G.bubbleIndex * 100);
  set('econFear',   G.fearIndex   * 100);

  const perEl = document.getElementById('econPer');
  if (perEl) {
    perEl.textContent = mktPER.toFixed(1) + 'x';
    perEl.className = 'econ-val ' + (mktPER > 25 ? 'down' : mktPER < 10 ? 'up' : '');
  }

  // 바 게이지 너비 설정 (0~100%)
  const setBar = (id, pct, cap=100) => {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(cap, Math.max(0, pct)) + '%';
  };
  setBar('econGdpBar',    Math.max(0, G.gdpGrowth + 3) / 11 * 100);  // -3~8% → 0~100%
  setBar('econInflBar',   Math.max(0, G.inflation)      / 10 * 100);  // 0~10%
  setBar('econUnempBar',  Math.max(0, G.unemployment)   / 12 * 100);  // 0~12%
  setBar('econPerBar',    Math.min(mktPER, 50)          / 50 * 100);  // 0~50x
  setBar('econBubbleBar', G.bubbleIndex * 100);
  setBar('econFearBar',   G.fearIndex   * 100);

  // 버블 경고 바
  const warnBar  = document.getElementById('bubbleWarningBar');
  const warnText = document.getElementById('bubbleWarningText');
  if (warnBar && warnText) {
    if (G.isCrash) {
      warnBar.style.display = 'block';
      warnBar.style.background = 'rgba(255,77,109,0.15)';
      warnBar.style.borderColor = 'rgba(255,77,109,0.5)';
      warnText.textContent = `💥 버블 붕괴 진행 중 — 회복까지 ${G.crashRecoveryTurns}턴 남음 (심각도: ${(G.crashSeverity*100).toFixed(0)}%)`;
    } else if (G.bubbleIndex >= 0.75) {
      warnBar.style.display = 'block';
      warnBar.style.background = 'rgba(255,77,109,0.08)';
      warnBar.style.borderColor = 'rgba(255,77,109,0.25)';
      const fills = Math.round(G.bubbleIndex * 20);
      const fillStr = '█'.repeat(fills) + '░'.repeat(20 - fills);
      warnText.textContent = `⚠ 버블 위험 구간 [${fillStr}] ${(G.bubbleIndex*100).toFixed(0)}% — 붕괴 임박 가능성`;
    } else if (G.bubbleIndex >= 0.5) {
      warnBar.style.display = 'block';
      warnBar.style.background = 'rgba(247,183,49,0.07)';
      warnBar.style.borderColor = 'rgba(247,183,49,0.25)';
      warnBar.style.color = '#f7b731';
      const fills = Math.round(G.bubbleIndex * 20);
      const fillStr = '█'.repeat(fills) + '░'.repeat(20 - fills);
      warnText.textContent = `📈 시장 과열 주의 [${fillStr}] ${(G.bubbleIndex*100).toFixed(0)}%`;
    } else if (G.fearIndex >= 0.5) {
      warnBar.style.display = 'block';
      warnBar.style.background = 'rgba(0,229,160,0.07)';
      warnBar.style.borderColor = 'rgba(0,229,160,0.2)';
      warnBar.style.color = 'var(--up)';
      warnText.textContent = `🔍 저평가 구간 — 유동성 랠리 에너지 축적 중 (공포지수: ${(G.fearIndex*100).toFixed(0)}%)`;
    } else {
      warnBar.style.display = 'none';
    }
  }
}


// ════════════════════════════════════════════════════
// SELECT STOCK
// ════════════════════════════════════════════════════
function selectStock(id) {
  if (G.stocks[id] && G.stocks[id].delisted) return;
  G.activeId = id;
  updateTabs(); updateHoldings(); updateUI(); updateFlowUI(); drawChart();
}


// ════════════════════════════════════════════════════
// UPDATE TICKER TABS
// ════════════════════════════════════════════════════
function updateTabs() {
  document.getElementById('tickerTabs').innerHTML = G.listedIds.map(id => {
    const st  = G.stocks[id];
    const chg = st.dayOpen > 0 ? (st.price - st.dayOpen) / st.dayOpen * 100 : 0;
    const cls = chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
    return `<div class="tab ${id === G.activeId ? 'active' : ''}" onclick="selectStock('${id}')">
      <span>${id}</span>
      <span class="tab-price">${fmtN(st.price)}</span>
      <span class="tab-chg ${cls}">${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%</span>
    </div>`;
  }).join('');
}


// ════════════════════════════════════════════════════
// UPDATE HOLDINGS
// ════════════════════════════════════════════════════
function updateHoldings() {
  const held = Object.values(G.stocks).filter(st => st.shares > 0);
  if (held.length === 0) {
    document.getElementById('holdingsBody').innerHTML = '<div class="hp-empty">보유 종목 없음</div>';
    return;
  }
  document.getElementById('holdingsBody').innerHTML = held.map(st => {
    const id   = st.def.id;
    const ret  = st.avgBuy > 0 ? (st.price - st.avgBuy) / st.avgBuy * 100 : 0;
    const cls  = ret > 0 ? 'up' : ret < 0 ? 'down' : 'flat';
    const sign = ret >= 0 ? '+' : '';
    const dayChg  = st.dayOpen > 0 ? (st.price - st.dayOpen) / st.dayOpen * 100 : 0;
    const dayCls  = dayChg > 0 ? 'up' : dayChg < 0 ? 'down' : 'flat';
    const delistBadge = st.delisted ? ' <span style="color:#ff4d6d;font-size:8px">[폐지]</span>' : '';
    return `<div class="hp-row ${id === G.activeId ? 'active' : ''}" onclick="selectStock('${id}')">
      <div>
        <div class="hp-name">${id}${delistBadge}</div>
        <div class="hp-sub">${fmtN(st.shares)}주 | 일<span class="${dayCls}">${sign}${dayChg.toFixed(1)}%</span></div>
      </div>
      <div class="hp-cell ${dayCls}">${fmtN(st.price)}</div>
      <div class="hp-cell">${fmtN(Math.round(st.avgBuy))}</div>
      <div class="hp-cell ${cls}">${sign}${ret.toFixed(2)}%</div>
    </div>`;
  }).join('');
}


// ════════════════════════════════════════════════════
// UPDATE UI
// ════════════════════════════════════════════════════
function updateUI() {
  const status = marketStatus();
  const st  = activeStock();
  if (!st) return;
  const def = activeDef();

  document.getElementById('hTicker').textContent = def.id;
  document.getElementById('hName').textContent   = def.name;
  document.getElementById('hSector').textContent = def.sector;

  const chgO = st.dayOpen > 0 ? st.price - st.dayOpen : 0;
  const pctO = st.dayOpen > 0 ? (chgO / st.dayOpen * 100) : 0;
  const sign = chgO >= 0 ? '+' : '';
  const cls  = chgO > 0 ? 'up' : chgO < 0 ? 'down' : 'flat';
  document.getElementById('curPrice').textContent = fmt(st.price);
  const pd = document.getElementById('priceDelta');
  pd.textContent = `${sign}${fmtN(chgO)} (${sign}${pctO.toFixed(2)}%)`;
  pd.className = 'price-delta ' + cls;

  const tdEl = document.getElementById('timeDisp');
  if (tdEl) tdEl.textContent = String(G.hour).padStart(2,'0') + ':' + String(G.minute).padStart(2,'0');
  const tdEl2 = document.getElementById('turnDisp');
  if (tdEl2) tdEl2.textContent = G.turn;

  const badge = document.getElementById('badge'), si = document.getElementById('sessionInfo');
  if (status === 'open') {
    badge.textContent = '정규장'; badge.className = 'badge badge-open'; si.textContent = '정규장 09:00~15:00';
  } else if (status === 'after') {
    badge.textContent = '애프터'; badge.className = 'badge badge-after'; si.textContent = '애프터 15:00~16:00';
  } else {
    badge.textContent = '장 마감'; badge.className = 'badge badge-closed';
    si.textContent = isWeekday(G.date) ? '개장 전 / 장 종료' : '주말 휴장';
  }

  document.getElementById('traitRow').innerHTML = def.traits.map(t => `<span class="trait">${t}</span>`).join('');
  document.getElementById('sOpen').textContent = fmt(st.dayOpen);
  document.getElementById('sHigh').textContent = fmt(st.dayHigh);
  document.getElementById('sLow').textContent  = fmt(st.dayLow);
  document.getElementById('sVol').textContent  = fmtN(st.dayVol);

  const mcap = st.price * st.totalShares;
  const fmtMcap = v => {
    if (v >= 1e12) return (v/1e12).toFixed(1) + '조';
    if (v >= 1e8)  return (v/1e8).toFixed(0) + '억';
    return (v/1e4).toFixed(0) + '만';
  };
  const fmtSharesK = v => {
    if (v >= 1e8) return (v/1e8).toFixed(1) + '억주';
    if (v >= 1e4) return (v/1e4).toFixed(0) + '만주';
    return fmtN(v) + '주';
  };
  document.getElementById('sMcap').textContent   = fmtMcap(mcap);
  document.getElementById('sShares').textContent = fmtSharesK(st.totalShares);

  const epsEl = document.getElementById('sEps');
  const perEl = document.getElementById('sPer');
  if (st.eps !== 0) {
    epsEl.textContent = fmt(st.eps);
    epsEl.className = 'stat-val ' + (st.eps > 0 ? '' : 'down');
    const per = st.eps > 0 ? (st.price / st.eps).toFixed(1) : 'N/A';
    perEl.textContent = per;
    perEl.className = 'stat-val ' + (st.eps > 0 && st.price/st.eps < 15 ? 'up' : st.eps < 0 ? 'down' : '');
  } else {
    epsEl.textContent = '─'; perEl.textContent = '─';
  }

  const dpsEl    = document.getElementById('sDps');
  const divYldEl = document.getElementById('sDivYld');
  if (dpsEl && divYldEl) {
    const dps = (st.eps > 0 && st.def.dividendPayout > 0)
      ? Math.floor(st.eps * st.def.dividendPayout / 10) * 10 : 0;
    if (dps > 0) {
      dpsEl.textContent    = fmtN(dps) + '원';
      dpsEl.className      = 'stat-val up';
      divYldEl.textContent = (dps / st.price * 100).toFixed(1) + '%';
      divYldEl.className   = 'stat-val up';
    } else {
      dpsEl.textContent    = '무배당';
      dpsEl.className      = 'stat-val flat';
      divYldEl.textContent = '─';
      divYldEl.className   = 'stat-val flat';
    }
  }

  // 포트폴리오
  const eval_ = st.shares * st.price;
  const totalAsset = G.cash + Object.values(G.stocks).reduce((s,s2) => s + s2.shares * s2.price, 0);
  const has  = st.shares > 0 && st.avgBuy > 0;
  const pnl  = has ? (st.price - st.avgBuy) * st.shares : 0;
  const ret  = has ? (st.price - st.avgBuy) / st.avgBuy * 100 : null;
  const rCls = ret === null ? 'flat' : ret > 0 ? 'up' : ret < 0 ? 'down' : 'flat';

  document.getElementById('pCash').textContent   = fmt(G.cash);
  document.getElementById('pShares').textContent = fmtN(st.shares) + '주';
  document.getElementById('pAvg').textContent    = has ? fmt(Math.round(st.avgBuy)) : '─';
  document.getElementById('pEval').textContent   = fmt(eval_);
  const pp = document.getElementById('pPnl');
  pp.textContent = has ? (pnl >= 0 ? '+' : '') + fmtN(pnl) + '원' : '─';
  pp.className = 'port-val ' + rCls;
  document.getElementById('pTotal').textContent = fmt(totalAsset);
  document.getElementById('pFee').textContent   = fmt(G.totalFee);
  const divEl = document.getElementById('pDividend');
  if (divEl) divEl.textContent = G.totalDividend > 0 ? fmt(G.totalDividend) : '─';
  const pr = document.getElementById('pReturn');
  pr.textContent = ret !== null ? (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%' : '─';
  pr.className = 'port-val ' + rCls;

  const allHeld = Object.values(G.stocks).filter(s => s.shares > 0 && s.avgBuy > 0);
  const totalPnl = allHeld.reduce((sum, s) => sum + (s.price - s.avgBuy) * s.shares, 0);
  const totalPnlEl = document.getElementById('pTotalPnl');
  if (allHeld.length > 0) {
    totalPnlEl.textContent = (totalPnl >= 0 ? '+' : '') + fmtN(totalPnl) + '원';
    totalPnlEl.className = 'port-val ' + (totalPnl > 0 ? 'up' : totalPnl < 0 ? 'down' : 'flat');
  } else {
    totalPnlEl.textContent = '─'; totalPnlEl.className = 'port-val flat';
  }

  const can = status !== 'closed' && !st.delisted && !G.marketCB && !st.vi;
  document.getElementById('btnBuy').disabled  = !can || st.isLowerLimit;
  document.getElementById('btnSell').disabled = !can || st.isUpperLimit;
  updateTradeInfo();

  // 매크로 대시보드
  updateMacroDashboard();
}


// ════════════════════════════════════════════════════
// DRAW CHART (기존 유지)
// ════════════════════════════════════════════════════
function drawChart() {
  const canvas = document.getElementById('chart');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 20;
  const H = 280;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#141720';
  ctx.fillRect(0, 0, W, H);

  const st = activeStock();
  if (!st) return;
  const candles = [
    ...st.dailyCandles,
    ...(st.intraday ? [{ ...st.intraday, dateStr: '오늘', live: true }] : [])
  ];

  if (candles.length === 0) {
    ctx.fillStyle = '#555e78'; ctx.font = '12px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('다음 턴을 눌러 차트를 시작하세요', W/2, H/2);
    return;
  }

  const PAD_L=66, PAD_R=64, PAD_T=14, PAD_B=30, VOL_H=42;
  const CHART_H = H - PAD_T - PAD_B - VOL_H - 6;
  const chartRight = W - PAD_R;
  const MAX_VIS = 80;
  const start = Math.max(0, candles.length - MAX_VIS);
  const vis = candles.slice(start);
  const N = vis.length;

  let pMax = Math.max(...vis.map(c=>c.h));
  let pMin = Math.min(...vis.map(c=>c.l));
  const pad = (pMax-pMin)*0.1 || pMax*0.02;
  pMax += pad; pMin -= pad;
  const pRange = pMax - pMin || 1;
  const vMax = Math.max(...vis.map(c=>c.volume), 1);

  const SLOT_W=9, BODY_W=5;
  const py = p => PAD_T + CHART_H - ((p-pMin)/pRange)*CHART_H;
  const vy = v => (H-PAD_B) - (v/vMax)*VOL_H;

  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
  for (let i=0; i<=4; i++) {
    const y = PAD_T + (CHART_H/4)*i;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W-PAD_R, y); ctx.stroke();
    ctx.fillStyle = '#555e78'; ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(pMax-(pRange/4)*i).toLocaleString(), PAD_L-4, y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(PAD_L, H-PAD_B-VOL_H-3); ctx.lineTo(W-PAD_R, H-PAD_B-VOL_H-3); ctx.stroke();

  vis.forEach((c, i) => {
    const cx = chartRight - (N-1-i)*SLOT_W - SLOT_W/2;
    const bx = Math.round(cx - BODY_W/2);
    const isUp = c.c >= c.o;
    const col  = isUp ? '#00e5a0' : '#ff4d6d';

    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(cx), py(c.h)); ctx.lineTo(Math.round(cx), py(c.l)); ctx.stroke();

    const top = py(Math.max(c.o, c.c));
    const bh  = Math.max(1, py(Math.min(c.o, c.c)) - top);
    if (c.live) {
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.strokeRect(bx+0.5, top+0.5, BODY_W-1, bh-1);
    } else {
      ctx.fillStyle = col; ctx.fillRect(bx, top, BODY_W, bh);
    }
    if (c.volume > 0) {
      ctx.fillStyle = isUp ? 'rgba(0,229,160,0.27)' : 'rgba(255,77,109,0.27)';
      ctx.fillRect(bx, vy(c.volume), BODY_W, H-PAD_B-vy(c.volume));
    }
  });

  if (st.shares > 0 && st.avgBuy > 0 && st.avgBuy >= pMin && st.avgBuy <= pMax) {
    const ay = py(st.avgBuy);
    ctx.strokeStyle = 'rgba(247,183,49,0.65)'; ctx.lineWidth = 1; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(PAD_L, ay); ctx.lineTo(W-PAD_R, ay); ctx.stroke();
    ctx.setLineDash([]);
    const atag = Math.round(st.avgBuy).toLocaleString();
    const atw  = atag.length*6+10;
    ctx.fillStyle = 'rgba(247,183,49,0.85)';
    ctx.beginPath(); ctx.roundRect(PAD_L-atw-2, ay-8, atw, 16, 2); ctx.fill();
    ctx.fillStyle = '#0d0f14'; ctx.font = '8px "Share Tech Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(atag, PAD_L-atw/2-2, ay);
  }

  const lastY   = py(st.price);
  const isUpNow = st.price >= st.dayOpen;
  ctx.strokeStyle = isUpNow ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,109,0.3)';
  ctx.lineWidth = 0.5; ctx.setLineDash([3,4]);
  ctx.beginPath(); ctx.moveTo(PAD_L, lastY); ctx.lineTo(W-PAD_R, lastY); ctx.stroke();
  ctx.setLineDash([]);
  const tag  = Math.round(st.price).toLocaleString();
  const tagW = tag.length*6.5+12;
  ctx.fillStyle = isUpNow ? '#00e5a0' : '#ff4d6d';
  ctx.beginPath(); ctx.roundRect(W-PAD_R+2, lastY-8, tagW, 16, 2); ctx.fill();
  ctx.fillStyle = '#0d0f14'; ctx.font = 'bold 8px "Share Tech Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tag, W-PAD_R+2+tagW/2, lastY);

  const step = Math.max(1, Math.floor(N/6));
  ctx.fillStyle = '#555e78'; ctx.font = '9px "Share Tech Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  vis.forEach((c, i) => {
    if (i%step===0 || i===N-1) {
      const cx = chartRight - (N-1-i)*SLOT_W - SLOT_W/2;
      ctx.fillText(c.dateStr || `D${start+i+1}`, cx, H-PAD_B+12);
    }
  });
}


function switchPage(name) {
  currentPage = name;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  const idx = ['stock','kospi'].indexOf(name);
  if (idx >= 0) document.querySelectorAll('.ptab')[idx].classList.add('active');
  if (name === 'kospi') { drawKospiChart(); renderKospiFlowTable(); }
}


function renderFull() {
  const h = String(G.hour).padStart(2,'0');
  const m = String(G.minute).padStart(2,'0');
  const clk = document.getElementById('tickClock');
  if (clk) clk.textContent = h + ':' + m;
  updateIndex();
  updateTabs();
  updateHoldings();
  updateUI();
  updateFlowUI();
  renderOrderBook();
  renderPendingOrders();
  drawChart();
  if (currentPage === 'kospi') { drawKospiChart(); renderKospiFlowTable(); }
}
