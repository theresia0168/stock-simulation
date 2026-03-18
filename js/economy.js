// ── economy.js ──  레짐전환, 금리/경제지표, KOSPI, 투자자흐름, 배당
// 의존: constants.js → state(G) 전역


function transitionRegime() {
  const cur = G.regime;
  const t = REGIME_TRANS[cur];
  const r = Math.random();
  if (r < t.bull) G.regime = 'bull';
  else if (r < t.bull + t.neutral) G.regime = 'neutral';
  else G.regime = 'bear';
}



function stepKospi() {
  const regime = REGIME_PARAMS[G.regime];
  const drift  = KOSPI_ANNUAL_DRIFT / (252 * MINS_PER_DAY) + regime.drift / MINS_PER_DAY;
  const vol    = KOSPI_MIN_VOL * regime.volMult * (G.activeMarketEvent ? 1.3 : 1.0);
  const logRet = drift - 0.5 * vol * vol + randn() * vol;

  const lst = listedStocks();
  let totalMcap = 0, sumW = 0;
  lst.forEach(st => {
    const mcap = st.price * st.totalShares;
    const prev = st.prevTickPrice || st.dayOpen;
    const tr   = prev > 0 ? Math.log(st.price / prev) : 0;
    sumW      += tr * mcap;
    totalMcap += mcap;
    st.prevTickPrice = st.price;
  });
  const mktRet = totalMcap > 0 ? sumW / totalMcap : 0;
  G.kospiLogReturn = logRet * 0.6 + mktRet * 0.4;
  G.kospi = Math.round(G.kospi * Math.exp(G.kospiLogReturn) * 100) / 100;
  const dayChg = G.kospiOpen > 0 ? (G.kospi - G.kospiOpen) / G.kospiOpen : 0;
  if (dayChg >  0.08) G.kospi = Math.round(G.kospiOpen * 1.08 * 100) / 100;
  if (dayChg < -0.08) G.kospi = Math.round(G.kospiOpen * 0.92 * 100) / 100;
}



function applyRateShock(direction) {
  listedStocks().forEach(st => {
    const impact = -direction * st.def.rateSens * 0.02;
    if (Math.abs(impact) < 0.001) return;
    st.priceF = Math.max(1, (st.priceF || st.price) * (1 + impact));
    const newDisp = displayPrice(st.priceF);
    updateGarch(st, impact);
    st.price   = newDisp;
    st.dayHigh = Math.max(st.dayHigh, newDisp);
    st.dayLow  = Math.min(st.dayLow,  newDisp);
    if (st.intraday) { st.intraday.h = Math.max(st.intraday.h, newDisp); st.intraday.l = Math.min(st.intraday.l, newDisp); st.intraday.c = newDisp; }
  });
}



function stepEconomy() {
  G.inflation    += (Math.random() - 0.5) * 0.04;
  G.gdpGrowth    += (Math.random() - 0.5) * 0.06;
  G.unemployment += (Math.random() - 0.5) * 0.03;
  G.inflation    = G.inflation    * 0.998 + 2.5 * 0.002;
  G.gdpGrowth    = G.gdpGrowth    * 0.997 + 2.0 * 0.003;
  G.unemployment = G.unemployment * 0.998 + 3.5 * 0.002;
  G.inflation    = Math.max(0, Math.min(8, G.inflation));
  G.gdpGrowth    = Math.max(-3, Math.min(6, G.gdpGrowth));
  G.unemployment = Math.max(2, Math.min(8, G.unemployment));

  G.rateDecisionTurn++;
  if (G.rateDecisionTurn < 60) return;
  G.rateDecisionTurn = 0;

  const fedHike = G.inflation > 3.5 && G.gdpGrowth > 1.0 && Math.random() < 0.35;
  const fedCut  = G.inflation < 2.0 && (G.gdpGrowth < 1.0 || G.unemployment > 5.0) && Math.random() < 0.35;

  if (fedHike) {
    const d = Math.random() < 0.7 ? 0.25 : 0.50;
    G.usRate = Math.min(8.0, Math.round((G.usRate + d) * 100) / 100);
    const msg = `🇺🇸 연준 기준금리 +${d}% 인상 → ${G.usRate}%`;
    showEventBar(msg, 'bear'); addLog(msg, 'sys'); setMsg(msg);
    applyRateShock(1);
  } else if (fedCut) {
    const d = Math.random() < 0.7 ? 0.25 : 0.50;
    G.usRate = Math.max(0.0, Math.round((G.usRate - d) * 100) / 100);
    const msg = `🇺🇸 연준 기준금리 -${d}% 인하 → ${G.usRate}%`;
    showEventBar(msg, 'bull'); addLog(msg, 'sys'); setMsg(msg);
    applyRateShock(-1);
  }

  const gap = G.usRate - G.krRate;
  const krHike = (G.inflation > 3.2 || gap > 1.5) && !fedHike && Math.random() < 0.30;
  const krCut  = ((G.inflation < 1.8 && G.gdpGrowth < 1.5) || gap < -1.0) && !fedCut && Math.random() < 0.30;
  if (krHike) {
    G.krRate = Math.min(7.0, Math.round((G.krRate + 0.25) * 100) / 100);
    const msg = `🇰🇷 한국은행 기준금리 +0.25% → ${G.krRate}%`;
    showEventBar(msg, 'bear'); addLog(msg, 'sys'); applyRateShock(0.6);
  } else if (krCut) {
    G.krRate = Math.max(0.0, Math.round((G.krRate - 0.25) * 100) / 100);
    const msg = `🇰🇷 한국은행 기준금리 -0.25% → ${G.krRate}%`;
    showEventBar(msg, 'bull'); addLog(msg, 'sys'); applyRateShock(-0.6);
  }
}


// 기관: 저가매수·역추세 성향, 레짐 추종
// 외국인: 모멘텀·레짐 강하게 추종, 대규모
// 개인: 기관+외인 반대 포지션 (시장 균형)
// ════════════════════════════════════════════════════
function calcInvestorFlow(st, logReturn, volume) {
  const regime = G.regime;
  const ret = logReturn;
  // 기관: 하락 시 저가매수 성향 (-ret 비례), 강세레짐 추세추종
  const instBias = regime === 'bull' ? 0.12 : regime === 'bear' ? 0.22 : 0.04;
  const instDir = -ret * 0.55 + (Math.random() - 0.5 + instBias) * 0.45;
  const instFlow = instDir * volume * (0.22 + Math.random() * 0.14) * st.price;
  // 외국인: 모멘텀 추종 (+ret 비례)
  const foreBias = regime === 'bull' ? 0.18 : regime === 'bear' ? -0.18 : 0;
  const foreDir = ret * 0.65 + (Math.random() - 0.5 + foreBias) * 0.35;
  const foreFlow = foreDir * volume * (0.18 + Math.random() * 0.14) * st.price;
  // 개인: 나머지 (기관+외인 반대 + 노이즈)
  const indivFlow = -(instFlow + foreFlow) * (0.88 + Math.random() * 0.24);
  return { inst: instFlow, fore: foreFlow, indiv: indivFlow };
}



// ════════════════════════════════════════════════════
// KOSPI CANDLE MANAGEMENT
// ════════════════════════════════════════════════════
function updateKospiCandle() {
  if (!G.kospiIntraday) {
    G.kospiIntraday = { o: G.kospiOpen, h: G.kospi, l: G.kospi, c: G.kospi };
  } else {
    G.kospiIntraday.h = Math.max(G.kospiIntraday.h, G.kospi);
    G.kospiIntraday.l = Math.min(G.kospiIntraday.l, G.kospi);
    G.kospiIntraday.c = G.kospi;
  }
}



function closeKospiCandle(ds) {
  if (!G.kospiIntraday) return;
  const prev = G.kospiCandles.length > 0 ? G.kospiCandles[G.kospiCandles.length-1].c : G.kospiOpen;
  G.kospiCandles.push({ ...G.kospiIntraday, dateStr: ds, prevClose: prev });
  G.kospiIntraday = null;
  // 당일 시장 전체 순매수 기록
  G.kospiFlowHistory.push({
    dateStr: ds,
    inst:  G.marketFlowInst,
    fore:  G.marketFlowFore,
    indiv: G.marketFlowIndiv,
    kospiChg: prev > 0 ? (G.kospi - prev) / prev * 100 : 0,
  });
  G.marketFlowInst = 0; G.marketFlowFore = 0; G.marketFlowIndiv = 0;
}



// ════════════════════════════════════════════════════
// UPDATE INDEX BAR
// ════════════════════════════════════════════════════
function updateIndex() {
  const kospiChg = G.kospiOpen > 0 ? (G.kospi - G.kospiOpen) / G.kospiOpen * 100 : 0;
  const cls = kospiChg > 0 ? 'up' : kospiChg < 0 ? 'down' : 'flat';
  document.getElementById('idxKospiVal').textContent = G.kospi.toFixed(2);
  const kc = document.getElementById('idxKospiChg');
  kc.textContent = (kospiChg >= 0 ? '+' : '') + kospiChg.toFixed(2) + '%';
  kc.className = 'idx-chg ' + cls;
  document.getElementById('idxCount').textContent = G.listedIds.length;
  document.getElementById('idxMoodLabel').textContent =
    G.regime === 'bull' ? '강세' : G.regime === 'bear' ? '약세' : '중립';

  // 금리 표시
  const ur = document.getElementById('idxUsRate');
  const kr = document.getElementById('idxKrRate');
  if (ur) ur.textContent = G.usRate.toFixed(2) + '%';
  if (kr) kr.textContent = G.krRate.toFixed(2) + '%';

  const status = marketStatus();
  const badge = document.getElementById('badge');
  const si = document.getElementById('sessionInfo');
  if (status === 'open')       { if(badge){badge.textContent='정규장';badge.className='badge badge-open';}   if(si)si.textContent='09:00~15:00'; }
  else if (status === 'after') { if(badge){badge.textContent='애프터';badge.className='badge badge-after';}  if(si)si.textContent='15:00~16:00'; }
  else                         { if(badge){badge.textContent='장 마감';badge.className='badge badge-closed';}if(si)si.textContent=isWeekday(G.date)?'개장전/종료':'주말'; }

  const d = G.date;
  const dayStr = ['일','월','화','수','목','금','토'][d.getDay()];
  document.getElementById('idxDate').textContent =
    `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${dayStr}) ${String(G.hour).padStart(2,'0')}:${String(G.minute).padStart(2,'0')}`;

  // KOSPI page stats
  document.getElementById('kStatVal').textContent = G.kospi.toFixed(2);
  const kc2 = document.getElementById('kStatChg');
  kc2.textContent = (kospiChg >= 0 ? '+' : '') + kospiChg.toFixed(2) + '%';
  kc2.className = 'ks-val ' + cls;
  const intra = G.kospiIntraday;
  document.getElementById('kStatHigh').textContent = intra ? intra.h.toFixed(2) : '─';
  document.getElementById('kStatLow').textContent  = intra ? intra.l.toFixed(2) : '─';
}



function processDividend() {
  let totalReceived = 0;
  const msgs = [];

  G.listedIds.forEach(id => {
    const st  = G.stocks[id];
    const def = st.def;
    if (!def.dividendPayout || def.dividendPayout <= 0) return;
    if (st.eps <= 0) return;  // 적자 기업은 배당 없음

    // 주당 배당금 = EPS × 배당성향 (원 단위 절사)
    const dps = Math.floor(st.eps * def.dividendPayout / 10) * 10;
    if (dps <= 0) return;

    // 배당수익률 (정보 표시용)
    const yld = (dps / st.price * 100).toFixed(1);

    // 배당락: 내일 시가에서 배당금만큼 갭다운
    // pendingGaps에 음수 로그수익률 예약
    const gapRatio = dps / st.price;
    G.pendingGaps[id] = (G.pendingGaps[id] || 0) - gapRatio;

    // 보유자 배당 지급
    if (st.shares > 0) {
      const received = dps * st.shares;
      G.cash += received;
      G.totalDividend += received;
      totalReceived += received;
      msgs.push(`  ${id} ${fmtN(dps)}원/주 × ${fmtN(st.shares)}주 = ${fmt(received)}`);
      addLog(`💰 [배당] ${id} DPS ${fmtN(dps)}원 (수익률 ${yld}%) → ${fmt(received)} 수령`, 'buy');
    } else {
      addLog(`📋 [배당락] ${id} DPS ${fmtN(dps)}원 (수익률 ${yld}%) — 미보유`, 'sys');
    }

    // 이벤트 바 공지
    showEventBar(`[배당] ${id} 주당 ${fmtN(dps)}원 (${yld}%) — 내일 배당락`, 'bull');
  });

  if (totalReceived > 0) {
    setMsg(`💰 결산 배당 수령: ${fmt(totalReceived)} ${msgs.length > 1 ? `(${msgs.length}개 종목)` : ''}`);
  } else {
    setMsg('📋 결산 배당 — 보유 배당주 없음 (배당락 갭다운 예정)');
  }
}

