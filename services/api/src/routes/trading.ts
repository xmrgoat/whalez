/**
 * Trading Control Routes
 * 
 * Provides endpoints for:
 * - POST /trading/arm - Arm live trading (requires confirmation)
 * - POST /trading/disarm - Disarm live trading
 * - GET /trading/status - Get trading status
 * - POST /trading/kill - Emergency kill switch
 */

import { FastifyPluginAsync } from 'fastify';
import { enhancedGrok, HyperliquidExecutionAdapter } from '@whalez/core';
import { prisma } from '@whalez/database';
import * as pythonBridge from '../lib/python-bridge.js';
import * as tradeDB from '../lib/trade-db.js';
import * as orderManager from '../lib/order-manager.js';
import * as quantEngine from '../lib/quant-engine.js';
import * as advancedAnalysis from '../lib/advanced-analysis.js';
import * as fs from 'fs';
import * as path from 'path';

// Settings persistence file path
const SETTINGS_FILE = path.join(process.cwd(), 'data', 'bot-settings.json');
const TRADES_FILE = path.join(process.cwd(), 'data', 'trades.json');
const AGENTS_FILE = path.join(process.cwd(), 'data', 'agents.json');

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Load settings from file
function loadPersistedSettings(): Map<string, any> {
  try {
    ensureDataDir();
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      console.log(`[Trading] 📂 Loaded ${Object.keys(parsed).length} user settings from file`);
      return new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error('[Trading] Failed to load settings:', error);
  }
  return new Map();
}

// Save settings to file
function persistSettings(settings: Map<string, any>) {
  try {
    ensureDataDir();
    const obj = Object.fromEntries(settings);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(obj, null, 2));
    console.log(`[Trading] 💾 Persisted ${settings.size} user settings to file`);
  } catch (error) {
    console.error('[Trading] Failed to persist settings:', error);
  }
}

// Load trades from file
function loadPersistedTrades(): typeof tradeHistory {
  try {
    ensureDataDir();
    if (fs.existsSync(TRADES_FILE)) {
      const data = fs.readFileSync(TRADES_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      console.log(`[Trading] 📂 Loaded ${parsed.length} trades from file`);
      return parsed;
    }
  } catch (error) {
    console.error('[Trading] Failed to load trades from file:', error);
  }
  return [];
}

// Save trades to file
function persistTrades() {
  try {
    ensureDataDir();
    fs.writeFileSync(TRADES_FILE, JSON.stringify(tradeHistory, null, 2));
  } catch (error) {
    console.error('[Trading] Failed to persist trades:', error);
  }
}

// Load agent credentials from file
function loadPersistedAgents(): Map<string, AgentCredentials> {
  try {
    ensureDataDir();
    if (fs.existsSync(AGENTS_FILE)) {
      const data = fs.readFileSync(AGENTS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      console.log(`[Trading] 📂 Loaded ${Object.keys(parsed).length} agent credentials from file`);
      return new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error('[Trading] Failed to load agents:', error);
  }
  return new Map();
}

// Save agent credentials to file
function persistAgents() {
  try {
    ensureDataDir();
    const obj = Object.fromEntries(userAgents);
    fs.writeFileSync(AGENTS_FILE, JSON.stringify(obj, null, 2));
    console.log(`[Trading] 💾 Persisted ${userAgents.size} agent credentials to file`);
  } catch (error) {
    console.error('[Trading] Failed to persist agents:', error);
  }
}

// Hyperliquid fee rate
const HL_TAKER_FEE = 0.00035;
const HL_MAKER_FEE = 0.0002;

// Calculate fees (entry + exit)
function calculateFees(price: number, quantity: number): number {
  return price * quantity * HL_TAKER_FEE;
}

// Calculate total round-trip fees (entry + exit)
function calculateRoundTripFees(entryPrice: number, exitPrice: number, quantity: number): number {
  const entryFee = entryPrice * quantity * HL_TAKER_FEE;
  const exitFee = exitPrice * quantity * HL_TAKER_FEE;
  return entryFee + exitFee;
}

// Check if a trade is profitable after fees
interface TradeProfitability {
  isProfitable: boolean;
  potentialProfit: number;
  totalFees: number;
  netProfit: number;
  breakEvenMove: number; // % move needed to break even
  minRecommendedSize: number; // Minimum size for profitable trade
}

function checkTradeProfitability(
  entryPrice: number,
  takeProfit: number,
  stopLoss: number,
  quantity: number,
  side: 'buy' | 'sell'
): TradeProfitability {
  // Calculate potential profit at TP
  const tpDistance = side === 'buy' 
    ? takeProfit - entryPrice 
    : entryPrice - takeProfit;
  const potentialProfit = tpDistance * quantity;
  
  // Calculate total fees (entry + exit)
  const entryFee = entryPrice * quantity * HL_TAKER_FEE;
  const exitFee = takeProfit * quantity * HL_TAKER_FEE;
  const totalFees = entryFee + exitFee;
  
  // Net profit after fees
  const netProfit = potentialProfit - totalFees;
  
  // Calculate break-even move (% price change needed to cover fees)
  const breakEvenMove = (totalFees / (entryPrice * quantity)) * 100;
  
  // Calculate minimum size for profitable trade (where profit > fees)
  // For a trade to be profitable: tpDistance * size > 2 * entryPrice * size * fee
  // Simplifies to: tpDistance > 2 * entryPrice * fee
  // Min notional = totalFees / (tpDistance / entryPrice)
  const tpPct = Math.abs(tpDistance / entryPrice);
  const minNotionalForProfit = tpPct > 0 ? (2 * HL_TAKER_FEE * entryPrice) / tpPct : Infinity;
  const minRecommendedSize = minNotionalForProfit / entryPrice;
  
  return {
    isProfitable: netProfit > 0,
    potentialProfit,
    totalFees,
    netProfit,
    breakEvenMove,
    minRecommendedSize,
  };
}

// Calculate and round position size based on Hyperliquid requirements
// Also considers fees to ensure trades are profitable
function calculatePositionSize(
  equity: number,
  positionSizePct: number,
  currentPrice: number,
  minNotional: number = 10,
  takeProfitPct: number = 4 // Expected TP % to calculate min profitable size
): { size: number; notional: number; warning: string | null } {
  let positionSize = (equity * positionSizePct / 100) / currentPrice;
  let warning: string | null = null;
  
  // Calculate minimum notional for profitable trade
  // For a trade to be profitable: TP_profit > 2 * fees
  // TP_profit = notional * tpPct/100
  // Fees = notional * 2 * 0.00035 = notional * 0.0007
  // So: notional * tpPct/100 > notional * 0.0007 * 2 (for 2x fee coverage)
  // This means: tpPct/100 > 0.0014, which is always true for tpPct > 0.14%
  // But for small accounts, we need: notional * (tpPct/100 - 0.0007) > $0.01 (min profit)
  const minProfitableNotional = 0.01 / (takeProfitPct / 100 - 2 * HL_TAKER_FEE);
  const effectiveMinNotional = Math.max(minNotional, minProfitableNotional);
  
  // Ensure minimum notional value
  const notionalValue = positionSize * currentPrice;
  if (notionalValue < effectiveMinNotional) {
    // Check if we can afford the minimum
    if (equity * 0.5 >= effectiveMinNotional) { // Don't use more than 50% of equity
      positionSize = effectiveMinNotional / currentPrice;
      warning = `Position size increased to minimum profitable size: $${effectiveMinNotional.toFixed(2)}`;
    } else {
      warning = `Account too small for profitable trades. Need at least $${(effectiveMinNotional * 2).toFixed(2)} equity`;
    }
  }
  
  // Cap position size at 10% of equity for risk management
  const maxPositionSize = (equity * 0.1) / currentPrice;
  if (positionSize > maxPositionSize) {
    positionSize = maxPositionSize;
  }
  
  // Round position size based on price (Hyperliquid requirements)
  if (currentPrice < 1) {
    positionSize = Math.ceil(positionSize); // Whole numbers for cheap coins
  } else if (currentPrice < 10) {
    positionSize = Math.ceil(positionSize * 10) / 10; // 1 decimal
  } else if (currentPrice < 100) {
    positionSize = Math.ceil(positionSize * 100) / 100; // 2 decimals
  } else if (currentPrice < 1000) {
    positionSize = Math.ceil(positionSize * 1000) / 1000; // 3 decimals
  } else {
    positionSize = Math.ceil(positionSize * 10000) / 10000; // 4 decimals for BTC
  }
  
  return {
    size: positionSize,
    notional: positionSize * currentPrice,
    warning,
  };
}

// Hyperliquid execution adapter for real trades
let executionAdapter: HyperliquidExecutionAdapter | null = null;

// Agent credentials for user wallets
interface AgentCredentials {
  agentAddress: string;
  agentPrivateKey: string;
  masterAddress: string;
  agentName: string;
  approvedAt: number;
}

// Store agent credentials per user (loaded from file on startup)
const userAgents: Map<string, AgentCredentials> = loadPersistedAgents();

// Helper function to get agent args for Python bridge
function getAgentArgs(userWallet?: string | null): string {
  if (!userWallet) return '';
  
  const agent = userAgents.get(userWallet.toLowerCase());
  if (!agent) {
    // No agent registered - use the wallet address directly for balance queries
    // The Python bridge will use env vars for trading but this wallet for balance
    return `--master=${userWallet}`;
  }
  
  return `--agent-key=${agent.agentPrivateKey} --master=${agent.masterAddress}`;
}

// Trading state (in-memory, persisted to env check)
interface TradingState {
  armed: boolean;
  armedAt: number | null;
  armedBy: string | null;
  mode: 'paper' | 'testnet' | 'mainnet';
  killSwitchActive: boolean;
  killReason: string | null;
  dailyLoss: number;
  dailyLossLimit: number;
  maxDrawdown: number;
  currentDrawdown: number;
  maxPositionSize: number;
  activeUserWallet: string | null; // The user wallet currently trading
}

const state: TradingState = {
  armed: false,
  armedAt: null,
  armedBy: null,
  mode: 'paper',
  killSwitchActive: false,
  killReason: null,
  dailyLoss: 0,
  dailyLossLimit: parseFloat(process.env['MAX_DAILY_LOSS_PCT'] || '5'),
  maxDrawdown: parseFloat(process.env['MAX_DRAWDOWN_PCT'] || '10'),
  currentDrawdown: 0,
  maxPositionSize: parseFloat(process.env['POSITION_SIZE_PCT'] || '2'),
  activeUserWallet: null,
};

// Check if live trading is allowed by environment
function isLiveTradingEnabled(): boolean {
  return process.env['LIVE_TRADING_ENABLED'] === 'true';
}

// Check if we're on testnet
function isTestnet(): boolean {
  return process.env['HL_NETWORK'] === 'testnet';
}

export const tradingRoutes: FastifyPluginAsync = async (fastify) => {
  
  /**
   * GET /trading/status
   * Get current trading status
   */
  fastify.get('/status', async () => {
    return {
      armed: state.armed,
      armedAt: state.armedAt,
      mode: state.mode,
      killSwitchActive: state.killSwitchActive,
      killReason: state.killReason,
      
      // Safety limits
      limits: {
        dailyLossLimit: state.dailyLossLimit,
        maxDrawdown: state.maxDrawdown,
        maxPositionSize: state.maxPositionSize,
      },
      
      // Current state
      current: {
        dailyLoss: state.dailyLoss,
        currentDrawdown: state.currentDrawdown,
      },
      
      // Environment checks
      env: {
        liveTradingEnabled: isLiveTradingEnabled(),
        isTestnet: isTestnet(),
        hlNetwork: process.env['HL_NETWORK'] || 'not_set',
        hlAccountConfigured: !!process.env['HL_ACCOUNT_ADDRESS'],
        hlKeyConfigured: !!process.env['HL_PRIVATE_KEY'],
      },
      
      timestamp: Date.now(),
    };
  });

  /**
   * POST /trading/register-agent
   * Register an agent wallet for a user (after they approve via MetaMask)
   */
  fastify.post('/register-agent', async (request) => {
    const { masterAddress, agentAddress, agentPrivateKey, agentName } = request.body as {
      masterAddress: string;
      agentAddress: string;
      agentPrivateKey: string;
      agentName: string;
    };

    if (!masterAddress || !agentAddress || !agentPrivateKey) {
      return { success: false, error: 'Missing required fields' };
    }

    // Store the agent credentials
    const credentials: AgentCredentials = {
      agentAddress,
      agentPrivateKey,
      masterAddress: masterAddress.toLowerCase(),
      agentName: agentName || 'WhalezBot',
      approvedAt: Date.now(),
    };

    userAgents.set(masterAddress.toLowerCase(), credentials);
    persistAgents(); // Save to file for persistence across restarts
    console.log(`[Trading] Registered agent ${agentAddress} for user ${masterAddress}`);

    return { 
      success: true, 
      message: 'Agent registered successfully',
      agentAddress,
    };
  });

  /**
   * GET /trading/agent-status
   * Check if a user has a registered agent
   */
  fastify.get('/agent-status', async (request) => {
    const { wallet } = request.query as { wallet?: string };
    
    if (!wallet) {
      return { hasAgent: false, error: 'Wallet address required' };
    }

    const agent = userAgents.get(wallet.toLowerCase());
    
    return {
      hasAgent: !!agent,
      agentAddress: agent?.agentAddress || null,
      agentName: agent?.agentName || null,
      approvedAt: agent?.approvedAt || null,
    };
  });

  /**
   * POST /trading/revoke-agent
   * Revoke an agent for a user
   */
  fastify.post('/revoke-agent', async (request) => {
    const { wallet } = request.body as { wallet: string };
    
    if (!wallet) {
      return { success: false, error: 'Wallet address required' };
    }

    const deleted = userAgents.delete(wallet.toLowerCase());
    
    return {
      success: deleted,
      message: deleted ? 'Agent revoked' : 'No agent found for this wallet',
    };
  });

  /**
   * POST /trading/cancel-all-orders
   * Cancel all open orders (useful to clean up spam)
   */
  fastify.post('/cancel-all-orders', async (request) => {
    const { coin } = request.body as { coin?: string };
    const agentArgs = getAgentArgs(state.activeUserWallet);
    
    console.log(`[Trading] 🗑️ Cancelling all orders${coin ? ` for ${coin}` : ''}...`);
    
    try {
      const result = await pythonBridge.cancelAllOrders(coin, agentArgs);
      
      if (result.success) {
        console.log(`[Trading] ✅ Cancelled ${result.cancelledCount} orders`);
        return {
          success: true,
          cancelledCount: result.cancelledCount,
          errorCount: result.errorCount,
          message: `Cancelled ${result.cancelledCount} orders${result.errorCount ? ` (${result.errorCount} errors)` : ''}`,
        };
      } else {
        return { success: false, error: result.error };
      }
    } catch (err) {
      console.error('[Trading] ❌ Cancel all orders error:', err);
      return { success: false, error: String(err) };
    }
  });

  /**
   * GET /trading/open-orders
   * Get all open orders
   */
  fastify.get('/open-orders', async () => {
    const agentArgs = getAgentArgs(state.activeUserWallet);
    
    try {
      const result = await pythonBridge.getOpenOrders(agentArgs);
      return result;
    } catch (err) {
      return { success: false, error: String(err), orders: [], count: 0 };
    }
  });

  /**
   * GET /trading/quant-metrics
   * Get quantitative performance metrics (Sharpe, Sortino, Kelly, Drawdown, etc.)
   */
  fastify.get('/quant-metrics', async () => {
    const performance = quantEngine.calculatePerformanceMetrics();
    const kelly = quantEngine.calculateKellyCriterion(10);
    const agentArgs = getAgentArgs(state.activeUserWallet);
    
    // Get current equity for drawdown calculation
    let drawdownState = null;
    try {
      const balanceResult = await pythonBridge.getBalance(agentArgs);
      if (balanceResult.success && balanceResult.accountValue) {
        drawdownState = quantEngine.updateDrawdownState(balanceResult.accountValue, botSettings.maxDrawdownPct || 10);
      }
    } catch (err) {
      // Ignore balance fetch errors
    }
    
    // Analyze pairs if enabled
    let pairsAnalysis = null;
    if (botSettings.enablePairsTrading && botSettings.tradingBag.length >= 2) {
      pairsAnalysis = quantEngine.analyzePairs(botSettings.tradingBag);
    }
    
    return {
      success: true,
      performance: {
        sharpeRatio: performance.sharpeRatio,
        sortinoRatio: performance.sortinoRatio,
        calmarRatio: performance.calmarRatio,
        profitFactor: performance.profitFactor,
        winRate: performance.winRate,
        avgReturn: performance.avgReturn,
        volatility: performance.volatility,
        maxDrawdown: performance.maxDrawdown,
        totalReturn: performance.totalReturn,
        tradesCount: performance.tradesCount,
      },
      kelly: {
        kellyFraction: kelly.kellyFraction,
        halfKelly: kelly.halfKelly,
        recommendedRiskPct: kelly.recommendedRiskPct,
        winRate: kelly.winRate,
        avgWin: kelly.avgWin,
        avgLoss: kelly.avgLoss,
        expectancy: kelly.expectancy,
      },
      drawdown: drawdownState ? {
        currentDrawdownPct: drawdownState.drawdownPct,
        maxDrawdown: drawdownState.maxDrawdown,
        peakEquity: drawdownState.peakEquity,
        currentEquity: drawdownState.currentEquity,
        isInDrawdown: drawdownState.isInDrawdown,
        shouldReduceSize: drawdownState.shouldReduceSize,
        shouldPause: drawdownState.shouldPause,
        sizeMultiplier: drawdownState.sizeMultiplier,
      } : null,
      pairsTrading: pairsAnalysis ? {
        pairsCount: pairsAnalysis.pairs.length,
        bestPair: pairsAnalysis.bestPair ? {
          pair: pairsAnalysis.bestPair.pair,
          correlation: pairsAnalysis.bestPair.correlation,
          cointegrationScore: pairsAnalysis.bestPair.cointegrationScore,
          spreadZScore: pairsAnalysis.bestPair.spreadZScore,
          signal: pairsAnalysis.bestPair.signal,
        } : null,
        opportunities: pairsAnalysis.tradingOpportunities.map(p => ({
          pair: p.pair,
          signal: p.signal,
          spreadZScore: p.spreadZScore,
        })),
      } : null,
      settings: {
        maxDrawdownPct: botSettings.maxDrawdownPct,
        enablePairsTrading: botSettings.enablePairsTrading,
        enableQuantSignals: botSettings.enableQuantSignals,
      },
    };
  });

  /**
   * POST /trading/arm
   * Arm live trading - requires multiple confirmations
   */
  fastify.post('/arm', {
    schema: {
      body: {
        type: 'object',
        required: ['confirmation', 'mode'],
        properties: {
          confirmation: { type: 'string' },
          mode: { type: 'string', enum: ['testnet', 'mainnet'] },
        },
      },
    },
  }, async (request, reply) => {
    const { confirmation, mode } = request.body as {
      confirmation: string;
      mode: 'testnet' | 'mainnet';
    };

    // Check 1: Environment allows live trading
    if (!isLiveTradingEnabled()) {
      return reply.status(403).send({
        error: 'Live trading not enabled',
        message: 'Set LIVE_TRADING_ENABLED=true in environment',
      });
    }

    // Check 2: Confirmation phrase
    const expectedPhrase = 'I UNDERSTAND THE RISKS';
    if (confirmation !== expectedPhrase) {
      return reply.status(400).send({
        error: 'Invalid confirmation',
        message: `Type exactly: "${expectedPhrase}"`,
      });
    }

    // Check 3: Mode matches environment
    if (mode === 'mainnet' && isTestnet()) {
      return reply.status(400).send({
        error: 'Mode mismatch',
        message: 'Cannot arm mainnet when HL_NETWORK=testnet',
      });
    }

    if (mode === 'testnet' && !isTestnet()) {
      return reply.status(400).send({
        error: 'Mode mismatch',
        message: 'Cannot arm testnet when HL_NETWORK=mainnet',
      });
    }

    // Check 4: HL credentials configured
    if (!process.env['HL_ACCOUNT_ADDRESS'] || !process.env['HL_PRIVATE_KEY']) {
      return reply.status(400).send({
        error: 'Credentials not configured',
        message: 'Set HL_ACCOUNT_ADDRESS and HL_PRIVATE_KEY',
      });
    }

    // Check 5: Kill switch not active
    if (state.killSwitchActive) {
      return reply.status(403).send({
        error: 'Kill switch active',
        message: `Trading halted: ${state.killReason}`,
      });
    }

    // All checks passed - arm trading
    state.armed = true;
    state.armedAt = Date.now();
    state.armedBy = (request as any).user?.id || 'api';
    state.mode = mode;

    console.log(`[Trading] ARMED for ${mode} by ${state.armedBy}`);

    return {
      success: true,
      armed: true,
      mode,
      armedAt: state.armedAt,
      message: `Trading armed for ${mode}. Be careful!`,
    };
  });

  /**
   * POST /trading/disarm
   * Disarm live trading
   */
  fastify.post('/disarm', async () => {
    const wasArmed = state.armed;
    
    state.armed = false;
    state.armedAt = null;
    state.armedBy = null;
    state.mode = 'paper';

    console.log('[Trading] DISARMED');

    return {
      success: true,
      armed: false,
      wasArmed,
      message: 'Trading disarmed. Now in paper mode.',
    };
  });

  /**
   * POST /trading/kill
   * Emergency kill switch - stops all trading immediately
   */
  fastify.post('/kill', {
    schema: {
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { reason } = request.body as { reason: string };

    // Activate kill switch
    state.killSwitchActive = true;
    state.killReason = reason;
    state.armed = false;
    state.armedAt = null;
    state.mode = 'paper';

    console.log(`[Trading] KILL SWITCH ACTIVATED: ${reason}`);

    // TODO: Close all open positions
    // TODO: Cancel all pending orders
    // TODO: Notify via webhook/email

    return {
      success: true,
      killSwitchActive: true,
      reason,
      message: 'Kill switch activated. All trading halted.',
      timestamp: Date.now(),
    };
  });

  /**
   * POST /trading/reset-kill
   * Reset kill switch (requires confirmation)
   */
  fastify.post('/reset-kill', {
    schema: {
      body: {
        type: 'object',
        required: ['confirmation'],
        properties: {
          confirmation: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { confirmation } = request.body as { confirmation: string };

    if (confirmation !== 'RESET KILL SWITCH') {
      return reply.status(400).send({
        error: 'Invalid confirmation',
        message: 'Type exactly: "RESET KILL SWITCH"',
      });
    }

    state.killSwitchActive = false;
    state.killReason = null;

    console.log('[Trading] Kill switch reset');

    return {
      success: true,
      killSwitchActive: false,
      message: 'Kill switch reset. Trading can be re-armed.',
    };
  });

  /**
   * POST /trading/update-limits
   * Update safety limits
   */
  fastify.post('/update-limits', {
    schema: {
      body: {
        type: 'object',
        properties: {
          dailyLossLimit: { type: 'number', minimum: 1, maximum: 20 },
          maxDrawdown: { type: 'number', minimum: 5, maximum: 25 },
          maxPositionSize: { type: 'number', minimum: 0.5, maximum: 10 },
        },
      },
    },
  }, async (request) => {
    const { dailyLossLimit, maxDrawdown, maxPositionSize } = request.body as {
      dailyLossLimit?: number;
      maxDrawdown?: number;
      maxPositionSize?: number;
    };

    if (dailyLossLimit !== undefined) {
      state.dailyLossLimit = dailyLossLimit;
    }
    if (maxDrawdown !== undefined) {
      state.maxDrawdown = maxDrawdown;
    }
    if (maxPositionSize !== undefined) {
      state.maxPositionSize = maxPositionSize;
    }

    return {
      success: true,
      limits: {
        dailyLossLimit: state.dailyLossLimit,
        maxDrawdown: state.maxDrawdown,
        maxPositionSize: state.maxPositionSize,
      },
    };
  });

  /**
   * POST /trading/record-loss
   * Record a loss for daily tracking (called by worker)
   */
  fastify.post('/record-loss', {
    schema: {
      body: {
        type: 'object',
        required: ['amount'],
        properties: {
          amount: { type: 'number' },
        },
      },
    },
  }, async (request) => {
    const { amount } = request.body as { amount: number };

    state.dailyLoss += amount;

    // Check if daily loss limit exceeded
    if (state.dailyLoss >= state.dailyLossLimit) {
      state.killSwitchActive = true;
      state.killReason = `Daily loss limit exceeded: ${state.dailyLoss.toFixed(2)}%`;
      state.armed = false;
      
      console.log(`[Trading] KILL SWITCH: ${state.killReason}`);
    }

    return {
      dailyLoss: state.dailyLoss,
      dailyLossLimit: state.dailyLossLimit,
      killSwitchActive: state.killSwitchActive,
    };
  });

  /**
   * POST /trading/simulate-event
   * Simulate a market event to trigger Grok analysis (for testing)
   */
  fastify.post('/simulate-event', {
    schema: {
      body: {
        type: 'object',
        properties: {
          eventType: { type: 'string', enum: ['volatility_spike', 'momentum', 'rsi_extreme', 'force_analysis', 'force_trade'] },
          symbol: { type: 'string' },
          direction: { type: 'string', enum: ['long', 'short'] },
        },
      },
    },
  }, async (request) => {
    const { eventType, symbol, direction } = request.body as { eventType?: string; symbol?: string; direction?: 'long' | 'short' };
    
    if (!state.armed) {
      return { success: false, error: 'Bot is not armed. Click Start first.' };
    }
    
    console.log(`[Trading] 🧪 SIMULATING EVENT: ${eventType || 'force_analysis'} on ${symbol || 'all pairs'} ${direction ? `(${direction})` : ''}`);
    
    // If force_trade with specific symbol and direction, execute directly
    if (eventType === 'force_trade' && symbol && direction) {
      return await forceTradeOnSymbol(symbol, direction);
    }
    
    // Force a Grok analysis
    await runAnalysis(true);
    
    return {
      success: true,
      message: `Simulated ${eventType || 'force_analysis'} event. Check logs for Grok analysis.`,
      lastAnalysis: lastAnalysis,
    };
  });

  /**
   * POST /trading/test-workflow
   * Test the complete trading workflow with multiple trades
   * This endpoint tests: price fetch, balance check, position sizing, SL/TP calculation, order execution
   */
  fastify.post('/test-workflow', async (request) => {
    const { trades } = request.body as { trades?: Array<{ symbol: string; direction: 'long' | 'short' }> };
    
    if (!state.armed) {
      return { success: false, error: 'Bot is not armed. Click Start first.' };
    }
    
    const defaultTrades = [
      { symbol: 'BTC-PERP', direction: 'long' as const },
      { symbol: 'BTC-PERP', direction: 'short' as const },
      { symbol: 'MEGA-PERP', direction: 'long' as const },
      { symbol: 'HYPE-PERP', direction: 'long' as const },
      { symbol: 'TAO-PERP', direction: 'long' as const },
    ];
    
    const tradesToExecute = trades || defaultTrades;
    const results: Array<{ symbol: string; direction: string; success: boolean; message: string; details?: any }> = [];
    
    console.log(`[Test Workflow] 🧪 Starting workflow test with ${tradesToExecute.length} trades...`);
    console.log(`[Test Workflow] ⚙️ Mode: ${botSettings.tradingMode} | Smart SL/TP: ${botSettings.useSmartSLTP ? 'ON' : 'OFF'} | Trailing: ${botSettings.enableTrailingStop ? 'ON' : 'OFF'}`);
    
    for (const trade of tradesToExecute) {
      console.log(`\n[Test Workflow] ═══════════════════════════════════════════`);
      console.log(`[Test Workflow] 📊 Testing ${trade.direction.toUpperCase()} on ${trade.symbol}`);
      console.log(`[Test Workflow] ═══════════════════════════════════════════`);
      
      try {
        const result = await forceTradeOnSymbol(trade.symbol, trade.direction);
        
        results.push({
          symbol: trade.symbol,
          direction: trade.direction,
          success: result.success,
          message: result.success ? `Trade executed successfully` : (result.error || 'Unknown error'),
          details: result.success ? {
            price: result.trade?.price,
            quantity: result.trade?.quantity,
            stopLoss: result.trade?.stopLoss,
            takeProfit: result.trade?.takeProfit,
            leverage: result.trade?.leverage,
          } : undefined,
        });
        
        if (result.success) {
          console.log(`[Test Workflow] ✅ ${trade.symbol} ${trade.direction.toUpperCase()} - SUCCESS`);
        } else {
          console.log(`[Test Workflow] ❌ ${trade.symbol} ${trade.direction.toUpperCase()} - FAILED: ${result.error}`);
        }
        
        // Longer delay between trades to avoid rate limiting (HyperLiquid has strict limits)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        results.push({
          symbol: trade.symbol,
          direction: trade.direction,
          success: false,
          message: `Error: ${error}`,
        });
        console.log(`[Test Workflow] ❌ ${trade.symbol} ${trade.direction.toUpperCase()} - ERROR: ${error}`);
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`\n[Test Workflow] ═══════════════════════════════════════════`);
    console.log(`[Test Workflow] 📊 WORKFLOW TEST COMPLETE`);
    console.log(`[Test Workflow] ✅ Success: ${successCount} | ❌ Failed: ${failCount}`);
    console.log(`[Test Workflow] ═══════════════════════════════════════════\n`);
    
    return {
      success: true,
      summary: {
        total: tradesToExecute.length,
        successful: successCount,
        failed: failCount,
        mode: botSettings.tradingMode,
        smartSLTP: botSettings.useSmartSLTP,
        trailingStop: botSettings.enableTrailingStop,
      },
      results,
    };
  });

  /**
   * GET /trading/settings
   * Get current bot settings
   */
  fastify.get('/settings', async (request) => {
    const { wallet } = request.query as { wallet?: string };
    
    // Get user-specific settings or default
    const settings = wallet ? userBotSettings.get(wallet.toLowerCase()) || botSettings : botSettings;
    
    return {
      success: true,
      settings,
    };
  });

  /**
   * POST /trading/settings
   * Update bot settings (persisted per user)
   */
  fastify.post('/settings', async (request) => {
    const { 
      wallet,
      botName,
      tradingMode,
      dynamicLeverage,
      maxLeverage,
      minConfirmations,
      userPrompt,
      tradingBag,
      positionSizePct,
      stopLossPct,
      takeProfitPct,
    } = request.body as Partial<BotSettings> & { wallet?: string };

    // Get current settings for this user or default
    const currentSettings = wallet 
      ? userBotSettings.get(wallet.toLowerCase()) || { ...botSettings }
      : botSettings;

    // Update only provided fields
    const updatedSettings: BotSettings = {
      botName: botName ?? currentSettings.botName,
      tradingMode: tradingMode ?? currentSettings.tradingMode,
      dynamicLeverage: dynamicLeverage ?? currentSettings.dynamicLeverage,
      maxLeverage: Math.min(maxLeverage ?? currentSettings.maxLeverage, 50), // Cap at 50x (varies by pair)
      minConfirmations: minConfirmations ?? currentSettings.minConfirmations,
      userPrompt: userPrompt ?? currentSettings.userPrompt,
      tradingBag: tradingBag ?? currentSettings.tradingBag,
      positionSizePct: Math.min(positionSizePct ?? currentSettings.positionSizePct, 10), // Cap at 10%
      stopLossPct: stopLossPct ?? currentSettings.stopLossPct,
      takeProfitPct: takeProfitPct ?? currentSettings.takeProfitPct,
      maxSimultaneousPositions: Math.min((currentSettings as any).maxSimultaneousPositions ?? 3, 5), // Cap at 5
      // Advanced algorithmic settings - preserve existing or use defaults
      enableTrailingStop: (currentSettings as any).enableTrailingStop ?? true,
      trailingStopActivation: (currentSettings as any).trailingStopActivation ?? 0.3,
      trailingStopDistance: (currentSettings as any).trailingStopDistance ?? 0.15,
      useSmartSLTP: (currentSettings as any).useSmartSLTP ?? true,
      enableSessionFilter: (currentSettings as any).enableSessionFilter ?? true,
      // Quant engine settings - preserve existing or use defaults
      maxDrawdownPct: (currentSettings as any).maxDrawdownPct ?? 10,
      enablePairsTrading: (currentSettings as any).enablePairsTrading ?? true,
      enableQuantSignals: (currentSettings as any).enableQuantSignals ?? true,
      // Advanced analysis settings - preserve existing or use defaults
      enableFundingAnalysis: (currentSettings as any).enableFundingAnalysis ?? true,
      enableOpenInterestAnalysis: (currentSettings as any).enableOpenInterestAnalysis ?? true,
      enableLiquidationAnalysis: (currentSettings as any).enableLiquidationAnalysis ?? true,
      enableMultiTimeframe: (currentSettings as any).enableMultiTimeframe ?? true,
      enableDynamicSizing: (currentSettings as any).enableDynamicSizing ?? true,
    };

    // Save settings
    if (wallet) {
      userBotSettings.set(wallet.toLowerCase(), updatedSettings);
      persistSettings(userBotSettings); // Persist to file
      console.log(`[Trading] 💾 Saved settings for wallet ${wallet.slice(0, 8)}...`);
    }
    
    // Also update global settings if this is the active user
    if (!wallet || state.activeUserWallet?.toLowerCase() === wallet?.toLowerCase()) {
      Object.assign(botSettings, updatedSettings);
    }

    // Save to database for persistence
    try {
      if (wallet) {
        await (prisma as any).walletProfile.upsert({
          where: { walletAddress: wallet.toLowerCase() },
          create: {
            walletAddress: wallet.toLowerCase(),
            settings: updatedSettings as any,
          },
          update: {
            settings: updatedSettings as any,
          },
        });
      }
    } catch (err) {
      // WalletProfile may not exist in schema yet - silently fail
      console.log('[Trading] Settings saved in memory (DB persistence skipped)');
    }

    console.log(`[Trading] ⚙️ Settings updated: Mode=${updatedSettings.tradingMode}, Leverage=${updatedSettings.maxLeverage}x, Bot="${updatedSettings.botName}"`);

    return {
      success: true,
      settings: updatedSettings,
      message: 'Settings saved successfully',
    };
  });

  /**
   * POST /trading/start
   * Start the trading bot (simple version without DB)
   */
  fastify.post('/start', async (request, reply) => {
    const { wallet } = request.body as { wallet?: string } || {};
    
    if (!state.armed) {
      return reply.status(400).send({
        error: 'Trading not armed',
        message: 'You must ARM trading first before starting the bot',
      });
    }

    if (botRunning) {
      return reply.status(400).send({
        error: 'Bot already running',
        message: 'The bot is already running',
      });
    }

    // Set the active user wallet for trading
    if (wallet) {
      state.activeUserWallet = wallet.toLowerCase();
      const hasAgent = userAgents.has(wallet.toLowerCase());
      console.log(`[Trading] 👤 Active user wallet: ${wallet} (agent: ${hasAgent ? 'yes' : 'no'})`);
      
      // Load user-specific settings into global botSettings
      const userSettings = userBotSettings.get(wallet.toLowerCase());
      if (userSettings) {
        Object.assign(botSettings, userSettings);
        console.log(`[Trading] ⚙️ Loaded user settings: Mode=${botSettings.tradingMode}, Leverage=${botSettings.maxLeverage}x, Bag=[${botSettings.tradingBag.join(', ')}]`);
      }
    }

    botRunning = true;
    botStartedAt = Date.now();

    console.log('[Trading] 🤖 Bot STARTED - Analyzing market with Grok AI');

    // Start the analysis loop
    startAnalysisLoop();
    
    // Start exit strategy monitor (async - syncs positions from Hyperliquid)
    startExitMonitor().catch(err => console.error('[Exit Strategy] Error starting monitor:', err));

    return {
      success: true,
      running: true,
      startedAt: botStartedAt,
      message: 'Bot started successfully. Analyzing market...',
    };
  });

  /**
   * POST /trading/stop
   * Stop the trading bot
   */
  fastify.post('/stop', async () => {
    const wasRunning = botRunning;
    botRunning = false;
    const runDuration = botStartedAt ? Date.now() - botStartedAt : 0;
    botStartedAt = null;
    
    // Stop exit strategy monitor
    stopExitMonitor();

    // Stop the analysis loop
    stopAnalysisLoop();

    console.log('[Trading] 🛑 Bot STOPPED');

    return {
      success: true,
      running: false,
      wasRunning,
      runDurationMs: runDuration,
      message: 'Bot stopped successfully',
    };
  });

  /**
   * GET /trading/bot-status
   * Get bot running status
   */
  fastify.get('/bot-status', async () => {
    return {
      running: botRunning,
      startedAt: botStartedAt,
      uptime: botStartedAt ? Date.now() - botStartedAt : 0,
      armed: state.armed,
      mode: state.mode,
      lastAnalysis,
    };
  });

  /**
   * GET /trading/analysis-history
   * Get history of Grok analyses
   */
  fastify.get('/analysis-history', async (request) => {
    const { limit = 20 } = request.query as { limit?: number };
    return {
      analyses: analysisHistory.slice(0, Math.min(limit, 50)),
      total: analysisHistory.length,
    };
  });

  /**
   * GET /trading/debug
   * Debug endpoint to see internal state
   */
  fastify.get('/debug', async () => {
    const priceHistoryStatus: Record<string, number> = {};
    for (const [sym, hist] of symbolPriceHistory.entries()) {
      priceHistoryStatus[sym] = hist.length;
    }
    
    // Also fetch live positions from Hyperliquid
    let livePositions: any[] = [];
    try {
      const agentArgs = getAgentArgs(state.activeUserWallet);
      console.log(`[Debug] Checking positions with agentArgs: ${agentArgs ? 'configured' : 'EMPTY'}`);
      const result = await pythonBridge.getPositions(agentArgs);
      if (result.success && result.positions) {
        livePositions = result.positions;
      }
    } catch (err) {
      console.error('[Debug] Failed to fetch positions:', err);
    }
    
    return {
      botRunning,
      armed: state.armed,
      activeWallet: state.activeUserWallet,
      tradingBag: botSettings.tradingBag,
      tradingMode: botSettings.tradingMode,
      priceHistoryStatus,
      analysisCount: analysisHistory.length,
      skipCount,
      tradingStats,
      livePositions,
      openTrades: tradeHistory.filter(t => t.status === 'open'),
      hasAgentConfigured: !!getAgentArgs(state.activeUserWallet),
      grokUsage: getGrokUsageStats(), // Grok API usage stats
    };
  });

  /**
   * GET /trading/grok-usage
   * Get Grok API usage statistics
   */
  fastify.get('/grok-usage', async () => {
    return {
      ...getGrokUsageStats(),
      gateConfigs: {
        aggressive: GROK_GATE_CONFIGS['aggressive'],
        moderate: GROK_GATE_CONFIGS['moderate'],
        conservative: GROK_GATE_CONFIGS['conservative'],
      },
    };
  });

  /**
   * GET /trading/trade-history
   * Get history of executed trades with SL/TP
   */
  fastify.get('/trade-history', async (request) => {
    const { limit = 50, wallet } = request.query as { limit?: number; wallet?: string };
    
    // Filter by wallet if provided
    let filteredTrades = tradeHistory;
    if (wallet) {
      filteredTrades = tradeHistory.filter(t => 
        t.walletAddress?.toLowerCase() === wallet.toLowerCase()
      );
    }
    
    const trades = filteredTrades.slice(0, limit).map(t => ({
      id: t.id,
      side: t.side,
      symbol: t.symbol,
      price: t.price,
      exitPrice: t.exitPrice,
      quantity: t.quantity,
      leverage: t.leverage || 1,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      entryFee: t.entryFee || calculateFees(t.price, t.quantity),
      exitFee: t.exitFee || (t.exitPrice ? calculateFees(t.exitPrice, t.quantity) : 0),
      pnl: t.pnl,
      pnlWithFees: t.pnlWithFees,
      confidence: t.confidence,
      reasoning: t.reasoning,
      timestamp: t.timestamp,
      exitTime: t.exitTime,
      status: t.status,
      walletAddress: t.walletAddress,
    }));
    
    return { trades, total: filteredTrades.length };
  });

  /**
   * GET /trading/stats
   * Get user trading stats with fees included
   */
  fastify.get('/stats', async (request) => {
    const { wallet } = request.query as { wallet?: string };
    
    // Filter by wallet if provided
    let filteredTrades = tradeHistory;
    if (wallet) {
      filteredTrades = tradeHistory.filter(t => 
        t.walletAddress?.toLowerCase() === wallet.toLowerCase()
      );
    }
    
    const closedTrades = filteredTrades.filter(t => t.status === 'closed' && t.pnl !== undefined);
    const wins = closedTrades.filter(t => (t.pnlWithFees || t.pnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnlWithFees || t.pnl || 0) <= 0);
    
    // Use pnlWithFees for accurate calculations
    const totalPnlWithFees = closedTrades.reduce((sum, t) => sum + (t.pnlWithFees || t.pnl || 0), 0);
    const totalPnlRaw = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalFees = filteredTrades.reduce((sum, t) => sum + (t.entryFee || 0) + (t.exitFee || 0), 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + (t.pnlWithFees || t.pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + (t.pnlWithFees || t.pnl || 0), 0) / losses.length) : 0;
    
    // Calculate max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnl = 0;
    closedTrades.forEach(t => {
      runningPnl += (t.pnlWithFees || t.pnl || 0);
      if (runningPnl > peak) peak = runningPnl;
      const drawdown = peak - runningPnl;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
    const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
    
    // Calculate profit factor
    const grossProfit = wins.reduce((sum, t) => sum + (t.pnlWithFees || t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnlWithFees || t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    
    // Calculate total volume
    const totalVolume = filteredTrades.reduce((sum, t) => sum + (t.price * t.quantity), 0);
    
    return {
      stats: {
        totalTrades: filteredTrades.length,
        closedTrades: closedTrades.length,
        openTrades: filteredTrades.filter(t => t.status === 'open').length,
        winningTrades: wins.length,
        losingTrades: losses.length,
        winRate,
        totalPnl: totalPnlWithFees,
        totalPnlRaw,
        totalFees,
        maxDrawdown,
        maxDrawdownPct,
        profitFactor,
        totalVolume,
        bestTrade: wins.length > 0 ? Math.max(...wins.map(t => t.pnlWithFees || t.pnl || 0)) : 0,
        worstTrade: losses.length > 0 ? Math.min(...losses.map(t => t.pnlWithFees || t.pnl || 0)) : 0,
        avgWin,
        avgLoss,
        expectancy: winRate > 0 ? (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss) : 0,
      },
      feeRate: HL_TAKER_FEE,
    };
  });

  /**
   * GET /trading/performance
   * Get detailed performance data with PNL history for charts
   */
  fastify.get('/performance', async (request) => {
    const { wallet, days = 30 } = request.query as { wallet?: string; days?: number };
    
    // Filter by wallet if provided
    let filteredTrades = tradeHistory;
    if (wallet) {
      filteredTrades = tradeHistory.filter(t => 
        t.walletAddress?.toLowerCase() === wallet.toLowerCase()
      );
    }
    
    const closedTrades = filteredTrades
      .filter(t => t.status === 'closed' && t.pnl !== undefined)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Build cumulative PNL history for chart
    let cumulativePnl = 0;
    const pnlHistory = closedTrades.map(t => {
      cumulativePnl += (t.pnlWithFees || t.pnl || 0);
      return {
        timestamp: t.exitTime || t.timestamp,
        pnl: t.pnlWithFees || t.pnl || 0,
        cumulativePnl,
        tradeId: t.id,
      };
    });
    
    // Group by day for daily PNL
    const dailyPnl: Record<string, { date: string; pnl: number; trades: number; wins: number; losses: number }> = {};
    closedTrades.forEach(t => {
      const dateStr = new Date(t.exitTime || t.timestamp).toISOString().split('T')[0];
      if (!dateStr) return;
      if (!dailyPnl[dateStr]) {
        dailyPnl[dateStr] = { date: dateStr, pnl: 0, trades: 0, wins: 0, losses: 0 };
      }
      const tradePnl = t.pnlWithFees || t.pnl || 0;
      const dayData = dailyPnl[dateStr];
      if (dayData) {
        dayData.pnl += tradePnl;
        dayData.trades += 1;
        if (tradePnl > 0) dayData.wins += 1;
        else dayData.losses += 1;
      }
    });
    
    // Calculate stats
    const wins = closedTrades.filter(t => (t.pnlWithFees || t.pnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnlWithFees || t.pnl || 0) <= 0);
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnlWithFees || t.pnl || 0), 0);
    const totalFees = filteredTrades.reduce((sum, t) => sum + (t.entryFee || 0) + (t.exitFee || 0), 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
    
    // Max drawdown calculation
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnl = 0;
    closedTrades.forEach(t => {
      runningPnl += (t.pnlWithFees || t.pnl || 0);
      if (runningPnl > peak) peak = runningPnl;
      const drawdown = peak - runningPnl;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
    
    // Profit factor
    const grossProfit = wins.reduce((sum, t) => sum + (t.pnlWithFees || t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnlWithFees || t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    
    // Avg trades per day
    const uniqueDays = Object.keys(dailyPnl).length;
    const avgTradesPerDay = uniqueDays > 0 ? closedTrades.length / uniqueDays : 0;
    
    // Total volume
    const totalVolume = filteredTrades.reduce((sum, t) => sum + (t.price * t.quantity), 0);
    
    // Best/worst month
    const monthlyPnl: Record<string, number> = {};
    closedTrades.forEach(t => {
      const month = new Date(t.exitTime || t.timestamp).toISOString().slice(0, 7);
      monthlyPnl[month] = (monthlyPnl[month] || 0) + (t.pnlWithFees || t.pnl || 0);
    });
    const months = Object.entries(monthlyPnl).sort((a, b) => b[1] - a[1]);
    const bestMonth = months[0] || ['N/A', 0];
    const worstMonth = months[months.length - 1] || ['N/A', 0];
    
    return {
      summary: {
        totalTrades: filteredTrades.length,
        closedTrades: closedTrades.length,
        winRate,
        totalPnl,
        totalFees,
        profitFactor: profitFactor === Infinity ? 999 : profitFactor,
        maxDrawdown,
        maxDrawdownPct: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
        avgTradesPerDay,
        totalVolume,
        avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
        avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
        bestMonth: { month: bestMonth[0], pnl: bestMonth[1] },
        worstMonth: { month: worstMonth[0], pnl: worstMonth[1] },
      },
      pnlHistory,
      dailyPnl: Object.values(dailyPnl).sort((a, b) => a.date.localeCompare(b.date)),
      recentTrades: closedTrades.slice(-10).reverse().map(t => ({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        pnl: t.pnlWithFees || t.pnl,
        timestamp: t.exitTime || t.timestamp,
      })),
    };
  });

  /**
   * GET /trading/leaderboard
   * Get global leaderboard of all traders
   */
  fastify.get('/leaderboard', async (request) => {
    const { sortBy = 'pnl', limit = 50 } = request.query as { sortBy?: string; limit?: number };
    
    // Group trades by wallet address
    const walletStats: Map<string, {
      walletAddress: string;
      botName: string;
      totalPnl: number;
      totalVolume: number;
      totalFees: number;
      totalTrades: number;
      winRate: number;
      wins: number;
      losses: number;
    }> = new Map();
    
    // Calculate stats per wallet
    tradeHistory.forEach(trade => {
      const wallet = trade.walletAddress || 'anonymous';
      
      if (!walletStats.has(wallet)) {
        const settings = userBotSettings.get(wallet) || botSettings;
        walletStats.set(wallet, {
          walletAddress: wallet,
          botName: settings.botName,
          totalPnl: 0,
          totalVolume: 0,
          totalFees: 0,
          totalTrades: 0,
          winRate: 0,
          wins: 0,
          losses: 0,
        });
      }
      
      const stats = walletStats.get(wallet)!;
      stats.totalTrades += 1;
      stats.totalVolume += trade.price * trade.quantity;
      stats.totalFees += (trade.entryFee || 0) + (trade.exitFee || 0);
      
      if (trade.status === 'closed' && trade.pnlWithFees !== undefined) {
        stats.totalPnl += trade.pnlWithFees;
        if (trade.pnlWithFees > 0) stats.wins += 1;
        else stats.losses += 1;
      }
    });
    
    // Calculate win rates
    walletStats.forEach(stats => {
      const closedTrades = stats.wins + stats.losses;
      stats.winRate = closedTrades > 0 ? (stats.wins / closedTrades) * 100 : 0;
    });
    
    // Convert to array and sort
    let leaderboard = Array.from(walletStats.values());
    
    switch (sortBy) {
      case 'volume':
        leaderboard.sort((a, b) => b.totalVolume - a.totalVolume);
        break;
      case 'fees':
        leaderboard.sort((a, b) => b.totalFees - a.totalFees);
        break;
      case 'trades':
        leaderboard.sort((a, b) => b.totalTrades - a.totalTrades);
        break;
      case 'winrate':
        leaderboard.sort((a, b) => b.winRate - a.winRate);
        break;
      case 'pnl':
      default:
        leaderboard.sort((a, b) => b.totalPnl - a.totalPnl);
    }
    
    // Add rank
    const rankedLeaderboard = leaderboard.slice(0, limit).map((entry, index) => ({
      rank: index + 1,
      ...entry,
      walletAddress: entry.walletAddress === 'anonymous' 
        ? 'Anonymous' 
        : `${entry.walletAddress.slice(0, 6)}...${entry.walletAddress.slice(-4)}`,
      walletAddressFull: entry.walletAddress,
    }));
    
    return {
      success: true,
      leaderboard: rankedLeaderboard,
      totalTraders: walletStats.size,
      sortBy,
    };
  });

  /**
   * POST /trading/close-trade
   * Close an open trade
   */
  fastify.post('/close-trade', async (request) => {
    const { tradeId, exitPrice } = request.body as { tradeId: string; exitPrice: number };
    
    if (!tradeId || !exitPrice) {
      return { success: false, error: 'tradeId and exitPrice required' };
    }
    
    const trade = tradeHistory.find(t => t.id === tradeId);
    if (trade && trade.status === 'open') {
      trade.status = 'closed';
      trade.exitPrice = exitPrice;
      trade.exitTime = Date.now();
      const entryFee = calculateFees(trade.price, trade.quantity);
      const exitFee = calculateFees(exitPrice, trade.quantity);
      const grossPnl = trade.side === 'buy'
        ? (exitPrice - trade.price) * trade.quantity
        : (trade.price - exitPrice) * trade.quantity;
      trade.pnl = grossPnl - entryFee - exitFee;
      
      // Record for Kelly Criterion and performance metrics
      const pnlPct = (trade.pnl / (trade.price * trade.quantity)) * 100;
      quantEngine.recordTradeForKelly(trade.pnl, pnlPct, trade.symbol);
      quantEngine.recordDailyReturn(pnlPct);
      console.log(`[QuantEngine] 📈 Trade recorded for Kelly: ${trade.symbol} PnL=${pnlPct.toFixed(2)}%`);
      
      return { success: true, trade };
    }
    
    return { success: false, error: 'Trade not found or already closed' };
  });

  /**
   * POST /trading/indicators
   * Update user configured indicators from chart
   */
  fastify.post('/indicators', async (request) => {
    const { indicators } = request.body as { indicators: typeof userIndicators };
    if (indicators && Array.isArray(indicators)) {
      userIndicators = indicators;
      console.log(`[Trading] 📊 Updated ${indicators.length} indicators from chart:`, 
        indicators.filter(i => i.visible).map(i => `${i.name}(${i.calcParams.join(',')})`).join(', '));
    }
    return { success: true, count: userIndicators.length };
  });

  /**
   * GET /trading/indicators
   * Get current user indicators
   */
  fastify.get('/indicators', async () => {
    return { indicators: userIndicators };
  });

  /**
   * POST /trading/test-trade
   * Execute a test trade (open and close immediately) to verify system works
   * WARNING: This will use real funds!
   */
  fastify.post('/test-trade', async (request) => {
    const { side = 'buy', size = 0.001 } = request.body as { side?: 'buy' | 'sell'; size?: number };
    
    if (!state.armed) {
      return { success: false, error: 'Bot must be armed first' };
    }

    try {
      // Use Python bridge for trading (official SDK)
      const { execSync } = await import('child_process');
      const path = await import('path');
      const scriptPath = path.resolve(process.cwd(), '../../scripts/hl_bridge.py');

      console.log(`[TEST] 🧪 Opening test ${side} position: ${size} BTC`);

      // Open position using Python bridge
      const openCmd = `python "${scriptPath}" order BTC ${side} ${size} market`;
      const openOutput = execSync(openCmd, { encoding: 'utf-8', cwd: path.resolve(process.cwd(), '../..') });
      const openResult = JSON.parse(openOutput.trim());

      if (!openResult.success) {
        return { success: false, error: `Failed to open: ${openResult.error}`, step: 'open' };
      }

      console.log(`[TEST] ✅ Position opened:`, openResult);

      // Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Close position (opposite side)
      const closeSide = side === 'buy' ? 'sell' : 'buy';
      console.log(`[TEST] 🔄 Closing position with ${closeSide}...`);

      const closeCmd = `python "${scriptPath}" order BTC ${closeSide} ${size} market`;
      const closeOutput = execSync(closeCmd, { encoding: 'utf-8', cwd: path.resolve(process.cwd(), '../..') });
      const closeResult = JSON.parse(closeOutput.trim());

      if (!closeResult.success) {
        return { 
          success: false, 
          error: `Failed to close: ${closeResult.error}`, 
          step: 'close',
          openOrder: openResult.order 
        };
      }

      console.log(`[TEST] ✅ Position closed:`, closeResult);

      // Get final account state using Python bridge
      const balanceCmd = `python "${scriptPath}" balance`;
      const balanceOutput = execSync(balanceCmd, { encoding: 'utf-8', cwd: path.resolve(process.cwd(), '../..') });
      const balanceResult = JSON.parse(balanceOutput.trim());

      return {
        success: true,
        message: 'Test trade completed successfully!',
        openOrder: openResult,
        closeOrder: closeResult,
        accountEquity: balanceResult.accountValue,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[TEST] ❌ Test trade failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * GET /trading/positions
   * Get current open positions
   */
  fastify.get('/positions', async () => {
    try {
      const { execSync } = await import('child_process');
      const path = await import('path');
      const scriptPath = path.resolve(process.cwd(), '../../scripts/hl_bridge.py');
      const cmd = `python "${scriptPath}" positions`;
      const output = execSync(cmd, { encoding: 'utf-8', cwd: path.resolve(process.cwd(), '../..') });
      return JSON.parse(output.trim());
    } catch (error) {
      return { success: false, error: (error as Error).message, positions: [] };
    }
  });

  /**
   * POST /trading/close-all
   * Close all open positions
   */
  fastify.post('/close-all', async (request) => {
    const { wallet } = request.body as { wallet?: string } || {};
    
    if (!state.armed) {
      return { success: false, error: 'Bot must be armed first' };
    }

    try {
      // Get current position info before closing
      const { execSync } = await import('child_process');
      const path = await import('path');
      
      // Get current price
      const tickerRes = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
      });
      const mids = await tickerRes.json() as Record<string, string>;
      const closePrice = parseFloat(mids['BTC'] || '0');
      
      // Find the open trade to update
      const openTrade = tradeHistory.find(t => t.status === 'open');
      
      // Get agent args for the user's wallet (or active wallet)
      const targetWallet = wallet || state.activeUserWallet;
      const agentArgs = getAgentArgs(targetWallet);
      
      if (agentArgs) {
        console.log(`[Trading] 🔑 Closing positions for user: ${targetWallet}`);
      }
      
      // Close the position
      const scriptPath = path.resolve(process.cwd(), '../../scripts/hl_bridge.py');
      const cmd = `python "${scriptPath}" ${agentArgs} close_all`;
      const output = execSync(cmd, { encoding: 'utf-8', cwd: path.resolve(process.cwd(), '../..') });
      const result = JSON.parse(output.trim());
      
      if (result.success && openTrade) {
        // Calculate PnL
        const entryPrice = openTrade.price;
        const quantity = openTrade.quantity;
        const isLong = openTrade.side === 'buy';
        const pnl = isLong 
          ? (closePrice - entryPrice) * quantity
          : (entryPrice - closePrice) * quantity;
        const pnlPercent = (pnl / (entryPrice * quantity)) * 100;
        
        // Update the open trade with PnL and close it
        openTrade.status = 'closed';
        openTrade.pnl = pnl;
        openTrade.exitPrice = closePrice;
        
        // Calculate fees
        const entryFee = entryPrice * quantity * HL_TAKER_FEE;
        const exitFee = closePrice * quantity * HL_TAKER_FEE;
        const totalFees = entryFee + exitFee;
        const pnlWithFees = pnl - totalFees;
        
        // Update open trade with fees
        openTrade.exitFee = exitFee;
        openTrade.pnlWithFees = pnlWithFees;
        openTrade.exitTime = Date.now();
        
        // Add a SELL trade entry for the close
        const closeTrade = {
          id: `close_${Date.now()}`,
          side: (isLong ? 'sell' : 'buy') as 'buy' | 'sell',
          symbol: 'BTC-PERP',
          price: closePrice,
          quantity: quantity,
          leverage: openTrade.leverage || 1,
          stopLoss: 0,
          takeProfit: 0,
          entryFee: entryFee,
          exitFee: exitFee,
          confidence: 100,
          reasoning: `Manual close of ${isLong ? 'LONG' : 'SHORT'} position. PnL: $${pnlWithFees.toFixed(2)} (${pnlPercent.toFixed(2)}%) [Fees: $${totalFees.toFixed(4)}]`,
          timestamp: Date.now(),
          status: 'closed' as const,
          pnl: pnl,
          pnlWithFees: pnlWithFees,
          exitPrice: closePrice,
          exitTime: Date.now(),
          walletAddress: targetWallet || undefined,
        };
        tradeHistory.unshift(closeTrade);
        
        // Save both trades to DB
        saveTradeToDb(openTrade);
        saveTradeToDb(closeTrade);
        
        // Keep only last 100 trades in memory
        if (tradeHistory.length > 100) {
          tradeHistory.pop();
        }
      }
      
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * POST /trading/close-position
   * Close a specific position for a user's wallet
   * Note: This currently only works with the backend wallet. 
   * For user wallets, they need to sign orders themselves.
   */
  fastify.post('/close-position', async (request) => {
    const { wallet, coin, size, side } = request.body as {
      wallet: string;
      coin: string;
      size: number;
      side: 'long' | 'short';
    };

    // Check if this is the backend wallet
    const backendWallet = process.env['HL_WALLET_ADDRESS'] || process.env['HL_ACCOUNT_ADDRESS'];
    
    if (wallet.toLowerCase() !== backendWallet?.toLowerCase()) {
      return {
        success: false,
        error: 'Cannot close positions for external wallets. You need to close positions directly on Hyperliquid or use a wallet that matches the backend configuration.',
        hint: 'To trade with your own wallet, you need to configure HL_WALLET_ADDRESS and HL_PRIVATE_KEY in .env to match your MetaMask wallet.',
      };
    }

    if (!state.armed) {
      return { success: false, error: 'Bot must be armed first' };
    }

    try {
      const { execSync } = await import('child_process');
      const path = await import('path');
      const scriptPath = path.resolve(process.cwd(), '../../scripts/hl_bridge.py');
      const cmd = `python "${scriptPath}" close_all`;
      const output = execSync(cmd, { encoding: 'utf-8', cwd: path.resolve(process.cwd(), '../..') });
      const result = JSON.parse(output.trim());
      
      return {
        success: result.success,
        message: result.success ? `Closed ${coin} ${side} position` : result.error,
        ...result,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * POST /trading/simulate-volatility
   * Simulate market volatility to trigger Grok analysis
   * This forces a Grok call regardless of the smart filter
   */
  fastify.post('/simulate-volatility', async (request) => {
    const { 
      action = 'LONG', 
      confidence = 85,
      executeReal = false 
    } = request.body as { 
      action?: 'LONG' | 'SHORT'; 
      confidence?: number;
      executeReal?: boolean;
    };

    if (!state.armed) {
      return { success: false, error: 'Bot must be armed first' };
    }

    try {
      // Get current BTC price
      const tickerRes = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
      });
      const mids = await tickerRes.json() as Record<string, string>;
      const btcPrice = parseFloat(mids['BTC'] || '0');

      console.log(`[SIMULATE] 🎭 Simulating ${action} signal with ${confidence}% confidence`);

      // Create simulated analysis
      const simulatedAnalysis = {
        id: `sim_${Date.now()}`,
        action,
        confidence,
        reasoning: `[SIMULATED] This is a test signal to verify the trading system. Action: ${action} at $${btcPrice.toLocaleString()} with ${confidence}% confidence.`,
        price: btcPrice,
        timestamp: Date.now(),
        sources: ['simulation'],
        warnings: ['This is a simulated signal for testing purposes'],
      };

      // Update last analysis
      lastAnalysis = {
        action: simulatedAnalysis.action,
        confidence: simulatedAnalysis.confidence,
        reasoning: simulatedAnalysis.reasoning,
        timestamp: simulatedAnalysis.timestamp,
      };

      // Add to history
      analysisHistory.unshift(simulatedAnalysis);
      if (analysisHistory.length > 50) {
        analysisHistory.pop();
      }

      // Execute real trade if requested
      let tradeResult = null;
      if (executeReal && confidence >= 70) {
        const { execSync } = await import('child_process');
        const path = await import('path');
        const scriptPath = path.resolve(process.cwd(), '../../scripts/hl_bridge.py');
        
        // Use fixed minimum size for testing (0.001 BTC ≈ $87)
        const positionSize = 0.001;
        
        if (true) { // Always execute for simulation
          const side = action === 'LONG' ? 'buy' : 'sell';
          
          console.log(`[SIMULATE] 📊 Executing ${side} ${positionSize.toFixed(6)} BTC @ $${btcPrice}`);
          
          const orderCmd = `python "${scriptPath}" order BTC ${side} ${positionSize.toFixed(6)} market`;
          const orderOutput = execSync(orderCmd, { encoding: 'utf-8', cwd: path.resolve(process.cwd(), '../..') });
          tradeResult = JSON.parse(orderOutput.trim());

          if (tradeResult.success) {
            // Calculate entry fee
            const tradePrice = parseFloat(tradeResult.avgPx) || btcPrice;
            const tradeQty = parseFloat(tradeResult.totalSz) || positionSize;
            const entryFee = tradePrice * tradeQty * HL_TAKER_FEE;
            
            // Add to trade history
            const newTrade = {
              id: tradeResult.oid?.toString() || `trade_${Date.now()}`,
              side: side as 'buy' | 'sell',
              symbol: 'BTC-PERP',
              price: tradePrice,
              quantity: tradeQty,
              leverage: botSettings.maxLeverage,
              stopLoss: side === 'buy' ? btcPrice * 0.98 : btcPrice * 1.02,
              takeProfit: side === 'buy' ? btcPrice * 1.04 : btcPrice * 0.96,
              entryFee: entryFee,
              exitFee: 0,
              confidence,
              reasoning: simulatedAnalysis.reasoning,
              timestamp: Date.now(),
              status: 'open' as const,
              walletAddress: state.activeUserWallet || undefined,
            };
            tradeHistory.unshift(newTrade);
            
            // Save to database
            saveTradeToDb(newTrade);
            
            if (tradeHistory.length > 100) {
              tradeHistory.pop();
            }
          }
        }
      }

      return {
        success: true,
        message: `Simulated ${action} signal created`,
        analysis: simulatedAnalysis,
        tradeExecuted: executeReal && tradeResult?.success,
        tradeResult,
      };
    } catch (error) {
      console.error('[SIMULATE] Error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * POST /trading/force-grok-analysis
   * Force a real Grok analysis regardless of smart filter
   */
  fastify.post('/force-grok-analysis', async () => {
    if (!state.armed) {
      return { success: false, error: 'Bot must be armed first' };
    }

    if (!botRunning) {
      return { success: false, error: 'Bot must be running' };
    }

    try {
      console.log('[FORCE] 🔄 Forcing Grok analysis...');
      await runAnalysis(true); // Force call
      return { 
        success: true, 
        message: 'Grok analysis triggered',
        lastAnalysis 
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
};

// Bot running state
let botRunning = false;
let botStartedAt: number | null = null;
let analysisInterval: NodeJS.Timeout | null = null;
let lastAnalysis: { action: string; confidence: number; reasoning: string; timestamp: number } | null = null;

// User configured indicators from chart
let userIndicators: Array<{
  id: string;
  name: string;
  calcParams: number[];
  visible: boolean;
}> = [];

// Bot settings (persisted per user)
interface BotSettings {
  botName: string;
  tradingMode: 'conservative' | 'moderate' | 'aggressive';
  dynamicLeverage: boolean;
  maxLeverage: number;
  minConfirmations: number;
  userPrompt: string; // Custom strategy prompt
  tradingBag: string[]; // Array of symbols (max 5)
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxSimultaneousPositions: number; // Max positions open at same time (1-5)
  // Advanced algorithmic settings
  enableTrailingStop: boolean;
  trailingStopActivation: number; // Activate at X% profit
  trailingStopDistance: number;   // Trail by X%
  useSmartSLTP: boolean;          // Use ATR-based dynamic SL/TP
  enableSessionFilter: boolean;   // Respect trading session hours
  // Quant engine settings
  maxDrawdownPct: number;         // Max drawdown before pausing (default 10%)
  enablePairsTrading: boolean;    // Enable pairs trading signals
  enableQuantSignals: boolean;    // Enable quant engine signals (Z-Score, VWAP, etc.)
  // Advanced analysis settings
  enableFundingAnalysis: boolean;     // Use funding rate for signals
  enableOpenInterestAnalysis: boolean; // Use OI for signals
  enableLiquidationAnalysis: boolean;  // Use liquidation heatmap
  enableMultiTimeframe: boolean;       // Use multi-timeframe confluence
  enableDynamicSizing: boolean;        // Auto-adapt to wallet size
}

// Timeframes based on trading mode (automatic)
const MODE_TIMEFRAMES: Record<string, string[]> = {
  aggressive: ['5m', '15m', '1h'],    // Quick entries, more trades
  moderate: ['1h', '4h'],              // Balanced approach
  conservative: ['4h', '1d'],          // Long-term setups, fewer trades
};

// Maximum leverage by pair based on Hyperliquid liquidity tiers
// Tier 1: High liquidity (BTC, ETH) - up to 50x
// Tier 2: Medium-high liquidity (major alts) - up to 25x
// Tier 3: Medium liquidity (popular alts) - up to 20x
// Tier 4: Lower liquidity (smaller caps) - up to 10x
// Tier 5: Low liquidity (meme/new coins) - up to 5x
const MAX_LEVERAGE_BY_PAIR: Record<string, number> = {
  // Tier 1 - 50x max
  'BTC-PERP': 50, 'ETH-PERP': 50,
  // Tier 2 - 25x max
  'SOL-PERP': 25, 'XRP-PERP': 25, 'BNB-PERP': 25, 'DOGE-PERP': 25, 'ADA-PERP': 25,
  'AVAX-PERP': 25, 'DOT-PERP': 25, 'LINK-PERP': 25, 'LTC-PERP': 25, 'BCH-PERP': 25,
  // Tier 3 - 20x max
  'MATIC-PERP': 20, 'ARB-PERP': 20, 'OP-PERP': 20, 'SUI-PERP': 20, 'APT-PERP': 20,
  'ATOM-PERP': 20, 'UNI-PERP': 20, 'NEAR-PERP': 20, 'FIL-PERP': 20, 'AAVE-PERP': 20,
  'INJ-PERP': 20, 'TIA-PERP': 20, 'SEI-PERP': 20, 'FTM-PERP': 20, 'MKR-PERP': 20,
  'TON-PERP': 20, 'TRX-PERP': 20, 'ETC-PERP': 20, 'XLM-PERP': 20,
  // Tier 4 - 10x max
  'STRK-PERP': 10, 'MANTA-PERP': 10, 'ZETA-PERP': 10, 'BLAST-PERP': 10, 'ZK-PERP': 10,
  'SNX-PERP': 10, 'CRV-PERP': 10, 'LDO-PERP': 10, 'COMP-PERP': 10, 'SUSHI-PERP': 10,
  'RUNE-PERP': 10, 'GMX-PERP': 10, 'DYDX-PERP': 10, 'PENDLE-PERP': 10, 'ENS-PERP': 10,
  'JUP-PERP': 10, 'PYTH-PERP': 10, 'WLD-PERP': 10, 'BLUR-PERP': 10, 'ORDI-PERP': 10,
  'IMX-PERP': 10, 'GALA-PERP': 10, 'SAND-PERP': 10, 'RENDER-PERP': 10, 'FET-PERP': 10,
  'TAO-PERP': 10, 'AR-PERP': 10, 'HBAR-PERP': 10, 'ALGO-PERP': 10, 'IOTA-PERP': 10,
  // Additional pairs - 5x max (low liquidity / memecoins)
  'HYPE-PERP': 5, 'MEGA-PERP': 5, 'PEPE-PERP': 5, 'SHIB-PERP': 5, 'FLOKI-PERP': 5,
  'BONK-PERP': 5, 'WIF-PERP': 5, 'MEME-PERP': 5, 'POPCAT-PERP': 5, 'MOG-PERP': 5,
  'BRETT-PERP': 5, 'NEIRO-PERP': 5, 'GOAT-PERP': 5, 'PNUT-PERP': 5, 'ACT-PERP': 5,
  'FARTCOIN-PERP': 5, 'AI16Z-PERP': 5, 'VIRTUAL-PERP': 5, 'GRIFFAIN-PERP': 5,
};

// Get max leverage for a symbol (default to 5x for unknown/low liquidity pairs)
// This allows ANY Hyperliquid pair to work, not just the ones in the list
function getMaxLeverageForSymbol(symbol: string): number {
  return MAX_LEVERAGE_BY_PAIR[symbol] || 5;
}

let botSettings: BotSettings = {
  botName: 'Whalez Bot',
  tradingMode: 'aggressive',
  dynamicLeverage: true,
  maxLeverage: 5,
  minConfirmations: 3,
  userPrompt: '',
  tradingBag: ['BTC-PERP'], // Default to BTC only
  positionSizePct: 2,
  stopLossPct: 2,
  takeProfitPct: 4,
  maxSimultaneousPositions: 3, // Allow up to 3 positions at once
  // Advanced algorithmic settings - defaults
  enableTrailingStop: true,
  trailingStopActivation: 0.3, // Activate at 0.3% profit (aggressive default)
  trailingStopDistance: 0.15,  // Trail by 0.15%
  useSmartSLTP: true,          // Use ATR-based dynamic SL/TP
  enableSessionFilter: true,   // Respect trading session hours
  // Quant engine settings - defaults
  maxDrawdownPct: 10,          // Pause trading at 10% drawdown
  enablePairsTrading: true,    // Enable pairs trading signals
  enableQuantSignals: true,    // Enable quant engine signals
  // Advanced analysis settings - defaults
  enableFundingAnalysis: true,      // Use funding rate for signals
  enableOpenInterestAnalysis: true, // Use OI for signals
  enableLiquidationAnalysis: true,  // Use liquidation heatmap
  enableMultiTimeframe: true,       // Use multi-timeframe confluence
  enableDynamicSizing: true,        // Auto-adapt to wallet size
};

// User settings storage (per wallet) - loaded from file on startup
export const userBotSettings: Map<string, BotSettings> = loadPersistedSettings();

// Analysis history (keep last 50)
const analysisHistory: Array<{
  id: string;
  action: string;
  confidence: number;
  reasoning: string;
  price: number;
  timestamp: number;
  sources: any[];
  warnings: string[];
}> = [];

// Trade history type
type TradeRecord = {
  id: string;
  side: 'buy' | 'sell';
  symbol: string;
  price: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  entryFee: number;
  exitFee: number;
  confidence: number;
  reasoning: string;
  timestamp: number;
  status: 'open' | 'closed' | 'cancelled';
  pnl?: number;
  pnlWithFees?: number; // PNL after fees
  exitPrice?: number;
  exitTime?: number;
  walletAddress?: string; // User wallet address
};

// Trade history (loaded from file on startup, then synced with DB)
let tradeHistory: TradeRecord[] = loadPersistedTrades();

// Default bot ID for trades (will be created if not exists)
const DEFAULT_BOT_ID = 'default-trading-bot';

// Trade notification subscribers (for real-time updates)
type TradeNotificationCallback = (trade: typeof tradeHistory[0]) => void;
const tradeNotificationSubscribers: Set<TradeNotificationCallback> = new Set();

// Emit trade notification to all subscribers
function emitTradeNotification(trade: typeof tradeHistory[0]) {
  console.log(`[Trading] 📢 Emitting trade notification: ${trade.side} ${trade.symbol}`);
  tradeNotificationSubscribers.forEach(callback => {
    try {
      callback(trade);
    } catch (err) {
      console.error('[Trading] Notification callback error:', err);
    }
  });
}

// Subscribe to trade notifications
export function subscribeToTradeNotifications(callback: TradeNotificationCallback) {
  tradeNotificationSubscribers.add(callback);
  return () => tradeNotificationSubscribers.delete(callback);
}

// Self-critique state
let lastSelfCritiqueAt = 0;
let selfCritiqueInsights: string[] = [];

// Trigger self-critique analysis
async function triggerSelfCritique() {
  const now = Date.now();
  // Don't run more than once per 4 hours (was 1 hour - reduced to save API calls)
  if (now - lastSelfCritiqueAt < 4 * 3600000) {
    console.log('[Trading] ⏭️ Skipping self-critique (ran recently)');
    return;
  }
  
  // Check if we have Grok calls remaining (self-critique uses 1 call)
  if (!canCallGrok()) {
    console.log('[Trading] ⚠️ Skipping self-critique - daily Grok limit reached');
    return;
  }
  
  lastSelfCritiqueAt = now;
  console.log('[Trading] 🔍 Running self-critique analysis...');
  
  try {
    const grok = enhancedGrok;
    if (!grok.isAvailable()) {
      console.log('[Trading] ⚠️ Grok not available for self-critique');
      return;
    }
    
    const closedTrades = tradeHistory.filter(t => t.status === 'closed');
    if (closedTrades.length < 5) {
      console.log('[Trading] ⚠️ Not enough closed trades for self-critique');
      return;
    }
    
    // Record the Grok call for self-critique
    recordGrokCall('SELF_CRITIQUE', 0, 'Periodic self-critique analysis', 'self_critique');
    
    const critique = await grok.performSelfCritique({
      botId: DEFAULT_BOT_ID,
      trades: closedTrades.slice(0, 20).map(t => ({
        side: t.side,
        symbol: t.symbol,
        entryPrice: t.price,
        exitPrice: t.exitPrice,
        pnl: t.pnlWithFees || t.pnl,
        stopLoss: t.stopLoss,
        quantity: t.quantity,
        status: t.status,
      })),
      previousInsights: selfCritiqueInsights,
      guardrails: {
        maxLeverage: botSettings.maxLeverage,
        maxPositionPct: botSettings.positionSizePct,
        maxDrawdown: state.maxDrawdown,
      },
    });
    
    console.log('[Trading] 📊 Self-critique results:');
    console.log(`  Win Rate: ${critique.metrics.winRate.toFixed(1)}%`);
    console.log(`  Expectancy: $${critique.metrics.expectancy.toFixed(2)}`);
    console.log(`  Max Drawdown: ${critique.metrics.maxDrawdown.toFixed(1)}%`);
    
    if (critique.whatWorked.length > 0) {
      console.log(`  ✅ What worked: ${critique.whatWorked.join(', ')}`);
    }
    if (critique.whatDidntWork.length > 0) {
      console.log(`  ❌ What didn't work: ${critique.whatDidntWork.join(', ')}`);
    }
    if (critique.suggestions.length > 0) {
      console.log(`  💡 Suggestions: ${critique.suggestions.map(s => s.parameter).join(', ')}`);
    }
    
    // Store insights for next critique
    selfCritiqueInsights = [
      ...critique.lessons,
      ...critique.patterns,
    ].slice(0, 10);
    
    // Add to analysis history
    analysisHistory.unshift({
      id: `critique_${Date.now()}`,
      action: 'SELF_CRITIQUE',
      confidence: critique.metrics.winRate,
      reasoning: `Self-critique: ${critique.lessons.join(' | ')}`,
      price: 0,
      timestamp: Date.now(),
      sources: [],
      warnings: critique.whatDidntWork,
    });
    
  } catch (err) {
    console.error('[Trading] Self-critique error:', err);
  }
}

// Load user settings from database on startup
async function loadSettingsFromDB() {
  try {
    const profiles = await (prisma as any).walletProfile.findMany({
      select: {
        walletAddress: true,
        settings: true,
      },
    });
    
    let loadedCount = 0;
    for (const profile of profiles) {
      if (profile.settings && typeof profile.settings === 'object') {
        const settings = profile.settings as Partial<BotSettings>;
        userBotSettings.set(profile.walletAddress.toLowerCase(), {
          botName: settings.botName || 'Whalez Bot',
          tradingMode: settings.tradingMode || 'moderate',
          dynamicLeverage: settings.dynamicLeverage ?? true,
          maxLeverage: settings.maxLeverage || 5,
          minConfirmations: settings.minConfirmations || 3,
          userPrompt: settings.userPrompt || '',
          tradingBag: settings.tradingBag || ['BTC-PERP'],
          positionSizePct: settings.positionSizePct || 2,
          stopLossPct: settings.stopLossPct || 2,
          takeProfitPct: settings.takeProfitPct || 4,
          maxSimultaneousPositions: settings.maxSimultaneousPositions || 3,
          // Advanced algorithmic settings
          enableTrailingStop: settings.enableTrailingStop ?? true,
          trailingStopActivation: settings.trailingStopActivation ?? 0.3,
          trailingStopDistance: settings.trailingStopDistance ?? 0.15,
          useSmartSLTP: settings.useSmartSLTP ?? true,
          enableSessionFilter: settings.enableSessionFilter ?? true,
          // Quant engine settings
          maxDrawdownPct: settings.maxDrawdownPct ?? 10,
          enablePairsTrading: settings.enablePairsTrading ?? true,
          enableQuantSignals: settings.enableQuantSignals ?? true,
          // Advanced analysis settings
          enableFundingAnalysis: settings.enableFundingAnalysis ?? true,
          enableOpenInterestAnalysis: settings.enableOpenInterestAnalysis ?? true,
          enableLiquidationAnalysis: settings.enableLiquidationAnalysis ?? true,
          enableMultiTimeframe: settings.enableMultiTimeframe ?? true,
          enableDynamicSizing: settings.enableDynamicSizing ?? true,
        });
        loadedCount++;
      }
    }
    
    console.log(`[Trading] 💾 Loaded settings for ${loadedCount} users from database`);
  } catch (err) {
    // WalletProfile may not exist - silently continue
    console.log('[Trading] Settings will be loaded from memory (DB not available)');
  }
}

// Load trades from database on startup and merge with file-based trades
async function loadTradesFromDB() {
  // Keep existing trades from file (already loaded at startup)
  const existingTradeIds = new Set(tradeHistory.map(t => t.id));
  const fileTradeCount = tradeHistory.length;
  
  try {
    // Try to load from TradeHistory (wallet-based, primary storage)
    const walletTrades = await (prisma as any).tradeHistory.findMany({
      orderBy: { entryTime: 'desc' },
      take: 100,
    });
    
    if (walletTrades && walletTrades.length > 0) {
      const dbTrades = walletTrades.map((t: any) => ({
        id: t.id,
        side: t.side.toLowerCase() as 'buy' | 'sell',
        symbol: t.symbol,
        price: t.entryPrice,
        quantity: t.quantity,
        leverage: t.leverage || 1,
        stopLoss: 0,
        takeProfit: 0,
        entryFee: t.fees || 0,
        exitFee: 0,
        confidence: t.aiConfidence || 0,
        reasoning: t.aiReasoning || '',
        timestamp: new Date(t.entryTime).getTime(),
        status: t.status.toLowerCase() as 'open' | 'closed' | 'cancelled',
        pnl: t.pnl || undefined,
        pnlWithFees: t.pnl || undefined,
        exitPrice: t.exitPrice || undefined,
        exitTime: t.exitTime ? new Date(t.exitTime).getTime() : undefined,
        walletAddress: t.walletAddress || undefined,
      }));
      
      // Merge: add DB trades that aren't already in file
      for (const dbTrade of dbTrades) {
        if (!existingTradeIds.has(dbTrade.id)) {
          tradeHistory.push(dbTrade);
          existingTradeIds.add(dbTrade.id);
        }
      }
      
      // Sort by timestamp descending
      tradeHistory.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`[Trading] ✅ Loaded trades: ${fileTradeCount} from file + ${walletTrades.length} from DB (${tradeHistory.length} total unique)`);
      return;
    }
    
    // Fallback: load from Trade table (bot-based, legacy)
    const dbTrades = await prisma.trade.findMany({
      where: { botId: DEFAULT_BOT_ID },
      orderBy: { entryTime: 'desc' },
      take: 100,
    });
    
    if (dbTrades.length > 0) {
      const legacyTrades = dbTrades.map(t => ({
        id: t.id,
        side: t.side.toLowerCase() as 'buy' | 'sell',
        symbol: t.symbol,
        price: t.entryPrice,
        quantity: t.quantity,
        leverage: (t.metadata as any)?.leverage || 1,
        stopLoss: t.stopLoss || 0,
        takeProfit: t.takeProfit || 0,
        entryFee: t.fees || 0,
        exitFee: (t.metadata as any)?.exitFee || 0,
        confidence: (t.metadata as any)?.confidence || 0,
        reasoning: (t.metadata as any)?.reasoning || '',
        timestamp: t.entryTime.getTime(),
        status: t.status.toLowerCase() as 'open' | 'closed' | 'cancelled',
        pnl: t.pnl || undefined,
        pnlWithFees: (t.metadata as any)?.pnlWithFees || undefined,
        exitPrice: t.exitPrice || undefined,
        exitTime: t.exitTime?.getTime(),
        walletAddress: (t.metadata as any)?.walletAddress || undefined,
      }));
      
      // Merge legacy trades
      for (const legacyTrade of legacyTrades) {
        if (!existingTradeIds.has(legacyTrade.id)) {
          tradeHistory.push(legacyTrade);
          existingTradeIds.add(legacyTrade.id);
        }
      }
      
      tradeHistory.sort((a, b) => b.timestamp - a.timestamp);
      console.log(`[Trading] ✅ Loaded trades: ${fileTradeCount} from file + ${dbTrades.length} from legacy DB (${tradeHistory.length} total unique)`);
    } else {
      console.log(`[Trading] ✅ Loaded ${fileTradeCount} trades from file (no DB trades found)`);
    }
  } catch (err) {
    console.error('[Trading] ⚠️ DB not available, using file-based trades only:', (err as Error).message);
    console.log(`[Trading] ✅ Using ${fileTradeCount} trades from file`);
  }
}

// Save trade to database and file
async function saveTradeToDb(trade: typeof tradeHistory[0]) {
  // Always persist to file first (reliable)
  persistTrades();
  
  try {
    // If we have a wallet address, save to TradeHistory (wallet-based)
    if (trade.walletAddress) {
      // Ensure WalletProfile exists
      await (prisma as any).walletProfile.upsert({
        where: { walletAddress: trade.walletAddress.toLowerCase() },
        create: {
          walletAddress: trade.walletAddress.toLowerCase(),
        },
        update: {
          lastActiveAt: new Date(),
        },
      });
      
      // Save to TradeHistory
      await (prisma as any).tradeHistory.upsert({
        where: { id: trade.id },
        create: {
          id: trade.id,
          walletAddress: trade.walletAddress.toLowerCase(),
          symbol: trade.symbol,
          side: trade.side,
          entryPrice: trade.price,
          exitPrice: trade.exitPrice,
          quantity: trade.quantity,
          leverage: trade.leverage,
          pnl: trade.pnlWithFees || trade.pnl,
          fees: trade.entryFee + trade.exitFee,
          entryTime: new Date(trade.timestamp),
          exitTime: trade.exitTime ? new Date(trade.exitTime) : null,
          aiConfidence: trade.confidence,
          aiReasoning: trade.reasoning,
          status: trade.status.toUpperCase(),
        },
        update: {
          exitPrice: trade.exitPrice,
          exitTime: trade.exitTime ? new Date(trade.exitTime) : null,
          pnl: trade.pnlWithFees || trade.pnl,
          fees: trade.entryFee + trade.exitFee,
          status: trade.status.toUpperCase(),
        },
      });
      
      console.log(`[Trading] Saved trade ${trade.id} to TradeHistory for wallet ${trade.walletAddress}`);
      return;
    }
    
    // Fallback: save to Trade table (bot-based)
    // Ensure bot exists
    await prisma.bot.upsert({
      where: { id: DEFAULT_BOT_ID },
      create: {
        id: DEFAULT_BOT_ID,
        userId: 'system',
        name: 'Default Trading Bot',
        symbol: 'BTC-PERP',
        config: {},
        status: 'RUNNING',
        paperTrading: false,
      },
      update: {},
    });
    
    // Ensure user exists
    await prisma.user.upsert({
      where: { id: 'system' },
      create: {
        id: 'system',
        email: 'system@whalez.ai',
        password: 'system',
        name: 'System',
      },
      update: {},
    });
    
    await prisma.trade.upsert({
      where: { id: trade.id },
      create: {
        id: trade.id,
        botId: DEFAULT_BOT_ID,
        symbol: trade.symbol,
        side: trade.side.toUpperCase() as 'BUY' | 'SELL',
        entryPrice: trade.price,
        exitPrice: trade.exitPrice,
        quantity: trade.quantity,
        entryTime: new Date(trade.timestamp),
        exitTime: trade.exitTime ? new Date(trade.exitTime) : null,
        pnl: trade.pnlWithFees || trade.pnl,
        fees: trade.entryFee + trade.exitFee,
        status: trade.status.toUpperCase() as 'OPEN' | 'CLOSED',
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        metadata: {
          confidence: trade.confidence,
          reasoning: trade.reasoning,
          leverage: trade.leverage,
          entryFee: trade.entryFee,
          exitFee: trade.exitFee,
          pnlWithFees: trade.pnlWithFees,
          walletAddress: trade.walletAddress,
        },
      },
      update: {
        exitPrice: trade.exitPrice,
        exitTime: trade.exitTime ? new Date(trade.exitTime) : null,
        pnl: trade.pnlWithFees || trade.pnl,
        fees: trade.entryFee + trade.exitFee,
        status: trade.status.toUpperCase() as 'OPEN' | 'CLOSED',
        metadata: {
          confidence: trade.confidence,
          reasoning: trade.reasoning,
          leverage: trade.leverage,
          entryFee: trade.entryFee,
          exitFee: trade.exitFee,
          pnlWithFees: trade.pnlWithFees,
          walletAddress: trade.walletAddress,
        },
      },
    });
    
    console.log(`[Trading] Saved trade ${trade.id} to database`);
  } catch (err) {
    console.error('[Trading] Failed to save trade to DB:', err);
  }
}

// Initialize: load settings and trades from DB
loadSettingsFromDB();
loadTradesFromDB();

// ============================================================================
// EXIT STRATEGY SYSTEM
// ============================================================================

// Track trailing stops for open positions
const trailingStopState: Map<string, {
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  currentStop: number;
  highestPrice: number; // For longs
  lowestPrice: number;  // For shorts
  trailingActivated: boolean;
  partialTaken: boolean; // Track if we took partial profits
}> = new Map();

// Exit strategy interval
let exitMonitorInterval: NodeJS.Timeout | null = null;

// Sync open positions from Hyperliquid to internal trade history
async function syncOpenPositions() {
  try {
    const agentArgs = getAgentArgs(state.activeUserWallet);
    const result = await pythonBridge.getPositions(agentArgs);
    
    if (!result.success || !result.positions || result.positions.length === 0) {
      console.log('[Exit Strategy] 📭 No open positions on Hyperliquid');
      return;
    }
    
    console.log(`[Exit Strategy] 🔄 Found ${result.positions.length} open position(s) on Hyperliquid`);
    
    for (const pos of result.positions) {
      // Python bridge returns 'symbol' not 'coin', and 'size' not 'szi'
      const coinName = (pos as any).symbol || pos.coin || '';
      if (!coinName) {
        console.log(`[Exit Strategy] ⚠️ Skipping position with no symbol:`, pos);
        continue;
      }
      const symbol = `${coinName}-PERP`;
      const size = (pos as any).size ?? pos.szi ?? 0;
      const side = size > 0 ? 'buy' : 'sell';
      const quantity = Math.abs(size);
      
      // Check if we already have this position tracked
      const existingTrade = tradeHistory.find(t => 
        t.status === 'open' && 
        t.symbol === symbol
      );
      
      if (!existingTrade) {
        // Calculate strategic SL/TP based on price history and bot settings
        const priceHistory = getSymbolPriceHistory(symbol);
        const trendStrength = calculateTrendStrength(priceHistory);
        const strategicLevels = calculateStrategicSLTP(pos.entryPx, side, priceHistory, trendStrength, {
          stopLossPct: botSettings.stopLossPct || 2,
          takeProfitPct: botSettings.takeProfitPct || 4,
          tradingMode: botSettings.tradingMode,
        });
        
        const stopLoss = strategicLevels.stopLoss;
        const takeProfit = strategicLevels.takeProfit;
        
        const newTrade = {
          id: `synced_${Date.now()}_${coinName}`,
          side: side as 'buy' | 'sell',
          symbol,
          price: pos.entryPx,
          quantity,
          leverage: pos.leverage || botSettings.maxLeverage,
          stopLoss,
          takeProfit,
          entryFee: pos.entryPx * quantity * 0.00035,
          exitFee: 0,
          confidence: 100,
          reasoning: '[SYNCED] Position imported from Hyperliquid',
          timestamp: Date.now(),
          status: 'open' as const,
          walletAddress: state.activeUserWallet || undefined,
        };
        
        tradeHistory.unshift(newTrade);
        console.log(`[Exit Strategy] ✅ Synced ${side.toUpperCase()} ${quantity} ${symbol} @ $${pos.entryPx}`);
        console.log(`[Exit Strategy] 🛑 SL: $${stopLoss.toFixed(2)} | 🎯 TP: $${takeProfit.toFixed(2)}`);
        
        // PLACE SL/TP ORDERS using OrderManager (handles cancellation of existing orders)
        try {
          console.log(`[Exit Strategy] 📤 Placing SL/TP orders via OrderManager...`);
          const slTpResult = await orderManager.placeSlTpOrders(
            coinName,
            side as 'buy' | 'sell',
            quantity,
            pos.entryPx,
            stopLoss,
            takeProfit,
            agentArgs
          );
          if (slTpResult.success) {
            console.log(`[Exit Strategy] ✅ SL/TP orders placed successfully`);
          } else {
            console.log(`[Exit Strategy] ⚠️ SL/TP issue: ${slTpResult.error}`);
          }
        } catch (orderErr) {
          console.error(`[Exit Strategy] ⚠️ Failed to place SL/TP orders:`, orderErr);
        }
      } else {
        // Position already tracked - don't place duplicate orders
        console.log(`[Exit Strategy] ℹ️ Position ${symbol} already tracked (skipping SL/TP)`);
      }
    }
    
    persistTrades();
  } catch (err) {
    console.error('[Exit Strategy] Error syncing positions:', err);
  }
}

// Start monitoring open positions for exit opportunities
async function startExitMonitor() {
  if (exitMonitorInterval) {
    clearInterval(exitMonitorInterval);
  }
  
  // First sync any existing positions from Hyperliquid
  await syncOpenPositions();
  
  // Check every 10 seconds
  exitMonitorInterval = setInterval(async () => {
    if (!botRunning || !state.armed) return;
    // Sync positions from Hyperliquid periodically to catch new positions
    await syncOpenPositions();
    await checkExitOpportunities();
  }, 10000);
  
  console.log('[Exit Strategy] 🎯 Exit monitor started');
}

// Stop exit monitor
function stopExitMonitor() {
  if (exitMonitorInterval) {
    clearInterval(exitMonitorInterval);
    exitMonitorInterval = null;
  }
}

// Check all open positions for exit opportunities
async function checkExitOpportunities() {
  const openTrades = tradeHistory.filter(t => t.status === 'open');
  if (openTrades.length === 0) return;
  
  const modeConfig = MODE_CONFIGS[botSettings.tradingMode] || MODE_CONFIGS['moderate'];
  
  for (const trade of openTrades) {
    try {
      const coinName = trade.symbol.replace('-PERP', '');
      const currentPrice = symbolLastPrice.get(trade.symbol) || 0;
      
      if (currentPrice === 0) continue;
      
      // CHECK IF POSITION IS STILL OPEN ON HYPERLIQUID
      const agentArgs = getAgentArgs(trade.walletAddress || null);
      const hasPosition = await pythonBridge.hasOpenPosition(coinName, agentArgs);
      
      if (!hasPosition) {
        // Position was closed (SL/TP hit or manual close)
        console.log(`[Exit Strategy] 🔔 Position ${trade.symbol} was CLOSED on exchange`);
        
        // Calculate final PnL
        const isLong = trade.side === 'buy';
        const pnl = isLong 
          ? (currentPrice - trade.price) * trade.quantity
          : (trade.price - currentPrice) * trade.quantity;
        const exitFee = currentPrice * trade.quantity * 0.00035; // Taker fee
        const pnlWithFees = pnl - trade.entryFee - exitFee;
        
        // Update trade status
        trade.status = 'closed';
        trade.exitPrice = currentPrice;
        trade.exitTime = Date.now();
        trade.pnl = pnl;
        trade.pnlWithFees = pnlWithFees;
        trade.exitFee = exitFee;
        
        // Record for Kelly Criterion and performance metrics
        const pnlPct = (pnlWithFees / (trade.price * trade.quantity)) * 100;
        quantEngine.recordTradeForKelly(pnlWithFees, pnlPct, trade.symbol);
        quantEngine.recordDailyReturn(pnlPct);
        
        // Clear tracked orders for this coin
        orderManager.clearTrackedOrders(coinName);
        
        // Update stats
        if (pnlWithFees > 0) {
          tradingStats.winsToday++;
          tradingStats.consecutiveLosses = 0;
          console.log(`[Exit Strategy] ✅ WIN: +$${pnlWithFees.toFixed(2)} (${pnlPct.toFixed(2)}%) on ${trade.symbol}`);
        } else {
          tradingStats.lossesToday++;
          tradingStats.consecutiveLosses++;
          console.log(`[Exit Strategy] ❌ LOSS: -$${Math.abs(pnlWithFees).toFixed(2)} on ${trade.symbol}`);
          
          // Check if we need to pause after consecutive losses
          if (tradingStats.consecutiveLosses >= (modeConfig?.maxConsecutiveLosses || 3)) {
            tradingStats.pauseUntil = Date.now() + (modeConfig?.pauseAfterLosses || 60 * 60 * 1000);
            console.log(`[Exit Strategy] ⏸️ PAUSING for ${(modeConfig?.pauseAfterLosses || 3600000) / 60000} minutes after ${tradingStats.consecutiveLosses} losses`);
          }
        }
        
        tradingStats.dailyPnl += pnlWithFees;
        
        // Clean up trailing stop state
        trailingStopState.delete(trade.id);
        
        // Persist trade
        persistTrades();
        await saveTradeToDb(trade);
        
        continue; // Skip to next trade
      }
      
      // Initialize trailing stop state if not exists
      if (!trailingStopState.has(trade.id)) {
        trailingStopState.set(trade.id, {
          symbol: trade.symbol,
          side: trade.side,
          entryPrice: trade.price,
          currentStop: trade.stopLoss,
          highestPrice: trade.price,
          lowestPrice: trade.price,
          trailingActivated: false,
          partialTaken: false,
        });
      }
      
      const trailState = trailingStopState.get(trade.id)!;
      const isLong = trade.side === 'buy';
      
      // Calculate current PnL %
      const pnlPct = isLong 
        ? ((currentPrice - trade.price) / trade.price) * 100
        : ((trade.price - currentPrice) / trade.price) * 100;
      
      // Update highest/lowest price
      if (isLong && currentPrice > trailState.highestPrice) {
        trailState.highestPrice = currentPrice;
      } else if (!isLong && currentPrice < trailState.lowestPrice) {
        trailState.lowestPrice = currentPrice;
      }
      
      // BREAKEVEN STOP - Move SL to entry when profit reaches 1%
      const breakevenThreshold = 1.0; // 1% profit to move to breakeven
      if (pnlPct >= breakevenThreshold && trailState.currentStop !== trade.price) {
        const wasBelow = isLong ? trailState.currentStop < trade.price : trailState.currentStop > trade.price;
        if (wasBelow) {
          trailState.currentStop = trade.price;
          console.log(`[Exit Strategy] 🔒 BREAKEVEN: SL moved to entry $${trade.price.toFixed(2)} for ${trade.symbol}`);
          const agentArgs = getAgentArgs(trade.walletAddress || null);
          // Use OrderManager to update SL (handles rate limiting and cancellation)
          await orderManager.updateStopLoss(coinName, trade.side, trade.quantity, trade.price, agentArgs, true);
        }
      }
      
      // TRAILING STOP LOGIC (uses user settings if available, falls back to mode config)
      const trailingEnabled = botSettings.enableTrailingStop ?? true;
      const trailingActivation = botSettings.trailingStopActivation ?? modeConfig?.trailingStopActivation ?? 1.0;
      const trailingDistance = botSettings.trailingStopDistance ?? modeConfig?.trailingStopDistance ?? 0.5;
      
      if (trailingEnabled && pnlPct >= trailingActivation && !trailState.trailingActivated) {
        trailState.trailingActivated = true;
        console.log(`[Exit Strategy] 🔄 Trailing stop ACTIVATED for ${trade.symbol} at ${pnlPct.toFixed(2)}% profit`);
      }
      
      if (trailingEnabled && trailState.trailingActivated) {
        // Calculate new trailing stop
        let newStop: number;
        if (isLong) {
          newStop = trailState.highestPrice * (1 - trailingDistance / 100);
          if (newStop > trailState.currentStop) {
            trailState.currentStop = newStop;
            console.log(`[Exit Strategy] 📈 Trailing stop moved UP to $${newStop.toFixed(2)} for ${trade.symbol}`);
            // Use OrderManager to update SL (handles rate limiting and cancellation)
            const agentArgs = getAgentArgs(trade.walletAddress || null);
            await orderManager.updateStopLoss(coinName, trade.side, trade.quantity, newStop, agentArgs);
          }
        } else {
          newStop = trailState.lowestPrice * (1 + trailingDistance / 100);
          if (newStop < trailState.currentStop) {
            trailState.currentStop = newStop;
            console.log(`[Exit Strategy] 📉 Trailing stop moved DOWN to $${newStop.toFixed(2)} for ${trade.symbol}`);
            // Use OrderManager to update SL (handles rate limiting and cancellation)
            const agentArgs = getAgentArgs(trade.walletAddress || null);
            await orderManager.updateStopLoss(coinName, trade.side, trade.quantity, newStop, agentArgs);
          }
        }
      }
      
      // PARTIAL PROFIT TAKING (at 50% of TP)
      const tpPct = botSettings.takeProfitPct || 4;
      const partialTrigger = tpPct / 2; // Take partial at half TP
      
      if (pnlPct >= partialTrigger && !trailState.partialTaken && trade.quantity > 0.0002) {
        // Take 50% profit
        const partialQty = trade.quantity / 2;
        console.log(`[Exit Strategy] 💰 Taking PARTIAL profit (50%) on ${trade.symbol} at ${pnlPct.toFixed(2)}%`);
        
        const agentArgs = getAgentArgs(trade.walletAddress || null);
        const closeSide = isLong ? 'sell' : 'buy';
        
        const result = await pythonBridge.executeLimitOrder(
          coinName, 
          closeSide, 
          partialQty, 
          currentPrice, 
          0.2, 
          agentArgs
        );
        
        if (result.success) {
          trailState.partialTaken = true;
          // Update trade quantity
          trade.quantity = trade.quantity - partialQty;
          console.log(`[Exit Strategy] ✅ Partial close executed. Remaining: ${trade.quantity}`);
        }
      }
      
      // LOG STATUS every minute
      if (Date.now() % 60000 < 10000) {
        console.log(`[Exit Strategy] 📊 ${trade.symbol}: PnL ${pnlPct.toFixed(2)}% | Trailing: ${trailState.trailingActivated ? 'ON' : 'OFF'} | Stop: $${trailState.currentStop.toFixed(2)}`);
      }
      
    } catch (err) {
      console.error(`[Exit Strategy] Error checking ${trade.symbol}:`, err);
    }
  }
}

// Smart filter state for API optimization
let lastPrice = 0;
let priceHistory: number[] = [];
let lastGrokCall = 0;
let skipCount = 0;

// ============================================================================
// GROK API GATE - Centralized control for ALL Grok API calls
// ============================================================================
// This is the SINGLE source of truth for whether Grok should be called.
// ALL Grok calls MUST go through this gate.
// ============================================================================

interface GrokCallRecord { 
  timestamp: number; 
  symbol: string; 
  score: number;
  reason: string;
  type: 'analysis' | 'self_critique' | 'forced';
}

interface GrokGateConfig {
  maxCallsPerDay: number;           // Hard limit per day
  minScoreToCall: number;           // Minimum opportunity score
  minCooldownMs: number;            // Minimum time between calls
  requirePattern: boolean;          // Must have a detected pattern
  minVolatilityPct: number;         // Minimum volatility to consider
  maxVolatilityPct: number;         // Maximum volatility (too risky)
}

// Mode-specific Grok gate configurations
const GROK_GATE_CONFIGS: Record<string, GrokGateConfig> = {
  aggressive: {
    maxCallsPerDay: 20,              // 20 calls max in aggressive
    minScoreToCall: 55,              // Need decent score
    minCooldownMs: 3 * 60 * 1000,    // 3 minutes minimum between calls
    requirePattern: true,            // Must have a pattern detected
    minVolatilityPct: 0.1,           // Need some movement
    maxVolatilityPct: 5.0,           // Not too crazy
  },
  moderate: {
    maxCallsPerDay: 15,
    minScoreToCall: 65,
    minCooldownMs: 5 * 60 * 1000,    // 5 minutes
    requirePattern: true,
    minVolatilityPct: 0.2,
    maxVolatilityPct: 4.0,
  },
  conservative: {
    maxCallsPerDay: 10,
    minScoreToCall: 75,
    minCooldownMs: 10 * 60 * 1000,   // 10 minutes
    requirePattern: true,
    minVolatilityPct: 0.3,
    maxVolatilityPct: 3.0,
  },
};

const grokGateState = {
  callsToday: 0,
  lastResetDate: new Date().toDateString(),
  lastCallTimestamp: 0,
  callHistory: [] as GrokCallRecord[],
  consecutiveSkips: 0,
  lastSkipReason: '',
};

// Reset daily counter if new day
function resetGrokGateIfNewDay(): void {
  const today = new Date().toDateString();
  if (today !== grokGateState.lastResetDate) {
    console.log(`[GrokGate] 🔄 New day - resetting (was ${grokGateState.callsToday} calls)`);
    grokGateState.callsToday = 0;
    grokGateState.lastResetDate = today;
    grokGateState.consecutiveSkips = 0;
  }
}

// The MAIN gate function - determines if Grok should be called
interface GrokGateDecision {
  allowed: boolean;
  reason: string;
  remainingCalls: number;
  nextAllowedIn?: number; // ms until next allowed call
}

function shouldCallGrok(
  mode: string,
  score: number,
  pattern: { type: string; direction: string },
  volatility: number,
  forceCall = false
): GrokGateDecision {
  resetGrokGateIfNewDay();
  
  const config: GrokGateConfig = GROK_GATE_CONFIGS[mode] ?? GROK_GATE_CONFIGS['moderate'] ?? {
    maxCallsPerDay: 15,
    minScoreToCall: 65,
    minCooldownMs: 5 * 60 * 1000,
    requirePattern: true,
    minVolatilityPct: 0.2,
    maxVolatilityPct: 4.0,
  };
  const now = Date.now();
  const timeSinceLastCall = now - grokGateState.lastCallTimestamp;
  const remainingCalls = Math.max(0, config.maxCallsPerDay - grokGateState.callsToday);
  
  // Check 1: Daily limit (HARD BLOCK - never bypass)
  if (grokGateState.callsToday >= config.maxCallsPerDay) {
    grokGateState.lastSkipReason = 'daily_limit';
    grokGateState.consecutiveSkips++;
    return {
      allowed: false,
      reason: `Daily limit reached (${grokGateState.callsToday}/${config.maxCallsPerDay})`,
      remainingCalls: 0,
    };
  }
  
  // Check 2: Cooldown (can be bypassed by force, but still logged)
  if (timeSinceLastCall < config.minCooldownMs && !forceCall) {
    const nextAllowedIn = config.minCooldownMs - timeSinceLastCall;
    grokGateState.lastSkipReason = 'cooldown';
    grokGateState.consecutiveSkips++;
    return {
      allowed: false,
      reason: `Cooldown active (${Math.round(nextAllowedIn / 1000)}s remaining)`,
      remainingCalls,
      nextAllowedIn,
    };
  }
  
  // Check 3: Score threshold
  if (score < config.minScoreToCall && !forceCall) {
    grokGateState.lastSkipReason = 'low_score';
    grokGateState.consecutiveSkips++;
    return {
      allowed: false,
      reason: `Score too low (${score} < ${config.minScoreToCall})`,
      remainingCalls,
    };
  }
  
  // Check 4: Pattern requirement
  if (config.requirePattern && pattern.type === 'none' && !forceCall) {
    grokGateState.lastSkipReason = 'no_pattern';
    grokGateState.consecutiveSkips++;
    return {
      allowed: false,
      reason: 'No pattern detected',
      remainingCalls,
    };
  }
  
  // Check 5: Volatility bounds
  if (volatility < config.minVolatilityPct && !forceCall) {
    grokGateState.lastSkipReason = 'low_volatility';
    grokGateState.consecutiveSkips++;
    return {
      allowed: false,
      reason: `Volatility too low (${volatility.toFixed(2)}% < ${config.minVolatilityPct}%)`,
      remainingCalls,
    };
  }
  
  if (volatility > config.maxVolatilityPct && !forceCall) {
    grokGateState.lastSkipReason = 'high_volatility';
    grokGateState.consecutiveSkips++;
    return {
      allowed: false,
      reason: `Volatility too high (${volatility.toFixed(2)}% > ${config.maxVolatilityPct}%)`,
      remainingCalls,
    };
  }
  
  // All checks passed - allow the call
  grokGateState.consecutiveSkips = 0;
  return {
    allowed: true,
    reason: forceCall ? 'Forced call' : `Score ${score} with ${pattern.type} pattern`,
    remainingCalls,
  };
}

// Record a Grok call (call this AFTER the API call succeeds)
function recordGrokCall(symbol: string, score: number, reason: string, type: 'analysis' | 'self_critique' | 'forced' = 'analysis'): void {
  resetGrokGateIfNewDay();
  grokGateState.callsToday++;
  grokGateState.lastCallTimestamp = Date.now();
  grokGateState.callHistory.push({ 
    timestamp: Date.now(), 
    symbol, 
    score, 
    reason,
    type 
  });
  
  // Keep only last 100 calls in history
  if (grokGateState.callHistory.length > 100) {
    grokGateState.callHistory = grokGateState.callHistory.slice(-100);
  }
  
  const maxCalls = GROK_GATE_CONFIGS[botSettings.tradingMode]?.maxCallsPerDay ?? 15;
  console.log(`[GrokGate] ✅ API call #${grokGateState.callsToday}/${maxCalls} | ${symbol} | Score: ${score} | ${reason}`);
}

// Helper to get config safely
function getGrokConfig(): GrokGateConfig {
  return GROK_GATE_CONFIGS[botSettings.tradingMode] ?? GROK_GATE_CONFIGS['moderate'] ?? {
    maxCallsPerDay: 15,
    minScoreToCall: 65,
    minCooldownMs: 5 * 60 * 1000,
    requirePattern: true,
    minVolatilityPct: 0.2,
    maxVolatilityPct: 4.0,
  };
}

// Get usage stats for monitoring
function getGrokUsageStats() {
  resetGrokGateIfNewDay();
  const config = getGrokConfig();
  const now = Date.now();
  const timeSinceLastCall = now - grokGateState.lastCallTimestamp;
  
  return {
    callsToday: grokGateState.callsToday,
    maxCalls: config.maxCallsPerDay,
    remaining: Math.max(0, config.maxCallsPerDay - grokGateState.callsToday),
    lastCallTimestamp: grokGateState.lastCallTimestamp,
    timeSinceLastCall: Math.round(timeSinceLastCall / 1000),
    cooldownRemaining: Math.max(0, Math.round((config.minCooldownMs - timeSinceLastCall) / 1000)),
    consecutiveSkips: grokGateState.consecutiveSkips,
    lastSkipReason: grokGateState.lastSkipReason,
    config: {
      minScoreToCall: config.minScoreToCall,
      minCooldownMs: config.minCooldownMs,
      requirePattern: config.requirePattern,
      minVolatilityPct: config.minVolatilityPct,
      maxVolatilityPct: config.maxVolatilityPct,
    },
    lastCalls: grokGateState.callHistory.slice(-10),
  };
}

// Legacy compatibility functions
function canCallGrok(): boolean {
  resetGrokGateIfNewDay();
  const config = getGrokConfig();
  return grokGateState.callsToday < config.maxCallsPerDay;
}

function getGrokRemainingCalls(): number {
  resetGrokGateIfNewDay();
  const config = getGrokConfig();
  return Math.max(0, config.maxCallsPerDay - grokGateState.callsToday);
}

// Price history PER SYMBOL (max 5 pairs in trading bag)
const symbolPriceHistory: Map<string, number[]> = new Map();
const symbolLastPrice: Map<string, number> = new Map();
const symbol24hPrices: Map<string, { price: number; timestamp: number }[]> = new Map();
const symbolVolumeData: Map<string, { volume: number; prevDayPx: number }> = new Map();

// Order book data cache (refreshed periodically)
interface OrderBookData {
  bestBid: number;
  bestAsk: number;
  spread: number;
  imbalance: number; // Positive = buy pressure, negative = sell pressure
  bidWall: { price: number; size: number } | null;
  askWall: { price: number; size: number } | null;
  totalBidSize: number;
  totalAskSize: number;
  timestamp: number;
}
const symbolOrderBook: Map<string, OrderBookData> = new Map();

// Get or create price history for a symbol
function getSymbolPriceHistory(symbol: string): number[] {
  if (!symbolPriceHistory.has(symbol)) {
    symbolPriceHistory.set(symbol, []);
  }
  return symbolPriceHistory.get(symbol)!;
}

// Calculate 24h change for a symbol
function calculate24hChange(symbol: string, currentPrice: number): number {
  const history = symbol24hPrices.get(symbol) || [];
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  
  // Find price from ~24h ago
  const oldEntry = history.find(h => h.timestamp <= oneDayAgo);
  if (oldEntry) {
    return ((currentPrice - oldEntry.price) / oldEntry.price) * 100;
  }
  
  // If no 24h data, use oldest available
  if (history.length > 0) {
    const oldest = history[0];
    if (oldest) {
      return ((currentPrice - oldest.price) / oldest.price) * 100;
    }
  }
  
  return 0;
}

// Update 24h price history for a symbol
function update24hPriceHistory(symbol: string, price: number) {
  if (!symbol24hPrices.has(symbol)) {
    symbol24hPrices.set(symbol, []);
  }
  const history = symbol24hPrices.get(symbol)!;
  const now = Date.now();
  
  // Add current price
  history.push({ price, timestamp: now });
  
  // Keep only last 24h + 1h buffer
  const cutoff = now - 25 * 60 * 60 * 1000;
  while (history.length > 0 && history[0] && history[0].timestamp < cutoff) {
    history.shift();
  }
  
  // Limit to 1000 entries max
  while (history.length > 1000) {
    history.shift();
  }
}

// Volatility tracking
let volatilityHistory: number[] = [];
let avgVolatility = 0;

// ============================================================================
// ALGORITHMIC TRADING ENGINE v3.0
// ============================================================================
// CORE PRINCIPLES:
// 1. CONFLUENCE - Multiple signals must align (min 3) before entry
// 2. SESSION AWARENESS - Trade during high liquidity hours
// 3. CORRELATION MANAGEMENT - Limit exposure to correlated assets
// 4. DYNAMIC SIZING - Adjust position size based on performance
// 5. REGIME DETECTION - Adapt strategy to market conditions
// 6. GROK = NEWS/SENTIMENT ONLY - Not for trade decisions
// ============================================================================

// ============================================================================
// SECTION 1: CONFLUENCE SYSTEM - Requires multiple aligned signals
// ============================================================================

interface SignalConfluence {
  name: string;
  direction: 'long' | 'short' | 'neutral';
  strength: number; // 0-100
  weight: number;   // Importance multiplier
}

interface ConfluenceResult {
  signals: SignalConfluence[];
  alignedCount: number;
  totalStrength: number;
  direction: 'long' | 'short' | 'neutral';
  isValid: boolean; // True if enough signals align
  reasons: string[];
}

// Minimum signals required for each mode
const MIN_CONFLUENCE_SIGNALS = {
  aggressive: 3,  // Scalping needs 3 aligned signals
  moderate: 4,    // Intraday needs 4 aligned signals
  conservative: 5 // Swing needs 5 aligned signals
};

function calculateConfluence(
  prices: number[],
  currentPrice: number,
  mode: string,
  orderBookImbalance: number = 0,
  volumes: number[] = [],
  orderBook?: { bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }> }
): ConfluenceResult {
  const signals: SignalConfluence[] = [];
  const reasons: string[] = [];
  
  if (prices.length < 30) {
    return { signals: [], alignedCount: 0, totalStrength: 0, direction: 'neutral', isValid: false, reasons: ['Insufficient data'] };
  }
  
  // ========== MOMENTUM INDICATORS ==========
  
  // 1. RSI Signal (Classic oversold/overbought)
  const rsi = calculateRSI(prices, 14);
  if (rsi <= 30) {
    signals.push({ name: 'RSI_OVERSOLD', direction: 'long', strength: Math.min(100, (30 - rsi) * 5 + 50), weight: 1.2 });
    reasons.push(`RSI oversold (${rsi.toFixed(1)})`);
  } else if (rsi >= 70) {
    signals.push({ name: 'RSI_OVERBOUGHT', direction: 'short', strength: Math.min(100, (rsi - 70) * 5 + 50), weight: 1.2 });
    reasons.push(`RSI overbought (${rsi.toFixed(1)})`);
  }
  
  // 2. Stochastic RSI (More sensitive, catches reversals earlier)
  const stochRSI = calculateStochRSI(prices);
  if (stochRSI.signal === 'oversold' && stochRSI.crossover === 'bullish_cross') {
    signals.push({ name: 'STOCH_RSI_BULLISH', direction: 'long', strength: 85, weight: 1.4 });
    reasons.push(`StochRSI bullish cross from oversold (K:${stochRSI.k.toFixed(1)})`);
  } else if (stochRSI.signal === 'overbought' && stochRSI.crossover === 'bearish_cross') {
    signals.push({ name: 'STOCH_RSI_BEARISH', direction: 'short', strength: 85, weight: 1.4 });
    reasons.push(`StochRSI bearish cross from overbought (K:${stochRSI.k.toFixed(1)})`);
  } else if (stochRSI.signal === 'oversold') {
    signals.push({ name: 'STOCH_RSI_OVERSOLD', direction: 'long', strength: 60, weight: 0.8 });
    reasons.push(`StochRSI oversold (${stochRSI.k.toFixed(1)})`);
  } else if (stochRSI.signal === 'overbought') {
    signals.push({ name: 'STOCH_RSI_OVERBOUGHT', direction: 'short', strength: 60, weight: 0.8 });
    reasons.push(`StochRSI overbought (${stochRSI.k.toFixed(1)})`);
  }
  
  // 3. Williams %R (Confirms momentum extremes)
  const williamsR = calculateWilliamsR(prices);
  if (williamsR.signal === 'oversold' && rsi < 40) {
    signals.push({ name: 'WILLIAMS_OVERSOLD', direction: 'long', strength: 65, weight: 0.9 });
    reasons.push(`Williams %R oversold (${williamsR.value.toFixed(1)})`);
  } else if (williamsR.signal === 'overbought' && rsi > 60) {
    signals.push({ name: 'WILLIAMS_OVERBOUGHT', direction: 'short', strength: 65, weight: 0.9 });
    reasons.push(`Williams %R overbought (${williamsR.value.toFixed(1)})`);
  }
  
  // ========== TREND INDICATORS ==========
  
  // 4. EMA Stack (Trend direction)
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const ema50 = calculateEMA(prices, 50);
  const emaCrossStrength = Math.abs((ema9 - ema21) / ema21) * 1000;
  
  if (ema9 > ema21 && ema21 > ema50) {
    signals.push({ name: 'EMA_BULLISH_STACK', direction: 'long', strength: Math.min(90, 50 + emaCrossStrength), weight: 1.5 });
    reasons.push('EMA bullish stack (9>21>50)');
  } else if (ema9 < ema21 && ema21 < ema50) {
    signals.push({ name: 'EMA_BEARISH_STACK', direction: 'short', strength: Math.min(90, 50 + emaCrossStrength), weight: 1.5 });
    reasons.push('EMA bearish stack (9<21<50)');
  } else if (ema9 > ema21) {
    signals.push({ name: 'EMA_CROSS_UP', direction: 'long', strength: Math.min(70, 40 + emaCrossStrength), weight: 1.0 });
    reasons.push('EMA 9 > 21');
  } else if (ema9 < ema21) {
    signals.push({ name: 'EMA_CROSS_DOWN', direction: 'short', strength: Math.min(70, 40 + emaCrossStrength), weight: 1.0 });
    reasons.push('EMA 9 < 21');
  }
  
  // 5. MACD (Trend momentum - HIGH WEIGHT)
  const macd = calculateMACD(prices);
  if (macd.crossover === 'bullish_cross') {
    signals.push({ name: 'MACD_BULLISH_CROSS', direction: 'long', strength: 90, weight: 1.6 });
    reasons.push('MACD bullish crossover');
  } else if (macd.crossover === 'bearish_cross') {
    signals.push({ name: 'MACD_BEARISH_CROSS', direction: 'short', strength: 90, weight: 1.6 });
    reasons.push('MACD bearish crossover');
  } else if (macd.trend === 'bullish' && macd.histogram > 0) {
    signals.push({ name: 'MACD_BULLISH', direction: 'long', strength: 65, weight: 1.1 });
    reasons.push(`MACD bullish (hist: ${macd.histogram.toFixed(4)})`);
  } else if (macd.trend === 'bearish' && macd.histogram < 0) {
    signals.push({ name: 'MACD_BEARISH', direction: 'short', strength: 65, weight: 1.1 });
    reasons.push(`MACD bearish (hist: ${macd.histogram.toFixed(4)})`);
  }
  
  // 6. ADX (Trend strength - filters weak trends)
  const adx = calculateADX(prices);
  if (adx.trend === 'strong_trend') {
    if (adx.direction === 'bullish') {
      signals.push({ name: 'ADX_STRONG_BULLISH', direction: 'long', strength: 75, weight: 1.3 });
      reasons.push(`Strong bullish trend (ADX: ${adx.adx.toFixed(1)})`);
    } else if (adx.direction === 'bearish') {
      signals.push({ name: 'ADX_STRONG_BEARISH', direction: 'short', strength: 75, weight: 1.3 });
      reasons.push(`Strong bearish trend (ADX: ${adx.adx.toFixed(1)})`);
    }
  }
  
  // 7. CCI (Commodity Channel Index - trend confirmation)
  const cci = calculateCCI(prices);
  if (cci.signal === 'oversold' && cci.trend !== 'bearish') {
    signals.push({ name: 'CCI_OVERSOLD', direction: 'long', strength: 70, weight: 1.0 });
    reasons.push(`CCI oversold (${cci.value.toFixed(0)})`);
  } else if (cci.signal === 'overbought' && cci.trend !== 'bullish') {
    signals.push({ name: 'CCI_OVERBOUGHT', direction: 'short', strength: 70, weight: 1.0 });
    reasons.push(`CCI overbought (${cci.value.toFixed(0)})`);
  }
  
  // ========== VOLATILITY INDICATORS ==========
  
  // 8. Bollinger Bands (Mean reversion + squeeze)
  const bb = calculateBollingerBands(prices);
  if (bb.squeeze) {
    // Squeeze = consolidation, prepare for breakout
    const momentum5 = ((currentPrice - (prices[prices.length - 6] || currentPrice)) / (prices[prices.length - 6] || currentPrice)) * 100;
    const breakoutDir = momentum5 > 0.1 ? 'long' : momentum5 < -0.1 ? 'short' : 'neutral';
    if (breakoutDir !== 'neutral') {
      signals.push({ name: 'BB_SQUEEZE_BREAKOUT', direction: breakoutDir, strength: 70, weight: 1.2 });
      reasons.push(`BB squeeze breakout ${breakoutDir} (BW: ${bb.bandwidth.toFixed(2)}%)`);
    }
  } else if (bb.signal === 'buy' && bb.percentB < 0.1) {
    signals.push({ name: 'BB_LOWER_TOUCH', direction: 'long', strength: 75, weight: 1.1 });
    reasons.push(`Price at lower BB (%B: ${(bb.percentB * 100).toFixed(1)}%)`);
  } else if (bb.signal === 'sell' && bb.percentB > 0.9) {
    signals.push({ name: 'BB_UPPER_TOUCH', direction: 'short', strength: 75, weight: 1.1 });
    reasons.push(`Price at upper BB (%B: ${(bb.percentB * 100).toFixed(1)}%)`);
  }
  
  // ========== PRICE ACTION ==========
  
  // 9. Price Momentum
  const momentum5 = ((currentPrice - (prices[prices.length - 6] || currentPrice)) / (prices[prices.length - 6] || currentPrice)) * 100;
  const momentum10 = ((currentPrice - (prices[prices.length - 11] || currentPrice)) / (prices[prices.length - 11] || currentPrice)) * 100;
  
  if (momentum5 > 0.3 && momentum10 > 0.5) {
    signals.push({ name: 'MOMENTUM_UP', direction: 'long', strength: Math.min(80, 40 + momentum5 * 20), weight: 1.0 });
    reasons.push(`Momentum up (${momentum5.toFixed(2)}%)`);
  } else if (momentum5 < -0.3 && momentum10 < -0.5) {
    signals.push({ name: 'MOMENTUM_DOWN', direction: 'short', strength: Math.min(80, 40 + Math.abs(momentum5) * 20), weight: 1.0 });
    reasons.push(`Momentum down (${momentum5.toFixed(2)}%)`);
  }
  
  // 10. Support/Resistance Bounce
  const { support, resistance } = detectSupportResistance(prices);
  const distanceToSupport = ((currentPrice - support) / support) * 100;
  const distanceToResistance = ((resistance - currentPrice) / currentPrice) * 100;
  
  if (distanceToSupport < 0.5 && distanceToSupport > 0) {
    signals.push({ name: 'SUPPORT_BOUNCE', direction: 'long', strength: 75, weight: 1.3 });
    reasons.push(`Near support ($${support.toFixed(2)})`);
  } else if (distanceToResistance < 0.5 && distanceToResistance > 0) {
    signals.push({ name: 'RESISTANCE_REJECTION', direction: 'short', strength: 75, weight: 1.3 });
    reasons.push(`Near resistance ($${resistance.toFixed(2)})`);
  }
  
  // 11. Order Book Imbalance
  if (orderBookImbalance > 15) {
    signals.push({ name: 'ORDER_BOOK_BUY_PRESSURE', direction: 'long', strength: Math.min(70, 40 + orderBookImbalance), weight: 0.8 });
    reasons.push(`Buy pressure (${orderBookImbalance.toFixed(1)}%)`);
  } else if (orderBookImbalance < -15) {
    signals.push({ name: 'ORDER_BOOK_SELL_PRESSURE', direction: 'short', strength: Math.min(70, 40 + Math.abs(orderBookImbalance)), weight: 0.8 });
    reasons.push(`Sell pressure (${orderBookImbalance.toFixed(1)}%)`);
  }
  
  // ========== QUANT ENGINE SIGNALS ==========
  
  // 12. Z-Score Mean Reversion (from quant-engine)
  const zScoreResult = quantEngine.calculateZScore(prices, 20);
  if (zScoreResult.signal === 'strong_buy') {
    signals.push({ name: 'ZSCORE_STRONG_BUY', direction: 'long', strength: 90, weight: 1.5 });
    reasons.push(`Z-Score strong buy (${zScoreResult.zScore.toFixed(2)}σ below mean)`);
  } else if (zScoreResult.signal === 'buy') {
    signals.push({ name: 'ZSCORE_BUY', direction: 'long', strength: 70, weight: 1.2 });
    reasons.push(`Z-Score buy (${zScoreResult.zScore.toFixed(2)}σ below mean)`);
  } else if (zScoreResult.signal === 'strong_sell') {
    signals.push({ name: 'ZSCORE_STRONG_SELL', direction: 'short', strength: 90, weight: 1.5 });
    reasons.push(`Z-Score strong sell (${zScoreResult.zScore.toFixed(2)}σ above mean)`);
  } else if (zScoreResult.signal === 'sell') {
    signals.push({ name: 'ZSCORE_SELL', direction: 'short', strength: 70, weight: 1.2 });
    reasons.push(`Z-Score sell (${zScoreResult.zScore.toFixed(2)}σ above mean)`);
  }
  
  // 13. VWAP Signal (from quant-engine)
  if (volumes.length >= 20) {
    const vwapData = quantEngine.calculateVWAP(prices.slice(-50), volumes.slice(-50));
    if (vwapData.signal === 'buy') {
      signals.push({ name: 'VWAP_BUY', direction: 'long', strength: 75, weight: 1.3 });
      reasons.push(`Price below VWAP lower band (dev: ${vwapData.deviation.toFixed(2)}%)`);
    } else if (vwapData.signal === 'sell') {
      signals.push({ name: 'VWAP_SELL', direction: 'short', strength: 75, weight: 1.3 });
      reasons.push(`Price above VWAP upper band (dev: ${vwapData.deviation.toFixed(2)}%)`);
    }
  }
  
  // 14. Order Flow Delta (from quant-engine)
  if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
    const orderFlowData = quantEngine.analyzeOrderFlow(orderBook.bids, orderBook.asks);
    if (orderFlowData.imbalance === 'strong_buy') {
      signals.push({ name: 'ORDERFLOW_STRONG_BUY', direction: 'long', strength: 85, weight: 1.4 });
      reasons.push(`Strong order flow buy pressure (delta: ${orderFlowData.deltaPercent.toFixed(1)}%)`);
    } else if (orderFlowData.imbalance === 'buy') {
      signals.push({ name: 'ORDERFLOW_BUY', direction: 'long', strength: 65, weight: 1.0 });
      reasons.push(`Order flow buy pressure (delta: ${orderFlowData.deltaPercent.toFixed(1)}%)`);
    } else if (orderFlowData.imbalance === 'strong_sell') {
      signals.push({ name: 'ORDERFLOW_STRONG_SELL', direction: 'short', strength: 85, weight: 1.4 });
      reasons.push(`Strong order flow sell pressure (delta: ${orderFlowData.deltaPercent.toFixed(1)}%)`);
    } else if (orderFlowData.imbalance === 'sell') {
      signals.push({ name: 'ORDERFLOW_SELL', direction: 'short', strength: 65, weight: 1.0 });
      reasons.push(`Order flow sell pressure (delta: ${orderFlowData.deltaPercent.toFixed(1)}%)`);
    }
    
    // Institutional activity warning
    if (orderFlowData.institutionalActivity) {
      reasons.push(`⚠️ Institutional activity detected (${orderFlowData.largeOrdersDetected} large orders)`);
    }
  }
  
  // 15. Higher Highs / Lower Lows (Trend Structure)
  const last5Highs: number[] = [];
  const last5Lows: number[] = [];
  for (let i = prices.length - 5; i < prices.length; i++) {
    if (i >= 2 && prices[i] !== undefined && prices[i-1] !== undefined && prices[i-2] !== undefined) {
      if (prices[i-1]! > prices[i-2]! && prices[i-1]! > prices[i]!) last5Highs.push(prices[i-1]!);
      if (prices[i-1]! < prices[i-2]! && prices[i-1]! < prices[i]!) last5Lows.push(prices[i-1]!);
    }
  }
  
  if (last5Highs.length >= 2 && last5Highs[last5Highs.length-1]! > last5Highs[last5Highs.length-2]!) {
    signals.push({ name: 'HIGHER_HIGHS', direction: 'long', strength: 65, weight: 1.1 });
    reasons.push('Higher highs forming');
  } else if (last5Lows.length >= 2 && last5Lows[last5Lows.length-1]! < last5Lows[last5Lows.length-2]!) {
    signals.push({ name: 'LOWER_LOWS', direction: 'short', strength: 65, weight: 1.1 });
    reasons.push('Lower lows forming');
  }
  
  // ========== CONFLUENCE CALCULATION ==========
  
  // Count aligned signals
  const longSignals = signals.filter(s => s.direction === 'long');
  const shortSignals = signals.filter(s => s.direction === 'short');
  
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  let alignedSignals: SignalConfluence[] = [];
  
  // Require clear majority (at least 2 more signals in one direction)
  if (longSignals.length > shortSignals.length + 1 && longSignals.length >= 2) {
    direction = 'long';
    alignedSignals = longSignals;
  } else if (shortSignals.length > longSignals.length + 1 && shortSignals.length >= 2) {
    direction = 'short';
    alignedSignals = shortSignals;
  }
  
  // Calculate weighted strength
  const totalWeight = alignedSignals.reduce((sum, s) => sum + s.weight, 0);
  const totalStrength = totalWeight > 0 
    ? alignedSignals.reduce((sum, s) => sum + s.strength * s.weight, 0) / totalWeight
    : 0;
  
  const minRequired = MIN_CONFLUENCE_SIGNALS[mode as keyof typeof MIN_CONFLUENCE_SIGNALS] || 4;
  
  // Stricter validation: need minimum signals AND good strength AND clear direction
  const isValid = alignedSignals.length >= minRequired && 
                  totalStrength >= 55 && 
                  direction !== 'neutral';
  
  return {
    signals,
    alignedCount: alignedSignals.length,
    totalStrength: Math.round(totalStrength),
    direction,
    isValid,
    reasons,
  };
}

// ============================================================================
// SECTION 2: SESSION FILTER - Trade during optimal hours
// ============================================================================

interface SessionInfo {
  name: string;
  isActive: boolean;
  liquidityScore: number; // 0-100
  volatilityExpected: 'low' | 'medium' | 'high';
  recommendation: 'trade' | 'caution' | 'avoid';
}

function getSessionInfo(): SessionInfo {
  const now = new Date();
  const hour = now.getUTCHours();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  
  // Weekend - crypto still trades but lower volume
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      name: 'Weekend',
      isActive: true,
      liquidityScore: 40,
      volatilityExpected: 'low',
      recommendation: 'caution',
    };
  }
  
  // Asian Session: 00:00 - 08:00 UTC
  if (hour >= 0 && hour < 8) {
    return {
      name: 'Asian Session',
      isActive: true,
      liquidityScore: 50,
      volatilityExpected: 'medium',
      recommendation: 'caution',
    };
  }
  
  // London Session: 08:00 - 16:00 UTC
  if (hour >= 8 && hour < 16) {
    // London/US overlap (13:00-16:00) is best
    if (hour >= 13) {
      return {
        name: 'London/US Overlap',
        isActive: true,
        liquidityScore: 100,
        volatilityExpected: 'high',
        recommendation: 'trade',
      };
    }
    return {
      name: 'London Session',
      isActive: true,
      liquidityScore: 80,
      volatilityExpected: 'medium',
      recommendation: 'trade',
    };
  }
  
  // US Session: 16:00 - 22:00 UTC
  if (hour >= 16 && hour < 22) {
    return {
      name: 'US Session',
      isActive: true,
      liquidityScore: 90,
      volatilityExpected: 'high',
      recommendation: 'trade',
    };
  }
  
  // Dead zone: 22:00 - 00:00 UTC
  return {
    name: 'Low Liquidity',
    isActive: false,
    liquidityScore: 30,
    volatilityExpected: 'low',
    recommendation: 'avoid',
  };
}

// ============================================================================
// SECTION 3: CORRELATION MANAGEMENT - Limit correlated exposure
// ============================================================================

// Crypto correlation groups (simplified)
const CORRELATION_GROUPS = {
  BTC_CORRELATED: ['BTC', 'ETH', 'SOL', 'AVAX', 'MATIC', 'DOT', 'ATOM'],
  MEME_COINS: ['DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF'],
  DEFI: ['UNI', 'AAVE', 'LINK', 'MKR', 'CRV', 'SUSHI'],
  LAYER2: ['ARB', 'OP', 'MATIC', 'IMX', 'STRK'],
  AI_TOKENS: ['FET', 'AGIX', 'OCEAN', 'RNDR', 'TAO'],
};

interface CorrelationCheck {
  canOpen: boolean;
  reason: string;
  currentExposure: number;
  maxExposure: number;
  correlatedPositions: string[];
}

function checkCorrelation(symbol: string, openPositions: typeof tradeHistory): CorrelationCheck {
  const coin = symbol.replace('-PERP', '').replace('USDT', '');
  const activePositions = openPositions.filter(t => t.status === 'open');
  
  // Find which group this coin belongs to
  let coinGroup: string | null = null;
  for (const [group, coins] of Object.entries(CORRELATION_GROUPS)) {
    if (coins.includes(coin)) {
      coinGroup = group;
      break;
    }
  }
  
  // Count positions in the same correlation group
  const correlatedPositions: string[] = [];
  for (const pos of activePositions) {
    const posCoin = pos.symbol.replace('-PERP', '').replace('USDT', '');
    if (posCoin === coin) continue;
    
    for (const [group, coins] of Object.entries(CORRELATION_GROUPS)) {
      if (group === coinGroup && coins.includes(posCoin)) {
        correlatedPositions.push(pos.symbol);
      }
    }
  }
  
  // BTC is special - if BTC position open, limit all other positions
  const hasBTCPosition = activePositions.some(p => p.symbol.includes('BTC'));
  const maxCorrelated = hasBTCPosition ? 1 : 2;
  
  const canOpen = correlatedPositions.length < maxCorrelated;
  
  return {
    canOpen,
    reason: canOpen 
      ? 'Correlation check passed' 
      : `Too many correlated positions (${correlatedPositions.length}/${maxCorrelated})`,
    currentExposure: correlatedPositions.length,
    maxExposure: maxCorrelated,
    correlatedPositions,
  };
}

// ============================================================================
// SECTION 4: DYNAMIC POSITION SIZING - Adjust based on performance
// ============================================================================

interface DynamicSizeResult {
  multiplier: number;  // 0.25 to 2.0
  reason: string;
  confidence: 'low' | 'medium' | 'high';
}

function calculateDynamicSizeMultiplier(stats: TradingStats, confluenceStrength: number): DynamicSizeResult {
  let multiplier = 1.0;
  const reasons: string[] = [];
  
  // 1. Consecutive losses reduction
  if (stats.consecutiveLosses >= 3) {
    multiplier *= 0.25; // 75% reduction after 3 losses
    reasons.push(`3+ consecutive losses (-75%)`);
  } else if (stats.consecutiveLosses === 2) {
    multiplier *= 0.5; // 50% reduction after 2 losses
    reasons.push(`2 consecutive losses (-50%)`);
  } else if (stats.consecutiveLosses === 1) {
    multiplier *= 0.75; // 25% reduction after 1 loss
    reasons.push(`1 recent loss (-25%)`);
  }
  
  // 2. Win streak bonus (max 2x)
  const recentWinRate = stats.tradestoday > 0 ? stats.winsToday / stats.tradestoday : 0;
  if (stats.consecutiveLosses === 0 && stats.winsToday >= 3 && recentWinRate >= 0.7) {
    multiplier *= 1.25; // 25% increase on hot streak
    reasons.push(`Win streak (+25%)`);
  }
  
  // 3. Daily PnL adjustment
  if (stats.dailyPnl < -50) {
    multiplier *= 0.5; // Reduce size if down significantly
    reasons.push(`Daily loss > $50 (-50%)`);
  } else if (stats.dailyPnl > 100) {
    multiplier *= 1.1; // Slight increase if profitable day
    reasons.push(`Profitable day (+10%)`);
  }
  
  // 4. Confluence strength adjustment
  if (confluenceStrength >= 80) {
    multiplier *= 1.2;
    reasons.push(`Strong confluence (+20%)`);
  } else if (confluenceStrength < 60) {
    multiplier *= 0.8;
    reasons.push(`Weak confluence (-20%)`);
  }
  
  // Clamp to reasonable bounds
  multiplier = Math.max(0.25, Math.min(2.0, multiplier));
  
  // Determine confidence
  let confidence: 'low' | 'medium' | 'high' = 'medium';
  if (multiplier >= 1.0 && confluenceStrength >= 70) confidence = 'high';
  else if (multiplier < 0.5 || confluenceStrength < 50) confidence = 'low';
  
  return {
    multiplier: Math.round(multiplier * 100) / 100,
    reason: reasons.join(' | ') || 'Standard size',
    confidence,
  };
}

// ============================================================================
// SECTION 5: ENHANCED REGIME DETECTION
// ============================================================================

interface RegimeAnalysis {
  regime: MarketRegime;
  strength: number; // 0-100
  recommendedStrategy: 'trend_follow' | 'mean_revert' | 'breakout' | 'avoid';
  tpMultiplier: number;
  slMultiplier: number;
}

function analyzeMarketRegime(prices: number[]): RegimeAnalysis {
  if (prices.length < 50) {
    return { regime: 'unknown', strength: 0, recommendedStrategy: 'avoid', tpMultiplier: 1, slMultiplier: 1 };
  }
  
  const volatility = calculateVolatility(prices);
  const avgVol = avgVolatility || volatility;
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const ema50 = calculateEMA(prices, 50);
  
  // Calculate ADX-like trend strength
  const recentPrices = prices.slice(-20);
  const olderPrices = prices.slice(-40, -20);
  const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const olderAvg = olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
  const trendStrength = Math.abs((recentAvg - olderAvg) / olderAvg) * 100;
  
  // Calculate range (for ranging detection)
  const high20 = Math.max(...prices.slice(-20));
  const low20 = Math.min(...prices.slice(-20));
  const rangePercent = ((high20 - low20) / low20) * 100;
  
  // Volatile regime
  if (volatility > avgVol * 2.5 || rangePercent > 8) {
    return {
      regime: 'volatile',
      strength: Math.min(100, volatility / avgVol * 40),
      recommendedStrategy: 'avoid',
      tpMultiplier: 0.5, // Take profits quickly
      slMultiplier: 1.5, // Wider stops
    };
  }
  
  // Strong trend up
  if (trendStrength > 2 && ema9 > ema21 && ema21 > ema50) {
    return {
      regime: 'trending_up',
      strength: Math.min(100, trendStrength * 30),
      recommendedStrategy: 'trend_follow',
      tpMultiplier: 1.5, // Let profits run
      slMultiplier: 0.8, // Tighter stops
    };
  }
  
  // Strong trend down
  if (trendStrength > 2 && ema9 < ema21 && ema21 < ema50) {
    return {
      regime: 'trending_down',
      strength: Math.min(100, trendStrength * 30),
      recommendedStrategy: 'trend_follow',
      tpMultiplier: 1.5,
      slMultiplier: 0.8,
    };
  }
  
  // Ranging market
  if (rangePercent < 3 && trendStrength < 1) {
    return {
      regime: 'ranging',
      strength: Math.min(100, (3 - rangePercent) * 30),
      recommendedStrategy: 'mean_revert',
      tpMultiplier: 0.7, // Quick profits at range edges
      slMultiplier: 1.0,
    };
  }
  
  // Default - mild trend or unclear
  return {
    regime: recentAvg > olderAvg ? 'trending_up' : 'trending_down',
    strength: Math.min(50, trendStrength * 20),
    recommendedStrategy: 'breakout',
    tpMultiplier: 1.0,
    slMultiplier: 1.0,
  };
}

// ============================================================================
// SECTION 6: GROK ROLE - NEWS & SENTIMENT ONLY
// ============================================================================

interface GrokSentimentResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  newsScore: number; // -100 to +100
  trendingCoins: string[];
  warnings: string[];
  shouldBoost: boolean; // True if news supports the trade
  shouldAvoid: boolean; // True if negative news
}

// This will be called separately from trade decisions
// Grok is for market context, not trade signals
async function getGrokSentiment(symbol: string): Promise<GrokSentimentResult | null> {
  if (!canCallGrok()) {
    return null;
  }
  
  try {
    const grok = enhancedGrok;
    if (!grok.isAvailable()) return null;
    
    // Record the call
    recordGrokCall(symbol, 0, 'Sentiment analysis', 'analysis');
    
    // Call Grok for news/sentiment only
    const sentimentPrompt = `CRYPTO SENTIMENT CHECK - ${symbol}. Focus on: recent news, Twitter/X sentiment, trending narratives, macro events. Rate sentiment -100 to +100.`;

    const response = await grok.analyzeMarket({
      symbol,
      price: 0,
      change24h: 0,
      indicators: {},
      guardrails: {},
      userPrompt: sentimentPrompt,
    });
    
    // Parse response - check if Grok recommends action
    const isBullish = response.action === 'LONG';
    const isBearish = response.action === 'SHORT';
    
    return {
      sentiment: isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral',
      newsScore: isBullish ? response.confidence : isBearish ? -response.confidence : 0,
      trendingCoins: [],
      warnings: response.warnings || [],
      shouldBoost: isBullish && response.confidence > 70,
      shouldAvoid: isBearish && response.confidence > 70,
    };
  } catch (err) {
    console.error('[Grok] Sentiment check failed:', err);
    return null;
  }
}

// ============================================================================
// TRADING STATS (Enhanced)
// ============================================================================

interface TradingStats {
  tradestoday: number;
  winsToday: number;
  lossesToday: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  lastTradeTime: number;
  pauseUntil: number;
  dailyPnl: number;
  weeklyPnl: number;
  maxDailyDrawdown: number;
}

const tradingStats: TradingStats = {
  tradestoday: 0,
  winsToday: 0,
  lossesToday: 0,
  consecutiveLosses: 0,
  consecutiveWins: 0,
  lastTradeTime: 0,
  pauseUntil: 0,
  dailyPnl: 0,
  weeklyPnl: 0,
  maxDailyDrawdown: 0,
};

// ============================================================================
// COOLDOWN SYSTEM - Prevent spam trading on same asset
// ============================================================================

// Cooldown per asset (in milliseconds)
const ASSET_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between trades on same asset
const assetLastTradeTime: Map<string, number> = new Map();

/**
 * Check if an asset is on cooldown
 */
function isAssetOnCooldown(symbol: string): boolean {
  const lastTrade = assetLastTradeTime.get(symbol);
  if (!lastTrade) return false;
  return (Date.now() - lastTrade) < ASSET_COOLDOWN_MS;
}

/**
 * Get remaining cooldown time for an asset
 */
function getAssetCooldownRemaining(symbol: string): number {
  const lastTrade = assetLastTradeTime.get(symbol);
  if (!lastTrade) return 0;
  const remaining = ASSET_COOLDOWN_MS - (Date.now() - lastTrade);
  return Math.max(0, remaining);
}

/**
 * Record a trade for cooldown tracking
 */
function recordAssetTrade(symbol: string): void {
  assetLastTradeTime.set(symbol, Date.now());
}

// Reset daily stats at midnight
function resetDailyStats() {
  const now = new Date();
  const lastReset = new Date(tradingStats.lastTradeTime);
  if (now.getDate() !== lastReset.getDate()) {
    tradingStats.tradestoday = 0;
    tradingStats.winsToday = 0;
    tradingStats.lossesToday = 0;
    tradingStats.dailyPnl = 0;
    console.log('[Trading] 📅 Daily stats reset');
  }
}

// Mode-specific configuration - ALGORITHMIC TRADING v3.0
interface ModeConfig {
  name: string;
  style: 'scalping' | 'intraday' | 'swing';
  loopInterval: number;           // How often to check (ms)
  minConfluenceSignals: number;   // Minimum aligned signals required
  minConfluenceStrength: number;  // Minimum confluence strength (0-100)
  minScoreToTrade: number;        // Minimum opportunity score
  minScoreToCallGrok: number;     // Minimum score to call Grok (for sentiment only)
  maxTradesPerDay: number;
  maxConsecutiveLosses: number;
  pauseAfterLosses: number;       // Pause duration in ms
  trailingStopActivation: number; // Activate trailing after X% profit
  trailingStopDistance: number;   // Trail by X%
  timeframes: string[];
  // Strategy-specific settings
  targetProfitPct: number;        // Target profit %
  maxStopLossPct: number;         // Maximum stop loss %
  minRiskReward: number;          // Minimum R:R ratio
  allowCounterTrend: boolean;     // Allow trading against trend
  sessionFilter: boolean;         // Respect session hours
}

const MODE_CONFIGS: Record<string, ModeConfig> = {
  aggressive: {
    name: 'Scalping',
    style: 'scalping',
    loopInterval: 8000,           // Check every 8 seconds for fast scalping
    minConfluenceSignals: 3,      // Need 3 aligned signals (fast entry)
    minConfluenceStrength: 50,    // Lower threshold for quick trades
    minScoreToTrade: 45,          // Lower score threshold for more trades
    minScoreToCallGrok: 80,       // Only call Grok on very strong setups (save credits)
    maxTradesPerDay: 25,          // More trades allowed for scalping
    maxConsecutiveLosses: 5,      // Allow more losses before pause
    pauseAfterLosses: 10 * 60 * 1000, // 10 min pause (shorter)
    trailingStopActivation: 0.25, // Activate trailing at 0.25% profit
    trailingStopDistance: 0.12,   // Trail by 0.12% (tighter)
    timeframes: ['1m', '5m'],
    // Scalping specifics - optimized for frequent small gains
    targetProfitPct: 0.4,         // Target 0.4% profit (faster exits)
    maxStopLossPct: 0.25,         // Max 0.25% stop loss (tight)
    minRiskReward: 1.5,           // Min 1.5:1 R:R
    allowCounterTrend: true,      // Allow counter-trend scalps on reversals
    sessionFilter: false,         // Trade 24/7 for more opportunities
  },
  moderate: {
    name: 'Intraday',
    style: 'intraday',
    loopInterval: 30000,          // Check every 30 seconds
    minConfluenceSignals: 4,      // Need 4 aligned signals
    minConfluenceStrength: 60,
    minScoreToTrade: 55,
    minScoreToCallGrok: 75,
    maxTradesPerDay: 8,
    maxConsecutiveLosses: 3,
    pauseAfterLosses: 45 * 60 * 1000, // 45 min pause
    trailingStopActivation: 0.8,  // Activate at 0.8% profit
    trailingStopDistance: 0.4,    // Trail by 0.4%
    timeframes: ['5m', '15m'],
    // Intraday specifics
    targetProfitPct: 1.5,         // Target 1.5% profit
    maxStopLossPct: 0.8,          // Max 0.8% stop loss
    minRiskReward: 1.8,           // Min 1.8:1 R:R
    allowCounterTrend: false,     // Only trade with trend
    sessionFilter: true,
  },
  conservative: {
    name: 'Swing',
    style: 'swing',
    loopInterval: 120000,         // Check every 2 minutes
    minConfluenceSignals: 5,      // Need 5 aligned signals
    minConfluenceStrength: 70,
    minScoreToTrade: 65,
    minScoreToCallGrok: 80,
    maxTradesPerDay: 3,
    maxConsecutiveLosses: 2,
    pauseAfterLosses: 2 * 60 * 60 * 1000, // 2 hour pause
    trailingStopActivation: 1.5,  // Activate at 1.5% profit
    trailingStopDistance: 0.8,    // Trail by 0.8%
    timeframes: ['15m', '1h'],
    // Swing specifics
    targetProfitPct: 3.0,         // Target 3% profit
    maxStopLossPct: 1.5,          // Max 1.5% stop loss
    minRiskReward: 2.0,           // Min 2:1 R:R
    allowCounterTrend: false,     // Only trade strong trends
    sessionFilter: false,         // Can trade any time
  },
};

// Market regime types
type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'unknown';

// Pattern types detected locally
interface DetectedPattern {
  type: 'breakout' | 'pullback' | 'reversal' | 'momentum' | 'range_bounce' | 'none';
  direction: 'long' | 'short' | 'neutral';
  strength: number; // 0-100
  description: string;
}

// Opportunity score breakdown
interface OpportunityScore {
  total: number;
  signalStrength: number;
  contextMultiplier: number;
  riskRewardMultiplier: number;
  dangerScore: number;
  pattern: DetectedPattern;
  regime: MarketRegime;
  shouldCallGrok: boolean;
  shouldTrade: boolean;
  reasons: string[];
}

// Heat score for pair selection
interface PairHeatScore {
  symbol: string;
  score: number;
  volatility: number;
  momentum: number;
  volume: number; // Relative volume
  trend: 'up' | 'down' | 'neutral';
}

// ============================================================================
// PATTERN DETECTION (Local, Free - No Grok needed)
// ============================================================================

function detectMarketRegime(prices: number[]): MarketRegime {
  if (prices.length < 20) return 'unknown';
  
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const volatility = calculateVolatility(prices);
  const avgVolatility = volatilityHistory.length > 0 
    ? volatilityHistory.reduce((a, b) => a + b, 0) / volatilityHistory.length 
    : volatility;
  
  // High volatility = volatile/choppy market
  if (volatility > avgVolatility * 2.5) {
    return 'volatile';
  }
  
  // Check trend
  const recentPrices = prices.slice(-10);
  const olderPrices = prices.slice(-20, -10);
  const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const olderAvg = olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
  const trendStrength = Math.abs((recentAvg - olderAvg) / olderAvg) * 100;
  
  if (trendStrength > 1.5) {
    return recentAvg > olderAvg ? 'trending_up' : 'trending_down';
  }
  
  return 'ranging';
}

function detectPattern(prices: number[], rsi: number, ema9: number, ema21: number): DetectedPattern {
  if (prices.length < 20) {
    return { type: 'none', direction: 'neutral', strength: 0, description: 'Insufficient data' };
  }
  
  const currentPrice = prices[prices.length - 1] || 0;
  const prevPrice = prices[prices.length - 2] || currentPrice;
  const volatility = calculateVolatility(prices);
  
  // Calculate recent momentum
  const momentum5 = prices.length >= 5 
    ? ((currentPrice - (prices[prices.length - 5] || currentPrice)) / (prices[prices.length - 5] || currentPrice)) * 100 
    : 0;
  
  // Breakout detection
  const recentHigh = Math.max(...prices.slice(-20));
  const recentLow = Math.min(...prices.slice(-20));
  const range = recentHigh - recentLow;
  
  // Breakout UP
  if (currentPrice > recentHigh * 0.998 && momentum5 > 0.5) {
    return {
      type: 'breakout',
      direction: 'long',
      strength: Math.min(80, 40 + Math.abs(momentum5) * 10),
      description: `Breakout above ${recentHigh.toFixed(2)} with ${momentum5.toFixed(2)}% momentum`,
    };
  }
  
  // Breakout DOWN
  if (currentPrice < recentLow * 1.002 && momentum5 < -0.5) {
    return {
      type: 'breakout',
      direction: 'short',
      strength: Math.min(80, 40 + Math.abs(momentum5) * 10),
      description: `Breakdown below ${recentLow.toFixed(2)} with ${momentum5.toFixed(2)}% momentum`,
    };
  }
  
  // RSI reversal
  if (rsi <= 25) {
    return {
      type: 'reversal',
      direction: 'long',
      strength: Math.min(70, 30 + (30 - rsi) * 2),
      description: `RSI oversold at ${rsi.toFixed(1)} - potential bounce`,
    };
  }
  
  if (rsi >= 75) {
    return {
      type: 'reversal',
      direction: 'short',
      strength: Math.min(70, 30 + (rsi - 70) * 2),
      description: `RSI overbought at ${rsi.toFixed(1)} - potential reversal`,
    };
  }
  
  // Pullback in trend
  const trend = ema9 > ema21 ? 'up' : ema9 < ema21 ? 'down' : 'neutral';
  
  if (trend === 'up' && currentPrice < ema9 && currentPrice > ema21 && rsi > 40 && rsi < 60) {
    return {
      type: 'pullback',
      direction: 'long',
      strength: 50,
      description: `Pullback to EMA9 in uptrend`,
    };
  }
  
  if (trend === 'down' && currentPrice > ema9 && currentPrice < ema21 && rsi > 40 && rsi < 60) {
    return {
      type: 'pullback',
      direction: 'short',
      strength: 50,
      description: `Pullback to EMA9 in downtrend`,
    };
  }
  
  // Strong momentum
  if (Math.abs(momentum5) > 1.5) {
    return {
      type: 'momentum',
      direction: momentum5 > 0 ? 'long' : 'short',
      strength: Math.min(60, 30 + Math.abs(momentum5) * 10),
      description: `Strong momentum: ${momentum5.toFixed(2)}% in 5 periods`,
    };
  }
  
  // Range bounce
  const rangePosition = (currentPrice - recentLow) / range;
  if (rangePosition < 0.15 && rsi < 40) {
    return {
      type: 'range_bounce',
      direction: 'long',
      strength: 40,
      description: `Near range low (${(rangePosition * 100).toFixed(1)}%)`,
    };
  }
  
  if (rangePosition > 0.85 && rsi > 60) {
    return {
      type: 'range_bounce',
      direction: 'short',
      strength: 40,
      description: `Near range high (${(rangePosition * 100).toFixed(1)}%)`,
    };
  }
  
  return { type: 'none', direction: 'neutral', strength: 0, description: 'No clear pattern' };
}

// ============================================================================
// OPPORTUNITY SCORE CALCULATION
// ============================================================================

function calculateOpportunityScore(
  symbol: string,
  prices: number[],
  currentPrice: number,
  mode: 'aggressive' | 'moderate' | 'conservative'
): OpportunityScore {
  const configLookup = MODE_CONFIGS[mode];
  const config: ModeConfig = configLookup ? configLookup : {
    name: 'Intraday',
    style: 'intraday',
    loopInterval: 30000,
    minConfluenceSignals: 4,
    minConfluenceStrength: 60,
    minScoreToTrade: 55,
    minScoreToCallGrok: 75,
    maxTradesPerDay: 8,
    maxConsecutiveLosses: 3,
    pauseAfterLosses: 45 * 60 * 1000,
    trailingStopActivation: 0.8,
    trailingStopDistance: 0.4,
    timeframes: ['5m', '15m'],
    targetProfitPct: 1.5,
    maxStopLossPct: 0.8,
    minRiskReward: 1.8,
    allowCounterTrend: false,
    sessionFilter: true,
  };
  const reasons: string[] = [];
  
  // Calculate indicators
  const rsi = calculateRSI(prices);
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const volatility = calculateVolatility(prices);
  
  // Detect market regime
  const regime = detectMarketRegime(prices);
  reasons.push(`Market: ${regime}`);
  
  // Detect pattern
  const pattern = detectPattern(prices, rsi, ema9, ema21);
  if (pattern.type !== 'none') {
    reasons.push(`Pattern: ${pattern.type} (${pattern.direction})`);
  }
  
  // 1. SIGNAL STRENGTH (from pattern)
  let signalStrength = pattern.strength;
  
  // Bonus for strong RSI signals
  if (rsi < 20 || rsi > 80) signalStrength += 15;
  else if (rsi < 30 || rsi > 70) signalStrength += 5;
  
  // Bonus for EMA alignment
  if ((pattern.direction === 'long' && ema9 > ema21) ||
      (pattern.direction === 'short' && ema9 < ema21)) {
    signalStrength += 10;
    reasons.push('EMA aligned');
  }
  
  // 2. CONTEXT MULTIPLIER
  let contextMultiplier = 1.0;
  
  // Market regime adjustment
  if (regime === 'trending_up' && pattern.direction === 'long') {
    contextMultiplier *= 1.3;
    reasons.push('With trend ↑');
  } else if (regime === 'trending_down' && pattern.direction === 'short') {
    contextMultiplier *= 1.3;
    reasons.push('With trend ↓');
  } else if (regime === 'volatile') {
    contextMultiplier *= 0.6;
    reasons.push('⚠️ Volatile market');
  } else if (regime === 'ranging') {
    // Ranging is good for scalping range bounces
    if (pattern.type === 'range_bounce') {
      contextMultiplier *= 1.2;
    } else {
      contextMultiplier *= 0.8;
    }
  }
  
  // Session bonus (simplified - US session is roughly 14:00-22:00 UTC)
  const hour = new Date().getUTCHours();
  const isActiveSession = (hour >= 14 && hour <= 22) || (hour >= 0 && hour <= 8);
  if (isActiveSession) {
    contextMultiplier *= 1.1;
  } else {
    contextMultiplier *= 0.85;
    reasons.push('Off-hours');
  }
  
  // 3. RISK/REWARD MULTIPLIER (estimated)
  let riskRewardMultiplier = 1.0;
  const slPct = botSettings.stopLossPct || 2;
  const tpPct = botSettings.takeProfitPct || 4;
  const rr = tpPct / slPct;
  
  if (rr >= 3) riskRewardMultiplier = 1.5;
  else if (rr >= 2) riskRewardMultiplier = 1.2;
  else if (rr >= 1.5) riskRewardMultiplier = 1.0;
  else riskRewardMultiplier = 0.7;
  
  reasons.push(`R:R ${rr.toFixed(1)}:1`);
  
  // 4. DANGER SCORE (things that reduce score)
  let dangerScore = 0;
  
  // Check consecutive losses
  if (tradingStats.consecutiveLosses >= 2) {
    dangerScore += tradingStats.consecutiveLosses * 10;
    reasons.push(`⚠️ ${tradingStats.consecutiveLosses} consecutive losses`);
  }
  
  // Check if we're near daily trade limit
  if (tradingStats.tradestoday >= config.maxTradesPerDay * 0.8) {
    dangerScore += 20;
    reasons.push('Near daily limit');
  }
  
  // Extreme volatility danger
  if (volatility > avgVolatility * 3) {
    dangerScore += 25;
    reasons.push('⚠️ Extreme volatility');
  }
  
  // Calculate final score
  const rawScore = signalStrength * contextMultiplier * riskRewardMultiplier;
  const total = Math.max(0, rawScore - dangerScore);
  
  // Determine actions
  const shouldCallGrok = total >= config.minScoreToCallGrok && pattern.type !== 'none';
  const shouldTrade = total >= config.minScoreToTrade;
  
  return {
    total: Math.round(total),
    signalStrength: Math.round(signalStrength),
    contextMultiplier: Math.round(contextMultiplier * 100) / 100,
    riskRewardMultiplier: Math.round(riskRewardMultiplier * 100) / 100,
    dangerScore: Math.round(dangerScore),
    pattern,
    regime,
    shouldCallGrok,
    shouldTrade,
    reasons,
  };
}

// ============================================================================
// HEAT SCORE - Select best pair to trade
// ============================================================================

function calculatePairHeatScore(symbol: string, prices: number[]): PairHeatScore {
  if (prices.length < 10) {
    return { symbol, score: 0, volatility: 0, momentum: 0, volume: 1, trend: 'neutral' };
  }
  
  const currentPrice = prices[prices.length - 1] || 0;
  const volatility = calculateVolatility(prices);
  
  // Momentum (5-period)
  const momentum = prices.length >= 5
    ? ((currentPrice - (prices[prices.length - 5] || currentPrice)) / (prices[prices.length - 5] || currentPrice)) * 100
    : 0;
  
  // Trend
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const trend = ema9 > ema21 * 1.001 ? 'up' : ema9 < ema21 * 0.999 ? 'down' : 'neutral';
  
  // Get real volume data if available
  const volData = symbolVolumeData.get(symbol);
  const volume24h = volData?.volume || 0;
  
  // Normalize volume score (higher volume = more liquidity = better)
  // BTC typically has $1B+ daily volume, smaller coins have less
  const volumeScore = volume24h > 0 ? Math.min(20, Math.log10(volume24h / 1000000) * 5) : 0;
  
  // Score = volatility (opportunity) + momentum (movement) + trend + volume
  const score = (volatility * 20) + (Math.abs(momentum) * 15) + (trend !== 'neutral' ? 10 : 0) + volumeScore;
  
  return {
    symbol,
    score: Math.round(score),
    volatility: Math.round(volatility * 1000) / 1000,
    momentum: Math.round(momentum * 100) / 100,
    volume: volume24h,
    trend,
  };
}

function selectBestPair(tradingBag: string[]): { symbol: string; heatScore: PairHeatScore } {
  const scores: PairHeatScore[] = [];
  
  for (const symbol of tradingBag) {
    const prices = getSymbolPriceHistory(symbol);
    const heatScore = calculatePairHeatScore(symbol, prices);
    scores.push(heatScore);
  }
  
  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  
  const best = scores[0] || { symbol: tradingBag[0] || 'BTC-PERP', score: 0, volatility: 0, momentum: 0, volume: 1, trend: 'neutral' as const };
  
  return { symbol: best.symbol, heatScore: best };
}

// Analysis config constants
// NOTE: Grok cooldowns are now managed by GROK_GATE_CONFIGS (centralized)
const SMART_FILTER_CONFIG = {
  priceHistoryLength: 100,
};

// Simple RSI calculation
function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50; // Neutral if not enough data
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const current = prices[i] ?? 0;
    const previous = prices[i - 1] ?? 0;
    const change = current - previous;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Simple EMA calculation
function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1] ?? 0;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    const price = prices[i] ?? 0;
    ema = (price - ema) * multiplier + ema;
  }
  
  return ema;
}

// Calculate current volatility (standard deviation of returns)
function calculateVolatility(prices: number[]): number {
  if (prices.length < 3) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1] ?? 1;
    const curr = prices[i] ?? prev;
    returns.push(((curr - prev) / prev) * 100);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

// Calculate ATR (Average True Range) for dynamic SL/TP
function calculateATR(prices: number[], period = 14): number {
  if (prices.length < period + 1) return (prices[prices.length - 1] || 0) * 0.02; // Default 2% if not enough data
  
  const trueRanges: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const high = prices[i] ?? 0;
    const low = prices[i - 1] ?? high;
    const prevClose = prices[i - 1] ?? high;
    
    // Simplified TR using price changes (we don't have OHLC, just close prices)
    const tr = Math.abs(high - low);
    trueRanges.push(tr);
  }
  
  // Calculate ATR as average of last 'period' true ranges
  const recentTRs = trueRanges.slice(-period);
  return recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length;
}

// ============================================================================
// ADVANCED TECHNICAL INDICATORS - Professional-grade signals
// ============================================================================

// MACD (Moving Average Convergence Divergence)
interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  crossover: 'bullish_cross' | 'bearish_cross' | 'none';
}

function calculateMACD(prices: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MACDResult {
  if (prices.length < slowPeriod + signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0, trend: 'neutral', crossover: 'none' };
  }
  
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  const macd = fastEMA - slowEMA;
  
  // Calculate MACD line history for signal line
  const macdHistory: number[] = [];
  for (let i = slowPeriod; i <= prices.length; i++) {
    const subPrices = prices.slice(0, i);
    const fast = calculateEMA(subPrices, fastPeriod);
    const slow = calculateEMA(subPrices, slowPeriod);
    macdHistory.push(fast - slow);
  }
  
  // Signal line is EMA of MACD
  const signal = macdHistory.length >= signalPeriod 
    ? macdHistory.slice(-signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod
    : macd;
  
  const histogram = macd - signal;
  
  // Previous values for crossover detection
  const prevMacd = macdHistory.length >= 2 ? macdHistory[macdHistory.length - 2] || 0 : macd;
  const prevSignal = macdHistory.length >= signalPeriod + 1
    ? macdHistory.slice(-signalPeriod - 1, -1).reduce((a, b) => a + b, 0) / signalPeriod
    : signal;
  
  // Detect crossover
  let crossover: 'bullish_cross' | 'bearish_cross' | 'none' = 'none';
  if (prevMacd <= prevSignal && macd > signal) {
    crossover = 'bullish_cross';
  } else if (prevMacd >= prevSignal && macd < signal) {
    crossover = 'bearish_cross';
  }
  
  // Determine trend
  const trend = histogram > 0.0001 ? 'bullish' : histogram < -0.0001 ? 'bearish' : 'neutral';
  
  return { macd, signal, histogram, trend, crossover };
}

// Stochastic RSI - More sensitive than regular RSI
interface StochRSIResult {
  k: number;  // Fast line (0-100)
  d: number;  // Slow line (0-100)
  signal: 'oversold' | 'overbought' | 'neutral';
  crossover: 'bullish_cross' | 'bearish_cross' | 'none';
}

function calculateStochRSI(prices: number[], rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3): StochRSIResult {
  if (prices.length < rsiPeriod + stochPeriod) {
    return { k: 50, d: 50, signal: 'neutral', crossover: 'none' };
  }
  
  // Calculate RSI history
  const rsiHistory: number[] = [];
  for (let i = rsiPeriod + 1; i <= prices.length; i++) {
    const subPrices = prices.slice(0, i);
    rsiHistory.push(calculateRSI(subPrices, rsiPeriod));
  }
  
  if (rsiHistory.length < stochPeriod) {
    return { k: 50, d: 50, signal: 'neutral', crossover: 'none' };
  }
  
  // Calculate Stochastic of RSI
  const recentRSI = rsiHistory.slice(-stochPeriod);
  const minRSI = Math.min(...recentRSI);
  const maxRSI = Math.max(...recentRSI);
  const currentRSI = rsiHistory[rsiHistory.length - 1] || 50;
  
  // %K = (Current RSI - Lowest RSI) / (Highest RSI - Lowest RSI) * 100
  const rawK = maxRSI !== minRSI ? ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100 : 50;
  
  // Smooth %K with SMA
  const kHistory: number[] = [];
  for (let i = stochPeriod; i <= rsiHistory.length; i++) {
    const subRSI = rsiHistory.slice(i - stochPeriod, i);
    const min = Math.min(...subRSI);
    const max = Math.max(...subRSI);
    const curr = subRSI[subRSI.length - 1] || 50;
    kHistory.push(max !== min ? ((curr - min) / (max - min)) * 100 : 50);
  }
  
  const k = kHistory.length >= kPeriod 
    ? kHistory.slice(-kPeriod).reduce((a, b) => a + b, 0) / kPeriod 
    : rawK;
  
  // %D = SMA of %K
  const d = kHistory.length >= kPeriod + dPeriod
    ? kHistory.slice(-kPeriod - dPeriod + 1, -kPeriod + 1 || undefined).reduce((a, b) => a + b, 0) / dPeriod
    : k;
  
  // Previous K for crossover
  const prevK = kHistory.length >= kPeriod + 1
    ? kHistory.slice(-kPeriod - 1, -1).reduce((a, b) => a + b, 0) / kPeriod
    : k;
  const prevD = kHistory.length >= kPeriod + dPeriod + 1
    ? kHistory.slice(-kPeriod - dPeriod, -kPeriod).reduce((a, b) => a + b, 0) / dPeriod
    : d;
  
  // Detect crossover
  let crossover: 'bullish_cross' | 'bearish_cross' | 'none' = 'none';
  if (prevK <= prevD && k > d) {
    crossover = 'bullish_cross';
  } else if (prevK >= prevD && k < d) {
    crossover = 'bearish_cross';
  }
  
  // Signal based on levels
  const signal = k <= 20 ? 'oversold' : k >= 80 ? 'overbought' : 'neutral';
  
  return { k, d, signal, crossover };
}

// Bollinger Bands
interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;  // (upper - lower) / middle * 100
  percentB: number;   // (price - lower) / (upper - lower)
  squeeze: boolean;   // Low bandwidth = potential breakout
  signal: 'buy' | 'sell' | 'neutral';
}

function calculateBollingerBands(prices: number[], period = 20, stdDev = 2): BollingerBandsResult {
  if (prices.length < period) {
    const price = prices[prices.length - 1] || 0;
    return { upper: price * 1.02, middle: price, lower: price * 0.98, bandwidth: 4, percentB: 0.5, squeeze: false, signal: 'neutral' };
  }
  
  const recentPrices = prices.slice(-period);
  const middle = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  // Calculate standard deviation
  const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = middle + (std * stdDev);
  const lower = middle - (std * stdDev);
  const currentPrice = prices[prices.length - 1] || middle;
  
  const bandwidth = middle !== 0 ? ((upper - lower) / middle) * 100 : 0;
  const percentB = upper !== lower ? (currentPrice - lower) / (upper - lower) : 0.5;
  
  // Squeeze detection: bandwidth < 4% indicates consolidation
  const squeeze = bandwidth < 4;
  
  // Signal based on position
  let signal: 'buy' | 'sell' | 'neutral' = 'neutral';
  if (percentB <= 0.05) {
    signal = 'buy';  // Price at/below lower band
  } else if (percentB >= 0.95) {
    signal = 'sell'; // Price at/above upper band
  }
  
  return { upper, middle, lower, bandwidth, percentB, squeeze, signal };
}

// CCI (Commodity Channel Index)
interface CCIResult {
  value: number;
  signal: 'oversold' | 'overbought' | 'neutral';
  trend: 'bullish' | 'bearish' | 'neutral';
}

function calculateCCI(prices: number[], period = 20): CCIResult {
  if (prices.length < period) {
    return { value: 0, signal: 'neutral', trend: 'neutral' };
  }
  
  const recentPrices = prices.slice(-period);
  
  // Typical Price (using close only since we don't have OHLC)
  const typicalPrice = recentPrices[recentPrices.length - 1] || 0;
  
  // Simple Moving Average of Typical Price
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  // Mean Deviation
  const meanDeviation = recentPrices.reduce((sum, p) => sum + Math.abs(p - sma), 0) / period;
  
  // CCI = (Typical Price - SMA) / (0.015 * Mean Deviation)
  const cci = meanDeviation !== 0 ? (typicalPrice - sma) / (0.015 * meanDeviation) : 0;
  
  // Signal based on CCI levels
  let signal: 'oversold' | 'overbought' | 'neutral' = 'neutral';
  if (cci <= -100) {
    signal = 'oversold';
  } else if (cci >= 100) {
    signal = 'overbought';
  }
  
  // Trend based on CCI direction
  const trend = cci > 50 ? 'bullish' : cci < -50 ? 'bearish' : 'neutral';
  
  return { value: cci, signal, trend };
}

// ADX (Average Directional Index) - Trend Strength
interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
  trend: 'strong_trend' | 'weak_trend' | 'no_trend';
  direction: 'bullish' | 'bearish' | 'neutral';
}

function calculateADX(prices: number[], period = 14): ADXResult {
  if (prices.length < period * 2) {
    return { adx: 0, plusDI: 50, minusDI: 50, trend: 'no_trend', direction: 'neutral' };
  }
  
  let plusDM = 0;
  let minusDM = 0;
  let tr = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const current = prices[i] || 0;
    const previous = prices[i - 1] || current;
    const change = current - previous;
    
    // Simplified DM calculation
    if (change > 0) {
      plusDM += change;
    } else {
      minusDM += Math.abs(change);
    }
    
    // True Range (simplified)
    tr += Math.abs(change);
  }
  
  // Directional Indicators
  const plusDI = tr !== 0 ? (plusDM / tr) * 100 : 50;
  const minusDI = tr !== 0 ? (minusDM / tr) * 100 : 50;
  
  // DX = |+DI - -DI| / (+DI + -DI) * 100
  const dx = (plusDI + minusDI) !== 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  
  // ADX is smoothed DX (simplified as current DX)
  const adx = dx;
  
  // Trend strength
  let trend: 'strong_trend' | 'weak_trend' | 'no_trend' = 'no_trend';
  if (adx >= 25) {
    trend = 'strong_trend';
  } else if (adx >= 15) {
    trend = 'weak_trend';
  }
  
  // Direction
  const direction = plusDI > minusDI * 1.1 ? 'bullish' : minusDI > plusDI * 1.1 ? 'bearish' : 'neutral';
  
  return { adx, plusDI, minusDI, trend, direction };
}

// Williams %R - Momentum oscillator
function calculateWilliamsR(prices: number[], period = 14): { value: number; signal: 'oversold' | 'overbought' | 'neutral' } {
  if (prices.length < period) {
    return { value: -50, signal: 'neutral' };
  }
  
  const recentPrices = prices.slice(-period);
  const highest = Math.max(...recentPrices);
  const lowest = Math.min(...recentPrices);
  const current = prices[prices.length - 1] || 0;
  
  // %R = (Highest High - Close) / (Highest High - Lowest Low) * -100
  const williamsR = highest !== lowest ? ((highest - current) / (highest - lowest)) * -100 : -50;
  
  const signal = williamsR <= -80 ? 'oversold' : williamsR >= -20 ? 'overbought' : 'neutral';
  
  return { value: williamsR, signal };
}

// Detect support and resistance levels from price history
function detectSupportResistance(prices: number[], lookback = 20): { support: number; resistance: number } {
  if (prices.length < lookback) {
    const currentPrice = prices[prices.length - 1] || 0;
    return { support: currentPrice * 0.98, resistance: currentPrice * 1.02 };
  }
  
  const recentPrices = prices.slice(-lookback);
  const sortedPrices = [...recentPrices].sort((a, b) => a - b);
  
  // Support = lower 20% of price range, Resistance = upper 20%
  const lowerIndex = Math.floor(sortedPrices.length * 0.2);
  const upperIndex = Math.floor(sortedPrices.length * 0.8);
  
  const support = sortedPrices[lowerIndex] || sortedPrices[0] || 0;
  const resistance = sortedPrices[upperIndex] || sortedPrices[sortedPrices.length - 1] || 0;
  
  return { support, resistance };
}

// Calculate trend strength using ADX-like metric
function calculateTrendStrength(prices: number[], period = 14): { strength: number; direction: 'up' | 'down' | 'sideways' } {
  if (prices.length < period * 2) {
    return { strength: 0, direction: 'sideways' };
  }
  
  // Calculate directional movement
  let plusDM = 0;
  let minusDM = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const current = prices[i] ?? 0;
    const previous = prices[i - 1] ?? current;
    const change = current - previous;
    
    if (change > 0) plusDM += change;
    else minusDM += Math.abs(change);
  }
  
  const totalDM = plusDM + minusDM;
  if (totalDM === 0) return { strength: 0, direction: 'sideways' };
  
  // Trend strength (0-100)
  const strength = Math.abs(plusDM - minusDM) / totalDM * 100;
  
  // Direction
  const direction = plusDM > minusDM * 1.2 ? 'up' : minusDM > plusDM * 1.2 ? 'down' : 'sideways';
  
  return { strength: Math.round(strength), direction };
}

// Calculate strategic SL/TP based on ATR and market conditions
interface StrategicLevels {
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  atr: number;
  support: number;
  resistance: number;
}

function calculateStrategicSLTP(
  entryPrice: number,
  side: 'buy' | 'sell',
  prices: number[],
  trendStrength: { strength: number; direction: 'up' | 'down' | 'sideways' },
  settings: { stopLossPct: number; takeProfitPct: number; tradingMode: string }
): StrategicLevels {
  const atr = calculateATR(prices);
  const { support, resistance } = detectSupportResistance(prices);
  const volatility = calculateVolatility(prices);
  
  // Get base SL/TP from bot settings (user-configured)
  const baseSlPct = settings.stopLossPct || 2;
  const baseTpPct = settings.takeProfitPct || 4;
  
  // Calculate ATR-based percentages for comparison
  const atrSlPct = (atr / entryPrice) * 100 * 1.5;
  const atrTpPct = (atr / entryPrice) * 100 * 3;
  
  // Dynamic adjustment factors based on market conditions
  let slAdjustment = 1.0;
  let tpAdjustment = 1.0;
  
  // 1. Adjust based on trend direction
  if ((side === 'buy' && trendStrength.direction === 'up') ||
      (side === 'sell' && trendStrength.direction === 'down')) {
    // Trading WITH trend: tighter SL, wider TP
    slAdjustment *= 0.8;
    tpAdjustment *= 1.5;
  } else if ((side === 'buy' && trendStrength.direction === 'down') ||
             (side === 'sell' && trendStrength.direction === 'up')) {
    // Trading AGAINST trend: wider SL, tighter TP
    slAdjustment *= 1.3;
    tpAdjustment *= 0.7;
  }
  
  // 2. Adjust based on trend strength (0-100)
  if (trendStrength.strength > 60) {
    // Strong trend: let profits run more
    tpAdjustment *= 1.2;
  } else if (trendStrength.strength < 30) {
    // Weak trend/ranging: take profits quicker
    tpAdjustment *= 0.8;
  }
  
  // 3. Adjust based on volatility
  if (volatility > 1.0) {
    // High volatility: wider SL to avoid noise
    slAdjustment *= 1.2;
  } else if (volatility < 0.3) {
    // Low volatility: tighter SL
    slAdjustment *= 0.9;
  }
  
  // 4. Adjust based on trading mode
  if (settings.tradingMode === 'aggressive') {
    // Aggressive: tighter SL, let TP run
    slAdjustment *= 0.9;
    tpAdjustment *= 1.1;
  } else if (settings.tradingMode === 'conservative') {
    // Conservative: wider SL, take profits earlier
    slAdjustment *= 1.2;
    tpAdjustment *= 0.9;
  }
  
  // Calculate final SL/TP percentages (blend of user settings and ATR)
  // Use 60% user settings + 40% ATR-based for balance
  const finalSlPct = (baseSlPct * 0.6 + atrSlPct * 0.4) * slAdjustment;
  const finalTpPct = (baseTpPct * 0.6 + atrTpPct * 0.4) * tpAdjustment;
  
  // Calculate raw SL/TP prices
  let stopLoss: number;
  let takeProfit: number;
  
  if (side === 'buy') {
    stopLoss = entryPrice * (1 - finalSlPct / 100);
    takeProfit = entryPrice * (1 + finalTpPct / 100);
    
    // Use support as SL if it's strategically better
    if (support > stopLoss && support < entryPrice * 0.995) {
      stopLoss = support * 0.998; // Just below support
    }
    
    // Use resistance as TP if it's strategically better
    if (resistance < takeProfit && resistance > entryPrice * 1.01) {
      takeProfit = resistance * 0.998; // Just below resistance
    }
  } else {
    stopLoss = entryPrice * (1 + finalSlPct / 100);
    takeProfit = entryPrice * (1 - finalTpPct / 100);
    
    // Use resistance as SL if it's strategically better
    if (resistance < stopLoss && resistance > entryPrice * 1.005) {
      stopLoss = resistance * 1.002; // Just above resistance
    }
    
    // Use support as TP if it's strategically better
    if (support > takeProfit && support < entryPrice * 0.99) {
      takeProfit = support * 1.002; // Just above support
    }
  }
  
  // Enforce min/max SL distance based on user settings
  const minSLDistance = entryPrice * (baseSlPct * 0.5 / 100); // Min = 50% of user SL
  const maxSLDistance = entryPrice * (baseSlPct * 2.0 / 100); // Max = 200% of user SL
  const slDistance = Math.abs(entryPrice - stopLoss);
  
  if (slDistance < minSLDistance) {
    stopLoss = side === 'buy' ? entryPrice - minSLDistance : entryPrice + minSLDistance;
  } else if (slDistance > maxSLDistance) {
    stopLoss = side === 'buy' ? entryPrice - maxSLDistance : entryPrice + maxSLDistance;
  }
  
  // Calculate actual R:R ratio
  const riskRewardRatio = Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss);
  
  // Round based on price magnitude
  const decimals = entryPrice < 1 ? 6 : entryPrice < 10 ? 4 : entryPrice < 100 ? 3 : 2;
  const roundFactor = Math.pow(10, decimals);
  
  return {
    stopLoss: Math.round(stopLoss * roundFactor) / roundFactor,
    takeProfit: Math.round(takeProfit * roundFactor) / roundFactor,
    riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
    atr: Math.round(atr * roundFactor) / roundFactor,
    support: Math.round(support * roundFactor) / roundFactor,
    resistance: Math.round(resistance * roundFactor) / roundFactor,
  };
}

// Analysis loop - interval based on trading mode
async function startAnalysisLoop() {
  console.log(`[Trading] 🔄 startAnalysisLoop called - botRunning: ${botRunning}, armed: ${state.armed}`);
  
  if (analysisInterval) {
    clearInterval(analysisInterval);
  }

  // Get mode-specific config
  const modeConfig = MODE_CONFIGS[botSettings.tradingMode] || MODE_CONFIGS['moderate'];
  const loopInterval = modeConfig?.loopInterval || 30000;
  
  console.log(`[Trading] 🚀 Starting ${modeConfig?.name || 'Trading'} mode (${modeConfig?.style || 'unknown'})`);
  console.log(`[Trading] ⏱️ Analysis interval: ${loopInterval / 1000}s | Min score to trade: ${modeConfig?.minScoreToTrade || 50}`);
  console.log(`[Trading] 📦 Trading bag: [${botSettings.tradingBag.join(', ')}]`);

  // Reset daily stats if needed
  resetDailyStats();

  // Run first analysis (NOT forced - let the GrokGate decide based on market conditions)
  console.log(`[Trading] ▶️ Running first analysis (collecting data)...`);
  await runAnalysisV2(false); // Don't force - let GrokGate decide
  console.log(`[Trading] ✅ First analysis completed - GrokGate will control API calls`);

  // Then run at mode-specific interval
  analysisInterval = setInterval(async () => {
    if (botRunning) {
      console.log(`[Trading] 🔁 Running scheduled analysis...`);
      resetDailyStats(); // Check daily reset
      await runAnalysisV2(false);
    }
  }, loopInterval);
}

// ============================================================================
// ALGORITHMIC TRADING ENGINE v3.0 - MAIN ANALYSIS LOOP
// ============================================================================
// This is the core trading loop that:
// 1. Checks all pre-conditions (session, pause, limits)
// 2. Calculates confluence of signals
// 3. Analyzes market regime
// 4. Checks correlation with existing positions
// 5. Calculates dynamic position size
// 6. Optionally calls Grok for news/sentiment (NOT for trade decision)
// 7. Executes trade if all conditions are met
// ============================================================================

async function runAnalysisV2(forceGrokCall = false) {
  const analysisStart = Date.now();
  
  if (!botRunning || !state.armed) {
    return;
  }

  const modeConfig = MODE_CONFIGS[botSettings.tradingMode] || MODE_CONFIGS['moderate'];
  const mode = botSettings.tradingMode;
  
  try {
    // ========================================================================
    // STEP 1: PRE-CONDITION CHECKS
    // ========================================================================
    
    // 1.1 Check pause mode (after consecutive losses)
    if (Date.now() < tradingStats.pauseUntil) {
      const remainingPause = Math.round((tradingStats.pauseUntil - Date.now()) / 60000);
      if (skipCount % 10 === 0) {
        console.log(`[AlgoEngine] ⏸️ Paused: ${remainingPause}min remaining (${tradingStats.consecutiveLosses} consecutive losses)`);
      }
      skipCount++;
      return;
    }
    
    // 1.2 Check daily trade limit
    if (modeConfig && tradingStats.tradestoday >= modeConfig.maxTradesPerDay) {
      if (skipCount % 20 === 0) {
        console.log(`[AlgoEngine] 📊 Daily limit reached: ${tradingStats.tradestoday}/${modeConfig.maxTradesPerDay} trades`);
      }
      skipCount++;
      return;
    }
    
    // 1.3 Check session filter (if enabled by user settings)
    const session = getSessionInfo();
    const sessionFilterEnabled = botSettings.enableSessionFilter ?? modeConfig?.sessionFilter ?? true;
    if (sessionFilterEnabled && session.recommendation === 'avoid') {
      if (skipCount % 30 === 0) {
        console.log(`[AlgoEngine] 🌙 ${session.name}: Low liquidity - skipping (liquidity: ${session.liquidityScore}%)`);
      }
      skipCount++;
      return;
    }

    // Get trading bag (max 5 pairs)
    const tradingBag: string[] = (botSettings.tradingBag && botSettings.tradingBag.length > 0) 
      ? botSettings.tradingBag.slice(0, 5)
      : ['BTC-PERP'];
    
    // Fetch current market data for ALL pairs (prices)
    const tickerRes = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });
    const mids = await tickerRes.json() as Record<string, string>;
    
    // Fetch 24h volume data for all pairs
    let volumeData: Record<string, { volume: number; prevDayPx: number }> = {};
    try {
      const metaRes = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      });
      const metaAndCtxs = await metaRes.json() as [any, any[]];
      const assetCtxs = metaAndCtxs[1] || [];
      const meta = metaAndCtxs[0] || { universe: [] };
      
      for (let i = 0; i < assetCtxs.length; i++) {
        const ctx = assetCtxs[i];
        const coin = meta.universe[i]?.name || '';
        if (coin && ctx) {
          volumeData[coin] = {
            volume: parseFloat(ctx.dayNtlVlm || '0'),
            prevDayPx: parseFloat(ctx.prevDayPx || '0'),
          };
        }
      }
    } catch (err) {
      console.error('[Trading] Failed to fetch volume data:', err);
    }
    
    // Update price history for all pairs
    for (const sym of tradingBag) {
      const coin = sym.replace('-PERP', '');
      const price = parseFloat(mids[coin] || '0');
      if (price > 0) {
        const hist = getSymbolPriceHistory(sym);
        hist.push(price);
        if (hist.length > SMART_FILTER_CONFIG.priceHistoryLength) {
          hist.shift();
        }
        update24hPriceHistory(sym, price);
        symbolLastPrice.set(sym, price);
        
        // Store volume data
        if (volumeData[coin]) {
          symbolVolumeData.set(sym, volumeData[coin]);
        }
      }
    }
    
    // Fetch order book for the best pair (after selection)
    // We'll do this after selecting the best pair to save API calls
    
    // Select best pair using heat score (instead of rotation)
    const { symbol: bestSymbol, heatScore } = selectBestPair(tradingBag);
    const coinName = bestSymbol.replace('-PERP', '');
    const currentPrice = parseFloat(mids[coinName] || '0');
    const symbolHistory = getSymbolPriceHistory(bestSymbol);
    const change24h = calculate24hChange(bestSymbol, currentPrice);
    
    // Update price history for all symbols (for pairs trading)
    for (const sym of tradingBag) {
      const symCoin = sym.replace('-PERP', '');
      const symPrice = parseFloat(mids[symCoin] || '0');
      if (symPrice > 0) {
        quantEngine.updatePriceHistory(sym, symPrice);
      }
    }
    
    if (currentPrice === 0 || symbolHistory.length < 3) {
      console.log(`[Trading] ⏳ Collecting data for ${bestSymbol}... (${symbolHistory.length}/3 points)`);
      return;
    }
    
    // ========================================================================
    // STEP 2: FETCH ORDER BOOK DATA
    // ========================================================================
    let orderBookImbalance = 0;
    try {
      const orderBook = await pythonBridge.getOrderBook(coinName, 10);
      if (orderBook.success) {
        symbolOrderBook.set(bestSymbol, {
          bestBid: orderBook.bestBid || 0,
          bestAsk: orderBook.bestAsk || 0,
          spread: orderBook.spread || 0,
          imbalance: orderBook.imbalance || 0,
          bidWall: orderBook.bidWall ? { price: orderBook.bidWall.price, size: orderBook.bidWall.size } : null,
          askWall: orderBook.askWall ? { price: orderBook.askWall.price, size: orderBook.askWall.size } : null,
          totalBidSize: orderBook.totalBidSize || 0,
          totalAskSize: orderBook.totalAskSize || 0,
          timestamp: Date.now(),
        });
        orderBookImbalance = orderBook.imbalance || 0;
      }
    } catch (err) {
      // Order book fetch failed - continue without it
    }
    
    // ========================================================================
    // STEP 3: CALCULATE CONFLUENCE OF SIGNALS (Core algorithmic decision)
    // ========================================================================
    const confluence = calculateConfluence(symbolHistory, currentPrice, mode, orderBookImbalance);
    
    // ========================================================================
    // STEP 4: ANALYZE MARKET REGIME
    // ========================================================================
    const regimeAnalysis = analyzeMarketRegime(symbolHistory);
    
    // ========================================================================
    // STEP 5: CHECK CORRELATION WITH EXISTING POSITIONS
    // ========================================================================
    const correlationCheck = checkCorrelation(bestSymbol, tradeHistory);
    
    // ========================================================================
    // STEP 6: CALCULATE DYNAMIC POSITION SIZE
    // ========================================================================
    const dynamicSize = calculateDynamicSizeMultiplier(tradingStats, confluence.totalStrength);
    
    // Log frequency based on mode (used throughout)
    const logFrequency = mode === 'aggressive' ? 6 : mode === 'moderate' ? 4 : 2;
    
    // ========================================================================
    // STEP 6.5: ADVANCED ANALYSIS (Funding, OI, Liquidations, MTF)
    // ========================================================================
    let advancedSignal: Awaited<ReturnType<typeof advancedAnalysis.generateAdvancedSignal>> | null = null;
    let advancedSizingResult: ReturnType<typeof advancedAnalysis.calculateDynamicSizing> | null = null;
    
    // Get account equity for dynamic sizing
    let accountEquity = 0;
    const agentArgsForBalance = getAgentArgs(state.activeUserWallet);
    try {
      const balanceResult = await pythonBridge.getBalance(agentArgsForBalance);
      if (balanceResult.success && balanceResult.accountValue) {
        accountEquity = balanceResult.accountValue;
      }
    } catch (err) {
      // Continue without balance
    }
    
    // Calculate volatility for sizing
    const volatility = symbolHistory.length > 20 
      ? calculateVolatility(symbolHistory) 
      : 1.0;
    
    // Get win rate from recent trades
    const recentTrades = tradeHistory.filter(t => t.status === 'closed').slice(0, 20);
    const winRate = recentTrades.length > 0 
      ? recentTrades.filter(t => (t.pnlWithFees || 0) > 0).length / recentTrades.length 
      : 0.5;
    
    // Count open positions
    const openPositionsCount = tradeHistory.filter(t => t.status === 'open').length;
    
    // Apply dynamic sizing based on wallet tier if enabled
    if (botSettings.enableDynamicSizing && accountEquity > 0) {
      advancedSizingResult = advancedAnalysis.calculateDynamicSizing(
        accountEquity,
        currentPrice,
        volatility,
        winRate,
        openPositionsCount
      );
      
      if (!advancedSizingResult.canTrade) {
        if (skipCount % 10 === 0) {
          console.log(`[AdvancedAnalysis] ⚠️ Cannot trade: ${advancedSizingResult.reason}`);
          if (advancedSizingResult.warnings.length > 0) {
            console.log(`[AdvancedAnalysis] 💡 ${advancedSizingResult.warnings.join(' | ')}`);
          }
        }
        skipCount++;
        return;
      }
      
      // Log wallet tier info periodically
      if (skipCount % logFrequency === 0) {
        console.log(`[AdvancedAnalysis] 💰 Wallet Tier: ${advancedSizingResult.tier.name} ($${accountEquity.toFixed(2)})`);
        console.log(`[AdvancedAnalysis] 📐 Recommended: ${advancedSizingResult.recommendedPositionPct.toFixed(1)}% ($${advancedSizingResult.recommendedNotional.toFixed(2)}) | Max ${advancedSizingResult.maxPositions} positions`);
      }
    }
    
    // Fetch advanced signals if enabled
    const advancedAnalysisEnabled = botSettings.enableFundingAnalysis || 
      botSettings.enableOpenInterestAnalysis || 
      botSettings.enableLiquidationAnalysis || 
      botSettings.enableMultiTimeframe;
    
    if (advancedAnalysisEnabled) {
      try {
        // Build price data for multi-timeframe (using available history)
        const priceData: { [tf: string]: number[] } = {
          '1m': symbolHistory.slice(-60),  // Last 60 1-min candles
          '5m': symbolHistory.filter((_, i) => i % 5 === 0).slice(-60),
          '15m': symbolHistory.filter((_, i) => i % 15 === 0).slice(-60),
          '1h': symbolHistory.filter((_, i) => i % 60 === 0).slice(-24),
        };
        
        advancedSignal = await advancedAnalysis.generateAdvancedSignal(
          bestSymbol,
          accountEquity,
          currentPrice,
          priceData,
          volatility,
          winRate,
          openPositionsCount
        );
        
        // Log advanced analysis periodically
        if (skipCount % logFrequency === 0 && advancedSignal) {
          const signals: string[] = [];
          if (advancedSignal.fundingSignal && botSettings.enableFundingAnalysis) {
            signals.push(`Funding: ${advancedSignal.fundingSignal.signal} (${advancedSignal.fundingSignal.strength.toFixed(0)}%)`);
          }
          if (advancedSignal.openInterestSignal && botSettings.enableOpenInterestAnalysis) {
            signals.push(`OI: ${advancedSignal.openInterestSignal.signal} (${advancedSignal.openInterestSignal.strength.toFixed(0)}%)`);
          }
          if (advancedSignal.liquidationSignal && botSettings.enableLiquidationAnalysis) {
            signals.push(`Liq: ${advancedSignal.liquidationSignal.signal} (${advancedSignal.liquidationSignal.strength.toFixed(0)}%)`);
          }
          if (advancedSignal.multiTimeframeSignal && botSettings.enableMultiTimeframe) {
            signals.push(`MTF: ${advancedSignal.multiTimeframeSignal.overallSignal} (${advancedSignal.multiTimeframeSignal.confluenceScore.toFixed(0)}%)`);
          }
          if (signals.length > 0) {
            console.log(`[AdvancedAnalysis] 🔬 ${signals.join(' | ')}`);
          }
          if (advancedSignal.warnings.length > 0) {
            console.log(`[AdvancedAnalysis] ⚠️ ${advancedSignal.warnings.slice(0, 2).join(' | ')}`);
          }
        }
        
        // Use advanced signal to boost or reduce confidence
        if (advancedSignal.overallDirection !== 'neutral') {
          // Check if advanced signal agrees with confluence
          const signalsAgree = (advancedSignal.overallDirection === 'long' && confluence.direction === 'long') ||
            (advancedSignal.overallDirection === 'short' && confluence.direction === 'short');
          
          if (signalsAgree) {
            // Boost confidence when signals agree
            confluence.totalStrength = Math.min(100, confluence.totalStrength + advancedSignal.overallStrength * 0.3);
            confluence.reasons.push(`Advanced: ${advancedSignal.overallDirection} (${advancedSignal.overallStrength.toFixed(0)}%)`);
          } else if (advancedSignal.overallStrength > 60) {
            // Reduce confidence when strong disagreement
            confluence.totalStrength = Math.max(0, confluence.totalStrength - advancedSignal.overallStrength * 0.2);
            if (skipCount % logFrequency === 0) {
              console.log(`[AdvancedAnalysis] ⚠️ Signal conflict: Algo=${confluence.direction}, Advanced=${advancedSignal.overallDirection}`);
            }
          }
        }
      } catch (advErr) {
        // Advanced analysis failed - continue without it
        if (skipCount % 20 === 0) {
          console.log(`[AdvancedAnalysis] ⚠️ Analysis unavailable: ${advErr}`);
        }
      }
    }
    
    // ========================================================================
    // STEP 7: ALGORITHMIC TRADE DECISION (No Grok needed!)
    // ========================================================================
    
    // Log status periodically
    if (skipCount % logFrequency === 0) {
      console.log(`[AlgoEngine] 📊 ${bestSymbol}: $${currentPrice.toLocaleString()} | ${session.name}`);
      console.log(`[AlgoEngine] 🎯 Confluence: ${confluence.alignedCount}/${modeConfig?.minConfluenceSignals || 4} signals | Strength: ${confluence.totalStrength} | Dir: ${confluence.direction}`);
      console.log(`[AlgoEngine] 📈 Regime: ${regimeAnalysis.regime} (${regimeAnalysis.strength}%) | Strategy: ${regimeAnalysis.recommendedStrategy}`);
      if (confluence.reasons.length > 0) {
        console.log(`[AlgoEngine] 💡 Signals: ${confluence.reasons.slice(0, 4).join(' | ')}`);
      }
    }
    
    // Check if we should trade (ALGORITHMIC DECISION - NO GROK)
    const minSignals = modeConfig?.minConfluenceSignals || 4;
    const minStrength = modeConfig?.minConfluenceStrength || 60;
    
    // Trade conditions:
    // 1. Enough aligned signals (confluence)
    // 2. Strong enough signal strength
    // 3. Not in volatile regime (unless aggressive mode)
    // 4. Correlation check passed
    // 5. Direction matches regime (unless allowCounterTrend)
    
    const hasEnoughSignals = confluence.alignedCount >= minSignals;
    const hasEnoughStrength = confluence.totalStrength >= minStrength;
    const regimeAllows = regimeAnalysis.recommendedStrategy !== 'avoid' || mode === 'aggressive';
    const correlationAllows = correlationCheck.canOpen;
    const directionMatchesRegime = modeConfig?.allowCounterTrend || 
      (confluence.direction === 'long' && (regimeAnalysis.regime === 'trending_up' || regimeAnalysis.regime === 'ranging')) ||
      (confluence.direction === 'short' && (regimeAnalysis.regime === 'trending_down' || regimeAnalysis.regime === 'ranging'));
    
    const shouldTradeAlgo = hasEnoughSignals && hasEnoughStrength && regimeAllows && correlationAllows && directionMatchesRegime;
    
    if (!shouldTradeAlgo) {
      // Log why we're not trading (occasionally)
      if (skipCount % (logFrequency * 2) === 0) {
        const reasons: string[] = [];
        if (!hasEnoughSignals) reasons.push(`signals: ${confluence.alignedCount}/${minSignals}`);
        if (!hasEnoughStrength) reasons.push(`strength: ${confluence.totalStrength}/${minStrength}`);
        if (!regimeAllows) reasons.push(`regime: ${regimeAnalysis.regime}`);
        if (!correlationAllows) reasons.push(`correlation: ${correlationCheck.reason}`);
        if (!directionMatchesRegime) reasons.push(`direction mismatch`);
        console.log(`[AlgoEngine] ⏭️ No trade: ${reasons.join(' | ')}`);
      }
      skipCount++;
      return;
    }
    
    // ========================================================================
    // STEP 8: OPTIONAL GROK SENTIMENT CHECK (News/Twitter only)
    // ========================================================================
    // Grok is NOT used for trade decision - only for news/sentiment boost or warning
    let grokSentiment: GrokSentimentResult | null = null;
    const grokDecision = shouldCallGrok(mode, confluence.totalStrength, { type: 'confluence', direction: confluence.direction }, regimeAnalysis.strength / 100, forceGrokCall);
    
    if (grokDecision.allowed && canCallGrok()) {
      console.log(`[AlgoEngine] 📰 Checking news/sentiment for ${bestSymbol}...`);
      try {
        grokSentiment = await getGrokSentiment(bestSymbol);
        
        if (grokSentiment) {
          console.log(`[AlgoEngine] 📰 Grok Sentiment: ${grokSentiment.sentiment} (score: ${grokSentiment.newsScore})`);
          
          // If Grok finds negative news, skip the trade
          if (grokSentiment.shouldAvoid) {
            console.log(`[AlgoEngine] ⚠️ Grok warns against trade - negative sentiment detected`);
            skipCount++;
            return;
          }
        }
      } catch (grokError) {
        // Grok failed (rate limit, no credits, etc.) - continue without it
        console.log(`[AlgoEngine] ⚠️ Grok unavailable (${grokError}) - continuing with algorithmic decision`);
        grokSentiment = null;
      }
    } else if (!canCallGrok()) {
      // Log occasionally that we're trading without Grok
      if (skipCount % 20 === 0) {
        console.log(`[AlgoEngine] 🤖 Trading algorithmically (Grok credits exhausted or disabled)`);
      }
    }
    
    // ========================================================================
    // STEP 9: EXECUTE TRADE
    // ========================================================================
    console.log(`[AlgoEngine] ✅ TRADE SIGNAL: ${(confluence.direction || 'unknown').toUpperCase()} ${bestSymbol}`);
    console.log(`[AlgoEngine] 📊 Confluence: ${confluence.alignedCount} signals | Strength: ${confluence.totalStrength}`);
    console.log(`[AlgoEngine] 📈 Regime: ${regimeAnalysis.regime} | Size multiplier: ${dynamicSize.multiplier}x`);
    if (grokSentiment?.shouldBoost) {
      console.log(`[AlgoEngine] 🚀 Grok sentiment BOOST: ${grokSentiment.sentiment}`);
    }
    
    // Calculate legacy score for compatibility with executeTradeV2
    const score = calculateOpportunityScore(bestSymbol, symbolHistory, currentPrice, botSettings.tradingMode);
    
    // Build analysis object for trade execution
    const algoAnalysis = {
      action: confluence.direction === 'long' ? 'LONG' : 'SHORT',
      confidence: confluence.totalStrength,
      reasoning: `Algorithmic: ${confluence.alignedCount} signals aligned (${confluence.reasons.join(', ')}). Regime: ${regimeAnalysis.regime}. ${grokSentiment ? `Sentiment: ${grokSentiment.sentiment}` : 'No sentiment data'}`,
      sources: [],
      warnings: grokSentiment?.warnings || [],
      suggestedEntry: currentPrice,
      suggestedSL: 0,
      suggestedTP: 0,
    };
    
    // Apply regime-based TP/SL multipliers
    const baseTpPct = modeConfig?.targetProfitPct || botSettings.takeProfitPct;
    const baseSlPct = modeConfig?.maxStopLossPct || botSettings.stopLossPct;
    algoAnalysis.suggestedTP = confluence.direction === 'long' 
      ? currentPrice * (1 + (baseTpPct * regimeAnalysis.tpMultiplier) / 100)
      : currentPrice * (1 - (baseTpPct * regimeAnalysis.tpMultiplier) / 100);
    algoAnalysis.suggestedSL = confluence.direction === 'long'
      ? currentPrice * (1 - (baseSlPct * regimeAnalysis.slMultiplier) / 100)
      : currentPrice * (1 + (baseSlPct * regimeAnalysis.slMultiplier) / 100);
    
    // Store analysis for UI
    lastAnalysis = {
      action: algoAnalysis.action as any,
      confidence: algoAnalysis.confidence,
      reasoning: algoAnalysis.reasoning,
      timestamp: Date.now(),
    };
    
    analysisHistory.unshift({
      id: `algo_${Date.now()}`,
      action: algoAnalysis.action as any,
      confidence: algoAnalysis.confidence,
      reasoning: algoAnalysis.reasoning,
      price: currentPrice,
      timestamp: Date.now(),
      sources: [],
      warnings: algoAnalysis.warnings,
    });
    if (analysisHistory.length > 50) analysisHistory.pop();
    
    // Execute the trade with dynamic size multiplier
    await executeTradeV2(bestSymbol, coinName, currentPrice, algoAnalysis.action, algoAnalysis, score, modeConfig, dynamicSize.multiplier);

  } catch (error) {
    console.error('[AlgoEngine] ❌ Analysis error:', error);
  }
}

// Force a trade on a specific symbol (for testing)
async function forceTradeOnSymbol(symbol: string, direction: 'long' | 'short') {
  console.log(`[ForceTradeDebug] START - symbol=${symbol}, direction=${direction}`);
  
  // Validate inputs
  if (!symbol || typeof symbol !== 'string') {
    return { success: false, error: 'Invalid symbol' };
  }
  if (!direction || (direction !== 'long' && direction !== 'short')) {
    return { success: false, error: `Invalid direction: ${direction}` };
  }
  
  // Check cooldown (skip for forced trades but log it)
  if (isAssetOnCooldown(symbol)) {
    const remaining = Math.ceil(getAssetCooldownRemaining(symbol) / 1000);
    console.log(`[Trading] ⏳ ${symbol} on cooldown (${remaining}s remaining) - proceeding anyway for forced trade`);
  }
  
  const coinName = symbol.replace('-PERP', '');
  console.log(`[ForceTradeDebug] coinName=${coinName}`);
  
  try {
    // Fetch current price with error handling
    let currentPrice = 0;
    try {
      const tickerRes = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
      });
      const mids = await tickerRes.json() as Record<string, string> | null;
      if (mids && mids[coinName]) {
        currentPrice = parseFloat(mids[coinName]);
      }
    } catch (fetchError) {
      console.error(`[Trading] ⚠️ Failed to fetch price: ${fetchError}`);
    }
    
    if (currentPrice === 0 || isNaN(currentPrice)) {
      return { success: false, error: `Could not fetch price for ${symbol}` };
    }
    
    console.log(`[Trading] 🎯 FORCE TRADE: ${direction?.toUpperCase() || 'UNKNOWN'} ${symbol} @ $${currentPrice}`);
    
    const agentArgs = getAgentArgs(state.activeUserWallet);
    
    // Check for existing position
    const hasPosition = await pythonBridge.hasOpenPosition(coinName, agentArgs);
    if (hasPosition) {
      return { success: false, error: `Already have an open ${coinName} position` };
    }
    
    // Get balance
    const balanceResult = await pythonBridge.getBalance(agentArgs);
    if (!balanceResult.success) {
      return { success: false, error: `Could not fetch balance: ${balanceResult.error}` };
    }
    const equity = balanceResult.accountValue || 0;
    
    console.log(`[Trading] 💵 Account equity: $${equity.toFixed(2)}`);
    
    // Check minimum equity for trading
    if (equity < 10) {
      return { success: false, error: `Account equity too low: $${equity.toFixed(2)} (minimum $10 required for HyperLiquid)` };
    }
    
    // Calculate position size using utility function
    const positionSizePct = botSettings.positionSizePct || 2;
    let { size: positionSize, notional } = calculatePositionSize(equity, positionSizePct, currentPrice);
    
    // Size decimals per asset (must match hl_bridge.py)
    const SZ_DECIMALS: Record<string, number> = {
      'BTC': 4, 'ETH': 3, 'SOL': 2, 'XRP': 0, 'BNB': 2, 'DOGE': 0,
      'ADA': 0, 'AVAX': 2, 'DOT': 1, 'LINK': 1, 'LTC': 2, 'BCH': 2,
      'MATIC': 0, 'ARB': 0, 'OP': 0, 'SUI': 0, 'APT': 1, 'ATOM': 1,
      'UNI': 1, 'NEAR': 0, 'FIL': 1, 'AAVE': 2, 'INJ': 1, 'TIA': 1,
      'SEI': 0, 'FTM': 0, 'MKR': 3, 'TON': 1, 'TRX': 0, 'ETC': 1,
      'HYPE': 1, 'MEGA': 0, 'PEPE': 0, 'WIF': 0, 'BONK': 0, 'TAO': 2,
    };
    const szDecimals = SZ_DECIMALS[coinName] ?? 2;
    
    // Ensure minimum notional of $12 for HyperLiquid (with margin for rounding)
    const minNotional = 12;
    if (notional < minNotional) {
      positionSize = minNotional / currentPrice;
      notional = minNotional;
      console.log(`[Trading] ⚠️ Adjusted to minimum notional: $${minNotional}`);
    }
    
    // Round position size according to asset decimals
    const roundFactor = Math.pow(10, szDecimals);
    positionSize = Math.ceil(positionSize * roundFactor) / roundFactor; // Round UP to ensure minimum
    notional = positionSize * currentPrice;
    
    console.log(`[Trading] 📐 Position size: ${positionSize} ${coinName} (notional: $${notional.toFixed(2)}, decimals: ${szDecimals})`);
    
    if (positionSize < 0.0001) {
      return { success: false, error: `Position size too small: ${positionSize}` };
    }
    
    // Final check: ensure we have enough equity for the position
    if (notional > equity * 0.9) {
      return { success: false, error: `Position too large for account: $${notional.toFixed(2)} > 90% of equity ($${(equity * 0.9).toFixed(2)})` };
    }
    
    const side = direction === 'long' ? 'buy' : 'sell';
    
    // Use Smart SL/TP if enabled
    const useSmartSLTP = botSettings.useSmartSLTP ?? true;
    let stopLoss: number;
    let takeProfit: number;
    
    // Get price history for this symbol
    const priceHistory = getSymbolPriceHistory(symbol);
    const trendStrength = calculateTrendStrength(priceHistory);
    
    if (useSmartSLTP && priceHistory.length >= 30) {
      // Calculate strategic SL/TP based on ATR, support/resistance, trend
      const strategicLevels = calculateStrategicSLTP(currentPrice, side, priceHistory, trendStrength, {
        stopLossPct: botSettings.stopLossPct || 2,
        takeProfitPct: botSettings.takeProfitPct || 4,
        tradingMode: botSettings.tradingMode,
      });
      
      stopLoss = strategicLevels.stopLoss;
      takeProfit = strategicLevels.takeProfit;
      console.log(`[Trading] 🧠 Smart SL/TP: ATR=$${strategicLevels.atr.toFixed(4)} | S=$${strategicLevels.support.toFixed(2)} | R=$${strategicLevels.resistance.toFixed(2)}`);
      console.log(`[Trading] 📈 Trend: ${trendStrength.direction} (${trendStrength.strength}%) | R:R=${strategicLevels.riskRewardRatio}:1`);
    } else {
      // Use fixed percentage SL/TP
      const slPct = botSettings.stopLossPct || 2;
      const tpPct = botSettings.takeProfitPct || 4;
      
      stopLoss = side === 'buy' 
        ? currentPrice * (1 - slPct / 100) 
        : currentPrice * (1 + slPct / 100);
      
      takeProfit = side === 'buy'
        ? currentPrice * (1 + tpPct / 100)
        : currentPrice * (1 - tpPct / 100);
      
      console.log(`[Trading] 📏 Fixed SL/TP: SL=${botSettings.stopLossPct}%, TP=${botSettings.takeProfitPct}%`);
    }
    
    const pairMaxLeverage = getMaxLeverageForSymbol(symbol);
    const leverage = Math.min(botSettings.maxLeverage, pairMaxLeverage);
    
    console.log(`[Trading] 📊 ${side.toUpperCase()} ${positionSize.toFixed(6)} ${coinName} @ $${currentPrice}`);
    console.log(`[Trading] 🛑 SL: $${stopLoss.toFixed(2)} | 🎯 TP: $${takeProfit.toFixed(2)} | ⚡ Leverage: ${leverage}x`);
    
    // Execute order with higher slippage for low-priced tokens
    const slippage = currentPrice < 1 ? 1.0 : currentPrice < 10 ? 0.5 : 0.2;
    const result = await pythonBridge.executeLimitOrder(coinName, side, positionSize, currentPrice, slippage, agentArgs);
    
    if (result.success) {
      console.log(`[Trading] ✅ Order executed!`);
      
      const tradePrice = result.avgPx || currentPrice;
      const tradeQty = result.totalSz || positionSize;
      const entryFee = tradePrice * tradeQty * HL_TAKER_FEE;
      
      // Place SL/TP orders using OrderManager (handles cancellation of existing orders)
      console.log(`[Trading] 📤 Placing strategic SL/TP orders via OrderManager...`);
      
      try {
        const slTpResult = await orderManager.placeSlTpOrders(
          coinName,
          side,
          tradeQty,
          tradePrice,
          stopLoss,
          takeProfit,
          agentArgs
        );
        
        if (!slTpResult.success) {
          console.log(`[Trading] ⚠️ SL/TP placement issue: ${slTpResult.error}`);
        }
      } catch (slTpError) {
        console.error(`[Trading] ⚠️ Error placing SL/TP orders:`, slTpError);
      }
      
      // Update stats and cooldown
      tradingStats.tradestoday++;
      tradingStats.lastTradeTime = Date.now();
      recordAssetTrade(symbol); // Record for cooldown tracking
      
      // Save trade
      const newTrade = {
        id: result.oid?.toString() || `trade_${Date.now()}`,
        side: side as 'buy' | 'sell',
        symbol: symbol,
        price: tradePrice,
        quantity: tradeQty,
        leverage: leverage,
        stopLoss,
        takeProfit,
        entryFee,
        exitFee: 0,
        confidence: 100,
        reasoning: `[FORCED] Manual ${(direction || 'unknown').toUpperCase()} trade on ${symbol}`,
        timestamp: Date.now(),
        status: 'open' as const,
        walletAddress: state.activeUserWallet || undefined,
      };
      
      tradeHistory.unshift(newTrade);
      saveTradeToDb(newTrade);
      emitTradeNotification(newTrade);
      
      return {
        success: true,
        message: `Executed ${(direction || 'unknown').toUpperCase()} on ${symbol}`,
        trade: newTrade,
      };
    } else {
      return { success: false, error: `Order failed: ${result.error}` };
    }
    
  } catch (error: any) {
    console.error('[Trading] ❌ Force trade error:', error);
    console.error('[Trading] ❌ Stack:', error?.stack);
    return { success: false, error: String(error) };
  }
}

// Execute trade with new system
async function executeTradeV2(
  symbol: string,
  coinName: string,
  currentPrice: number,
  direction: string,
  analysis: any,
  score: OpportunityScore,
  modeConfig: ModeConfig | undefined,
  sizeMultiplier: number = 1.0
) {
  try {
    console.log(`[Trading] 🔄 executeTradeV2 called: ${symbol} ${direction} @ $${currentPrice}`);
    
    // Check cooldown for algorithmic trades (enforced, not just logged)
    if (isAssetOnCooldown(symbol)) {
      const remaining = Math.ceil(getAssetCooldownRemaining(symbol) / 1000);
      console.log(`[Trading] ⏳ ${symbol} on cooldown (${remaining}s remaining) - SKIPPING`);
      return;
    }
    
    const agentArgs = getAgentArgs(state.activeUserWallet);
    console.log(`[Trading] 🔑 Agent args: ${agentArgs ? 'configured' : 'MISSING'}`);
    
    // Check for existing position on this symbol
    const hasPosition = await pythonBridge.hasOpenPosition(coinName, agentArgs);
    if (hasPosition) {
      console.log(`[Trading] ⚠️ Already have an open ${coinName} position - SKIPPING`);
      return;
    }
    
    // Check max simultaneous positions limit
    const openPositions = tradeHistory.filter(t => t.status === 'open');
    const maxPositions = botSettings.maxSimultaneousPositions || 3;
    if (openPositions.length >= maxPositions) {
      console.log(`[Trading] ⚠️ Max simultaneous positions reached (${openPositions.length}/${maxPositions}) - SKIPPING`);
      return;
    }
    
    // Get balance
    const balanceResult = await pythonBridge.getBalance(agentArgs);
    if (!balanceResult.success) {
      console.log(`[Trading] ⚠️ Could not fetch balance: ${balanceResult.error} - SKIPPING`);
      return;
    }
    const equity = balanceResult.accountValue || 0;
    
    // ========== QUANT ENGINE: DRAWDOWN PROTECTION ==========
    const drawdownState = quantEngine.updateDrawdownState(equity, botSettings.maxDrawdownPct || 10);
    if (drawdownState.shouldPause) {
      console.log(`[QuantEngine] 🛑 MAX DRAWDOWN REACHED (${drawdownState.drawdownPct.toFixed(1)}%) - PAUSING TRADING`);
      return;
    }
    if (drawdownState.shouldReduceSize) {
      console.log(`[QuantEngine] ⚠️ In drawdown (${drawdownState.drawdownPct.toFixed(1)}%), reducing position size`);
    }
    
    // ========== QUANT ENGINE: KELLY CRITERION ==========
    const kellyResult = quantEngine.calculateKellyCriterion(15);
    const kellyMultiplier = kellyResult.halfKelly > 0.005 ? Math.min(1.5, kellyResult.halfKelly / 0.01) : 1.0;
    console.log(`[QuantEngine] 📊 Kelly: WR=${(kellyResult.winRate*100).toFixed(0)}% | Expectancy=${kellyResult.expectancy.toFixed(2)}% | Multiplier=${kellyMultiplier.toFixed(2)}x`);
    
    // Calculate position size using utility function (considers fees for profitability)
    // Apply dynamic size multiplier from algorithmic analysis + Kelly + Drawdown
    const basePositionSizePct = botSettings.positionSizePct || 2;
    const quantMultiplier = sizeMultiplier * kellyMultiplier * drawdownState.sizeMultiplier;
    const adjustedPositionSizePct = basePositionSizePct * quantMultiplier;
    const takeProfitPct = botSettings.takeProfitPct || 4;
    const { size: positionSize, notional, warning: sizeWarning } = calculatePositionSize(
      equity, adjustedPositionSizePct, currentPrice, 10, takeProfitPct
    );
    
    console.log(`[AlgoEngine] 💵 Account equity: $${equity.toFixed(2)} | Peak: $${drawdownState.peakEquity.toFixed(2)}`);
    console.log(`[AlgoEngine] 📐 Position size: ${positionSize} ${coinName} (notional: $${notional.toFixed(2)}) | Quant multiplier: ${quantMultiplier.toFixed(2)}x`);
    
    if (sizeWarning) {
      console.log(`[AlgoEngine] ⚠️ ${sizeWarning}`);
    }
    
    if (positionSize < 0.0001) {
      console.log(`[Trading] ⚠️ Position size too small: ${positionSize}`);
      return;
    }
    
    // Check if account is too small for profitable trading
    if (equity < 5) {
      console.log(`[Trading] ⚠️ Account equity too low ($${equity.toFixed(2)}) - minimum $5 recommended for profitable scalping`);
      return;
    }
    
    const side = direction === 'LONG' ? 'buy' : 'sell';
    
    // Get price history for strategic SL/TP calculation
    const priceHistory = getSymbolPriceHistory(symbol);
    const trendStrength = calculateTrendStrength(priceHistory);
    
    // Use Smart SL/TP (ATR-based) if enabled by user, otherwise use fixed percentages
    const useSmartSLTP = botSettings.useSmartSLTP ?? true;
    
    let stopLoss: number;
    let takeProfit: number;
    let strategicLevels: any = null;
    
    if (useSmartSLTP) {
      // Calculate strategic SL/TP based on ATR, support/resistance, trend, and bot settings
      strategicLevels = calculateStrategicSLTP(currentPrice, side, priceHistory, trendStrength, {
        stopLossPct: botSettings.stopLossPct || 2,
        takeProfitPct: botSettings.takeProfitPct || 4,
        tradingMode: botSettings.tradingMode,
      });
      
      stopLoss = strategicLevels.stopLoss;
      takeProfit = strategicLevels.takeProfit;
      console.log(`[AlgoEngine] 🧠 Smart SL/TP: Using ATR-based levels (ATR: $${strategicLevels.atr.toFixed(4)})`);
    } else {
      // Use fixed percentage SL/TP from user settings
      const slPct = botSettings.stopLossPct || 2;
      const tpPct = botSettings.takeProfitPct || 4;
      
      if (side === 'buy') {
        stopLoss = currentPrice * (1 - slPct / 100);
        takeProfit = currentPrice * (1 + tpPct / 100);
      } else {
        stopLoss = currentPrice * (1 + slPct / 100);
        takeProfit = currentPrice * (1 - tpPct / 100);
      }
      console.log(`[AlgoEngine] 📏 Fixed SL/TP: SL=${slPct}%, TP=${tpPct}%`);
    }
    
    console.log(`[AlgoEngine] 📈 Trend: ${trendStrength.direction} (strength: ${trendStrength.strength}%)`);
    if (strategicLevels) {
      console.log(`[AlgoEngine] 📊 ATR: $${strategicLevels.atr.toFixed(4)} | S: $${strategicLevels.support.toFixed(2)} | R: $${strategicLevels.resistance.toFixed(2)}`);
      console.log(`[AlgoEngine] 🎯 R:R Ratio: ${strategicLevels.riskRewardRatio}:1`);
    }
    
    // CHECK PROFITABILITY AFTER FEES - Critical for small accounts and scalping
    const profitability = checkTradeProfitability(currentPrice, takeProfit, stopLoss, positionSize, side);
    console.log(`[Trading] 💰 Fees Analysis: Entry+Exit = $${profitability.totalFees.toFixed(4)} | Potential Profit = $${profitability.potentialProfit.toFixed(4)} | Net = $${profitability.netProfit.toFixed(4)}`);
    console.log(`[Trading] 📉 Break-even move: ${profitability.breakEvenMove.toFixed(3)}%`);
    
    if (!profitability.isProfitable) {
      console.log(`[Trading] ⚠️ Trade NOT profitable after fees! Net profit would be $${profitability.netProfit.toFixed(4)} - SKIPPING`);
      console.log(`[Trading] 💡 Minimum notional for profit: $${(profitability.minRecommendedSize * currentPrice).toFixed(2)}`);
      return;
    }
    
    // Ensure net profit is at least 2x the fees (good risk/reward on fees)
    const feeRatio = profitability.netProfit / profitability.totalFees;
    if (feeRatio < 1.5) {
      console.log(`[Trading] ⚠️ Fee ratio too low: ${feeRatio.toFixed(2)}x (need 1.5x minimum) - SKIPPING`);
      console.log(`[Trading] 💡 Increase position size or wait for better setup with wider TP`);
      return;
    }
    
    console.log(`[Trading] ✅ Fee ratio: ${feeRatio.toFixed(2)}x - Trade is profitable after fees`);
    
    // Get leverage
    const pairMaxLeverage = getMaxLeverageForSymbol(symbol);
    const suggestedLeverage = botSettings.dynamicLeverage
      ? Math.min(analysis.suggestedLeverage || 3, botSettings.maxLeverage, pairMaxLeverage)
      : Math.min(botSettings.maxLeverage, pairMaxLeverage);
    
    console.log(`[Trading] 📊 ${side.toUpperCase()} ${positionSize.toFixed(6)} ${coinName} @ $${currentPrice}`);
    console.log(`[Trading] 🛑 SL: $${stopLoss.toFixed(2)} | 🎯 TP: $${takeProfit.toFixed(2)} | ⚡ Leverage: ${suggestedLeverage}x`);
    
    // Execute order with higher slippage for low-priced tokens
    const slippage = currentPrice < 1 ? 1.0 : currentPrice < 10 ? 0.5 : 0.2;
    const result = await pythonBridge.executeLimitOrder(coinName, side, positionSize, currentPrice, slippage, agentArgs);
    
    if (result.success) {
      console.log(`[Trading] ✅ Order executed!`);
      
      const tradePrice = result.avgPx || currentPrice;
      const tradeQty = result.totalSz || positionSize;
      const entryFee = tradePrice * tradeQty * HL_TAKER_FEE;
      
      // Place SL/TP orders using OrderManager (handles cancellation of existing orders)
      console.log(`[Trading] 📤 Placing strategic SL/TP orders via OrderManager...`);
      
      try {
        const slTpResult = await orderManager.placeSlTpOrders(
          coinName,
          side,
          tradeQty,
          tradePrice,
          stopLoss,
          takeProfit,
          agentArgs
        );
        
        if (!slTpResult.success) {
          console.log(`[Trading] ⚠️ SL/TP placement issue: ${slTpResult.error}`);
        }
      } catch (slTpError) {
        console.error(`[Trading] ⚠️ Error placing SL/TP orders:`, slTpError);
      }
      
      // Update stats and cooldown
      tradingStats.tradestoday++;
      tradingStats.lastTradeTime = Date.now();
      recordAssetTrade(symbol); // Record for cooldown tracking
      
      // Save trade
      const newTrade = {
        id: result.oid?.toString() || `trade_${Date.now()}`,
        side: side as 'buy' | 'sell',
        symbol: symbol,
        price: tradePrice,
        quantity: tradeQty,
        leverage: suggestedLeverage,
        stopLoss,
        takeProfit,
        entryFee,
        exitFee: 0,
        confidence: analysis.confidence,
        reasoning: `[${modeConfig?.name || 'Trade'}] Score: ${score.total} | ${score.pattern.description}`,
        timestamp: Date.now(),
        status: 'open' as const,
        walletAddress: state.activeUserWallet || undefined,
      };
      
      tradeHistory.unshift(newTrade);
      saveTradeToDb(newTrade);
      emitTradeNotification(newTrade);
      
      if (tradeHistory.length > 100) tradeHistory.pop();
      
    } else {
      console.log(`[Trading] ❌ Order failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error('[Trading] ❌ Trade execution error:', error);
  }
}

// Legacy runAnalysis kept for backward compatibility
async function runAnalysis(forceGrokCall = false) {
  // Redirect to V2
  return runAnalysisV2(forceGrokCall);
}

// Legacy function removed - using runAnalysisV2 instead

function stopAnalysisLoop() {
  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
  }
}

// Export state checker for worker
export function isTradingArmed(): boolean {
  return state.armed && !state.killSwitchActive && isLiveTradingEnabled();
}

export function isBotRunning(): boolean {
  return botRunning;
}

export function getTradingMode(): 'paper' | 'testnet' | 'mainnet' {
  return state.mode;
}

export function isKillSwitchActive(): boolean {
  return state.killSwitchActive;
}

export default tradingRoutes;
