# Whalez V2

Autonomous swing trading agent with **real-time Hyperliquid PERPS data**, self-critique, and adaptive learning. Built for Hyperliquid, ready for MegaETH.

## ✨ V2 Features

- **Real-Time Market Data**: Live candles from Hyperliquid via REST + WebSocket with polling fallback
- **KLineCharts Pro**: Professional trading chart with EMA, RSI, Volume, Ichimoku indicators
- **Multi-Timeframe**: 1m, 5m, 15m, 1h, 4h, 1d support
- **Decision Policy**: Minimum 3 confirmations required before any trade
- **Grok AI Integration**: Grounded macro analysis with X (Twitter) evidence citations
- **ARMED Mode**: Double confirmation required for live trading
- **Self-Critique System**: Auto-analysis every 5 trades with safe parameter tuning
- **Adapter Pattern**: Switch between Hyperliquid and MegaETH via environment variables

## Architecture

```
whalez/
├── packages/
│   ├── core/           # Trading engine, adapters, types
│   └── database/       # Prisma schema and client
├── services/
│   ├── api/            # Fastify REST API + WebSocket
│   └── worker/         # Bot execution service
└── apps/
    └── web/            # Next.js dashboard with KLineCharts
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- PostgreSQL 14+

### Installation

```bash
# Clone and install
cd trading-agent
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your values

# Setup database
pnpm --filter @trading-agent/database generate
pnpm --filter @trading-agent/database push

# Build packages
pnpm build
```

### Development

```bash
# Start all services in dev mode
pnpm dev

# Or start individually:
pnpm --filter @trading-agent/api dev      # API on :3001
pnpm --filter @trading-agent/worker dev   # Worker
pnpm --filter @trading-agent/web dev      # Web on :3000
```

### Production

```bash
pnpm build
pnpm start
```

## Configuration

### Adapters

Switch execution and market data adapters via environment variables:

```bash
# Paper trading (default)
EXECUTION_ADAPTER=paper
MARKETDATA_ADAPTER=paper

# Hyperliquid
EXECUTION_ADAPTER=hyperliquid
MARKETDATA_ADAPTER=hyperliquid
HL_ACCOUNT_ADDRESS=0x...
HL_PRIVATE_KEY=...
HL_NETWORK=testnet  # or mainnet
```

### Switching to MegaETH

When MegaETH adapters are implemented:

```bash
EXECUTION_ADAPTER=megaeth
MARKETDATA_ADAPTER=megaeth
MEGAETH_RPC_URL=...
MEGAETH_PRIVATE_KEY=...
```

## API Endpoints

### Authentication

```
POST /api/auth/register    # Create account
POST /api/auth/login       # Get JWT token
GET  /api/auth/me          # Get current user
POST /api/auth/api-keys    # Create API key
```

### Bots

```
GET    /api/bots           # List bots
POST   /api/bots           # Create bot
GET    /api/bots/:id       # Get bot details
PATCH  /api/bots/:id       # Update bot
DELETE /api/bots/:id       # Delete bot
POST   /api/bots/:id/start # Start bot
POST   /api/bots/:id/stop  # Stop bot
GET    /api/bots/:id/trades    # Get bot trades
GET    /api/bots/:id/critique  # Get critique reports
```

### Trades & Critique

```
GET /api/trades            # List trades
GET /api/trades/stats      # Trade statistics
GET /api/critique          # List critique reports
POST /api/critique/params/:id/rollback  # Rollback parameter change
```

### WebSocket

Connect to `/ws?token=<jwt>` for real-time updates:

```javascript
// Message types received:
{ type: 'trade_update', botId, trade }
{ type: 'signal', botId, signal }
{ type: 'critique_report', botId, report }
{ type: 'candle', botId, candle }
```

## Bot Configuration

```typescript
{
  name: "BTC Swing Bot",
  symbol: "BTC-PERP",
  timeframes: ["4h", "1d"],
  indicators: [
    { name: "EMA", params: { period: 20 }, enabled: true },
    { name: "EMA", params: { period: 50 }, enabled: true },
    { name: "EMA", params: { period: 200 }, enabled: true },
    { name: "RSI", params: { period: 14 }, enabled: true },
    { name: "ATR", params: { period: 14 }, enabled: true }
  ],
  rules: [
    { name: "EMA Crossover", enabled: true },
    { name: "RSI Filter", enabled: true },
    { name: "Trend Filter", enabled: true }
  ],
  risk: {
    maxPositionSizePercent: 2,
    maxLeverage: 5,
    stopLossAtrMultiplier: 2,
    takeProfitAtrMultiplier: 3,
    maxDrawdownPercent: 10,
    maxOpenPositions: 1,
    cooldownAfterLossMs: 21600000  // 6 hours
  }
}
```

## Self-Critique System

Every 5 closed trades, the system:

1. **Analyzes performance**: Win rate, expectancy, R-multiple, stop hit rate
2. **Identifies patterns**: What worked, what didn't, failure patterns
3. **Recommends changes**: Only whitelisted parameters within safe bounds
4. **Auto-applies safe changes**: With full rollback capability

### Whitelisted Parameters

Only these parameters can be auto-adjusted:

- `indicators.rsi.overbought` (65-80)
- `indicators.rsi.oversold` (20-35)
- `indicators.atr.multiplier` (1.5-3.0)
- `risk.cooldownAfterLossMs` (2h-12h)

### Forbidden Parameters

These are NEVER auto-adjusted:

- `risk.maxLeverage`
- `risk.maxDrawdownPercent`
- `risk.stopLossAtrMultiplier` (can only be widened, not tightened)

## Safety Features

- **Paper trading by default**: Must explicitly enable live trading
- **Max drawdown protection**: Auto-stops bot when exceeded
- **Cooldown after losses**: Prevents revenge trading
- **Position size limits**: Based on equity percentage
- **Leverage limits**: Configurable max leverage
- **Parameter bounds**: Auto-tuning stays within safe ranges
- **Full rollback**: Revert any parameter change

## Tech Stack

- **Runtime**: Node.js 18+, TypeScript 5
- **Monorepo**: pnpm workspaces
- **Database**: PostgreSQL + Prisma
- **API**: Fastify + WebSocket
- **Frontend**: Next.js 14 + TailwindCSS + KLineCharts
- **Validation**: Zod schemas

## License

MIT

## Disclaimer

⚠️ **This is not financial advice.** Trading cryptocurrencies involves substantial risk of loss. Use paper trading mode first. Never trade with funds you cannot afford to lose. The authors are not responsible for any financial losses incurred through the use of this software.
