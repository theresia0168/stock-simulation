// ── init.js ──  게임 초기화 (모든 모듈 로드 완료 후 실행)
// 반드시 kospi_ui.js 다음에 로드할 것

// ════════════════════════════════════════════════════
// REGIME PARAMETERS
// ════════════════════════════════════════════════════
const REGIME_TRANS = {
  // 5거래일마다 1번 전환 시도 기준
  // bull 유지: 87% → 평균 지속 ≈ 7.7회 × 5일 = 약 1.5개월 (기존 2.5개월에서 단축)
  // bear 유지: 88% → 평균 지속 ≈ 8.3회 × 5일 = 약 1.7개월
  // neutral: 50% 유지, bull↔bear 전환 허브
  bull:    { bull: 0.87, neutral: 0.10, bear: 0.03 },
  neutral: { bull: 0.25, neutral: 0.50, bear: 0.25 },
  bear:    { bull: 0.00, neutral: 0.12, bear: 0.88 }, // bear→bull 직행 차단 유지
};
// drift 단위: /분, 연환산 = drift × 420 × 252
// bull:    +0.0005 × 420 × 252 = 연 +52.9%
// neutral: +0.0002 × 420 × 252 = 연 +21.2%
// bear:    -0.0004 × 420 × 252 = 연 -42.3% (기존 -31.8% → 강화)
const REGIME_PARAMS = {
  bull:    { drift:  0.0005, volMult: 0.82 },
  neutral: { drift:  0.0002, volMult: 1.00 },
  bear:    { drift: -0.0004, volMult: 1.40 }, // drift 강화 + 변동성 증가
};

// UI 전역 상태
let G_orderType = 'market';
let currentPage = 'stock';

// ════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════
document.getElementById('qtyInput').addEventListener('input', updateTradeInfo);

window.addEventListener('resize', () => {
  drawChart();
  if (currentPage === 'kospi') { drawKospiChart(); renderKospiFlowTable(); }
});

// constants.js에서 G 초기화 후 추가 필드 보장
G.kospiCandles      = G.kospiCandles      || [];
G.kospiIntraday     = G.kospiIntraday     || null;
G.kospiFlowHistory  = G.kospiFlowHistory  || [];
G.marketFlowInst    = G.marketFlowInst    || 0;
G.marketFlowFore    = G.marketFlowFore    || 0;
G.marketFlowIndiv   = G.marketFlowIndiv   || 0;

// 버블/사이클 필드 (constants.js에 이미 포함, 방어적 초기화)
G.totalTicksElapsed    = G.totalTicksElapsed    || 0;
G.cyclePhaseOffset     = G.cyclePhaseOffset     || (Math.random() * Math.PI * 2);
G.bubbleIndex          = G.bubbleIndex          || 0;
G.fearIndex            = G.fearIndex            || 0;
G.isCrash              = G.isCrash              || false;
G.crashSeverity        = G.crashSeverity        || 0;
G.crashRecoveryTurns   = G.crashRecoveryTurns   || 0;
G.consecutiveBullTurns = G.consecutiveBullTurns || 0;
G.regimeTransitionCooldown = G.regimeTransitionCooldown || 0;
G.fedDecisionTurn = G.fedDecisionTurn || 0;
G.bokDecisionTurn = G.bokDecisionTurn || 0;
G.highRateTurns    = G.highRateTurns    || 0;
G.highRateTurnsBok = G.highRateTurnsBok || 0;
G.marketEventCooldown  = G.marketEventCooldown  || 0;
G.recentMarketEvents   = G.recentMarketEvents   || [];

// 종목별 흐름 초기화
G.listedIds.forEach(id => {
  const st = G.stocks[id];
  st.flowInst = st.flowInst || 0;
  st.flowFore = st.flowFore || 0;
  st.flowIndiv = st.flowIndiv || 0;
  st.netInst   = st.netInst  || 0;
  st.netFore   = st.netFore  || 0;
  st.netIndiv  = st.netIndiv || 0;
});

syncHourMinute();
renderFull();
setMsg('▶ 하루 시작을 눌러 실시간으로 시작하세요. » 빠른 진행도 가능합니다.');
