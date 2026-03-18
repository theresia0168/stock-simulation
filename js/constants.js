// ── constants.js ──  상수, 종목정의, 시장이벤트, 레짐파라미터, 헬퍼함수
// 의존: constants.js → state(G) 전역


// ════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════
const INIT_CASH = 1000000;
const OPEN_H = 9, CLOSE_H = 15, AFTER_H = 16;
const OPEN_MIN  = OPEN_H  * 60;
const CLOSE_MIN = CLOSE_H * 60;
const AFTER_MIN = AFTER_H * 60;
const DAY_TICKS = AFTER_MIN - OPEN_MIN;
const MINS_PER_DAY = 420;
const REST_SECS = 60;
const KOSPI_ANNUAL_DRIFT = 0.08;
const KOSPI_DAILY_VOL    = 0.015;
const KOSPI_MIN_VOL      = KOSPI_DAILY_VOL / Math.sqrt(MINS_PER_DAY);
const FEE_RATE = 0.00015;
const TAX_RATE = 0.0018;
const DAYS_KR = ['일','월','화','수','목','금','토'];
const KOSPI_BASE = 2500;

// ════════════════════════════════════════════════════
// STOCK POOL (기존 유지)
// ════════════════════════════════════════════════════
const ALL_STOCKS_DEF = [
  {
    id:'NARO', name:'나로테크', sector:'반도체 · 대형주', initPrice:85000,
    totalShares:600000000, initEps:3400, parValue:500,
    epsGrowthRate:0.12, epsCycleSens:1.2, epsRateSens:-0.3,
    dividendPayout:0.15,
    annualDrift:0.10, volBase:0.015, meanRevSpeed:0.006,
    garchOmega:2.14e-8, garchAlpha:0.08, garchBeta:0.88,
    dailyLimit:0.262, baseVol:180000, volSens:2.5, marketBeta:1.3, rateSens:-0.3,
    traits:['대형우량주','외국인선호','배당성장'],
    events:[
      {text:'HBM 수요 급증, 분기 사상 최대 실적 전망', impact:0.035, type:'bull'},
      {text:'미국 수출 규제 우려 재부각', impact:-0.028, type:'bear'},
      {text:'반도체 업황 둔화 — 목표주가 하향', impact:-0.020, type:'bear'},
      {text:'AI 가속기 수주 계약 체결', impact:0.030, type:'bull'},
      {text:'파운드리 고객사 다변화 성공', impact:0.018, type:'bull'},
    ]
  },
  {
    id:'BIOX', name:'바이오엑스', sector:'바이오 · 중형주', initPrice:32000,
    totalShares:50000000, initEps:400, parValue:500,
    epsGrowthRate:0.08, epsCycleSens:0.3, epsRateSens:-0.2,
    dividendPayout:0.0,
    annualDrift:0.08, volBase:0.035, meanRevSpeed:0.003,
    garchOmega:1.17e-7, garchAlpha:0.14, garchBeta:0.82,
    dailyLimit:0.262, baseVol:90000, volSens:4.0, marketBeta:0.65, rateSens:-0.6,
    traits:['고변동성','임상결과민감','성장주'],
    events:[
      {text:'항암제 임상 2상 성공적 완료', impact:0.15, type:'bull'},
      {text:'FDA 임상 3상 중단 권고', impact:-0.18, type:'bear'},
      {text:'글로벌 제약사 인수 검토설', impact:0.10, type:'bull'},
      {text:'경쟁사 동일 파이프라인 진입', impact:-0.08, type:'bear'},
      {text:'기술이전 계약 체결 (500억)', impact:0.07, type:'bull'},
      {text:'임상 중간 데이터 기대 이하', impact:-0.06, type:'bear'},
    ]
  },
  {
    id:'HNCR', name:'한창리테일', sector:'소비재 · 중형주', initPrice:14500,
    totalShares:80000000, initEps:806, parValue:1000,
    epsGrowthRate:0.04, epsCycleSens:0.3, epsRateSens:-0.1,
    dividendPayout:0.50,
    annualDrift:0.04, volBase:0.010, meanRevSpeed:0.003,
    garchOmega:9.52e-9, garchAlpha:0.06, garchBeta:0.90,
    dailyLimit:0.262, baseVol:55000, volSens:1.6, marketBeta:0.75, rateSens:-0.2,
    traits:['저변동성','경기방어주','배당주'],
    events:[
      {text:'동남아 신규 출점 계획 발표', impact:0.025, type:'bull'},
      {text:'소비심리 위축, 리테일 업황 악화', impact:-0.020, type:'bear'},
      {text:'배당 증액 결정', impact:0.018, type:'bull'},
      {text:'최저임금 인상 수익성 우려', impact:-0.015, type:'bear'},
      {text:'온라인 부문 흑자 전환 성공', impact:0.020, type:'bull'},
    ]
  },
  {
    id:'EVGO', name:'이브고', sector:'전기차 · 소형주', initPrice:9800,
    totalShares:100000000, initEps:49, parValue:100,
    epsGrowthRate:0.35, epsCycleSens:1.8, epsRateSens:-0.8,
    dividendPayout:0.0,
    annualDrift:0.15, volBase:0.045, meanRevSpeed:0.004,
    garchOmega:2.41e-7, garchAlpha:0.16, garchBeta:0.79,
    dailyLimit:0.262, baseVol:320000, volSens:5.0, marketBeta:1.6, rateSens:-0.9,
    traits:['테마주','고성장기대','고위험고수익'],
    events:[
      {text:'완성차 배터리 공급 MOU 체결', impact:0.12, type:'bull'},
      {text:'전기차 보조금 축소 정책 발표', impact:-0.10, type:'bear'},
      {text:'차세대 전고체 배터리 시제품 공개', impact:0.08, type:'bull'},
      {text:'화재 사고 발생 — 안전성 논란', impact:-0.13, type:'bear'},
      {text:'글로벌 EV 수요 급증 전망 보고서', impact:0.06, type:'bull'},
    ]
  },
  {
    id:'SNBK', name:'선은행', sector:'금융 · 대형주', initPrice:52000,
    totalShares:400000000, initEps:6500, parValue:5000,
    epsGrowthRate:0.05, epsCycleSens:0.6, epsRateSens:0.4,
    dividendPayout:0.60,
    annualDrift:0.06, volBase:0.009, meanRevSpeed:0.004,
    garchOmega:5.79e-9, garchAlpha:0.05, garchBeta:0.92,
    dailyLimit:0.262, baseVol:120000, volSens:1.4, marketBeta:0.85, rateSens:0.5,
    traits:['안정우량주','고배당','금리연동'],
    events:[
      {text:'부동산 부실채권 우려 — 은행권 하락', impact:-0.018, type:'bear'},
      {text:'배당성향 50% 상향 공시', impact:0.025, type:'bull'},
      {text:'부실채권 비율 최저치 경신', impact:0.015, type:'bull'},
      {text:'가계대출 연체율 상승 우려', impact:-0.020, type:'bear'},
      {text:'해외법인 실적 호조', impact:0.014, type:'bull'},
    ]
  },
  {
    id:'QTUM', name:'퀀텀시스템즈', sector:'양자컴퓨팅 · 소형주', initPrice:15000,
    totalShares:30000000, initEps:-200, parValue:100,
    epsGrowthRate:0.50, epsCycleSens:2.0, epsRateSens:-1.0,
    dividendPayout:0.0,
    annualDrift:0.20, volBase:0.055, meanRevSpeed:0.002,
    garchOmega:3.60e-7, garchAlpha:0.18, garchBeta:0.77,
    dailyLimit:0.262, baseVol:250000, volSens:6.0, marketBeta:1.8, rateSens:-1.0,
    traits:['미래기술주','초고변동','공모주'],
    events:[
      {text:'양자 오류 수정 기술 세계 최초 상용화', impact:0.20, type:'bull'},
      {text:'양자컴퓨팅 상용화 지연 공식 발표', impact:-0.15, type:'bear'},
      {text:'글로벌 IT 기업과 공동 연구 계약', impact:0.10, type:'bull'},
      {text:'핵심 연구인력 집단 이탈', impact:-0.12, type:'bear'},
    ]
  },
  {
    id:'GRNU', name:'그린유', sector:'신재생에너지 · 중형주', initPrice:22000,
    totalShares:60000000, initEps:880, parValue:500,
    epsGrowthRate:0.12, epsCycleSens:0.7, epsRateSens:-0.4,
    dividendPayout:0.10,
    annualDrift:0.12, volBase:0.022, meanRevSpeed:0.005,
    garchOmega:4.61e-8, garchAlpha:0.10, garchBeta:0.86,
    dailyLimit:0.262, baseVol:140000, volSens:3.2, marketBeta:1.1, rateSens:-0.5,
    traits:['ESG테마','정책수혜주','성장가치'],
    events:[
      {text:'정부 재생에너지 확대 정책 발표', impact:0.08, type:'bull'},
      {text:'해상풍력 입찰 탈락', impact:-0.06, type:'bear'},
      {text:'유럽 탄소중립 펀드 대규모 편입', impact:0.07, type:'bull'},
      {text:'원자재 가격 급등으로 수익성 악화', impact:-0.05, type:'bear'},
    ]
  },
  {
    id:'MEDI', name:'메디케어', sector:'헬스케어 · 대형주', initPrice:68000,
    totalShares:150000000, initEps:4250, parValue:1000,
    epsGrowthRate:0.07, epsCycleSens:0.25, epsRateSens:-0.1,
    dividendPayout:0.45,
    annualDrift:0.07, volBase:0.012, meanRevSpeed:0.004,
    garchOmega:1.37e-8, garchAlpha:0.07, garchBeta:0.89,
    dailyLimit:0.262, baseVol:95000, volSens:2.0, marketBeta:0.70, rateSens:-0.15,
    traits:['고령화수혜','안정성장','고배당'],
    events:[
      {text:'고령화 수혜로 매출 사상 최대', impact:0.03, type:'bull'},
      {text:'주력 의약품 특허 만료 임박', impact:-0.04, type:'bear'},
      {text:'신약 허가 취득 성공', impact:0.05, type:'bull'},
      {text:'약가 인하 정책으로 수익성 압박', impact:-0.03, type:'bear'},
    ]
  },
];

const MARKET_EVENTS = [
  {text:'미중 무역분쟁 재점화 — 수출주 일제 하락', mult:-0.022, type:'bear'},
  {text:'GDP 성장률 예상 상회 — 경기 회복 기대감', mult:0.015, type:'bull'},
  {text:'글로벌 신용 리스크 — 안전자산 선호 급증', mult:-0.02, type:'bear'},
  {text:'외국인 역대급 순매수 — 증시 전반 강세', mult:0.018, type:'bull'},
  {text:'국제유가 급등 — 원가 부담 확산', mult:-0.012, type:'bear'},
  {text:'AI·반도체 수요 폭증 — 기술주 대거 상승', mult:0.03, type:'bull'},
  {text:'중국 경기 둔화 우려 — 수출 감소 전망', mult:-0.016, type:'bear'},
  {text:'글로벌 공급망 안정화 — 제조업 수혜', mult:0.013, type:'bull'},
  {text:'원/달러 환율 급등 — 수입 물가 상승', mult:-0.010, type:'bear'},
  {text:'국내 기업 실적 시즌 호조 — 증시 상승', mult:0.020, type:'bull'},
];

const GENERIC_NEWS = [
  '외국인 순매수 전환','기관 차익실현 매물 출회','거래량 급감 관망세',
  '증권사 리포트 집중 발간','옵션만기일 변동성 확대','프로그램 매수 유입',
  '공매도 잔고 증가','연기금 저가 매수 진입',
];

// ════════════════════════════════════════════════════
// GLOBAL STATE — 버블/사이클 필드 추가
// ════════════════════════════════════════════════════
let G = {
  // 기본
  date: new Date(2025, 0, 6),
  hour: 9, minute: 0, totalMin: OPEN_MIN,
  turn: 0,
  realtimeTimer: null, isRunning: false, isResting: false, restTimer: null,
  activeId: 'NARO',
  cash: INIT_CASH, totalFee: 0, totalDividend: 0, dividendPaidThisYear: false,
  logs: [],

  // 레짐
  regime: 'neutral',
  activeMarketEvent: null,

  // KOSPI
  kospi: KOSPI_BASE, kospiOpen: KOSPI_BASE, kospiLogReturn: 0,
  kospiCandles: [], kospiIntraday: null, kospiFlowHistory: [],
  marketFlowInst: 0, marketFlowFore: 0, marketFlowIndiv: 0,

  // 종목
  listedIds: ['NARO','BIOX','HNCR','EVGO','SNBK'],
  stocks: {},

  // 이벤트/쿨다운
  specialCooldown: 0,
  corpActionCooldown: {},
  marketCB: null,
  pendingGaps: {},
  pendingOrderList: [],
  earningsTurn: 0, earningsIdx: 0,

  // 금리/경제
  usRate: 4.50, krRate: 3.25,
  inflation: 2.8, gdpGrowth: 2.2, unemployment: 3.5,
  rateDecisionTurn: 0,

  // ── 신규: 경기사이클 ──
  totalTicksElapsed: 0,           // 전체 틱 카운터
  cyclePhaseOffset: Math.random() * Math.PI * 2, // 사이클 시작 위상 (랜덤)

  // ── 신규: 버블/공포 ──
  bubbleIndex: 0,                 // 0~1, 버블 과열도
  fearIndex: 0,                   // 0~1, 저평가/공포 에너지
  isCrash: false,                 // 붕괴 진행 중 여부
  crashSeverity: 0,               // 붕괴 심각도 (0~1)
  crashRecoveryTurns: 0,          // 회복 잠금 턴 수
  consecutiveBullTurns: 0,        // 연속 bull 레짐 카운터
};

// 종목 초기 상태 생성
ALL_STOCKS_DEF.forEach(def => {
  G.stocks[def.id] = {
    def,
    price: def.initPrice, dayOpen: def.initPrice,
    dayHigh: def.initPrice, dayLow: def.initPrice,
    dayVol: 0, prevClose: def.initPrice,
    shares: 0, avgBuy: 0,
    dailyCandles: [], intraday: null,
    evCooldown: 0, listed: false, delisted: false,
    garchVol: def.volBase / Math.sqrt(MINS_PER_DAY),
    prevTickPrice: def.initPrice,
    priceF: def.initPrice, dayOpenF: def.initPrice,
    parValue: def.parValue, totalShares: def.totalShares, eps: def.initEps,
    vi: null, isUpperLimit: false, isLowerLimit: false,
    flowInst: 0, flowFore: 0, flowIndiv: 0,
    netInst: 0, netFore: 0, netIndiv: 0,
  };
});
G.listedIds.forEach(id => { G.stocks[id].listed = true; });

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════
const isWeekday  = d  => d.getDay() >= 1 && d.getDay() <= 5;
const fmt        = n  => '₩' + Math.round(n).toLocaleString('ko-KR');
const fmtN       = n  => Math.round(n).toLocaleString('ko-KR');
const dStr       = d  => `${d.getMonth()+1}/${d.getDate()}`;
const activeStock  = () => G.stocks[G.activeId];
const activeDef    = () => activeStock().def;
const listedStocks = () => G.listedIds.map(id => G.stocks[id]).filter(st => st.listed && !st.delisted);
