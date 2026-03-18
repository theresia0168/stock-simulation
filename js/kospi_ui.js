// ── kospi_ui.js ──  KOSPI 차트 + 세력 테이블 렌더링
// 의존: constants.js → state(G) 전역


// ════════════════════════════════════════════════════
// UPDATE FLOW UI (수치 테이블)
// ════════════════════════════════════════════════════
function fmtFlow(v) {
  const s = v >= 0 ? '+' : '';
  const a = Math.abs(v);
  if (a >= 1e12) return s + (v/1e12).toFixed(1) + '조';
  if (a >= 1e8)  return s + (v/1e8).toFixed(0) + '억';
  if (a >= 1e4)  return s + (v/1e4).toFixed(0) + '만';
  return s + Math.round(v).toLocaleString();
}



function updateFlowUI() {
  const st = activeStock();
  if (!st) return;
  const inst  = st.flowInst  || 0;
  const fore  = st.flowFore  || 0;
  const indiv = st.flowIndiv || 0;
  const nI = st.netInst  || 0;
  const nF = st.netFore  || 0;
  const nD = st.netIndiv || 0;
  const total = Math.abs(inst) + Math.abs(fore) + Math.abs(indiv) || 1;
  const pct = v => (Math.abs(v)/total*100).toFixed(1) + '%';

  const set = (id, v, cls) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = fmtFlow(v); if(cls) el.className=cls; }
  };
  set('fInstDay',  inst,  inst>=0?'up':'down');
  set('fForeDay',  fore,  fore>=0?'up':'down');
  set('fIndivDay', indiv, indiv>=0?'up':'down');
  set('fInstNet',  nI);
  set('fForeNet',  nF);
  set('fIndivNet', nD);
  document.getElementById('fInstPct').textContent  = pct(inst);
  document.getElementById('fForePct').textContent  = pct(fore);
  document.getElementById('fIndivPct').textContent = pct(indiv);
  document.getElementById('fTotalDay').textContent = fmtFlow(inst+fore+indiv);
}



// ════════════════════════════════════════════════════
// DRAW KOSPI CANDLE CHART
// ════════════════════════════════════════════════════
function drawKospiChart() {
  const canvas = document.getElementById('kospiChart');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 20, H = 300;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  canvas.width = W*dpr; canvas.height = H*dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#141720'; ctx.fillRect(0,0,W,H);

  const candles = [...G.kospiCandles, ...(G.kospiIntraday?[{...G.kospiIntraday,dateStr:'오늘',live:true}]:[])];
  if (candles.length === 0) {
    ctx.fillStyle='#555e78'; ctx.font='12px "Share Tech Mono",monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('턴을 진행하면 KOSPI 차트가 표시됩니다', W/2, H/2); return;
  }

  // 종목 차트와 동일한 레이아웃 (거래량 패널 없음)
  const PAD_L=66, PAD_R=64, PAD_T=14, PAD_B=30;
  const CHART_H = H - PAD_T - PAD_B;
  const chartRight = W - PAD_R;

  const MAX_VIS = 80;
  const start = Math.max(0, candles.length - MAX_VIS);
  const vis = candles.slice(start);
  const N = vis.length;

  let pMax = Math.max(...vis.map(c=>c.h));
  let pMin = Math.min(...vis.map(c=>c.l));
  const pad = (pMax-pMin)*0.10 || pMax*0.02;
  pMax += pad; pMin -= pad;
  const pRange = pMax - pMin || 1;

  const SLOT_W = 9, BODY_W = 5;
  const py = p => PAD_T + CHART_H - ((p-pMin)/pRange)*CHART_H;

  // 수평 그리드
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
  for (let i=0; i<=4; i++) {
    const y = PAD_T + (CHART_H/4)*i;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W-PAD_R, y); ctx.stroke();
    ctx.fillStyle = '#555e78'; ctx.font = '9px "Share Tech Mono",monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(pMax-(pRange/4)*i).toLocaleString(), PAD_L-4, y);
  }

  // 캔들
  vis.forEach((c, i) => {
    const cx = chartRight - (N-1-i)*SLOT_W - SLOT_W/2;
    const bx = Math.round(cx - BODY_W/2);
    const isUp = c.c >= c.o;
    const col = isUp ? '#00e5a0' : '#ff4d6d';

    // 심지
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(cx), py(c.h));
    ctx.lineTo(Math.round(cx), py(c.l));
    ctx.stroke();

    // 몸통
    const top = py(Math.max(c.o, c.c));
    const bh  = Math.max(1, py(Math.min(c.o, c.c)) - top);
    if (c.live) {
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.strokeRect(bx+0.5, top+0.5, BODY_W-1, bh-1);
    } else {
      ctx.fillStyle = col;
      ctx.fillRect(bx, top, BODY_W, bh);
    }
  });

  // 현재가 점선
  const lastY = py(G.kospi);
  const isUpNow = G.kospi >= G.kospiOpen;
  ctx.strokeStyle = isUpNow ? 'rgba(0,229,160,0.35)' : 'rgba(255,77,109,0.35)';
  ctx.lineWidth = 0.5; ctx.setLineDash([3,4]);
  ctx.beginPath(); ctx.moveTo(PAD_L, lastY); ctx.lineTo(W-PAD_R, lastY); ctx.stroke();
  ctx.setLineDash([]);

  // 현재가 태그
  const tag = G.kospi.toFixed(2);
  const tagW = tag.length * 6.5 + 12;
  ctx.fillStyle = isUpNow ? '#00e5a0' : '#ff4d6d';
  ctx.beginPath(); ctx.roundRect(W-PAD_R+2, lastY-8, tagW, 16, 2); ctx.fill();
  ctx.fillStyle = '#0d0f14'; ctx.font = 'bold 8px "Share Tech Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tag, W-PAD_R+2+tagW/2, lastY);

  // X 날짜 레이블
  const step = Math.max(1, Math.floor(N/6));
  ctx.fillStyle = '#555e78'; ctx.font = '9px "Share Tech Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  vis.forEach((c, i) => {
    if (i%step===0 || i===N-1) {
      const cx = chartRight - (N-1-i)*SLOT_W - SLOT_W/2;
      ctx.fillText(c.dateStr || `D${start+i+1}`, cx, H-PAD_B+12);
    }
  });
}



// ════════════════════════════════════════════════════
// RENDER KOSPI FLOW TABLE (일별 세력 동향)
// ════════════════════════════════════════════════════
function renderKospiFlowTable() {
  const tb = document.getElementById('kospiFlowTable');
  if (!tb) return;
  const hist = [...G.kospiFlowHistory].reverse().slice(0, 20);
  if (hist.length === 0) {
    tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:12px;font-family:var(--mono);font-size:10px">거래일이 쌓이면 표시됩니다</td></tr>';
    return;
  }
  tb.innerHTML = hist.map(h => {
    const chgCls = h.kospiChg > 0 ? 'color:var(--up)' : h.kospiChg < 0 ? 'color:var(--down)' : 'color:var(--text2)';
    const sign = h.kospiChg >= 0 ? '+' : '';
    return `<tr>
      <td style="text-align:left;color:var(--text3)">${h.dateStr}</td>
      <td style="color:var(--inst)">${fmtFlow(h.inst)}</td>
      <td style="color:var(--fore)">${fmtFlow(h.fore)}</td>
      <td style="color:var(--text2)">${fmtFlow(h.indiv)}</td>
      <td style="${chgCls}">${sign}${h.kospiChg.toFixed(2)}%</td>
    </tr>`;
  }).join('');
}

