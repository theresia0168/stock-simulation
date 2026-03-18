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
// Box-Muller transform → 표준정규분포 샘플
// ════════════════════════════════════════════════════
function randn() {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}



// 학생 t-분포 근사 (자유도 nu=4) → 두꺼운 꼬리(fat tail)
// 실제 주가 수익률은 정규분포보다 극단값이 훨씬 자주 발생
function randFatTail(nu) {
  // t(nu) = randn / sqrt(chi2(nu)/nu)
  // chi2(nu) ≈ sum of nu squared normals
  let chi2 = 0;
  for (let i = 0; i < nu; i++) { const z = randn(); chi2 += z * z; }
  return randn() / Math.sqrt(chi2 / nu);
}


//   4. GARCH: priceF 기준 logReturn으로 업데이트
//   5. OB: 표시 가격 기준으로 렌더, float 가격 이동 연출
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



function updateGarch(st, logReturn) {
  const def  = st.def;
  const minV = def.volBase / Math.sqrt(MINS_PER_DAY);
  st.garchVol = Math.sqrt(
    def.garchOmega + def.garchAlpha * logReturn * logReturn + def.garchBeta * st.garchVol * st.garchVol
  );
  st.garchVol = Math.max(minV * 0.5, Math.min(minV * 1.8, st.garchVol));
}



function recalcKospi() { /* KOSPI는 stepKospi()에서 직접 업데이트 — 이 함수는 호환성 유지용 */ }




function checkMarketCB() {
  if (G.marketCB) return;
  const chg = G.kospiOpen > 0 ? (G.kospi - G.kospiOpen) / G.kospiOpen * 100 : 0;
  let stage = 0;
  if (chg <= -20) stage = 3;
  else if (chg <= -15) stage = 2;
  else if (chg <= -8)  stage = 1;
  if (stage === 0) return;
  const suspendMins = stage === 1 ? 20 : stage === 2 ? 20 : 0; // 3단계는 당일 장 종료
  G.marketCB = { stage, resumeTurn: G.turn + suspendMins };
  const msg = `⛔ KOSPI ${chg.toFixed(1)}% — 시장 서킷브레이커 ${stage}단계 발동`;
  showEventBar(msg, 'bear');
  addLog(msg, 'sys');
  setMsg(msg);
}



function checkPriceLimits(st) {
  if (!st.dayOpen || st.dayOpen <= 0) return;
  const chg = (st.price - st.dayOpen) / st.dayOpen;
  st.isUpperLimit = chg >=  0.295;
  st.isLowerLimit = chg <= -0.295;
}



function checkStockVI(st, prevPrice) {
  if (st.vi !== null) return;
  if (prevPrice <= 0) return;
  const tickChg = Math.abs(st.price - prevPrice) / prevPrice;
  if (tickChg >= 0.10) { // 단일 틱 10% 급변
    st.vi = { resumeTurn: G.turn + 2 };
    const msg = `⏸ [VI] ${st.def.id} 변동성완화장치 발동 (${(tickChg*100).toFixed(1)}%)`;
    if (st.def.id === G.activeId) setMsg(msg);
    addLog(msg, 'sys');
  }
}



function genMove(st, status) {
  const def    = st.def;
  const regime = REGIME_PARAMS[G.regime];
  const minVol = def.volBase / Math.sqrt(MINS_PER_DAY);

  // 조건부 변동성
  const timeMult = (G.hour === OPEN_H) ? 1.15 : (G.hour === CLOSE_H - 1) ? 1.10 : 1.0;
  const effVol   = (status === 'open'
    ? st.garchVol * timeMult * regime.volMult
    : st.garchVol * 0.20)
    * (G.activeMarketEvent ? 1.4 : 1.0);

  // 드리프트 (분당)
  const daysPassed   = st.dailyCandles.length;
  const trendPrice   = def.initPrice * Math.exp(def.annualDrift / 252 * daysPassed);
  const priceRef     = st.priceF > 0 ? st.priceF : st.price;

  // meanRev 기준: trendPrice와 장기이평(60일) 혼합
  // 장기이평이 있으면 그 방향으로도 복원 → 너무 큰 편차만 잡아줌
  let mrRef = trendPrice;
  if (st.dailyCandles.length >= 20) {
    const lookback = Math.min(60, st.dailyCandles.length);
    const sma = st.dailyCandles.slice(-lookback)
      .reduce((sum, c) => sum + c.c, 0) / lookback;
    // trendPrice와 60일 이평의 평균을 기준으로 사용
    mrRef = (trendPrice + sma) / 2;
  }

  const meanRevForce = -def.meanRevSpeed * Math.log(Math.max(1, priceRef) / mrRef) / MINS_PER_DAY;
  const rateEffect   = def.rateSens * (G.krRate - 3.0) * 0.001 / MINS_PER_DAY;
  const totalDrift   =
    def.annualDrift / (252 * MINS_PER_DAY) +
    regime.drift / MINS_PER_DAY +
    meanRevForce + rateEffect;

  // 확률적 충격 (순수 GBM + KOSPI 소폭 연동)
  const kospiContrib = Math.min(Math.abs(G.kospiLogReturn * def.marketBeta), effVol * 0.3)
                       * Math.sign(G.kospiLogReturn || 0);
  const shock        = randn() * effVol + kospiContrib;
  const logReturn    = totalDrift - 0.5 * effVol * effVol + shock;

  // 일간 등락 제한 (priceF 기준)
  const dayOpenF   = st.dayOpenF > 0 ? st.dayOpenF : st.dayOpen;
  const currentDayLR = Math.log(Math.max(1, priceRef) / dayOpenF);
  let clampedLR    = logReturn;
  if (currentDayLR + logReturn >  def.dailyLimit) clampedLR = Math.max(0,  def.dailyLimit - currentDayLR);
  if (currentDayLR + logReturn < -def.dailyLimit) clampedLR = Math.min(0, -def.dailyLimit - currentDayLR);

  // 거래량
  // 거래량: 로그정규 노이즈를 0.8로 키워 일간 변동계수 0.5 이상 확보
  // 실제 주식 거래량은 조용한 날 vs 급등락 날 3~10배 차이
  const baseMin = def.baseVol / MINS_PER_DAY;
  const volume  = status === 'open'
    ? Math.max(1, Math.floor(baseMin
        * (1 + Math.abs(clampedLR) * def.volSens * 40)
        * (G.activeMarketEvent ? 1.8 : 1.0)
        * (G.regime === 'bear' ? 1.25 : 1.0)
        * Math.exp(randn() * 0.8)))   // 0.3 → 0.8: 일간 거래량 들쭉날쭉하게
    : Math.max(1, Math.floor(baseMin * 0.05 * Math.exp(randn() * 0.5)));

  return { logReturn: clampedLR, volume };
}



// ── 메인 틱 처리 ──
function processPriceTick() {
  const status = marketStatus();
  if (status !== 'open' && status !== 'after') return;
  const cbActive = G.marketCB !== null;

  G.listedIds.forEach(id => {
    const st = G.stocks[id];
    if (st.delisted || st.vi !== null || cbActive) return;
    if (!st.ob) initOrderBook(st);

    // priceF 초기화 (처음 틱이면)
    if (!st.priceF) st.priceF = st.price;
    if (!st.dayOpenF) st.dayOpenF = st.dayOpen;

    const prevPriceF = st.priceF;
    const prevDisp   = st.price;  // 이전 표시 가격

    // GBM 계산
    const { logReturn, volume } = genMove(st, status);

    // float 가격 업데이트
    st.priceF = Math.max(1, prevPriceF * Math.exp(logReturn));

    // 표시 가격 (틱 반올림)
    const newDisp = displayPrice(st.priceF);

    // GARCH: float 기준 수익률로 업데이트
    updateGarch(st, logReturn);

    // OB 연출
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

    // 표시 가격 기준 OHLCV
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
      st.netInst  += flow.inst; st.netFore += flow.fore; st.netIndiv += flow.indiv;
      G.marketFlowInst += flow.inst; G.marketFlowFore += flow.fore; G.marketFlowIndiv += flow.indiv;
      checkPriceLimits(st);
      checkStockVI(st, prevDisp);
    }
  });

  recalcKospi();
  if (marketStatus() === 'open') { updateKospiCandle(); checkMarketCB(); }
  checkPendingOrders();
}

