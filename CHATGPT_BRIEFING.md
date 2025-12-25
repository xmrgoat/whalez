# Whalez Trading Agent - Briefing Complet pour ChatGPT

## Contexte du Projet

**Whalez** est un agent de trading autonome pour les marchés crypto (Hyperliquid PERPS). C'est un monorepo TypeScript avec:

- **Frontend**: Next.js 14 + KLineCharts Pro (dashboard trading)
- **API**: Fastify (REST + WebSocket)
- **Worker**: Bot de trading autonome
- **Database**: PostgreSQL + Prisma ORM
- **Core**: Adapters, stratégies, moteurs de risque

---

## Architecture Actuelle

```
trading-agent/
├── apps/
│   └── web/                    # Next.js 14 Dashboard
│       └── src/
│           ├── components/
│           │   ├── TradingChart.tsx    # KLineCharts Pro
│           │   └── WalletButton.tsx    # Connexion wallet EIP-1193
│           ├── hooks/
│           │   └── useMarketData.ts    # Hook WebSocket temps réel
│           └── app/
│               └── dashboard/page.tsx  # Page principale
├── services/
│   ├── api/                    # Fastify API
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── market.ts       # Endpoints candles/ticker
│   │       │   ├── debug.ts        # Endpoints E2E testing
│   │       │   ├── trading.ts      # Arm/disarm/kill switch
│   │       │   └── websocket.ts    # WS broadcast
│   │       └── services/
│   │           └── market-data.service.ts  # Source unique HL
│   └── worker/                 # Bot Runner
│       └── src/
│           └── bot-runner.ts   # Logique trading
├── packages/
│   ├── core/                   # Adapters + Engines
│   │   └── src/
│   │       ├── adapters/
│   │       │   ├── hyperliquid-market-data.adapter.ts
│   │       │   ├── hyperliquid-execution.adapter.ts
│   │       │   └── paper-*.adapter.ts
│   │       ├── engines/
│   │       │   ├── strategy.engine.ts
│   │       │   └── risk.engine.ts
│   │       └── services/
│   │           └── grok-client.ts  # AI grounded analysis
│   └── database/               # Prisma schema
└── scripts/
    └── e2e-smoke.ts            # Test E2E automatisé
```

---

## Ce qui FONCTIONNE (Prouvé par E2E)

### ✅ Smoke Test 6/6 PASSÉ

```
✅ API Health: API is running
✅ Market Candles: Received 6 candles, last close: $87,176
✅ WS Connected: WebSocket connected to Hyperliquid
✅ Candles Flowing: Received 1 new candles since start
✅ DB Access: Database accessible
✅ Candle Freshness: Last candle 3s ago
```

### ✅ Fonctionnalités Opérationnelles

| Feature | Status | Détails |
|---------|--------|---------|
| **Hyperliquid REST API** | ✅ | Candles BTC/ETH réelles mainnet |
| **Polling temps réel** | ✅ | Toutes les 5s (évite rate limit 429) |
| **Dashboard UI** | ✅ | Chart KLineCharts + contrôles |
| **Wallet EIP-1193** | ✅ | MetaMask/Rabby connexion |
| **API centralisée** | ✅ | MarketDataService = source unique |
| **Debug endpoints** | ✅ | `/debug/state` pour monitoring |
| **Trading control** | ✅ | `/trading/arm`, `/trading/kill` |
| **Database Prisma** | ✅ | PostgreSQL accessible |
| **Build TypeScript** | ✅ | Compile sans erreurs |

---

## Ce qui est STUB / À FAIRE

| Feature | Status | Action Requise |
|---------|--------|----------------|
| **WalletConnect v2 QR** | ❌ | Dépendances wagmi incompatibles avec Next.js 14. Actuellement EIP-1193 only (injected wallets) |
| **MegaETH Adapters** | ❌ | Interfaces définies, implémentation vide |
| **WebSocket HL direct** | ⚠️ | Messages `candle` non reçus, utilise polling fallback |
| **Ichimoku indicator** | ⚠️ | Désactivé, peut produire NaN |
| **Bot Worker E2E** | ⚠️ | Logique OK mais pas testé automatiquement |
| **Grok X API** | ⚠️ | Optionnel, "insufficient sources" sans X_BEARER_TOKEN |
| **Chart Markers** | ⚠️ | Table DB créée, UI non connectée |
| **Decisions DB** | ⚠️ | Table créée, worker ne persiste pas encore |

---

## Problème Wallet Actuel

### Symptôme
Quand l'utilisateur clique "Connect Wallet", le wallet se reconnecte automatiquement avec le dernier compte utilisé au lieu de montrer le sélecteur.

### Cause
Le wallet (MetaMask/Rabby) garde les permissions de connexion. `eth_requestAccounts` retourne directement le compte autorisé.

### Solution Implémentée
```typescript
// Force l'affichage du sélecteur de compte
await window.ethereum.request({
  method: 'wallet_requestPermissions',
  params: [{ eth_accounts: {} }],
});
```

### Limitation
- `wallet_requestPermissions` n'est pas supporté par tous les wallets
- Pour changer de réseau, l'utilisateur doit le faire dans l'extension wallet directement
- WalletConnect v2 (QR code) non fonctionnel à cause de conflits de dépendances

---

## Stack Technique

- **Frontend**: Next.js 14, React 18, TailwindCSS, KLineCharts Pro
- **Backend**: Fastify, WebSocket, Prisma
- **Database**: PostgreSQL
- **Infra**: Docker Compose (local), pnpm workspaces
- **Trading**: Hyperliquid PERPS API (REST + WS)
- **AI**: Grok API (optionnel) pour analyse macro

---

## Commandes Utiles

```bash
# Démarrer tout
pnpm --filter @whalez/api dev    # API sur :3001
pnpm --filter @whalez/web dev    # Web sur :3000

# Test E2E
pnpm e2e:smoke

# Vérifier état
curl http://localhost:3001/debug/state | jq
curl http://localhost:3001/trading/status | jq

# Armer le trading (testnet)
curl -X POST http://localhost:3001/trading/arm \
  -H "Content-Type: application/json" \
  -d '{"confirmation": "I UNDERSTAND THE RISKS", "mode": "testnet"}'
```

---

## Variables d'Environnement Clés

```env
# Hyperliquid
HL_HTTP_URL=https://api.hyperliquid.xyz
HL_WS_URL=wss://api.hyperliquid.xyz/ws
HL_ACCOUNT_ADDRESS=0x...
HL_PRIVATE_KEY=0x...

# Database
DATABASE_URL=postgresql://whalez:whalez@localhost:5432/whalez

# Trading Safety
LIVE_TRADING_ENABLED=false
MAX_LEVERAGE=3
MAX_DRAWDOWN_PCT=10
POSITION_SIZE_PCT=2

# Optional AI
GROK_API_KEY=xai-...
X_BEARER_TOKEN=AAAA...
```

---

## Questions pour V3

1. **WalletConnect v2** - Utiliser `@reown/appkit` (nouveau nom de web3modal) ou rester EIP-1193 only?

2. **WebSocket HL** - Investiguer le format de subscription correct ou rester en polling 5s?

3. **Multi-tenant** - Ajouter JWT auth sur tous les endpoints?

4. **Grok fallback** - Implémenter cache local de news?

5. **MegaETH** - Priorité d'implémentation ou attendre stabilité réseau?

---

## Résumé

**Whalez V2 est fonctionnel pour le paper trading avec données réelles Hyperliquid.**

- ✅ Dashboard affiche BTC/ETH en temps réel ($87,176)
- ✅ API centralisée (one source of truth)
- ✅ Smoke test passe 6/6
- ✅ Kill switch et gating en place
- ⚠️ WalletConnect v2 QR non fonctionnel
- ⚠️ Bot worker non testé E2E
- ❌ MegaETH non implémenté

**Prêt pour:** Paper trading, tests manuels, développement continu
**Non prêt pour:** Production mainnet, trading live sans supervision
