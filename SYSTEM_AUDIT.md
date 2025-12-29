# 🔍 WATCHTOWER TRADING SYSTEM - AUDIT COMPLET

> Document de référence pour GPTs et développeurs
> Dernière mise à jour: 29 Décembre 2024

---

## 📊 ARCHITECTURE GLOBALE

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│  apps/web/                                                       │
│  ├── /trade      → Interface de trading principale              │
│  ├── /bots       → Liste des bots utilisateur (max 5)           │
│  ├── /bots/create → Bot Builder (templates, no-code, AI)        │
│  ├── /library    → Bibliothèque communautaire                   │
│  ├── /backtest   → Backtesting avec simulation Grok             │
│  └── /profile    → Profil utilisateur                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API (Fastify)                             │
│  services/api/                                                   │
│  ├── /api/user-bots  → CRUD bots par wallet                     │
│  ├── /api/library    → Bibliothèque communautaire               │
│  ├── /api/trading    → Signaux, positions, ordres               │
│  ├── /api/backtest   → Backtesting engine                       │
│  ├── /api/grok       → Intégration Grok AI                      │
│  └── /api/market     → Données de marché                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CORE ENGINE (packages/core)                  │
│  ├── BotRunner       → Exécution des bots                       │
│  ├── StrategyEngine  → Analyse technique + signaux              │
│  ├── RiskEngine      → Gestion du risque                        │
│  ├── ExecutionEngine → Exécution des ordres                     │
│  ├── RealtimeData    → Orderbook, funding, liquidations         │
│  └── GrokService     → Analyse AI                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      HYPERLIQUID L1                              │
│  ├── WebSocket: wss://api.hyperliquid.xyz/ws                    │
│  ├── REST API: https://api.hyperliquid.xyz/info                 │
│  └── Execution: Ordres, positions, compte                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🤖 CE QUE LE BOT PEUT VOIR (DONNÉES DISPONIBLES)

### 1. DONNÉES OHLC (Candles)
```typescript
interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```
- **Timeframes**: 1m, 5m, 15m, 1h, 4h, 1d, 1w
- **Source**: Hyperliquid API
- **Historique**: 30 jours par défaut

### 2. ORDERBOOK EN TEMPS RÉEL
```typescript
interface OrderBook {
  coin: string;
  bids: OrderBookLevel[];      // Prix + taille + nb ordres
  asks: OrderBookLevel[];
  midPrice: number;            // Prix milieu
  spread: number;              // Écart bid-ask
  spreadPct: number;           // Spread en %
  imbalance: number;           // > 0.5 = pression achat
}
```
- **Niveaux**: Top 5 par défaut
- **Mise à jour**: Temps réel via WebSocket
- **Usage**: Détecter pression achat/vente

### 3. FUNDING RATE
```typescript
interface FundingData {
  coin: string;
  fundingRate: number;         // Taux actuel
  predictedRate: number;       // Taux prédit
  openInterest: number;        // OI en USD
  timestamp: number;
}
```
- **Calcul APY**: `fundingRate * 24 * 365 * 100`
- **Signal**: Funding > 20% APY = bearish, < -20% = bullish

### 4. TRADES EN TEMPS RÉEL
```typescript
interface TradeData {
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  timestamp: number;
  hash?: string;               // TX hash on-chain
}
```
- **Volume Profile**: Ratio buy/sell sur période
- **Usage**: Détecter momentum, gros ordres

### 5. LIQUIDATIONS
```typescript
interface LiquidationData {
  coin: string;
  side: 'long' | 'short';
  price: number;
  size: number;
  timestamp: number;
}
```
- **Signal**: Liquidations longs = pression baissière
- **Usage**: Détecter cascades de liquidations

### 6. MARKET INFO
```typescript
interface MarketInfo {
  coin: string;
  maxLeverage: number;         // Ex: 50x
  tickSize: number;            // Précision prix
  stepSize: number;            // Précision taille
  minOrderSize: number;
  fundingInterval: string;     // "1 hour"
  marginType: string;          // "USD"
}
```

---

## 📈 INDICATEURS TECHNIQUES DISPONIBLES

### Indicateurs de Base (`packages/core/src/engine/indicators.ts`)

| Indicateur | Fonction | Paramètres | Usage |
|------------|----------|------------|-------|
| **SMA** | `SMA(data, period)` | period: 20, 50, 200 | Moyenne simple |
| **EMA** | `EMA(data, period)` | period: 20, 50, 200 | Moyenne exponentielle |
| **RSI** | `RSI(closes, period)` | period: 14 | Surachat/Survente |
| **ATR** | `ATR(candles, period)` | period: 14 | Volatilité |
| **MACD** | `MACD(closes, fast, slow, signal)` | 12, 26, 9 | Momentum |
| **Bollinger** | `BollingerBands(closes, period, stdDev)` | 20, 2 | Bandes de volatilité |

### Indicateurs Quantitatifs (`packages/core/src/lib/quant-indicators.ts`)

| Catégorie | Indicateur | Description |
|-----------|------------|-------------|
| **Position Sizing** | `kellyPositionSize()` | Taille optimale basée sur win rate |
| | `valueAtRisk()` | VaR à 95% confidence |
| | `conditionalVaR()` | Expected Shortfall |
| **Régime** | `hurstExponent()` | < 0.5 = mean-reversion, > 0.5 = trend |
| | `adx()` | Force de tendance (< 20 = range, > 40 = fort) |
| | `volatilityClustering()` | Ratio vol récente/historique |
| **Mean Reversion** | `zScore()` | Écarts-types de la moyenne |
| | `rollingZScore()` | Z-Score glissant |
| | `autocorrelation()` | Corrélation avec lag |
| **Momentum** | `roc()` | Rate of Change |
| | `momentumFactor()` | Score momentum normalisé |
| **Risk** | `maxAdverseExcursion()` | Pire drawdown intra-trade |
| | `skewness()` | Asymétrie des returns |
| | `kurtosis()` | Fat tails |
| | `omegaRatio()` | Gains/Pertes pondérés |
| **Performance** | `sharpeRatio()` | Return ajusté au risque |
| | `sortinoRatio()` | Sharpe avec downside only |
| | `calmarRatio()` | Return / Max DD |
| | `expectancy()` | Valeur attendue par trade |
| **Microstructure** | `orderBookImbalance()` | Ratio bid/ask volume |
| | `spreadAnalysis()` | Spread en % et bps |
| | `vwap()` | Prix moyen pondéré volume |
| | `volumeProfile()` | Distribution volume par prix |

---

## 🧠 STRATÉGIE ENGINE ACTUELLE

### Logique de Signal (`packages/core/src/engine/strategy.engine.ts`)

```typescript
// Conditions d'entrée LONG
const longEntry = 
  trendBullish &&           // Prix > EMA200
  ema20CrossAbove50 &&      // EMA20 croise au-dessus EMA50
  rsiBullish;               // RSI > 50

// Conditions d'entrée SHORT
const shortEntry = 
  trendBearish &&           // Prix < EMA200
  ema20CrossBelow50 &&      // EMA20 croise en-dessous EMA50
  rsiBearish;               // RSI < 50

// Conditions de sortie
const longExit = ema20CrossBelow50 || rsiOverbought;  // RSI > 70
const shortExit = ema20CrossAbove50 || rsiOversold;   // RSI < 30
```

### Calcul de Confidence
- Base: 50%
- +15% si alignement avec EMA200
- +15% si EMAs alignées (20 > 50 > 200)
- +10% si RSI confirme
- -10% si RSI extrême

---

## 🔄 BOTRUNNER - FLUX D'EXÉCUTION

```
1. CONNEXION
   ├── MarketDataAdapter.connect()
   ├── ExecutionAdapter.connect()
   └── RealtimeDataService.connect()

2. SOUSCRIPTIONS
   ├── subscribeOHLC(symbol, timeframe)
   ├── subscribeToL2Book(symbol)
   └── subscribeTrades(symbol)

3. BOUCLE PRINCIPALE (onCandle)
   │
   ├── Récupérer candles historiques (30 jours)
   │
   ├── StrategyEngine.processCandles()
   │   └── Calcul indicateurs + évaluation règles → Signal
   │
   ├── RealtimeDataService.getFullMarketData()
   │   ├── fundingAPY
   │   ├── orderBookImbalance
   │   ├── recentLiquidationPressure
   │   └── volumeTrend
   │
   ├── GrokService.analyzeMarket() [si disponible]
   │   └── Confirmation AI du signal
   │
   ├── RiskEngine.checkTradeAllowed()
   │   ├── Vérifier drawdown
   │   ├── Calculer position size
   │   └── Définir SL/TP
   │
   └── ExecutionEngine.executeSignal()
       └── Placer ordre sur Hyperliquid

4. CRITIQUE (tous les 5 trades fermés)
   ├── Analyser performance
   ├── Générer recommandations
   └── Appliquer ajustements sûrs
```

---

## 🎛️ CONFIGURATION BOT (BotConfig)

```typescript
interface BotConfig {
  id: string;
  name: string;
  symbol: string;                    // Ex: "BTC-PERP"
  timeframes: Timeframe[];           // ["1h", "4h"]
  
  indicators: IndicatorConfig[];     // Indicateurs actifs
  rules: RuleConfig[];               // Règles de trading
  
  risk: {
    maxPositionSizePercent: number;  // 2% par défaut
    stopLossAtrMultiplier: number;   // 2x ATR
    takeProfitAtrMultiplier?: number;
    maxOpenPositions: number;        // 1 par défaut
    maxDrawdownPercent: number;      // 10%
    cooldownAfterLossMs: number;     // 6h
    maxLeverage: number;             // 5x
  };
  
  paperTrading: boolean;
  enabled: boolean;
}
```

---

## 🆕 SYSTÈME USERBOT (Nouveau)

### Modèle de Données

```typescript
model UserBot {
  id              String   
  walletAddress   String              // Propriétaire
  name            String
  description     String?
  symbol          String              // "BTC-PERP"
  timeframe       String              // "1h"
  
  status          UserBotStatus       // DRAFT, READY, RUNNING, etc.
  strategyType    StrategyType        // TEMPLATE, CUSTOM, AI_GENERATED
  templateId      String?             // Si basé sur template
  
  strategyConfig  Json                // Indicateurs, conditions
  riskConfig      Json                // Position size, SL, TP
  
  // Stats
  totalTrades     Int
  winningTrades   Int
  totalPnl        Float
  totalPnlPct     Float
  maxDrawdown     Float
  
  // Relations
  trades          UserBotTrade[]
  remixedFrom     LibraryItem?        // Si remix
  publishedItem   LibraryItem?        // Si publié
}
```

### Limite: 5 bots par wallet

---

## 📚 BIBLIOTHÈQUE COMMUNAUTAIRE

### Types d'Items
- **BOT**: Bot complet avec config
- **STRATEGY**: Stratégie seule (indicateurs + règles)
- **TEMPLATE**: Template de départ
- **BACKTEST**: Résultat de backtest partagé

### Fonctionnalités
- Browse avec filtres (type, symbol, tags)
- Sort (trending, recent, top_rated, most_remixed)
- Remix → Copie dans mes bots
- Rating 1-5 étoiles + reviews
- Commentaires
- Vérification on-chain (tx hashes Hyperliquid)

---

## 🔧 COMMENT CRÉER UN BOT (3 MODES)

### 1. Templates
```typescript
const TEMPLATES = [
  {
    id: 'rsi_reversal',
    name: 'RSI Reversal',
    config: {
      indicators: [{ name: 'RSI', params: { period: 14 } }],
      entryConditions: [{ indicator: 'RSI', operator: '<', value: 30 }],
      exitConditions: [{ indicator: 'RSI', operator: '>', value: 70 }],
    },
    risk: { positionSizePct: 2, stopLossPct: 2, takeProfitPct: 4 },
  },
  // ... autres templates
];
```

### 2. No-Code Builder
- Sélectionner indicateurs
- Définir conditions d'entrée (IF RSI < 30 AND MACD > 0)
- Définir conditions de sortie
- Configurer risk management

### 3. AI (Grok)
```typescript
// Prompt utilisateur:
"Create a bot that buys BTC when RSI is below 30 and MACD is bullish"

// Grok génère:
{
  name: "RSI MACD Bot",
  indicators: [...],
  entryConditions: [...],
  exitConditions: [...],
  risk: {...}
}
```

---

## 🔌 INTÉGRATION HYPERLIQUID

### Adapters Disponibles

| Adapter | Type | Usage |
|---------|------|-------|
| `HyperliquidMarketDataAdapter` | Market Data | Candles, ticker |
| `HyperliquidExecutionAdapter` | Execution | Ordres, positions |
| `PaperExecutionAdapter` | Execution | Paper trading |
| `PaperMarketDataAdapter` | Market Data | Simulation |

### API Endpoints Hyperliquid

```typescript
// WebSocket
const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';

// REST
const HL_API_URL = 'https://api.hyperliquid.xyz/info';

// Subscriptions
{ method: 'subscribe', subscription: { type: 'l2Book', coin: 'BTC' } }
{ method: 'subscribe', subscription: { type: 'trades', coin: 'BTC' } }
{ method: 'subscribe', subscription: { type: 'activeAssetCtx', coin: 'BTC' } }
```

---

## 📋 CHECKLIST POUR NOUVELLE STRATÉGIE

### Données Requises
- [ ] Candles OHLC (quel timeframe?)
- [ ] Orderbook (imbalance, spread?)
- [ ] Funding rate?
- [ ] Volume profile?
- [ ] Liquidations?

### Indicateurs
- [ ] Quels indicateurs techniques?
- [ ] Quels indicateurs quantitatifs?
- [ ] Paramètres de chaque indicateur?

### Conditions
- [ ] Conditions d'entrée LONG
- [ ] Conditions d'entrée SHORT
- [ ] Conditions de sortie
- [ ] Filtres additionnels (trend, volatilité?)

### Risk Management
- [ ] Position size (% du capital)
- [ ] Stop loss (ATR multiple ou %)
- [ ] Take profit
- [ ] Max drawdown
- [ ] Max positions simultanées
- [ ] Cooldown après perte

### Validation
- [ ] Backtest sur 30-60 jours
- [ ] Vérifier win rate, Sharpe, max DD
- [ ] Paper trading avant live

---

## 🚀 COMMANDES POUR DÉMARRER

```bash
# 1. Générer Prisma client
cd packages/database
npx prisma generate
npx prisma db push

# 2. Lancer le projet
cd ../..
pnpm dev

# 3. Accéder
# Frontend: http://localhost:3000
# API: http://localhost:3001
```

---

## 📁 FICHIERS CLÉS

| Fichier | Description |
|---------|-------------|
| `packages/core/src/engine/strategy.engine.ts` | Logique de stratégie |
| `packages/core/src/engine/indicators.ts` | Indicateurs techniques |
| `packages/core/src/lib/quant-indicators.ts` | Indicateurs quantitatifs |
| `packages/core/src/services/realtime-data.service.ts` | Données temps réel |
| `services/worker/src/bot-runner.ts` | Exécution des bots |
| `services/api/src/routes/user-bots.ts` | API bots utilisateur |
| `services/api/src/routes/library.ts` | API bibliothèque |
| `packages/database/prisma/schema.prisma` | Modèles de données |

---

## 🆕 USERBOT RUNNER SYSTEM (Nouveau - Implémenté)

### Architecture UserBot

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER BOT MANAGER                             │
│  services/worker/src/user-bot-manager.ts                        │
│  ├── Singleton orchestrant tous les UserBotRunner               │
│  ├── Health checks automatiques (30s)                           │
│  ├── Sync avec base de données (60s)                            │
│  └── Gestion lifecycle (start/stop/pause/resume)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     USER BOT RUNNER                              │
│  services/worker/src/user-bot-runner.ts                         │
│  ├── Exécute un bot utilisateur individuel                      │
│  ├── Parse UserBotStrategyConfig → BotConfig                    │
│  ├── Calcule indicateurs personnalisés                          │
│  ├── Évalue conditions et règles d'entrée/sortie                │
│  ├── Intègre AI (Grok) pour confirmation                        │
│  └── Émet événements (trade_opened, trade_closed, etc.)         │
└─────────────────────────────────────────────────────────────────┘
```

### Types Ultra Complets (`packages/core/src/types/user-bot.types.ts`)

```typescript
// Sources de données personnalisables
type DataSourceType = 'ohlc' | 'orderbook' | 'trades' | 'funding' | 
                      'liquidations' | 'open_interest' | 'volume_profile';

// Indicateurs supportés (40+)
type IndicatorType = 
  // Trend: ema, sma, wma, vwma
  // Momentum: rsi, macd, stochastic, cci, williams_r, roc
  // Volatility: atr, bollinger, keltner, donchian
  // Volume: obv, vwap, mfi, ad, cmf
  // Quantitative: zscore, hurst, adx, kelly, var
  // Microstructure: orderbook_imbalance, spread, volume_delta, cvd

// Opérateurs de condition
type ConditionOperator = 
  'greater_than' | 'less_than' | 'equals' | 'not_equals' |
  'crosses_above' | 'crosses_below' | 'between' | 'outside' |
  'increasing' | 'decreasing' | 'is_bullish' | 'is_bearish';

// Configuration complète de stratégie
interface UserBotStrategyConfig {
  version: string;
  symbol: string;
  primaryTimeframe: string;
  additionalTimeframes?: string[];
  dataSources: DataSourceConfig[];
  indicators: UserIndicatorConfig[];
  conditions: TradingCondition[];
  entryRules: EntryRule[];
  exitRules: ExitRule[];
  risk: UserRiskConfig;
  ai?: AIConfig;
  advanced?: AdvancedConfig;
}
```

### API de Contrôle (`services/api/src/routes/bot-control.ts`)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/control/bots/:id/start` | POST | Démarrer un bot |
| `/api/control/bots/:id/stop` | POST | Arrêter un bot |
| `/api/control/bots/:id/pause` | POST | Mettre en pause |
| `/api/control/bots/:id/resume` | POST | Reprendre |
| `/api/control/bots/:id/status` | GET | État du bot |
| `/api/control/bots/:id/trades` | GET | Historique trades |
| `/api/control/bots/:id/performance` | GET | Métriques performance |
| `/api/control/bots/:id/config` | PATCH | Mise à jour config |
| `/api/control/bots/running` | GET | Bots en cours |

---

## 📋 TEMPLATES DE STRATÉGIES (`packages/core/src/templates/strategy-templates.ts`)

### Templates Disponibles

| Template | Catégorie | Difficulté | Description |
|----------|-----------|------------|-------------|
| **Trend Following (EMA)** | trend | beginner | EMA crossover avec RSI confirmation |
| **Mean Reversion (BB)** | mean_reversion | intermediate | Bollinger Bands + RSI extremes |
| **Momentum Scalping** | scalping | advanced | MACD + VWAP haute fréquence |
| **Breakout (Donchian)** | breakout | intermediate | Donchian channels + ADX |
| **AI-Assisted** | trend | beginner | Analyse technique + Grok AI |

### Exemple Template

```typescript
const trendFollowingTemplate = {
  id: 'trend-following-ema',
  name: 'Trend Following (EMA Crossover)',
  category: 'trend',
  difficulty: 'beginner',
  
  defaultConfig: {
    indicators: [
      { id: 'ema_fast', type: 'ema', params: [{ name: 'period', value: 20 }] },
      { id: 'ema_slow', type: 'ema', params: [{ name: 'period', value: 50 }] },
      { id: 'rsi', type: 'rsi', params: [{ name: 'period', value: 14 }] },
    ],
    conditions: [
      { id: 'ema_cross_up', operator: 'crosses_above', source: 'ema_fast', compare: 'ema_slow' },
      { id: 'rsi_bullish', operator: 'greater_than', source: 'rsi', compare: 50 },
    ],
    entryRules: [
      { side: 'long', conditions: ['ema_cross_up', 'rsi_bullish'], logic: 'AND' },
    ],
    risk: {
      positionSizing: { method: 'fixed_percentage', basePercentage: 2 },
      stopLoss: { type: 'atr_multiple', value: 2 },
      takeProfit: { type: 'atr_multiple', value: 3 },
    },
  },
  
  backtestResults: {
    winRate: 52.3,
    totalReturn: 47.8,
    maxDrawdown: 12.4,
    sharpeRatio: 1.42,
  },
};
```

---

## 🎛️ CONFIGURATION RISK AVANCÉE

```typescript
interface UserRiskConfig {
  positionSizing: {
    method: 'fixed_percentage' | 'kelly' | 'volatility_adjusted' | 'risk_parity';
    basePercentage: number;
    maxPercentage: number;
    minPercentage: number;
    kellyFraction?: number;        // 0.25 = quarter Kelly
    volatilityLookback?: number;
  };
  
  stopLoss: {
    enabled: boolean;
    type: 'atr_multiple' | 'percentage' | 'fixed' | 'indicator' | 'swing';
    value: number;
  };
  
  takeProfit: {
    enabled: boolean;
    type: 'atr_multiple' | 'percentage' | 'fixed' | 'risk_reward';
    value: number;
    riskRewardRatio?: number;
  };
  
  trailingStop?: {
    enabled: boolean;
    activationProfit: number;      // % profit pour activer
    trailingDistance: number;
    trailingStep: number;
  };
  
  limits: {
    maxOpenPositions: number;
    maxDrawdownPercent: number;
    maxDailyLoss: number;
    maxDailyTrades: number;
    maxLeverage: number;
    cooldownAfterLossMs: number;
    maxConsecutiveLosses: number;
  };
  
  dynamicAdjustments?: {
    reduceAfterLoss: boolean;
    lossReductionFactor: number;
    increaseAfterWin: boolean;
    volatilityScaling: boolean;
  };
}
```

---

## 🤖 CONFIGURATION AI (Grok)

```typescript
interface AIConfig {
  enabled: boolean;
  provider: 'grok' | 'openai' | 'anthropic';
  mode: 'confirmation' | 'signal_generation' | 'analysis_only' | 'full_control';
  
  minConfidenceToTrade: number;    // 65 par défaut
  minConfidenceToOverride: number; // 80 pour override signal technique
  
  maxCallsPerDay: number;          // 20 par défaut
  minCooldownMs: number;           // 5 min entre appels
  
  customPrompt?: string;           // Prompt personnalisé
  
  includeContext: {
    technicalIndicators: boolean;
    orderbook: boolean;
    funding: boolean;
    recentTrades: boolean;
    marketSentiment: boolean;
  };
}
```

---

## 📁 NOUVEAUX FICHIERS CLÉS

| Fichier | Description |
|---------|-------------|
| `packages/core/src/types/user-bot.types.ts` | Types complets UserBot |
| `packages/core/src/templates/strategy-templates.ts` | Templates de stratégies |
| `services/worker/src/user-bot-runner.ts` | Exécution bots utilisateur |
| `services/worker/src/user-bot-manager.ts` | Orchestration multi-bots |
| `services/api/src/routes/bot-control.ts` | API contrôle bots |
| `services/api/src/routes/user-bots.ts` | API CRUD bots |
| `services/api/src/routes/library.ts` | API bibliothèque |
| `apps/web/src/app/bots/page.tsx` | Page liste bots |
| `apps/web/src/app/bots/create/page.tsx` | Bot Builder |
| `apps/web/src/app/library/page.tsx` | Bibliothèque communautaire |

---

## 🎯 PROCHAINES ÉTAPES

1. **Régénérer Prisma Client**
   - Fermer tous les processus node
   - `npx prisma generate && npx prisma db push`

2. **Ajouter indicateurs manquants**
   - Order Blocks
   - Fibonacci
   - Elliott Waves
   - Ichimoku

3. **Améliorer No-Code Builder**
   - UI drag-and-drop pour conditions
   - Preview en temps réel
   - Validation des règles

4. **Vérification On-Chain**
   - Sauvegarder tx hashes des trades
   - Afficher dans library
   - Permettre vérification externe

5. **WebSocket pour état temps réel**
   - Streaming état bot vers frontend
   - Notifications trades

---

*Ce document est destiné à être partagé avec des GPTs pour générer des stratégies compatibles avec le système.*
