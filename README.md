# 주가 시뮬레이터

한국 주식시장을 시뮬레이션하는 브라우저 기반 HTS입니다.

## 파일 구조

```
simulator/
├── index.html              # 메인 HTML (UI 구조만, 인라인 코드 없음)
├── css/
│   ├── base.css            # 리셋, CSS 변수, 공통 레이아웃, 헤더, 탭
│   └── components.css      # 호가창, 주문패널, 포트폴리오, 차트, 통계
└── js/
    ├── constants.js        # 상수, 종목정의, 시장이벤트, 레짐, 전역상태(G), INIT
    ├── engine.js           # GBM/GARCH 가격 엔진, genMove, processPriceTick
    ├── orderbook.js        # 호가창 로직 (initOrderBook, syncOrderBook)
    ├── trade.js            # 주문 입력/체결/미체결 관리
    ├── economy.js          # 레짐전환, 금리, 경제지표, KOSPI, 배당
    ├── events.js           # 기업공시, 실적, 기업행동, IPO/상폐, CB
    ├── time.js             # 시간흐름, 틱루프, 일간리셋, 장운영
    ├── ui.js               # 주식정보/포트폴리오 렌더링, 캔들차트
    └── kospi_ui.js         # KOSPI 차트 + 세력 테이블
```

## 수정 가이드

| 수정 목적 | 파일 |
|-----------|------|
| 종목 추가/수정, 배당성향 변경 | `js/constants.js` → `ALL_STOCKS_DEF` |
| 변동성, GBM 파라미터 튜닝 | `js/engine.js` → `genMove()` |
| GARCH 클리핑, 틱사이즈 | `js/engine.js` → `updateGarch()`, `getTickSize()` |
| 호가창 잔량/레벨 조정 | `js/orderbook.js` → `initOrderBook()`, `syncOrderBook()` |
| 주문 유형 추가 | `js/trade.js` → `submitOrder()` |
| 금리 결정 로직 | `js/economy.js` → `stepEconomy()` |
| 배당 시기/금액 변경 | `js/economy.js` → `processDividend()` |
| 실적 발표 주기/효과 | `js/events.js` → `tryEarningsEvent()` |
| 기업행동 쿨다운/조건 | `js/events.js` → `tryCorporateActions()` |
| 장 운영 시간 변경 | `js/time.js` + `js/constants.js` 상수 |
| UI 레이아웃 변경 | `index.html` + `css/components.css` |
| 차트 스타일 | `js/ui.js` → `drawChart()` |
| KOSPI 변동성 | `js/economy.js` → `stepKospi()` |

## 실행 방법

로컬에서 바로 `index.html`을 열면 CORS 오류가 발생할 수 있습니다.
간단한 로컬 서버를 사용하세요:

```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve .
```

## 의존성 순서 (script 로딩 순서)

```
constants.js (전역 상태 G 포함)
    ↓
engine.js → orderbook.js → trade.js
    ↓
economy.js → events.js → time.js
    ↓
ui.js → kospi_ui.js
```
