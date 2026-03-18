// ── events.js ──  기업공시, 실적발표, 기업행동, IPO/상폐, 서킷브레이커
// 의존: constants.js → state(G) 전역

// ════════════════════════════════════════════════════
// 누락 함수 복구
// ════════════════════════════════════════════════════

function applyPendingGaps() {
  Object.entries(G.pendingGaps).forEach(([id, logGap]) => {
    const st = G.stocks[id];
    if (!st || st.delisted) return;
    const newPriceF = (st.priceF || st.price) * Math.exp(logGap);
    st.priceF = Math.max(1, newPriceF);
    st.price  = displayPrice(st.priceF);
  });
  G.pendingGaps = {};
}



function checkCBRelease() {
  if (!G.marketCB) return;
  if (G.turn >= G.marketCB.resumeTurn) { G.marketCB = null; setMsg('✅ 서킷브레이커 해제'); }
}



function tryCorporateActions() {
  if (marketStatus() !== 'open') return;
  G.listedIds.forEach(id => {
    const st = G.stocks[id];
    if (st.delisted || !st.listed) return;

    // 쿨다운: 180턴(26일) → 1500턴(214일, 약 7개월)
    // 실제 기업행동은 연 1회도 드문 편
    const lastAction = G.corpActionCooldown[id] || 0;
    if (G.turn - lastAction < 1500) return;

    const per = st.eps > 0 ? st.price / st.eps : null;
    const priceRatio = st.price / st.def.initPrice;

    // 액면분할: 주가가 초기가의 5배 이상 (드물게)
    if (priceRatio >= 5 && st.parValue >= 100 && Math.random() < 0.3) {
      const ratio = priceRatio >= 10 ? 10 : 5;
      if (st.shares > 0) { st.shares *= ratio; if (st.avgBuy > 0) st.avgBuy /= ratio; }
      st.parValue = Math.round(st.parValue / ratio);
      st.totalShares *= ratio;
      st.priceF = (st.priceF || st.price) / ratio;
      st.price   = displayPrice(st.priceF);
      st.dayOpen = st.price; st.dayOpenF = st.priceF;
      st.dayHigh = st.price; st.dayLow = st.price;
      st.ob = null;
      G.corpActionCooldown[id] = G.turn;
      const msg = `✂️ [액면분할] ${id} ${ratio}:1 → ${fmt(st.price)}`;
      showEventBar(msg, 'special'); addLog(msg, 'sys');
      return;
    }

    // 액면병합: 주가가 액면가 50% 미만
    if (st.price < st.parValue * 0.5 && st.parValue <= 5000 && Math.random() < 0.3) {
      const ratio = 10;
      if (st.shares > 0) { st.shares = Math.max(1, Math.round(st.shares / ratio)); if (st.avgBuy > 0) st.avgBuy *= ratio; }
      st.parValue *= ratio;
      st.totalShares = Math.max(1000000, Math.round(st.totalShares / ratio));
      st.eps *= ratio;
      st.priceF = (st.priceF || st.price) * ratio;
      st.price   = displayPrice(st.priceF);
      st.dayOpen = st.price; st.dayOpenF = st.priceF;
      st.dayHigh = st.price; st.dayLow = st.price;
      st.ob = null;
      G.corpActionCooldown[id] = G.turn;
      const msg = `🔄 [액면병합] ${id} 1:${ratio} → ${fmt(st.price)}`;
      showEventBar(msg, 'bear'); addLog(msg, 'sys');
      return;
    }

    // 유상증자: PER>60 + 성장 필요 + 낮은 확률
    // 0.15 → 0.03 (연 1회 미만)
    if (per !== null && per > 60 && G.krRate < 4.5 && Math.random() < 0.03) {
      const ratio = 0.05 + Math.random() * 0.05;
      const old = st.totalShares;
      st.totalShares = Math.round(old * (1 + ratio));
      st.eps = Math.round(st.eps * (old / st.totalShares));
      st.priceF = (st.priceF || st.price) * (1 - ratio * 0.5);
      st.price  = displayPrice(st.priceF);
      G.corpActionCooldown[id] = G.turn;
      const msg = `📢 [유상증자] ${id} +${(ratio * 100).toFixed(1)}%`;
      showEventBar(msg, 'bear'); addLog(msg, 'sys');
      return;
    }

    // 자사주소각: PER<8 + 현금 여유 + 낮은 확률
    if (per !== null && per > 0 && per < 8 && Math.random() < 0.03) {
      const ratio = 0.01 + Math.random() * 0.02;
      const old = st.totalShares;
      st.totalShares = Math.max(1000000, Math.round(old * (1 - ratio)));
      st.eps = Math.round(st.eps * (old / st.totalShares));
      st.priceF = (st.priceF || st.price) * (1 + ratio * 0.8);
      st.price  = displayPrice(st.priceF);
      G.corpActionCooldown[id] = G.turn;
      const msg = `🔥 [자사주소각] ${id} -${(ratio * 100).toFixed(1)}%`;
      showEventBar(msg, 'bull'); addLog(msg, 'sys');
    }
  });
}



function trySpecialEvent() {
  if (G.specialCooldown > 0) { G.specialCooldown--; return null; }
  if (Math.random() > 0.008) return null;

  const unlistedCandidates = ALL_STOCKS_DEF.filter(d =>
    !G.listedIds.includes(d.id) && !G.stocks[d.id].delisted && !G.stocks[d.id].listed
  );

  if (unlistedCandidates.length > 0 && Math.random() < 0.6) {
    const def = unlistedCandidates[Math.floor(Math.random()*unlistedCandidates.length)];
    const st  = G.stocks[def.id];
    const ipoPrice = Math.round(def.initPrice * (0.9 + Math.random()*0.2) / getTickSize(def.initPrice)) * getTickSize(def.initPrice);
    st.price   = ipoPrice; st.priceF = ipoPrice; st.dayOpenF = ipoPrice;
    st.dayOpen = ipoPrice; st.dayHigh = ipoPrice; st.dayLow = ipoPrice;
    st.dayVol  = 0; st.dailyCandles = []; st.intraday = null;
    st.listed  = true; st.delisted = false;
    st.garchVol = def.volBase / Math.sqrt(MINS_PER_DAY);
    st.totalShares = def.totalShares; st.eps = def.initEps;
    st.ob = null;
    G.listedIds.push(def.id);
    G.specialCooldown = 30;
    const msg = `📣 [신규상장] ${def.id} ${def.name} 코스피 상장! 공모가 ${fmt(ipoPrice)}`;
    showEventBar(`[IPO] ${def.name} 상장`, 'special');
    addLog(msg, 'sys'); return msg;
  }

  if (G.listedIds.length > 2 && Math.random() < 0.3) {
    const candidates = G.listedIds.filter(id => {
      const st = G.stocks[id];
      return st.price < st.def.initPrice * 0.3 && st.eps < 0;
    });
    if (candidates.length > 0) {
      const id = candidates[Math.floor(Math.random()*candidates.length)];
      const st = G.stocks[id]; const def = st.def;
      let forceMsg = '';
      if (st.shares > 0) {
        G.cash += st.shares * st.price;
        addLog(`[상폐청산] ${id} ${st.shares}주 @${fmt(st.price)} 강제매도`, 'sell');
        forceMsg = ` (${st.shares}주 청산)`;
        st.shares = 0; st.avgBuy = 0;
      }
      st.listed = false; st.delisted = true;
      G.listedIds = G.listedIds.filter(i => i !== id);
      if (G.activeId === id) G.activeId = G.listedIds[0] || '';
      G.specialCooldown = 40;
      const msg = `⚠️ [상장폐지] ${id} ${def.name}${forceMsg}`;
      showEventBar(`[상폐] ${def.name}`, 'delist');
      addLog(msg, 'sys'); return msg;
    }
  }
  return null;
}



function tryEarningsEvent() {
  G.earningsTurn++;
  // 실적 발표 주기: 250턴 = 약 35일 (heuristic 분기)
  // 60턴(9일)은 실제 분기(63영업일)보다 7배 빠름 → EPS 과도하게 변동
  if (G.earningsTurn < 250) return null;
  G.earningsTurn = 0;

  const listed = G.listedIds.filter(id => !G.stocks[id].delisted);
  if (listed.length === 0) return null;
  G.earningsIdx = G.earningsIdx % listed.length;
  const id = listed[G.earningsIdx++];
  const st = G.stocks[id]; const def = st.def;

  // 분기 EPS 성장률 계산
  const quarterlyBase = def.epsGrowthRate / 4;
  // 레짐 효과 절반으로 축소: bull +2% / bear -3% (기존 +4%/-6%)
  // bear 레짐에서도 성장주는 EPS가 완전히 녹지 않도록
  const regimeEffect  = (G.regime==='bull' ? 0.02 : G.regime==='bear' ? -0.03 : 0) * def.epsCycleSens;
  const rateEffect    = -(G.krRate - 3.0) * 0.01 * def.epsRateSens;
  // 서프라이즈: 종목 변동성에 비례, 부호 랜덤
  const surprise      = randn() * def.volBase * 1.5;
  const totalGrowth   = quarterlyBase + regimeEffect + rateEffect + surprise;

  const oldEps = st.eps;
  if (oldEps >= 0) {
    st.eps = Math.round(oldEps * (1 + totalGrowth));
    // EPS가 0 아래로 빠지면 최대 -50%로 제한 (현실적)
    if (st.eps < 0) st.eps = Math.round(oldEps * -0.5);
  } else {
    // 적자 기업: 성장이면 적자 축소, 쇼크면 적자 확대
    st.eps = Math.round(oldEps * (1 - totalGrowth));
    // 흑자 전환 가능 (성장 지속 시)
    if (totalGrowth > 0.5 && Math.random() < 0.3) st.eps = Math.round(Math.abs(oldEps) * 0.2);
  }

  const isPos   = st.eps > oldEps;
  const delta   = st.eps - oldEps;
  const label   = isPos ? (Math.abs(delta) > Math.abs(oldEps * quarterlyBase) * 2 ? '어닝 서프라이즈' : '예상 소폭 상회')
                        : (Math.abs(delta) > Math.abs(oldEps * quarterlyBase) * 2 ? '어닝 쇼크'       : '예상 소폭 하회');
  const impact  = Math.max(-0.15, Math.min(0.15, totalGrowth * 0.35));
  const logGap  = Math.log(1 + impact);
  const per     = st.eps > 0 ? (st.price / st.eps).toFixed(1) : 'N/A';
  const sign    = delta >= 0 ? '+' : '';

  if (G.totalMin >= CLOSE_MIN) {
    G.pendingGaps[id] = (G.pendingGaps[id] || 0) + logGap;
    const msg = `📊 [실적장외] ${id} ${label} | EPS ${sign}${fmtN(delta)}원 → 내일 갭`;
    showEventBar(`[실적] ${id} ${label}`, isPos ? 'bull' : 'bear');
    addLog(msg, 'sys'); return msg;
  } else {
    st.priceF = Math.max(1, (st.priceF || st.price) * Math.exp(logGap));
    const newDisp = displayPrice(st.priceF);
    updateGarch(st, logGap);
    st.price = newDisp;
    st.dayHigh = Math.max(st.dayHigh, newDisp);
    st.dayLow  = Math.min(st.dayLow,  newDisp);
    if (st.intraday) { st.intraday.h = Math.max(st.intraday.h, newDisp); st.intraday.l = Math.min(st.intraday.l, newDisp); st.intraday.c = newDisp; }
    const msg = `📊 [실적발표] ${id} ${label} | EPS ${fmtN(st.eps)}원 PER ${per}`;
    showEventBar(`[실적] ${id} ${label}`, isPos ? 'bull' : 'bear');
    addLog(msg, 'sys'); return msg;
  }
}



function processHourlyTurn() {
  const status = marketStatus();
  G.turn++;
  checkCBRelease();
  const cbActive = G.marketCB !== null;
  transitionRegime();
  let topMsg = '';

  if (status === 'open' || status === 'after') {
    if (!cbActive) {
      const evtProb = G.regime==='bull'?0.03:G.regime==='bear'?0.05:0.04;
      if (status==='open' && !G.activeMarketEvent && Math.random()<evtProb) {
        const pool = G.regime==='bear'
          ? MARKET_EVENTS.filter(e=>e.type==='bear').concat(MARKET_EVENTS)
          : G.regime==='bull'
          ? MARKET_EVENTS.filter(e=>e.type==='bull').concat(MARKET_EVENTS)
          : MARKET_EVENTS;
        const mev = pool[Math.floor(Math.random()*pool.length)];
        G.activeMarketEvent = mev;
        topMsg = '🌐 시장: ' + mev.text;
        showEventBar(mev.text, mev.type);
        // 이벤트 발생 시 즉각 가격 충격 (per-tick drift 누적 제거 대신)
        listedStocks().forEach(st => {
          const impact = mev.mult * st.def.marketBeta;
          if (Math.abs(impact) < 0.001) return;
          st.priceF = Math.max(1, (st.priceF || st.price) * Math.exp(impact));
          const nd = displayPrice(st.priceF);
          updateGarch(st, impact);
          st.price = nd;
          st.dayHigh = Math.max(st.dayHigh, nd);
          st.dayLow  = Math.min(st.dayLow,  nd);
          if (st.intraday) { st.intraday.h=Math.max(st.intraday.h,nd); st.intraday.l=Math.min(st.intraday.l,nd); st.intraday.c=nd; }
        });
        // 이벤트는 당일만 유지 후 closeDay에서 해제
      }
    }
    if (status==='open') stepEconomy();
    if (status==='open' && !cbActive) tryCorporateActions();
    if (status==='open' && !topMsg && !cbActive) { const m=trySpecialEvent(); if(m) topMsg=m; }
    // 실적 발표: topMsg 유무와 무관하게 항상 실행 (모든 종목 순환 보장)
    if (status==='open') { const m=tryEarningsEvent(); if(m && !topMsg) topMsg=m; }

    // 종목 공시 이벤트 — 모든 종목 처리, 로그는 항상 기록
    G.listedIds.forEach(id => {
      const st = G.stocks[id];
      if (st.delisted||st.vi!==null||cbActive||status!=='open') return;
      if (Math.random()>=0.015||st.evCooldown>0) return;
      const def=st.def;
      const stEv=def.events[Math.floor(Math.random()*def.events.length)];
      st.evCooldown=15;

      // 로그는 모든 종목 항상 기록 (activeId 무관)
      const evMsg = `📌 [${id}] ${stEv.text}`;
      addLog(evMsg, stEv.type === 'bull' ? 'buy' : 'sell');

      // 이벤트 바 표시는 현재 보는 종목 or topMsg 없을 때
      if (!topMsg) {
        topMsg = evMsg;
        showEventBar(`[${id}] ${stEv.text}`, stEv.type);
      } else if (id === G.activeId) {
        // 현재 종목 이벤트는 항상 이벤트바에 표시
        showEventBar(`[${id}] ${stEv.text}`, stEv.type);
      }

      if (G.totalMin < CLOSE_MIN) {
        const logImpact = Math.log(1+stEv.impact);
        st.priceF = Math.max(1,(st.priceF||st.price)*Math.exp(logImpact));
        const newDisp = displayPrice(st.priceF);
        updateGarch(st, logImpact);
        st.price=newDisp; st.dayHigh=Math.max(st.dayHigh,newDisp); st.dayLow=Math.min(st.dayLow,newDisp);
        if(st.intraday){st.intraday.h=Math.max(st.intraday.h,newDisp);st.intraday.l=Math.min(st.intraday.l,newDisp);st.intraday.c=newDisp;}
        if(stEv.shareChange){
          const old=st.totalShares;
          st.totalShares=Math.max(1000000,Math.round(old*(1+stEv.shareChange)));
          st.eps=Math.round(st.eps*(old/st.totalShares));
        }
      } else if (Math.random()<0.4) {
        // 장 마감 후 공시 → 갭
        G.pendingGaps[id]=(G.pendingGaps[id]||0)+Math.log(1+stEv.impact*0.6);
      }
    });

    // KOSPI GBM
    stepKospi();
    if (status==='open') updateKospiCandle();
    if (status==='open') checkMarketCB();

    if (cbActive) setMsg('⛔ 시장 CB 발동 중 — 거래 정지');
    else if (topMsg) setMsg(topMsg);
    else if (Math.random()<0.15) {
      const gn=GENERIC_NEWS[Math.floor(Math.random()*GENERIC_NEWS.length)];
      setMsg('📰 '+gn);
      const nt=document.getElementById('newsText');
      if(nt) nt.textContent='📰 '+gn+'   ·   시뮬레이터   ·   ';
    } else setMsg('');
    if (status==='after') setMsg('🌙 애프터마켓 진행 중');
  }
  if (!G.activeId||!G.stocks[G.activeId]||G.stocks[G.activeId].delisted)
    G.activeId=G.listedIds[0]||'';
}

