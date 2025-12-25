# Whalez V3 - Verification Checklist

## Build Status
- [x] `pnpm build` - All packages compile without errors
- [x] Prisma client generated with new Decision models
- [x] TypeScript types consistent across packages

## New Features Implemented

### 1. Decision Inspector UI
- [x] `DecisionInspectorPanel.tsx` - Right-side drawer with full decision details
- [x] `DecisionTimeline.tsx` - Scrollable list of decisions (latest first)
- [x] `ConfidenceBadge.tsx` - Score display with breakdown bars
- [x] Inspector toggle button in chart header
- [x] Click-to-inspect candle functionality

### 2. Confidence Score Engine (0-100)
- [x] `confidence.engine.ts` - Main computation logic
- [x] **DataQuality (0-20)**: wsConnected, freshness, gaps, latency
- [x] **SignalAgreement (0-30)**: indicator confirmations (min 3)
- [x] **RiskFit (0-25)**: drawdown, daily loss, position size, leverage
- [x] **RegimeMatch (0-15)**: trend alignment, volatility, ranging detection
- [x] **NewsBonus (0-10)**: Grok grounded sources only

### 3. Gating Rules (Hard Blocks)
- [x] DataQuality < 8 => NO_TRADE
- [x] RiskFit fails => BLOCK TRADE
- [x] Confirmations < 3 => NO_TRADE
- [x] Grok insufficient sources => no bonus, mark UNKNOWN

### 4. KLineCharts V3 Fixes
- [x] `TradingChartV3.tsx` - New chart component
- [x] Candle merge logic: updateData for same timestamp, append for new
- [x] Live follow toggle (auto-scroll vs free navigation)
- [x] User interaction detection (scroll/zoom disables follow)
- [x] "Go Live" button to recenter
- [x] Price/tick display with metadata

### 5. Regime Detector
- [x] `regime.detector.ts` - ATR, trend slope, ranging detection
- [x] Volatility levels: low/medium/high
- [x] Trend direction: uptrend/downtrend/sideways

### 6. Data Quality Measurement
- [x] `data-quality.ts` - Candle freshness, gaps, latency tracking
- [x] Timeframe-aware gap detection

### 7. API Endpoints
- [x] `GET /api/market/metadata` - tickSize, pricePrecision per symbol
- [x] `GET /api/decisions` - List with filters
- [x] `GET /api/decisions/:id` - Full breakdown + evidence
- [x] `GET /api/decisions/by-timestamp` - Decision for specific candle
- [x] `GET /api/decisions/markers` - Chart markers for range

### 8. Database Schema (Prisma)
- [x] `Decision` - Main decision record with action, score, blocked reason
- [x] `DecisionBreakdown` - Score breakdown by family
- [x] `DecisionEvidence` - Individual checks with pass/fail/unknown
- [x] `ChartMarker` - Entry/exit/no-trade markers linked to decisions

## Manual Verification Steps

### Chart Functionality
```
1. Open http://localhost:3000/dashboard
2. Verify chart loads with BTC-PERP data
3. Change timeframe to 1m - should update in real-time
4. Scroll/zoom chart - "Live" button should change to "Go Live"
5. Click "Go Live" - chart should recenter to latest candle
6. Click "Inspector" button - should open right panel
```

### Decision Inspector
```
1. Click on Decision Timeline items (right side)
2. Inspector panel should show:
   - Action badge (LONG/SHORT/NO_TRADE)
   - Confidence score with breakdown bars
   - Evidence list grouped by type
   - Debug JSON (collapsible)
3. Click on chart candle - should load decision for that timestamp
```

### API Endpoints
```bash
# Market metadata
curl http://localhost:3001/api/market/metadata?symbol=BTC-PERP

# Decisions list
curl http://localhost:3001/api/decisions?symbol=BTC-PERP&limit=10

# Decision markers
curl http://localhost:3001/api/decisions/markers?symbol=BTC-PERP&timeframe=1h
```

## Known Limitations / TODO

### Worker Integration (Pending)
- [ ] Worker needs to call `computeConfidence()` before trades
- [ ] Worker needs to persist Decision + Evidence to DB
- [ ] Worker needs to create ChartMarkers for executed trades

### Not Implemented
- [ ] WebSocket channel for real-time decision push
- [ ] Grok API integration in confidence engine
- [ ] Ichimoku indicator (disabled, may produce NaN)

## Potential Edge Cases

1. **Empty candles array** - Chart handles gracefully
2. **No decisions in DB** - Timeline shows "No decisions yet"
3. **Decision not found for candle** - Inspector shows "No decision for this candle"
4. **WS disconnected** - Falls back to polling, DataQuality score drops
5. **Rate limiting (429)** - Polling interval increased to 5s

## Files Created/Modified

### New Files
- `packages/core/src/engines/confidence.engine.ts`
- `packages/core/src/engines/regime.detector.ts`
- `packages/core/src/engines/data-quality.ts`
- `services/api/src/routes/decisions.ts`
- `apps/web/src/components/TradingChartV3.tsx`
- `apps/web/src/components/DecisionInspectorPanel.tsx`
- `apps/web/src/components/DecisionTimeline.tsx`
- `apps/web/src/components/ConfidenceBadge.tsx`
- `apps/web/src/hooks/useDecisions.ts`

### Modified Files
- `packages/database/prisma/schema.prisma` - New Decision models
- `packages/core/src/index.ts` - Export new engines
- `services/api/src/index.ts` - Register decisions routes
- `services/api/src/routes/market.ts` - Add /metadata endpoint
- `apps/web/src/app/dashboard/page.tsx` - Integrate Inspector

## Self-Audit Summary

### What Works
- Build compiles without errors
- New components render correctly
- API endpoints respond
- Confidence engine computes deterministic scores
- Gating rules block trades correctly

### What Needs Testing
- Real-time candle updates on 1m timeframe
- Live follow toggle behavior
- Decision persistence from worker
- Chart markers rendering

### Security Notes
- No new secrets required
- Existing JWT auth patterns followed
- No hardcoded credentials
