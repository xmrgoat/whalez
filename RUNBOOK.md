# Whalez V2 - Runbook

## Quick Start

### 1. Prerequisites
```bash
# Required
- Node.js 18+
- pnpm 8+
- Docker (for PostgreSQL)

# Optional
- Grok API key (for AI analysis)
- X API bearer token (for evidence retrieval)
- WalletConnect Project ID (for QR wallet connection)
```

### 1.1 Getting Hyperliquid Credentials

**For Testnet:**
1. Go to https://app.hyperliquid-testnet.xyz
2. Connect your wallet
3. Go to Settings → API → Create API Key
4. Copy the API wallet address → `HL_ACCOUNT_ADDRESS`
5. Copy the private key → `HL_PRIVATE_KEY`
6. Set `HL_NETWORK=testnet`

**For Mainnet:**
1. Go to https://app.hyperliquid.xyz
2. Connect your wallet
3. Go to Settings → API → Create API Key
4. **IMPORTANT**: Use a dedicated API wallet, not your main wallet
5. Fund the API wallet with a small amount for testing
6. Set `HL_NETWORK=mainnet`

**API URLs:**
```bash
# Testnet
HL_HTTP_URL=https://api.hyperliquid-testnet.xyz
HL_WS_URL=wss://api.hyperliquid-testnet.xyz/ws

# Mainnet
HL_HTTP_URL=https://api.hyperliquid.xyz
HL_WS_URL=wss://api.hyperliquid.xyz/ws
```

### 2. Setup
```bash
# Clone and install
cd trading-agent
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Start database
docker-compose up -d

# Generate Prisma client
pnpm --filter @whalez/database generate
pnpm --filter @whalez/database db push

# Build all packages
pnpm build
```

### 3. Development
```bash
# Start all services
pnpm dev

# Or individually:
pnpm --filter @whalez/api dev      # API on :3001
pnpm --filter @whalez/web dev      # Web on :3000
pnpm --filter @whalez/worker dev   # Worker
```

### 4. Test Hyperliquid Connection
```bash
npx tsx scripts/test-hl-stream.ts
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ KLineCharts │  │ WalletButton│  │ Real-time Dashboard │  │
│  └──────┬──────┘  └─────────────┘  └──────────┬──────────┘  │
│         │                                      │             │
│         └──────────────┬───────────────────────┘             │
└────────────────────────┼─────────────────────────────────────┘
                         │ WebSocket + REST
┌────────────────────────┼─────────────────────────────────────┐
│                   API Server (Fastify)                       │
│  ┌─────────────┐  ┌────┴────┐  ┌─────────────────────────┐  │
│  │ Market Data │  │   WS    │  │ Bot/Trade/Critique APIs │  │
│  │   Service   │  │ Server  │  └─────────────────────────┘  │
│  └──────┬──────┘  └─────────┘                                │
└─────────┼────────────────────────────────────────────────────┘
          │ REST + WS
┌─────────┼────────────────────────────────────────────────────┐
│         ▼                                                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Hyperliquid PERPS API                       │ │
│  │  • REST: https://api.hyperliquid.xyz                    │ │
│  │  • WS: wss://api.hyperliquid.xyz/ws                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Real-Time Candles
1. `MarketDataService` connects to Hyperliquid WS
2. Subscribes to candle channels (BTC-PERP, ETH-PERP)
3. Broadcasts updates to connected WebSocket clients
4. Frontend `useMarketData` hook receives and updates chart

### Bot Decisions
1. Worker fetches candles from `MarketDataService`
2. `StrategyEngine` processes indicators (EMA, RSI, ATR)
3. `DecisionPolicy` requires 3+ confirmations
4. If Grok configured, adds macro confirmation
5. `RiskEngine` validates position sizing
6. `ExecutionEngine` places order (paper or live)
7. Decision broadcast to frontend via WebSocket

---

## Configuration Reference

### Adapters
| Variable | Values | Description |
|----------|--------|-------------|
| `EXECUTION_ADAPTER` | `paper`, `hyperliquid` | Trade execution |
| `MARKETDATA_ADAPTER` | `paper`, `hyperliquid` | Market data source |

### Hyperliquid
| Variable | Default | Description |
|----------|---------|-------------|
| `HL_NETWORK` | `mainnet` | `mainnet` or `testnet` |
| `HL_HTTP_URL` | `https://api.hyperliquid.xyz` | REST API |
| `HL_WS_URL` | `wss://api.hyperliquid.xyz/ws` | WebSocket |
| `HL_ACCOUNT_ADDRESS` | - | Your account address |
| `HL_PRIVATE_KEY` | - | API wallet key (server-side only) |

### Safety
| Variable | Default | Description |
|----------|---------|-------------|
| `LIVE_TRADING_ENABLED` | `false` | Must be `true` for live trades |
| `MAX_LEVERAGE` | `5` | Maximum leverage allowed |
| `MAX_DRAWDOWN_PCT` | `10` | Auto-stop at this drawdown |
| `POSITION_SIZE_PCT` | `2` | Max position as % of equity |
| `MIN_CONFIRMATIONS` | `3` | Required confirmations for trade |

### Grok AI
| Variable | Default | Description |
|----------|---------|-------------|
| `GROK_API_KEY` | - | xAI API key |
| `GROK_MODEL` | `grok-3-latest` | Model to use |
| `GROK_TEMPERATURE` | `0` | Response temperature |
| `X_BEARER_TOKEN` | - | X API for evidence retrieval |

---

## Safety Checklist

### Before Going Live
- [ ] Test with paper trading for at least 1 week
- [ ] Verify all indicators display correctly
- [ ] Confirm WebSocket reconnection works
- [ ] Test ARM mode confirmation flow
- [ ] Set appropriate `MAX_LEVERAGE` and `MAX_DRAWDOWN_PCT`
- [ ] Ensure `MIN_CONFIRMATIONS` is at least 3
- [ ] Have kill switch ready (stop bot button)

### ARMED Mode
1. Click "ARM LIVE" button
2. Type "I UNDERSTAND THE RISKS"
3. Confirm with button
4. Mode indicator turns RED
5. Bot can now execute real trades

### Emergency Stop
- Click "Stop Bot" in dashboard
- Or set `LIVE_TRADING_ENABLED=false` and restart

---

## Troubleshooting

### Chart Not Loading
1. Check API is running: `curl http://localhost:3001/health`
2. Check browser console for WebSocket errors
3. Verify `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`

### No Real-Time Updates
1. Check `MarketDataService` logs in API console
2. Verify Hyperliquid WS connection
3. Check for rate limiting (max 20 req/min to Grok)

### Grok Shows "Insufficient Sources"
1. Ensure `X_BEARER_TOKEN` is set
2. Check X API rate limits
3. Try `RELAXED` mode instead of `STRICT`

### Database Errors
1. Ensure PostgreSQL is running: `docker-compose ps`
2. Run migrations: `pnpm --filter @whalez/database db push`
3. Check `DATABASE_URL` in `.env`

---

## API Endpoints

### Health & Debug
```bash
# Health check
curl http://localhost:3001/health

# Full system state (E2E verification)
curl http://localhost:3001/debug/state

# Last candles received
curl http://localhost:3001/debug/candles?symbol=BTC-PERP&timeframe=1m&limit=5

# Last signals from DB
curl http://localhost:3001/debug/signals?limit=10

# Last trades from DB
curl http://localhost:3001/debug/trades?limit=10
```

### Trading Control
```bash
# Get trading status
curl http://localhost:3001/trading/status

# Arm live trading (testnet)
curl -X POST http://localhost:3001/trading/arm \
  -H "Content-Type: application/json" \
  -d '{"confirmation": "I UNDERSTAND THE RISKS", "mode": "testnet"}'

# Disarm trading
curl -X POST http://localhost:3001/trading/disarm

# Emergency kill switch
curl -X POST http://localhost:3001/trading/kill \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manual stop"}'

# Reset kill switch
curl -X POST http://localhost:3001/trading/reset-kill \
  -H "Content-Type: application/json" \
  -d '{"confirmation": "RESET KILL SWITCH"}'
```

### Market Data
```
GET /api/market/candles?symbol=BTC-PERP&timeframe=1h&limit=500
GET /api/market/ticker?symbol=BTC-PERP
GET /api/market/symbols
GET /api/market/status
GET /api/market/funding?symbol=BTC-PERP
```

### WebSocket
```
Connect: ws://localhost:3001/ws

Subscribe to candles:
{ "type": "subscribe", "channel": "candles", "symbol": "BTC-PERP", "timeframe": "1h" }

Subscribe to bot:
{ "type": "subscribe", "channel": "bot", "botId": "..." }
```

---

## Validation Live

### E2E Smoke Test
```bash
# Start services first
docker-compose up -d
pnpm db:push
pnpm dev:api &
pnpm dev:web &

# Run smoke test
pnpm e2e:smoke
```

### Expected Output
```
✅ API Health: API is running
✅ Market Candles: Received 5 candles, last close: $87000
✅ WS Connected: WebSocket connected to Hyperliquid
✅ Candles Flowing: Received 3 new candles since start
✅ DB Access: Database accessible (0 trades, 0 signals)
✅ Candle Freshness: Last candle 5s ago

Passed: 6/6
✅ SMOKE TEST PASSED
```

### Manual Verification
1. Open http://localhost:3000/dashboard
2. Check WS indicator shows "Connected" (green dot)
3. Verify chart shows real BTC price (~$87k as of Dec 2024)
4. Change timeframe - candles should reload
5. Connect wallet - should show address + chain

---

## Version History

### V2.0.0 (Current)
- Real-time Hyperliquid PERPS data
- KLineCharts Pro integration
- Grok AI grounded analysis
- WalletConnect support
- Decision Policy with confirmations
- ARMED mode for live trading

### V1.0.0
- Paper trading only
- Simulated data
- Basic chart
