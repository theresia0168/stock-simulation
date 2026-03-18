// ── engine.js ──  GBM/GARCH 가격 엔진
// 의존: constants.js → state(G) 전역


function marketStatus() {
  if (!isWeekday(G.date)) return 'closed';
  if (G.totalMin >= OPEN_MIN  && G.totalMin < CLOSE_MIN) return 'open';
  if (G.totalMin >= CLOSE_MIN && G.totalMin < AFTER_MIN) return 'after';
  return 'closed';
}


// ════════════════════════════════════════════════════
// RANDOM UTILITIES
// ════════════════════════════════════════════════════
function randn() {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function randFatTail(nu) {
  let chi2 = 0;
  for (let i = 0; i < nu; i++) { const z = randn(); chi2 += z * z; }
  return randn() / Math.sqrt(chi2 / nu);
}


// ════════════════════════════════════════════════════
// TICK SIZE / DISPLAY
// ════════════════════════════════════════════════════
function getTickSize(price) {
  if (price >= 500000) return 1000;
  if (price >= 100000) return 500;
  if (price >= 50000)  return 100;
  if (price >= 10000)  return 50;
  if (price >= 1000)   return 10;
  return 5;
}

function displayPrice(priceF) {
  const tick = getTickSize(priceF);
  return Math.max(tick, Math.round(priceF / tick) * tick);
}


// ════════════════════════════════════════════════════
// GARCH 변동성 업데이트
// ════════════════════════════════════════════════════
function updateGarch(st, logReturn) {
  const def  = st.def;
  const minV = def.volBase / Math.sqrt(MINS_PER_DAY);
  const maxMult = G.isCrash ? 4.0 : 1.8;
  st.garchVol = Math.sqrt(
    def.garchOmega + def.garchAlpha * logReturn * logReturn + def.garchBeta * st.garchVol * st.garchVol
  );
  // 하한 0.85 → 변동성이 0 근처로 수렴하는 현상 방지
  st.garchVol = Math.max(minV * 0.85, Math.min(minV * maxMult, st.garchVol));
}

function recalcKospi() { /* 호환성 유지 */ }


// ════════════════════════════════════════════════════
// 서킷브레이커
// ════════════════════════════════════════════════════
function checkMarketCB() {
  if (G.marketCB) return;
  const chg = G.kospiOpen > 0 ? (G.kospi - G.kospiOpen) / G.kospiOpen * 100 : 0;
  let stage = 0;
  if (chg <= -20) stage = 3;
  else if (chg <= -15) stage = 2;
  else if (chg <= -8)  stage = 1;
  if (stage === 0) return;
  const suspendMins = stage === 1 ? 20 : stage === 2 ? 20 : 0;
  G.marketCB = { stage, resumeTurn: G.turn + suspendMins };
  const msg = `⛔ KOSPI ${chg.toFixed(1)}% — 시장 서킷브레이커 ${stage}단계 발동`;
  showEventBar(msg, 'bear');
  addLog(msg, 'sys');
  setMsg(msg);
}

function checkCBRelease() {
  if (!G.marketCB) return;
  if (G.turn >= G.marketCB.resumeTurn) { G.marketCB = null; setMsg('✅ 서킷브레이커 해제'); }
}


// ════════════════════════════════════════════════════
// 가격 제한 / VI
// ════════════════════════════════════════════════════
function checkPriceLimits(st) {
  if (!st.dayOpen || st.dayOpen <= 0) return;
  const chg = (st.price - st.dayOpen) / st.dayOpen;
  st.isUpperLimit = chg >=  0.295;
  st.isLowerLimit = chg <= -0.295;
}

function checkStockVI(st, prevPrice) {
  if (st.vi !== null || prevPrice <= 0) return;
  const tickChg = Math.abs(st.price - prevPrice) / prevPrice;
  if (tickChg >= 0.10) {
    st.vi = { resumeMin: G.totalMin + 2 }; // 2분 후 해제 (totalMin 기반)
    const msg = `⏸ [VI] ${st.def.id} 변동성완화장치 발동 (${(tickChg*100).toFixed(1)}%)`;
    if (st.def.id === G.activeId) setMsg(msg);
    addLog(msg, 'sys');
  }
}


// ════════════════════════════════════════════════════
// GBM 가격 생성 — PER 할인율 드리프트 통합
// ════════════════════════════════════════════════════
function genMove(st, status) {
  const def    = st.def;
  const regime = REGIME_PARAMS[G.regime];
  const minVol = def.volBase / Math.sqrt(MINS_PER_DAY);

  // 조건부 변동성 — 크래시 중엔 변동성 대폭 확대
  const crashVolMult = G.isCrash ? (1.5 + G.crashSeverity * 2.0) : 1.0;
  const timeMult  = (G.hour === OPEN_H) ? 1.15 : (G.hour === CLOSE_H - 1) ? 1.10 : 1.0;
  const effVol = (status === 'open'
    ? st.garchVol * timeMult * regime.volMult * crashVolMult
    : st.garchVol * 0.20)
    * (G.activeMarketEvent ? 1.4 : 1.0)
    * (1 + G.bubbleIndex * 0.3);  // 버블기엔 변동성 증가

  // 드리프트
  const daysPassed = st.dailyCandles.length;
  const trendPrice = def.initPrice * Math.exp(def.annualDrift / 252 * daysPassed);
  const priceRef   = st.priceF > 0 ? st.priceF : st.price;

  // meanRev 기준: trendPrice 70% + SMA 30%
  let mrRef = trendPrice;
  if (st.dailyCandles.length >= 20) {
    const lookback = Math.min(60, st.dailyCandles.length);
    const sma = st.dailyCandles.slice(-lookback)
      .reduce((sum, c) => sum + c.c, 0) / lookback;
    mrRef = trendPrice * 0.70 + sma * 0.30;
  }

  const priceRatio = priceRef / trendPrice;
  const adaptiveMRSpeed = priceRatio < 0.5
    ? def.meanRevSpeed * 2.5
    : priceRatio < 0.7
    ? def.meanRevSpeed * 1.5
    : def.meanRevSpeed;

  let meanRevForce = -adaptiveMRSpeed * Math.log(Math.max(1, priceRef) / mrRef) / MINS_PER_DAY;

  // bear 레짐에서 meanRev 상방 기여 강하게 억제
  if (G.regime === 'bear' && meanRevForce > 0) {
    meanRevForce *= 0.3; // 기존 0.5 → 0.3으로 강화
  }

  const rateEffect = def.rateSens * (G.krRate - 3.0) * 0.001 / MINS_PER_DAY;

  // PER 할인율 드리프트 — bear 레짐에선 저PER 상방 압력도 강하게 제한
  let perDiscountDrift = getPERDiscountDrift(st);
  if (G.regime === 'bear' && perDiscountDrift > 0) {
    perDiscountDrift *= 0.25; // 기존 0.4 → 0.25로 강화
  }

  const crashDrift = G.isCrash
    ? -G.crashSeverity * 0.001 * def.marketBeta / MINS_PER_DAY
    : 0;

  const recoveryDrift = (!G.isCrash && G.crashRecoveryTurns === 0 && G.crashSeverity > 0)
    ? G.crashSeverity * 0.0002 * def.marketBeta / MINS_PER_DAY
    : 0;

  const bubbleMomentum = G.bubbleIndex > 0.5
    ? (G.bubbleIndex - 0.5) * 0.0003 * def.marketBeta / MINS_PER_DAY
    : 0;

  // 적자 종목(EPS ≤ 0) annualDrift 제한
  // 실제로 적자 기업의 주가는 기대감으로만 오르므로 한계가 있어야 함
  // trendPrice 대비 너무 올랐으면 annualDrift 효과를 줄임
  const daysPassed2  = st.dailyCandles.length;
  const trendPrice2  = def.initPrice * Math.exp(def.annualDrift / 252 * daysPassed2);
  const lossStockDriftMult = (st.eps <= 0 && trendPrice2 > 0)
    ? Math.max(0, 1 - Math.max(0, priceRef / trendPrice2 - 1.0) * 0.8)
    : 1.0;
  // trendPrice와 같으면 1.0(정상), 2배면 0.2(80% 억제), 3배면 0(완전 억제)

  // bear 레짐에선 longRunBias 거의 제거
  const longRunBias = G.regime === 'bear'
    ? 0.003 / (252 * MINS_PER_DAY)
    : 0.015 / (252 * MINS_PER_DAY);

  const totalDrift =
    def.annualDrift / (252 * MINS_PER_DAY) * lossStockDriftMult +
    regime.drift / MINS_PER_DAY +
    meanRevForce + rateEffect +
    perDiscountDrift + crashDrift + recoveryDrift + bubbleMomentum + longRunBias;

  // 확률적 충격
  const kospiContrib = Math.min(Math.abs(G.kospiLogReturn * def.marketBeta), effVol * 0.3)
                       * Math.sign(G.kospiLogReturn || 0);
  const shock = randn() * effVol + kospiContrib;
  const logReturn = totalDrift - 0.5 * effVol * effVol + shock;

  // 일간 등락 제한 — 크래시 중엔 완화
  const dayOpenF = st.dayOpenF > 0 ? st.dayOpenF : st.dayOpen;
  const currentDayLR = Math.log(Math.max(1, priceRef) / dayOpenF);
  const limitUp   =  def.dailyLimit;
  const limitDown = G.isCrash ? def.dailyLimit * 2.0 : def.dailyLimit;
  let clampedLR = logReturn;
  if (currentDayLR + logReturn >  limitUp)   clampedLR = Math.max(0,   limitUp  - currentDayLR);
  if (currentDayLR + logReturn < -limitDown)  clampedLR = Math.min(0, -limitDown - currentDayLR);

  // 거래량
  const baseMin = def.baseVol / MINS_PER_DAY;
  const crashVolSens = G.isCrash ? 3.0 : 1.0; // 크래시 중엔 거래량 폭증
  const volume = status === 'open'
    ? Math.max(1, Math.floor(baseMin
        * (1 + Math.abs(clampedLR) * def.volSens * 40)
        * (G.activeMarketEvent ? 1.8 : 1.0)
        * (G.regime === 'bear'  ? 1.25 : 1.0)
        * crashVolSens
        * Math.exp(randn() * 0.8)))
    : Math.max(1, Math.floor(baseMin * 0.05 * Math.exp(randn() * 0.5)));

  return { logReturn: clampedLR, volume };
}


// ════════════════════════════════════════════════════
// 메인 틱 처리
// ════════════════════════════════════════════════════
function processPriceTick() {
  const status = marketStatus();
  if (status !== 'open' && status !== 'after') return;
  const cbActive = G.marketCB !== null;

  G.listedIds.forEach(id => {
    const st = G.stocks[id];
    if (st.delisted || cbActive) return;

    // VI 해제 체크는 항상 먼저 (VI 중에도 시간은 흐름)
    if (st.vi !== null) {
      if (G.totalMin >= st.vi.resumeMin) {
        const msg = `▶ [VI해제] ${st.def.id} 거래 재개`;
        if (st.def.id === G.activeId) setMsg(msg);
        addLog(msg, 'sys');
        st.vi = null;
      } else {
        return; // 아직 VI 중 → 틱 처리 스킵
      }
    }

    if (!st.ob) initOrderBook(st);
    if (!st.priceF)    st.priceF    = st.price;
    if (!st.dayOpenF)  st.dayOpenF  = st.dayOpen;

    const prevPriceF = st.priceF;
    const prevDisp   = st.price;

    const { logReturn, volume } = genMove(st, status);
    st.priceF = Math.max(1, prevPriceF * Math.exp(logReturn));
    const newDisp = displayPrice(st.priceF);
    updateGarch(st, logReturn);

    if (st.priceF > prevPriceF && st.ob.asks.length > 0) {
      const minV = st.def.volBase / Math.sqrt(MINS_PER_DAY);
      const c = Math.max(1, Math.round(obBaseVol(st) * Math.abs(logReturn) / minV * 0.5));
      st.ob.asks[0].vol = Math.max(1, st.ob.asks[0].vol - c);
    } else if (st.priceF < prevPriceF && st.ob.bids.length > 0) {
      const minV = st.def.volBase / Math.sqrt(MINS_PER_DAY);
      const c = Math.max(1, Math.round(obBaseVol(st) * Math.abs(logReturn) / minV * 0.5));
      st.ob.bids[0].vol = Math.max(1, st.ob.bids[0].vol - c);
    }
    syncOrderBook(st, newDisp);

    st.dayHigh = Math.max(st.dayHigh, newDisp);
    st.dayLow  = Math.min(st.dayLow,  newDisp);
    st.dayVol += volume;
    st.price   = newDisp;
    st.prevTickPrice = prevDisp;

    if (status === 'open') {
      if (!st.intraday) {
        st.intraday = { o: st.dayOpen, h: newDisp, l: newDisp, c: newDisp, volume };
      } else {
        st.intraday.h = Math.max(st.intraday.h, newDisp);
        st.intraday.l = Math.min(st.intraday.l, newDisp);
        st.intraday.c = newDisp;
        st.intraday.volume += volume;
      }
      const flow = calcInvestorFlow(st, logReturn, volume);
      st.flowInst = flow.inst; st.flowFore = flow.fore; st.flowIndiv = flow.indiv;
      st.netInst  += flow.inst; st.netFore  += flow.fore; st.netIndiv  += flow.indiv;
      G.marketFlowInst += flow.inst; G.marketFlowFore += flow.fore; G.marketFlowIndiv += flow.indiv;
      checkPriceLimits(st);
      checkStockVI(st, prevDisp);
    }
  });

  recalcKospi();
  if (marketStatus() === 'open') { updateKospiCandle(); checkMarketCB(); }
  checkPendingOrders();
}
