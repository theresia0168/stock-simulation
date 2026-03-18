// ── init.js ──  게임 초기화 (모든 모듈 로드 완료 후 실행)
// 반드시 kospi_ui.js 다음에 로드할 것

// ════════════════════════════════════════════════════
// REGIME PARAMETERS (constants.js에 누락된 상수)
// ════════════════════════════════════════════════════
const REGIME_TRANS = {
  bull:    { bull: 0.70, neutral: 0.25, bear: 0.05 },
  neutral: { bull: 0.15, neutral: 0.70, bear: 0.15 },
  bear:    { bull: 0.05, neutral: 0.25, bear: 0.70 },
};
const REGIME_PARAMS = {
  bull:    { drift:  0.0004, volMult: 0.85 },
  neutral: { drift:  0.0001, volMult: 1.00 },
  bear:    { drift: -0.0005, volMult: 1.35 },
};

// ════════════════════════════════════════════════════
// UI 전역 상태 변수 (constants.js에 누락된 변수)
// ════════════════════════════════════════════════════
let G_orderType = 'market';
let currentPage = 'stock';

// ════════════════════════════════════════════════════
// INIT — 모든 모듈 로드 후 1회 실행
// ════════════════════════════════════════════════════
document.getElementById('qtyInput').addEventListener('input', updateTradeInfo);

window.addEventListener('resize', () => {
  drawChart();
  if (currentPage === 'kospi') { drawKospiChart(); renderKospiFlowTable(); }
});

// G에 새 필드 추가 후 초기화
G.kospiCandles = [];
G.kospiIntraday = null;
G.kospiFlowHistory = [];
G.marketFlowInst = 0;
G.marketFlowFore = 0;
G.marketFlowIndiv = 0;
G.listedIds.forEach(id => {
  const st = G.stocks[id];
  st.flowInst = 0; st.flowFore = 0; st.flowIndiv = 0;
  st.netInst  = 0; st.netFore  = 0; st.netIndiv  = 0;
});

syncHourMinute();
renderFull();
setMsg('▶ 하루 시작을 눌러 실시간으로 시작하세요. » 빠른 진행도 가능합니다.');
