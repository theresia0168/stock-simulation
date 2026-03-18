// ── economy.js ──  경기사이클, 금리, 버블, 투자자흐름, 배당
// 의존: constants.js → state(G) 전역
//
// ══ 상호작용 구조 ══
//
//  경기사이클 (사인파 추세) ──→ GDP성장률
//       ↑                           ↓
//  주가 역피드백            필립스 곡선 (실업↔인플레)
//       ↑                           ↓
//  EPS 성장률 ←── 금리 ←── 인플레/GDP/실업
//       ↓              ↓
//  주가 ←── PER할인율 (금리 연동)
//       ↓
//  버블지수 축적 → 임계점 → 붕괴 → 장기침체 → 회복
//       ↓
//  레짐 자동전환 (외생 마르코프 → 내생 경제지표 연동)


// ════════════════════════════════════════════════════
// 1. 경기 사이클 (장기 사인파)
//    실제 경기 4~7년 주기를 시뮬 시간으로 압축
//    MINS_PER_DAY=420, 252 거래일/년
//    1 시뮬년 ≈ 252*420 = 105,840 틱
//    사이클 주기: 5년 = 529,200 틱
// ════════════════════════════════════════════════════
const CYCLE_PERIOD_TICKS = 529200;   // 5년 주기
const CYCLE_AMPLITUDE    = 0.018;    // GDP 진폭 ±1.8%p

function getCyclicalGDP() {
  // 사인파 기반 경기사이클 (G.totalTicksElapsed 사용)
  const phase = (G.totalTicksElapsed / CYCLE_PERIOD_TICKS) * 2 * Math.PI + G.cyclePhaseOffset;
  return CYCLE_AMPLITUDE * Math.sin(phase);
}


// ════════════════════════════════════════════════════
// 2. 레짐 전환 — 경제지표 연동 (내생적)
//    기존 고정 마르코프 → GDP/인플레/버블/PER 반영
// ════════════════════════════════════════════════════
function transitionRegime() {
  // 크래시 회복 중이면 bear 고정
  if (G.crashRecoveryTurns > 0) {
    G.regime = 'bear';
    G.crashRecoveryTurns--;
    return;
  }
  if (G.isCrash) {
    G.regime = 'bear';
    return;
  }

  // 경제지표 score
  const gdpScore  = G.gdpGrowth  >  3.0 ?  0.20 : G.gdpGrowth  < 0.0  ? -0.25 :
                    G.gdpGrowth  >  2.0 ?  0.10 : G.gdpGrowth  < 1.0  ? -0.10 : 0;
  const infScore  = G.inflation   > 5.0  ? -0.20 : G.inflation  < 1.0   ?  0.08 :
                    G.inflation   > 3.5  ? -0.10 : 0;
  const rateScore = G.krRate      > 5.0  ? -0.20 : G.krRate     < 1.5   ?  0.12 :
                    G.krRate      > 4.0  ? -0.10 : 0;
  const bubScore  = G.bubbleIndex > 0.7  ? -0.25 : G.bubbleIndex < 0.15 ?  0.08 : 0;
  const mktPER    = calcMarketPER();
  const perScore  = mktPER > 35 ? -0.15 : mktPER < 9 ? 0.12 : 0;
  const totalScore = gdpScore + infScore + rateScore + bubScore + perScore;

  const prevRegime = G.regime;
  const base = REGIME_TRANS[G.regime];

  // ── bear → bull 직행 차단 ──
  // bear에서 bull로 바로 가는 것을 막고 반드시 neutral을 경유하도록
  // 현실에서 약세장 → 강세장 전환은 반드시 바닥 확인(횡보) 구간이 있음
  // 유일한 예외: 유동성 랠리(triggerLiquidityRally)가 직접 bull로 설정하는 경우
  if (prevRegime === 'bear') {
    // bear에서 bull 확률을 0으로 고정, neutral로만 이동 가능
    let pNeut = Math.min(0.25, base.neutral + Math.max(0, totalScore) * 0.4);
    let pBear = Math.max(0.75, 1 - pNeut);
    const r = Math.random();
    const next = r < pNeut ? 'neutral' : 'bear';
    if (next !== prevRegime) {
      G.regime = next;
      const label = '➡️ 중립 (바닥 확인 중)';
      const msg = `[국면전환] bear → neutral ${label}`;
      addLog(msg, 'sys');
      showEventBar(msg, 'neutral');
    }
    return;
  }

  // ── neutral → bull/bear 전환 ──
  // neutral에서 bull로 가려면 경제지표 개선이 확인돼야 함
  // score가 양수(경기 호조)일 때만 bull 전환 확률 상승
  if (prevRegime === 'neutral') {
    // bull 전환: 경기 호조 조건 2개 이상 충족 시 가중
    const bullConditions = [
      G.gdpGrowth > 2.0,
      G.inflation < 3.5,
      G.krRate < 4.0,
      G.bubbleIndex < 0.4,
      mktPER < 25,
    ].filter(Boolean).length;

    // 조건 0개: bull 확률 5% / 2개: 20% / 4개 이상: 40%
    const pBull = Math.min(0.40, 0.05 + bullConditions * 0.07 + Math.max(0, totalScore) * 0.15);
    const pBear = Math.min(0.35, base.bear + Math.max(0, -totalScore) * 0.3);
    const pNeut = Math.max(0.30, 1 - pBull - pBear);

    const r = Math.random();
    const next = r < pBull ? 'bull' : r < pBull + pNeut ? 'neutral' : 'bear';
    if (next !== prevRegime) {
      G.regime = next;
      const label = next === 'bull' ? '📈 강세장' : '📉 약세장';
      const msg = `[국면전환] neutral → ${next} ${label}`;
      addLog(msg, next === 'bull' ? 'buy' : 'sell');
      showEventBar(msg, next === 'bull' ? 'bull' : 'bear');
    }
    return;
  }

  // ── bull 전환 (기존 유지) ──
  let pBull = base.bull + totalScore * 0.4;
  let pBear = base.bear - totalScore * 0.4;
  pBull = Math.max(0.01, Math.min(0.97, pBull));
  pBear = Math.max(0.01, Math.min(0.97, pBear));
  const pNeut = Math.max(0.02, 1 - pBull - pBear);

  const r = Math.random();
  const next = r < pBull ? 'bull' : r < pBull + pNeut ? 'neutral' : 'bear';
  if (next !== prevRegime) {
    G.regime = next;
    const label = next === 'bull' ? '📈 강세장' : next === 'bear' ? '📉 약세장' : '➡️ 중립';
    const msg = `[국면전환] ${prevRegime} → ${next} ${label}`;
    addLog(msg, next === 'bull' ? 'buy' : next === 'bear' ? 'sell' : 'sys');
    showEventBar(msg, next === 'bull' ? 'bull' : next === 'bear' ? 'bear' : 'neutral');
  }
}


// ════════════════════════════════════════════════════
// 3. 시장 평균 PER 계산
// ════════════════════════════════════════════════════
function calcMarketPER() {
  const lst = listedStocks();
  if (lst.length === 0) return 15;
  let totalMcap = 0, totalEarnings = 0;
  lst.forEach(st => {
    if (st.eps > 0) {
      totalMcap     += st.price * st.totalShares;
      totalEarnings += st.eps   * st.totalShares;
    }
  });
  if (totalEarnings <= 0) return 20;
  return totalMcap / totalEarnings;
}


// ════════════════════════════════════════════════════
// 4. 추세 대비 주가 괴리율 (시장 전체)
// ════════════════════════════════════════════════════
function calcPriceToTrend() {
  const lst = listedStocks();
  if (lst.length === 0) return 1;
  let sumRatio = 0, cnt = 0;
  lst.forEach(st => {
    const daysPassed = st.dailyCandles.length;
    const trend = st.def.initPrice * Math.exp(st.def.annualDrift / 252 * daysPassed);
    if (trend > 0) { sumRatio += st.price / trend; cnt++; }
  });
  return cnt > 0 ? sumRatio / cnt : 1;
}


// ════════════════════════════════════════════════════
// 5. 버블 지수 업데이트
//    0~1 범위, 0.65↑ 위험, 0.85↑ 붕괴 임박
// ════════════════════════════════════════════════════
function updateBubbleIndex() {
  const mktPER       = calcMarketPER();
  const priceToTrend = calcPriceToTrend();
  const bullStreakBonus = G.consecutiveBullTurns > 150
    ? (G.consecutiveBullTurns - 150) * 0.000005 : 0;

  const lst = listedStocks();
  const highPERRatio = lst.length > 0
    ? lst.filter(st => st.eps > 0 && st.price / st.eps > 25).length / lst.length
    : 0;
  const maxPER = lst.reduce((m, st) =>
    st.eps > 0 ? Math.max(m, st.price / st.eps) : m, 0);

  // 적자 종목의 trendPrice 대비 과열도 버블에 기여
  // EPS 음수인데 주가가 추세의 1.5배 이상이면 투기적 과열로 판단
  const lossStockOverheat = lst.reduce((sum, st) => {
    if (st.eps >= 0) return sum;
    const daysPassed = st.dailyCandles.length;
    const trend = st.def.initPrice * Math.exp(st.def.annualDrift / 252 * daysPassed);
    const ratio = trend > 0 ? st.price / trend : 1;
    return sum + (ratio > 1.5 ? (ratio - 1.5) * 0.0005 : 0);
  }, 0);

  const buildUp =
    (mktPER > 16         ? (mktPER - 16) * 0.00035  : 0) +
    (priceToTrend > 1.10 ? (priceToTrend - 1.10) * 0.003 : 0) +
    (G.regime === 'bull' ? 0.0006 : 0) +
    (G.krRate < 2.5      ? 0.0006 : G.krRate < 3.5 ? 0.0003 : 0) +
    (highPERRatio > 0.25 ? highPERRatio * 0.0010 : 0) +
    (maxPER > 40         ? (maxPER - 40) * 0.000005 : 0) +
    lossStockOverheat +
    bullStreakBonus;

  // 고금리 구간에서 버블 소멸 가속
  // 금리 5% 이상이면 소멸 속도 크게 증가 (실제로 고금리는 버블을 빠르게 꺼뜨림)
  const rateDecay = G.krRate > 5.0
    ? G.krRate * 0.00020          // 고금리: 강한 소멸
    : G.krRate * 0.00005;         // 일반: 기존 유지

  const decay =
    rateDecay +
    (G.regime === 'bear' ? 0.0005 : 0) +
    (mktPER < 12         ? 0.0004 : 0) +
    (priceToTrend < 0.85 ? 0.0008 : 0);

  G.bubbleIndex = Math.max(0, Math.min(1, G.bubbleIndex + buildUp - decay));

  if (G.regime === 'bull') G.consecutiveBullTurns++;
  else G.consecutiveBullTurns = 0;
}


// ════════════════════════════════════════════════════
// 6. 버블 붕괴 체크 & 실행
// ════════════════════════════════════════════════════
function checkBubbleBurst() {
  if (G.bubbleIndex < 0.65 || G.isCrash) return;

  // 임계점 근처에서 확률적 붕괴
  // 금리 인상, 악재 이벤트가 뇌관 역할
  const burstProb =
    (G.bubbleIndex - 0.65) * 0.04 +
    (G.krRate > 4.5          ? 0.015 : 0) +
    (G.inflation > 4.0       ? 0.010 : 0) +
    (G.activeMarketEvent?.type === 'bear' ? 0.020 : 0);

  if (Math.random() > burstProb) return;

  // ── 붕괴 실행 ──
  const severity = G.bubbleIndex; // 0.65~1.0
  G.isCrash          = true;
  G.crashSeverity    = severity;
  // 회복까지 잠금: 심각도에 비례하되 최대 600턴 (약 1거래일)으로 제한
  // 이후 fearIndex + 레짐 전환으로 자연 회복되게 함
  G.crashRecoveryTurns = Math.round(severity * 600);
  G.bubbleIndex      = 0;
  G.regime           = 'bear';
  G.consecutiveBullTurns = 0;

  // 모든 종목에 즉각 충격 (PER 정상화 + 패닉 할인)
  const panicDiscount = 0.25 + severity * 0.35; // 25~60% 하락
  listedStocks().forEach(st => {
    const logImpact = -panicDiscount * st.def.marketBeta * (0.7 + Math.random() * 0.6);
    const clamped   = Math.max(logImpact, Math.log(1 - st.def.dailyLimit));
    st.priceF = Math.max(1, (st.priceF || st.price) * Math.exp(clamped));
    const nd  = displayPrice(st.priceF);
    updateGarch(st, clamped);
    st.price   = nd;
    st.dayHigh = Math.max(st.dayHigh, nd);
    st.dayLow  = Math.min(st.dayLow,  nd);
    if (st.intraday) { st.intraday.h = Math.max(st.intraday.h, nd); st.intraday.l = Math.min(st.intraday.l, nd); st.intraday.c = nd; }
  });

  // KOSPI도 폭락
  G.kospi = Math.max(500, G.kospi * (1 - panicDiscount * 0.6));

  const severityLabel = severity > 0.85 ? '대폭락' : severity > 0.75 ? '급락' : '조정';
  const msg = `💥 [버블 붕괴] ${severityLabel} 발생! 시장 전반 패닉 매도 — 회복까지 장기 침체 예상`;
  showEventBar(msg, 'bear');
  addLog(msg, 'sys');
  setMsg(msg);
}


// ════════════════════════════════════════════════════
// 7. 공포지수 (유동성 랠리 에너지)
//    저PER + 저금리 + 장기침체 후 → 반등 에너지 축적
// ════════════════════════════════════════════════════
function updateFearIndex() {
  const mktPER = calcMarketPER();
  const ptt    = calcPriceToTrend();

  // 공포 축적 — PER 기준 상향(12→15), 저PER일수록 더 빠르게 쌓임
  // PER 6x면 (15-6)*0.0015 = 0.0135/턴 → 약 50턴(~3거래일)이면 0.6 돌파
  const buildUp =
    (mktPER < 15          ? (15 - mktPER) * 0.0015 : 0) +
    (G.regime === 'bear'  ? 0.0010 : 0) +
    (ptt < 0.7            ? (0.7 - ptt) * 0.008 : 0) +
    (G.krRate < 3.0       ? 0.0005 : 0) +
    // 고금리 + 저PER: 실질적 저평가 신호 → 에너지 더 빠르게 축적
    (G.krRate > 5.0 && mktPER < 10 ? 0.0020 : 0) +
    (G.isCrash            ? 0.0008 : 0);

  // 소멸
  const decay =
    (G.regime === 'bull'  ? 0.0015 : 0) +
    (ptt > 1.1            ? 0.0010 : 0);

  G.fearIndex = Math.max(0, Math.min(1, G.fearIndex + buildUp - decay));

  // 임계값 0.60 → 0.50으로 낮춤 (저PER 상황에서 더 빨리 반등)
  if (G.fearIndex > 0.50 && !G.isCrash && G.crashRecoveryTurns === 0) {
    const prob = (G.fearIndex - 0.50) * 0.10;
    if (Math.random() < prob) triggerLiquidityRally();
  }
}


// ════════════════════════════════════════════════════
// 8. 유동성 랠리 (대호황)
// ════════════════════════════════════════════════════
function triggerLiquidityRally() {
  // fearIndex를 리셋하기 전에 강도 계산
  const rallyStrength = 0.10 + G.fearIndex * 0.20; // 10~30% 반등
  G.fearIndex   = 0;
  G.regime      = 'bull';
  G.consecutiveBullTurns = 0;

  listedStocks().forEach(st => {
    const logImpact = rallyStrength * st.def.marketBeta * (0.6 + Math.random() * 0.8);
    const clamped   = Math.min(logImpact, st.def.dailyLimit * 1.5); // 랠리엔 상한 완화
    st.priceF = Math.max(1, (st.priceF || st.price) * Math.exp(clamped));
    const nd  = displayPrice(st.priceF);
    updateGarch(st, clamped);
    st.price   = nd;
    st.dayHigh = Math.max(st.dayHigh, nd);
    st.dayLow  = Math.min(st.dayLow,  nd);
    if (st.intraday) { st.intraday.h = Math.max(st.intraday.h, nd); st.intraday.l = Math.min(st.intraday.l, nd); st.intraday.c = nd; }
    // EPS도 소폭 회복 (유동성 → 실적 기대 선반영)
    if (st.eps < 0) st.eps = Math.round(st.eps * 0.7); // 적자 축소
  });

  const msg = `🚀 [유동성 랠리] 저평가 해소 — 시장 전반 급반등! (강도 ${(rallyStrength*100).toFixed(0)}%)`;
  showEventBar(msg, 'bull');
  addLog(msg, 'sys');
  setMsg(msg);
}


// ════════════════════════════════════════════════════
// 9. KOSPI GBM (버블/공포 반영)
// ════════════════════════════════════════════════════
function stepKospi() {
  const regime = REGIME_PARAMS[G.regime];

  // KOSPI 자체 드리프트 — 레짐 효과를 더 강하게 반영
  // 기존: KOSPI_ANNUAL_DRIFT(8%) + regime.drift
  // 수정: 레짐 드리프트를 1.5배로 증폭 → bull/bear 국면이 KOSPI에 더 뚜렷하게 나타남
  const bubbleDrift = G.bubbleIndex > 0.5 ? (G.bubbleIndex - 0.5) * 0.0006 : 0;
  const drift = KOSPI_ANNUAL_DRIFT / (252 * MINS_PER_DAY)
              + regime.drift * 1.5 / MINS_PER_DAY  // 레짐 효과 1.5배 증폭
              + bubbleDrift;
  const vol = KOSPI_MIN_VOL * regime.volMult
    * (G.activeMarketEvent ? 1.4 : 1.0)
    * (G.isCrash           ? 2.5 : 1.0)
    * (1 + G.bubbleIndex * 0.5);

  const logRet = drift - 0.5 * vol * vol + randn() * vol;

  // 종목 시가총액 가중 수익률
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

  // bear/크래시 시 종목 흐름 반영 비중 높임
  // 폭락장에서 종목들이 크게 내리는데 KOSPI만 버티는 현상 방지
  const mktWeight = G.isCrash ? 0.70
    : G.regime === 'bear' ? 0.60
    : 0.50;
  const gbmWeight = 1 - mktWeight;
  G.kospiLogReturn = logRet * gbmWeight + mktRet * mktWeight;
  G.kospi = Math.round(G.kospi * Math.exp(G.kospiLogReturn) * 100) / 100;

  const dayLimit = G.isCrash ? 0.20 : 0.08;
  const dayChg = G.kospiOpen > 0 ? (G.kospi - G.kospiOpen) / G.kospiOpen : 0;
  if (dayChg >  dayLimit) G.kospi = Math.round(G.kospiOpen * (1 + dayLimit) * 100) / 100;
  if (dayChg < -dayLimit) G.kospi = Math.round(G.kospiOpen * (1 - dayLimit) * 100) / 100;
}


// ════════════════════════════════════════════════════
// 10. 금리 충격 적용 (PER 할인율 채널 추가)
// ════════════════════════════════════════════════════
function applyRateShock(direction) {
  const mktPER = calcMarketPER();
  listedStocks().forEach(st => {
    // 기존: EPS 경로 충격
    const epsImpact = -direction * st.def.rateSens * 0.02;
    // 추가: PER 할인율 경로 (금리↑ → 적정PER↓ → 주가↓)
    // 고PER 종목일수록 더 크게 타격
    const stockPER     = st.eps > 0 ? st.price / st.eps : mktPER;
    const perSensitivity = Math.max(1, stockPER / 15);
    const discountImpact = -direction * 0.015 * perSensitivity;
    const totalImpact  = (epsImpact + discountImpact) * 0.5;

    if (Math.abs(totalImpact) < 0.001) return;
    st.priceF = Math.max(1, (st.priceF || st.price) * (1 + totalImpact));
    const newDisp = displayPrice(st.priceF);
    updateGarch(st, totalImpact);
    st.price   = newDisp;
    st.dayHigh = Math.max(st.dayHigh, newDisp);
    st.dayLow  = Math.min(st.dayLow,  newDisp);
    if (st.intraday) { st.intraday.h = Math.max(st.intraday.h, newDisp); st.intraday.l = Math.min(st.intraday.l, newDisp); st.intraday.c = newDisp; }
  });
}


// ════════════════════════════════════════════════════
// 11. 경제지표 스텝 — 필립스 곡선 + 역피드백 통합
// ════════════════════════════════════════════════════
function stepEconomy() {
  G.totalTicksElapsed++;

  // ── 경기사이클 베이스 ──
  const cyclicalBase = getCyclicalGDP();

  // ── 주가 → 경기 역피드백 ──
  const ptt = calcPriceToTrend();
  const wealthEffect = (ptt - 1.0) * 0.004; // 기존 0.008 → 0.004 (절반으로 축소)

  // ── 크래시 시 경기 충격 ──
  const crashDrag = G.isCrash ? -0.010 * G.crashSeverity : 0;

  // ── GDP ──
  // 랜덤 노이즈 축소(0.06→0.03), 평균회귀 강화(0.997→0.985)
  // 목표값 2.0%로 훨씬 강하게 당김 → 극단값 방지
  G.gdpGrowth += (Math.random() - 0.5) * 0.03 + cyclicalBase * 0.002 + wealthEffect + crashDrag;
  G.gdpGrowth  = G.gdpGrowth * 0.985 + 2.0 * 0.015;
  G.gdpGrowth  = Math.max(-4, Math.min(7, G.gdpGrowth));

  // ── 실업률: GDP 연동 (오쿤의 법칙) ──
  // 노이즈 축소(0.03→0.015), 평균회귀 강화(0.998→0.988)
  // GDP가 낮으면 실업 올라가고, 높으면 내려가는 구조 유지하되 진폭 줄임
  const gdpToUnemp = -(G.gdpGrowth - 2.0) * 0.015; // 기존 0.03 → 0.015
  G.unemployment += (Math.random() - 0.5) * 0.015 + gdpToUnemp;
  G.unemployment  = G.unemployment * 0.988 + 3.5 * 0.012; // 강한 평균회귀
  G.unemployment  = Math.max(2.5, Math.min(10, G.unemployment)); // 하한 2.5%로 상향

  // ── 인플레이션: 필립스 곡선 ──
  // 핵심 수정:
  //   1) 필립스 계수 0.04 → 0.008 (5배 축소) — 실업 1%여도 인플레 +0.025%/턴으로 제한
  //   2) 노이즈 0.04 → 0.02 (절반)
  //   3) 평균회귀 0.998 → 0.982 (9배 강화) — 목표 2.5%로 강하게 당김
  //   4) 상한 10% → 8% (하이퍼인플레 방지)
  const philipsEffect = -(G.unemployment - 3.5) * 0.008; // 기존 0.04 → 0.008
  G.inflation += (Math.random() - 0.5) * 0.02 + philipsEffect;
  G.inflation  = G.inflation * 0.982 + 2.5 * 0.018; // 강한 평균회귀
  G.inflation  = Math.max(-1, Math.min(8, G.inflation)); // 상한 8%

  // ── 금리 결정 — 분기 단위 ──
  // 실제 Fed: 연 8회(약 45일마다) / BOK: 연 8회
  // 시뮬: 1분기 = 63거래일 × 7턴 = 441턴
  // Fed와 BOK는 각자 독립적인 카운터로 운영
  // 단, 긴급 상황(크래시, 인플레 급등)에서는 임시회의 가능

  G.fedDecisionTurn = (G.fedDecisionTurn || 0) + 1;
  G.bokDecisionTurn = (G.bokDecisionTurn || 0) + 1;

  // 긴급 임시회의 조건 — 분기 관계없이 즉각 소집
  const fedEmergency = G.isCrash || G.inflation > 6.0 || G.gdpGrowth < -2.0;
  const bokEmergency = G.isCrash || G.inflation > 5.5 || G.gdpGrowth < -1.5;

  const FED_QUARTER = 441; // 약 63거래일
  const BOK_QUARTER = 441;

  const fedMeeting = G.fedDecisionTurn >= FED_QUARTER || fedEmergency;
  const bokMeeting = G.bokDecisionTurn >= BOK_QUARTER || bokEmergency;

  if (!fedMeeting && !bokMeeting) return;

  const crashCutBias  = G.isCrash ? 0.45 : 0;
  const recessionBias = G.gdpGrowth < 0 ? 0.30 : G.gdpGrowth < 1.0 ? 0.15 : 0;
  const inflationUrgency = Math.max(0, G.inflation - 2.5);
  const hikeProb  = Math.min(0.90, 0.35 + inflationUrgency * 0.12);
  const hikeSizeP = Math.min(0.90, 0.30 + inflationUrgency * 0.14);
  const preemptiveHike = G.gdpGrowth > 3.5 && G.inflation > 2.0 && !G.isCrash
                         && Math.random() < 0.25;

  // 고금리 지속 압력 — 금리가 높은 채로 오래 있을수록 인하 압력 누적
  // 실제로 중앙은행은 경기 둔화 신호가 쌓이면 결국 인하를 결정함
  G.highRateTurns = (G.highRateTurns || 0);
  if (G.usRate > 5.0 && G.inflation < 3.5) G.highRateTurns++;
  else G.highRateTurns = Math.max(0, G.highRateTurns - 2);
  // 매 분기 누적, 8분기(2년) 이상 고금리 유지면 강한 인하 압력
  const highRateBias = Math.min(0.50, G.highRateTurns * 0.04);

  // ── Fed 결정 ──
  if (fedMeeting) {
    if (G.fedDecisionTurn >= FED_QUARTER) G.fedDecisionTurn = 0;

    const fedHike = (G.inflation > 2.5 && !G.isCrash && Math.random() < hikeProb)
                    || preemptiveHike;
    const fedCut  = ((G.inflation < 3.0 && (G.gdpGrowth < 2.5 || G.unemployment > 3.8))
                     || (G.usRate > 4.5 && G.inflation < 3.5 && Math.random() < 0.35)
                     || G.isCrash)
                    && !fedHike
                    && Math.random() < (0.50 + crashCutBias + recessionBias + highRateBias);

    if (fedHike) {
      const d = Math.random() < hikeSizeP ? 0.50 : 0.25;
      G.usRate = Math.min(10.0, Math.round((G.usRate + d) * 100) / 100);
      const tag = fedEmergency && G.fedDecisionTurn !== 0 ? ' [긴급]' : '';
      const msg = `🇺🇸 연준 기준금리${tag} +${d}% 인상 → ${G.usRate}%`;
      showEventBar(msg, 'bear'); addLog(msg, 'sys'); setMsg(msg);
      applyRateShock(1);
    } else if (fedCut) {
      const d = Math.random() < 0.7 ? 0.25 : 0.50;
      G.usRate = Math.max(0.0, Math.round((G.usRate - d) * 100) / 100);
      const tag = fedEmergency && G.fedDecisionTurn !== 0 ? ' [긴급]' : '';
      const msg = `🇺🇸 연준 기준금리${tag} -${d}% 인하 → ${G.usRate}%`;
      showEventBar(msg, 'bull'); addLog(msg, 'sys'); setMsg(msg);
      applyRateShock(-1);
    } else {
      // 동결 — 분기 정례회의에서 명시적으로 로그
      if (!fedEmergency) {
        const msg = `🇺🇸 연준 기준금리 동결 → ${G.usRate}% (인플레 ${G.inflation.toFixed(1)}%, GDP ${G.gdpGrowth.toFixed(1)}%)`;
        addLog(msg, 'sys');
      }
    }
  }

  // ── BOK 결정 ──
  if (bokMeeting) {
    if (G.bokDecisionTurn >= BOK_QUARTER) G.bokDecisionTurn = 0;

    // BOK도 고금리 지속 압력 반영
    G.highRateTurnsBok = (G.highRateTurnsBok || 0);
    if (G.krRate > 4.0 && G.inflation < 3.5) G.highRateTurnsBok++;
    else G.highRateTurnsBok = Math.max(0, G.highRateTurnsBok - 2);
    const highRateBiasBok = Math.min(0.45, G.highRateTurnsBok * 0.04);

    const gap = G.usRate - G.krRate;
    const krHikeProb = Math.min(0.80, 0.25 + inflationUrgency * 0.10);
    const krPreemptive = G.gdpGrowth > 3.5 && G.inflation > 2.0 && !G.isCrash
                         && Math.random() < 0.22;
    const krHike = ((G.inflation > 2.5 || gap > 1.5) && !G.isCrash
                    && Math.random() < krHikeProb) || krPreemptive;
    const krCut  = ((G.inflation < 3.0 && G.gdpGrowth < 2.5)
                     || (G.krRate > 3.5 && G.inflation < 3.5 && Math.random() < 0.35)
                     || gap < -1.0 || G.isCrash || G.gdpGrowth < 0)
                   && !krHike
                   && Math.random() < (0.45 + crashCutBias + recessionBias + highRateBiasBok);

    if (krHike) {
      G.krRate = Math.min(7.0, Math.round((G.krRate + 0.25) * 100) / 100);
      const tag = bokEmergency && G.bokDecisionTurn !== 0 ? ' [긴급]' : '';
      const msg = `🇰🇷 한국은행 기준금리${tag} +0.25% → ${G.krRate}%`;
      showEventBar(msg, 'bear'); addLog(msg, 'sys'); applyRateShock(0.6);
    } else if (krCut) {
      G.krRate = Math.max(0.0, Math.round((G.krRate - 0.25) * 100) / 100);
      const tag = bokEmergency && G.bokDecisionTurn !== 0 ? ' [긴급]' : '';
      const msg = `🇰🇷 한국은행 기준금리${tag} -0.25% → ${G.krRate}%`;
      showEventBar(msg, 'bull'); addLog(msg, 'sys'); applyRateShock(-0.6);
    } else {
      if (!bokEmergency) {
        const msg = `🇰🇷 한국은행 기준금리 동결 → ${G.krRate}% (인플레 ${G.inflation.toFixed(1)}%, GDP ${G.gdpGrowth.toFixed(1)}%)`;
        addLog(msg, 'sys');
      }
    }
  }

  // 버블/공포 업데이트 (금리 결정과 같은 주기로)
  updateBubbleIndex();
  updateFearIndex();
  checkBubbleBurst();

  // 크래시 해제 (crashRecoveryTurns가 0이 되면)
  if (G.isCrash && G.crashRecoveryTurns === 0) {
    G.isCrash = false;
    G.crashSeverity = 0; // severity 리셋 — 다음 크래시 계산에 오염되지 않도록
    const msg = `📈 [시장 회복] 장기 침체 종료 — 점진적 회복 국면 진입`;
    showEventBar(msg, 'bull');
    addLog(msg, 'sys');
  }
}


// ════════════════════════════════════════════════════
// 12. EPS 성장률에 PER 할인율 채널 반영 (events.js 보조)
//     금리가 높을수록 적정 PER이 낮아짐 → 주가에 지속적 하방압력
//     이 함수는 processPriceTick() 내 genMove()의 drift에서 호출
// ════════════════════════════════════════════════════
function getPERDiscountDrift(st) {
  const fairPER = Math.max(8, Math.min(40, 100 / Math.max(1, G.krRate + G.usRate * 0.3)));

  if (st.eps > 0) {
    const stockPER = st.price / st.eps;
    const perGap   = (stockPER - fairPER) / fairPER;
    return -perGap * 0.08 / (252 * MINS_PER_DAY);
  }

  // EPS ≤ 0 (적자 종목) — trendPrice 기준 양방향 압력
  const daysPassed = st.dailyCandles.length;
  const trendPrice = st.def.initPrice * Math.exp(st.def.annualDrift / 252 * daysPassed);
  const priceRatio = st.price / trendPrice;

  if (priceRatio > 2.0) {
    // 추세 대비 200% 초과 과열 → 강한 하방 압력
    // 적자인데 주가가 추세의 2배면 명백한 거품
    const overHeat = (priceRatio - 2.0);
    return -overHeat * 0.15 / (252 * MINS_PER_DAY);
  }
  if (priceRatio > 1.2) {
    // 추세 대비 120~200% → 약한 하방 압력 (고평가 부담)
    return -(priceRatio - 1.2) * 0.05 / (252 * MINS_PER_DAY);
  }
  if (priceRatio < 0.5) {
    // 추세 대비 50% 이하 → 소폭 상방 드리프트
    return (0.5 - priceRatio) * 0.04 / (252 * MINS_PER_DAY);
  }
  return 0;
}


// ════════════════════════════════════════════════════
// 13. 투자자 흐름 (버블/크래시 반영)
// ════════════════════════════════════════════════════
function calcInvestorFlow(st, logReturn, volume) {
  const regime = G.regime;
  const ret    = logReturn;

  const crashMod = G.isCrash ? 0.3 : 1.0;

  const instBias = G.isCrash ? 0.25
    : regime === 'bull' ? 0.08 : regime === 'bear' ? 0.14 : 0.02;
  const foreBias = G.isCrash ? -0.28
    : regime === 'bull' ? 0.12 : regime === 'bear' ? -0.12 : 0;

  const noise = () => (Math.random() - 0.5) * 1.4;

  const instDir  = -ret * 0.45 + (noise() + instBias) * 0.55;
  const instFlow = instDir * volume * (0.18 + Math.random() * 0.20) * st.price * crashMod;
  const foreDir  = ret * 0.50 + (noise() + foreBias) * 0.50;
  const foreFlow = foreDir * volume * (0.15 + Math.random() * 0.20) * st.price;

  // 개인 투자자 — 독립 포지션 비중 대폭 확대
  // 기존: 기관+외인 반대 * 계수 + 작은 노이즈 → 사실상 항상 순매도
  // 수정: 세 가지 힘의 합산
  //   1) 기관+외인 반대 포지션 (60%만 반영 → 역할 축소)
  //   2) 독립적 방향성: 주가 하락 시 역추세 매수(동학개미), 상승 시 추격 매수 혼재
  //   3) 레짐별 심리: bull에서 개인도 낙관 → 순매수 전환 가능
  const contrarian  = -(instFlow + foreFlow) * 0.60;  // 반대 포지션 60%만
  const retailMomentum = ret * (Math.random() < 0.5 ? 1 : -1)  // 추격 or 역추세 랜덤
    * volume * (0.10 + Math.random() * 0.15) * st.price;
  const regimeBias  = regime === 'bull'  ?  0.04   // bull에서 개인 낙관 매수
                    : regime === 'bear'  ? -0.02   // bear에서 개인 공포 매도 (약하게)
                    : 0;
  const retailBias  = regimeBias * volume * st.price;
  const indivFlow   = contrarian + retailMomentum + retailBias;

  return { inst: instFlow, fore: foreFlow, indiv: indivFlow };
}


// ════════════════════════════════════════════════════
// 14. KOSPI 캔들 관리 (기존 유지)
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
// 15. 인덱스 바 업데이트 (버블 게이지 포함)
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

  const ur = document.getElementById('idxUsRate');
  const kr = document.getElementById('idxKrRate');
  if (ur) ur.textContent = G.usRate.toFixed(2) + '%';
  if (kr) kr.textContent = G.krRate.toFixed(2) + '%';

  // 버블 게이지
  const bubbleEl = document.getElementById('idxBubble');
  if (bubbleEl) {
    const pct = (G.bubbleIndex * 100).toFixed(0);
    const bubCls = G.bubbleIndex > 0.75 ? 'down'
                 : G.bubbleIndex > 0.50 ? 'flat'
                 : 'up';
    bubbleEl.textContent = pct + '%';
    bubbleEl.className   = 'idx-val ' + bubCls;
  }

  // 경제지표 표시
  const gdpEl  = document.getElementById('idxGdp');
  const infEl  = document.getElementById('idxInfl');
  const unempEl = document.getElementById('idxUnemp');
  if (gdpEl)   gdpEl.textContent  = G.gdpGrowth.toFixed(1)  + '%';
  if (infEl)   infEl.textContent  = G.inflation.toFixed(1)   + '%';
  if (unempEl) unempEl.textContent = G.unemployment.toFixed(1) + '%';

  const status = marketStatus();
  const badge = document.getElementById('badge');
  const si    = document.getElementById('sessionInfo');
  if (status === 'open')       { if(badge){badge.textContent='정규장';badge.className='badge badge-open';}   if(si)si.textContent='09:00~15:00'; }
  else if (status === 'after') { if(badge){badge.textContent='애프터';badge.className='badge badge-after';}  if(si)si.textContent='15:00~16:00'; }
  else                         { if(badge){badge.textContent='장 마감';badge.className='badge badge-closed';}if(si)si.textContent=isWeekday(G.date)?'개장전/종료':'주말'; }

  const d = G.date;
  const dayStr = ['일','월','화','수','목','금','토'][d.getDay()];
  document.getElementById('idxDate').textContent =
    `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${dayStr}) ${String(G.hour).padStart(2,'0')}:${String(G.minute).padStart(2,'0')}`;

  document.getElementById('kStatVal').textContent = G.kospi.toFixed(2);
  const kc2 = document.getElementById('kStatChg');
  kc2.textContent = (kospiChg >= 0 ? '+' : '') + kospiChg.toFixed(2) + '%';
  kc2.className = 'ks-val ' + cls;
  const intra = G.kospiIntraday;
  document.getElementById('kStatHigh').textContent = intra ? intra.h.toFixed(2) : '─';
  document.getElementById('kStatLow').textContent  = intra ? intra.l.toFixed(2) : '─';
}


// ════════════════════════════════════════════════════
// 16. 배당 처리 (기존 유지)
// ════════════════════════════════════════════════════
function processDividend() {
  let totalReceived = 0;
  const msgs = [];

  G.listedIds.forEach(id => {
    const st  = G.stocks[id];
    const def = st.def;
    if (!def.dividendPayout || def.dividendPayout <= 0) return;
    if (st.eps <= 0) return;

    const dps = Math.floor(st.eps * def.dividendPayout / 10) * 10;
    if (dps <= 0) return;

    const yld      = (dps / st.price * 100).toFixed(1);
    const gapRatio = dps / st.price;
    G.pendingGaps[id] = (G.pendingGaps[id] || 0) - gapRatio;

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
    showEventBar(`[배당] ${id} 주당 ${fmtN(dps)}원 (${yld}%) — 내일 배당락`, 'bull');
  });

  if (totalReceived > 0) {
    setMsg(`💰 결산 배당 수령: ${fmt(totalReceived)} ${msgs.length > 1 ? `(${msgs.length}개 종목)` : ''}`);
  } else {
    setMsg('📋 결산 배당 — 보유 배당주 없음 (배당락 갭다운 예정)');
  }
}
