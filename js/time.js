// ── time.js ──  시간흐름, 틱루프, 일간리셋, 장운영
// 의존: constants.js → state(G) 전역


function syncHourMinute() {
  G.hour   = Math.floor(G.totalMin / 60);
  G.minute = G.totalMin % 60;
}



function nextDayReset() {
  do { G.date = new Date(G.date.getTime() + 86400000); } while (!isWeekday(G.date));
  G.totalMin = OPEN_MIN;
  syncHourMinute();
  if (G.marketCB) G.marketCB = null;
  G.listedIds.forEach(id => {
    const st = G.stocks[id];
    st.dayHigh = st.price; st.dayLow = st.price;
    st.dayVol = 0; st.intraday = null;
    st.vi = null; st.isUpperLimit = false; st.isLowerLimit = false;
    st.ob = null;  // 호가창 재초기화
    if (st.evCooldown > 0) st.evCooldown--;
  });
  applyPendingGaps();
  G.listedIds.forEach(id => {
    const st = G.stocks[id];
    st.dayOpen  = st.price;
    st.dayOpenF = st.priceF || st.price;
  });
  G.kospiOpen = G.kospi;
}



function closeDay() {
  G.listedIds.forEach(id => {
    const st = G.stocks[id];
    if (st.intraday) {
      st.dailyCandles.push({ ...st.intraday, dateStr: dStr(G.date) });
      st.prevClose = st.price;
      st.intraday  = null;
    }
    if (st.evCooldown > 0) st.evCooldown--;
    st.isUpperLimit = false; st.isLowerLimit = false;
    st.flowInst = 0; st.flowFore = 0; st.flowIndiv = 0;
  });
  G.activeMarketEvent = null;
  closeKospiCandle(dStr(G.date));
  G.kospiOpen = G.kospi;

  // ── 배당락 & 배당 지급 ──
  // 한국 결산 배당: 12월 31일 기준 → 배당락일 = 12월 28일 (마지막 영업일 전날)
  // 시뮬에서는 12월 마지막 거래일 장 마감 시 처리
  const m = G.date.getMonth(); // 0=1월, 11=12월
  const d = G.date.getDate();
  const isDecLast = m === 11 && d >= 26;  // 12월 26일 이후 첫 영업일 마감
  if (isDecLast && !G.dividendPaidThisYear) {
    G.dividendPaidThisYear = true;
    processDividend();
  }
  // 1월이 되면 플래그 초기화
  if (m === 0) G.dividendPaidThisYear = false;
}



function advanceTime() {
  const prevMin = G.totalMin;
  G.totalMin++;
  syncHourMinute();
  if (prevMin < CLOSE_MIN && G.totalMin === CLOSE_MIN) closeDay();
  if (G.totalMin > AFTER_MIN) nextDayReset();
}



function nextTick() {
  if (G.totalMin >= AFTER_MIN) {
    stopRealtime();
    renderFull();
    startRest();
    return;
  }
  advanceTime();
  const ticksSinceOpen = G.totalMin - OPEN_MIN;
  if (ticksSinceOpen > 0 && (ticksSinceOpen - 1) % 60 === 0) processHourlyTurn();
  processPriceTick();
  renderFull();
}



function startRest() {
  G.isResting = true;
  let remaining = REST_SECS;
  const btn = document.getElementById('btnDay');
  const tick = () => {
    remaining--;
    const clk = document.getElementById('tickClock');
    if (clk) clk.textContent = '휴식 ' + remaining + 's';
    if (btn) btn.textContent = '휴식 ' + remaining + 's';
    setMsg('🌙 장 마감. ' + remaining + '초 후 다음 거래일로 넘어갑니다.');
    if (remaining <= 0) {
      clearInterval(G.restTimer);
      G.restTimer = null;
      G.isResting = false;
      nextDayReset();
      renderFull();
      if (btn) { btn.textContent = '▶ 하루 시작'; btn.classList.remove('running'); }
      setMsg('📅 새 거래일 준비 완료. ▶ 하루 시작을 눌러 시작하세요.');
    }
  };
  tick();
  G.restTimer = setInterval(tick, 1000);
}



function startRealtime() {
  if (G.isRunning || G.isResting) return;
  if (G.totalMin >= AFTER_MIN) { nextDayReset(); renderFull(); }
  G.isRunning = true;
  const btn = document.getElementById('btnDay');
  if (btn) { btn.textContent = '⏸ 일시정지'; btn.classList.add('running'); }
  G.realtimeTimer = setInterval(nextTick, 1000);
}



function stopRealtime() {
  G.isRunning = false;
  clearInterval(G.realtimeTimer);
  G.realtimeTimer = null;
}



function toggleRealtime() {
  if (G.isResting) return;
  if (G.isRunning) {
    stopRealtime();
    const btn = document.getElementById('btnDay');
    if (btn) { btn.textContent = '▶ 재개'; btn.classList.remove('running'); }
  } else {
    startRealtime();
  }
}



function skipDay() {
  if (G.isResting) return;
  stopRealtime();
  while (G.totalMin < AFTER_MIN) {
    const prevMin = G.totalMin;
    G.totalMin++;
    syncHourMinute();
    if (prevMin < CLOSE_MIN && G.totalMin === CLOSE_MIN) closeDay();
    const ticksSinceOpen = G.totalMin - OPEN_MIN;
    if (ticksSinceOpen > 0 && (ticksSinceOpen - 1) % 60 === 0) processHourlyTurn();
    processPriceTick();
  }
  nextDayReset();
  renderFull();
  const btn = document.getElementById('btnDay');
  if (btn) { btn.textContent = '▶ 하루 시작'; btn.classList.remove('running'); }
  setMsg('📅 하루 건너뜀. ▶ 하루 시작을 눌러 다음 거래일을 시작하세요.');
}

