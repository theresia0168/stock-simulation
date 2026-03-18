// ── events.js ──  기업공시, 실적발표, 기업행동, IPO/상폐, 서킷브레이커
// 의존: constants.js → state(G) 전역
// ※ economy.js의 버블/크래시 상태(G.isCrash, G.bubbleIndex)를 참조

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
    const lastAction = G.corpActionCooldown[id] || 0;
    if (G.turn - lastAction < 1500) return;

    const per = st.eps > 0 ? st.price / st.eps : null;
    const priceRatio = st.price / st.def.initPrice;

    if (priceRatio >= 5 && st.parValue >= 100 && Math.random() < 0.3) {
      const ratio = priceRatio >= 10 ? 10 : 5;
      if (st.shares > 0) { st.shares *= ratio; if (st.avgBuy > 0) st.avgBuy /= ratio; }
      st.parValue    = Math.round(st.parValue / ratio);
      st.totalShares *= ratio;
      st.eps          = Math.round(st.eps / ratio); // EPS도 분할 비율로 조정
      st.priceF       = (st.priceF || st.price) / ratio;
      st.price        = displayPrice(st.priceF);
      // 일간 OHLC 전부 새 가격으로 리셋
      st.dayOpen  = st.price; st.dayOpenF = st.priceF;
      st.dayHigh  = st.price; st.dayLow   = st.price;
      // prevTickPrice 리셋 — 분할 전 가격이 남아있으면 KOSPI에 폭락으로 잡힘
      st.prevTickPrice = st.price;
      // intraday 캔들도 새 가격으로 리셋
      if (st.intraday) {
        st.intraday.o = st.price; st.intraday.h = st.price;
        st.intraday.l = st.price; st.intraday.c = st.price;
      }
      st.ob = null;
      G.corpActionCooldown[id] = G.turn;
      const msg = `✂️ [액면분할] ${id} ${ratio}:1 → ${fmt(st.price)} (주식수 ${ratio}배, EPS ${ratio}분의1)`;
      showEventBar(msg, 'special'); addLog(msg, 'sys');
      return;
    }

    if (st.price < st.parValue * 0.5 && st.parValue <= 5000 && Math.random() < 0.3) {
      const ratio = 10;
      if (st.shares > 0) { st.shares = Math.max(1, Math.round(st.shares / ratio)); if (st.avgBuy > 0) st.avgBuy *= ratio; }
      st.parValue    *= ratio;
      st.totalShares  = Math.max(1000000, Math.round(st.totalShares / ratio));
      st.eps         *= ratio;
      st.priceF       = (st.priceF || st.price) * ratio;
      st.price        = displayPrice(st.priceF);
      st.dayOpen  = st.price; st.dayOpenF = st.priceF;
      st.dayHigh  = st.price; st.dayLow   = st.price;
      st.prevTickPrice = st.price;
      if (st.intraday) {
        st.intraday.o = st.price; st.intraday.h = st.price;
        st.intraday.l = st.price; st.intraday.c = st.price;
      }
      st.ob = null;
      G.corpActionCooldown[id] = G.turn;
      const msg = `🔄 [액면병합] ${id} 1:${ratio} → ${fmt(st.price)}`;
      showEventBar(msg, 'bear'); addLog(msg, 'sys');
      return;
    }

    if (per !== null && per > 60 && G.krRate < 4.5 && Math.random() < 0.03) {
      // 유상증자 연간 최대 1회 제한
      // 같은 종목이 1년에 여러 번 증자하는 건 비현실적
      const lastRightsIssue = st.lastRightsIssueTurn || 0;
      if (G.turn - lastRightsIssue < 1764) return; // 1764턴 ≈ 252거래일 × 7턴 = 1년

      const ratio = 0.05 + Math.random() * 0.05;
      const old = st.totalShares;
      st.totalShares = Math.round(old * (1 + ratio));
      st.eps = Math.round(st.eps * (old / st.totalShares));
      st.priceF = (st.priceF || st.price) * (1 - ratio * 0.5);
      st.price  = displayPrice(st.priceF);
      G.corpActionCooldown[id] = G.turn;
      st.lastRightsIssueTurn   = G.turn; // 마지막 유상증자 턴 기록
      const msg = `📢 [유상증자] ${id} 주식수 +${(ratio * 100).toFixed(1)}% → 주가 -${(ratio * 0.5 * 100).toFixed(1)}%`;
      showEventBar(msg, 'bear'); addLog(msg, 'sys');
      return;
    }

    if (per !== null && per > 0 && per < 8 && Math.random() < 0.03) {
      const ratio = 0.01 + Math.random() * 0.02;
      const old = st.totalShares;
      st.totalShares = Math.max(1000000, Math.round(old * (1 - ratio)));
      st.eps = Math.round(st.eps * (old / st.totalShares));
      st.priceF = (st.priceF || st.price) * (1 + ratio * 0.8);
      st.price  = displayPrice(st.priceF);
      G.corpActionCooldown[id] = G.turn;
      // 자사주소각은 주식 수 감소 → 주당가치 상승 → 호재
      // 소각 비율은 주식 수 기준이고 주가는 오름 → +로 표기
      const msg = `🔥 [자사주소각] ${id} 주식수 -${(ratio * 100).toFixed(1)}% → 주가 +${(ratio * 0.8 * 100).toFixed(1)}%`;
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
      // 기존: 주가 < initPrice*0.3 AND eps < 0
      // 수정: 아래 조건 중 하나라도 충족
      //   1) 적자 + 주가 30% 미만 (기존)
      //   2) 주가가 initPrice의 5% 미만 (좀비 종목 — 흑자여도 상폐)
      //   3) 적자 지속 + 주가 15% 미만 (완화된 조건)
      const zombie      = st.price < st.def.initPrice * 0.05;
      const classic     = st.price < st.def.initPrice * 0.30 && st.eps < 0;
      const deepLoss    = st.price < st.def.initPrice * 0.15 && st.eps < 0;
      return zombie || classic || deepLoss;
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
  if (G.earningsTurn < 250) return null;
  G.earningsTurn = 0;

  const listed = G.listedIds.filter(id => !G.stocks[id].delisted);
  if (listed.length === 0) return null;
  G.earningsIdx = G.earningsIdx % listed.length;
  const id = listed[G.earningsIdx++];
  const st = G.stocks[id]; const def = st.def;

  const quarterlyBase = def.epsGrowthRate / 4;

  // 크래시 중엔 EPS 충격 강화
  const crashEffect = G.isCrash ? -0.05 * G.crashSeverity * def.epsCycleSens : 0;
  const regimeEffect = (G.regime==='bull' ? 0.02 : G.regime==='bear' ? -0.03 : 0) * def.epsCycleSens;
  const rateEffect   = -(G.krRate - 3.0) * 0.01 * def.epsRateSens;
  // GDP 연동: 경기 좋으면 EPS도 개선
  const gdpEffect    = (G.gdpGrowth - 2.0) * 0.005 * def.epsCycleSens;
  const surprise     = randn() * def.volBase * 1.5;
  const totalGrowth  = quarterlyBase + regimeEffect + rateEffect + gdpEffect + crashEffect + surprise;

  const oldEps = st.eps;
  if (oldEps >= 0) {
    st.eps = Math.round(oldEps * (1 + totalGrowth));
    if (st.eps < 0) st.eps = Math.round(oldEps * -0.5);
    // EPS 하한: initEps의 10% (무한 하락 방지)
    if (def.initEps > 0) st.eps = Math.max(Math.round(def.initEps * 0.10), st.eps);
  } else {
    st.eps = Math.round(oldEps * (1 - totalGrowth));
    // 흑자 전환 확률: bull 레짐이거나 GDP 호조 시 대폭 상향
    const recoveryChance = G.regime === 'bull' ? 0.50
      : G.gdpGrowth > 2.0               ? 0.30
      : 0.15;
    if (totalGrowth > 0.3 && Math.random() < recoveryChance) {
      st.eps = Math.round(Math.abs(oldEps) * 0.3);
    }
    // 적자 하한: initEps 기준 -300% (무한 적자 방지)
    const epsMin = def.initEps > 0 ? -def.initEps * 3 : Math.round(def.initEps * 3);
    if (st.eps < epsMin) st.eps = epsMin;
  }

  const isPos  = st.eps > oldEps;
  const delta  = st.eps - oldEps;
  const label  = isPos ? (Math.abs(delta) > Math.abs(oldEps * quarterlyBase) * 2 ? '어닝 서프라이즈' : '예상 소폭 상회')
                       : (Math.abs(delta) > Math.abs(oldEps * quarterlyBase) * 2 ? '어닝 쇼크'       : '예상 소폭 하회');
  const impact = Math.max(-0.15, Math.min(0.15, totalGrowth * 0.35));
  const logGap = Math.log(1 + impact);
  const per    = st.eps > 0 ? (st.price / st.eps).toFixed(1) : 'N/A';
  const sign   = delta >= 0 ? '+' : '';

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

  // 레짐 전환: 매 hourlyTurn(=매 시간)이 아닌 약 5거래일(35턴)마다 1번만 시도
  // 크래시/회복 중엔 transitionRegime() 내부에서 bear 강제 유지하므로 별도 처리 불필요
  G.regimeTransitionCooldown = (G.regimeTransitionCooldown || 0) + 1;
  if (G.regimeTransitionCooldown >= 35) {
    G.regimeTransitionCooldown = 0;
    transitionRegime();
  }

  let topMsg = '';

  if (status === 'open' || status === 'after') {
    if (!cbActive) {
      const evtProb = G.regime==='bull'?0.03:G.regime==='bear'?0.05:0.04;

      // 마켓 이벤트 쿨다운 카운터 감소
      if (G.marketEventCooldown > 0) G.marketEventCooldown--;

      if (status==='open' && !G.activeMarketEvent
          && G.marketEventCooldown === 0
          && Math.random() < evtProb) {

        const matchedPool = G.regime === 'bear'
          ? MARKET_EVENTS.filter(e => e.type === 'bear')
          : G.regime === 'bull'
          ? MARKET_EVENTS.filter(e => e.type === 'bull')
          : MARKET_EVENTS;
        const pool = Math.random() < 0.70 && matchedPool.length > 0
          ? matchedPool
          : MARKET_EVENTS;

        // 최근 발생 이벤트 제외 (직전 2개와 다른 이벤트 선택)
        const recentTexts = G.recentMarketEvents || [];
        const filtered = pool.filter(e => !recentTexts.includes(e.text));
        const finalPool = filtered.length > 0 ? filtered : pool;
        const mev = finalPool[Math.floor(Math.random() * finalPool.length)];

        // 최근 이벤트 기록 (최대 2개 유지)
        G.recentMarketEvents = [mev.text, ...(G.recentMarketEvents || [])].slice(0, 2);

        // 이벤트 발생 후 14턴(약 2거래일) 쿨다운
        G.marketEventCooldown = 14;

        G.activeMarketEvent = mev;
        topMsg = '🌐 시장: ' + mev.text;
        showEventBar(mev.text, mev.type);
        addLog(`🌐 [시장이벤트] ${mev.text}`, mev.type === 'bull' ? 'buy' : mev.type === 'bear' ? 'sell' : 'sys');
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
      }
    }
    if (status==='open') stepEconomy();
    if (status==='open' && !cbActive) tryCorporateActions();
    if (status==='open' && !topMsg && !cbActive) { const m=trySpecialEvent(); if(m) topMsg=m; }
    if (status==='open') { const m=tryEarningsEvent(); if(m && !topMsg) topMsg=m; }

    // ── EPS 점진적 성장/회복 (실적 발표 사이 구간) ──
    // 실제로 기업은 분기 내내 이익을 축적함
    // 핵심 변경: initEps를 천장으로 쓰지 않고 추세 EPS(목표값)를 기준으로 성장
    if (status === 'open') {
      const gdpBoost    = Math.max(0, G.gdpGrowth - 1.0) * 0.0003; // GDP 1% 초과분 반영
      const regimeBoost = G.regime === 'bull'    ? 0.0006
                        : G.regime === 'neutral' ? 0.0002
                        : 0;
      const growthRate  = gdpBoost + regimeBoost; // 최대 ~0.001/턴

      if (growthRate > 0) {
        G.listedIds.forEach(id => {
          const st  = G.stocks[id];
          const def = st.def;
          if (st.delisted || !st.listed) return;

          if (st.eps < 0) {
            // 적자: 호황이면 적자 폭 축소
            const reduction = Math.abs(st.eps) * growthRate * def.epsCycleSens;
            st.eps = Math.min(0, Math.round(st.eps + reduction));

          } else {
            // 흑자: 종목 고유 성장률 + 경기/레짐 부스트로 실질 성장
            // 목표 EPS = initEps * (1 + annualEpsGrowth)^(경과연수)
            const yearsPassed = st.dailyCandles.length / 252;
            const targetEps   = Math.round(
              def.initEps * Math.pow(1 + def.epsGrowthRate, yearsPassed)
            );
            // 현재 EPS가 목표보다 낮으면 따라잡기 + 기본 성장
            const catchUpRate = st.eps < targetEps
              ? growthRate * 1.5   // 목표 미달이면 더 빠르게
              : growthRate * 0.5;  // 목표 초과면 느리게 (과열 억제)
            const epsGain = Math.max(1, Math.round(st.eps * catchUpRate * def.epsCycleSens));
            st.eps = Math.round(st.eps + epsGain);

            // EPS 상한: 목표의 200% (버블기 EPS 과열 억제)
            const epsMax = targetEps * 2;
            if (st.eps > epsMax) st.eps = epsMax;
          }
        });
      }

      // bear/크래시 중엔 EPS 서서히 악화
      if (G.regime === 'bear' || G.isCrash) {
        const deteriorateRate = G.isCrash
          ? 0.0008 * G.crashSeverity
          : 0.0002;
        G.listedIds.forEach(id => {
          const st  = G.stocks[id];
          const def = st.def;
          if (st.delisted || !st.listed || st.eps <= 0) return;
          const loss = Math.max(1, Math.round(st.eps * deteriorateRate * def.epsCycleSens));
          st.eps = Math.max(Math.round(def.initEps * 0.1), st.eps - loss);
        });
      }
    }

    G.listedIds.forEach(id => {
      const st = G.stocks[id];
      if (st.delisted||st.vi!==null||cbActive||status!=='open') return;
      if (Math.random()>=0.015||st.evCooldown>0) return;
      const def=st.def;

      // 최근 발생 이벤트 이력 추적 — 이벤트 풀 절반까지 제외
      // 기존: 직전 1개만 기억 → 60턴 후 같은 이벤트 반복 가능
      // 수정: 최근 ceil(poolSize/2)개 기억 → 다양한 이벤트 순환
      const evCount   = def.events.length;
      const maxMemory = Math.ceil(evCount / 2); // 풀 절반까지 기억
      const recentIdxs = st.recentEvIdxs || [];

      // 최근 이력에 없는 이벤트만 후보로
      let candidates = Array.from({length: evCount}, (_, i) => i)
        .filter(i => !recentIdxs.includes(i));
      if (candidates.length === 0) candidates = Array.from({length: evCount}, (_, i) => i);

      const evIdx = candidates[Math.floor(Math.random() * candidates.length)];

      // 이력 업데이트 (최대 maxMemory개 유지)
      st.recentEvIdxs = [evIdx, ...recentIdxs].slice(0, maxMemory);

      const stEv = def.events[evIdx];
      st.evCooldown = 60;

      const evMsg = `📌 [${id}] ${stEv.text}`;
      addLog(evMsg, stEv.type === 'bull' ? 'buy' : 'sell');

      if (!topMsg) {
        topMsg = evMsg;
        showEventBar(`[${id}] ${stEv.text}`, stEv.type);
      } else if (id === G.activeId) {
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
        G.pendingGaps[id]=(G.pendingGaps[id]||0)+Math.log(1+stEv.impact*0.6);
      }
    });

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
