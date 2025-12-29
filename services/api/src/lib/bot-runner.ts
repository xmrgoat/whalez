/**
 * Bot Runner - Multi-Bot Execution Engine
 * 
 * This module manages multiple trading bots running simultaneously.
 * Each bot runs its own analysis loop based on its configuration.
 * 
 * Features:
 * - Run up to 3 bots per user simultaneously
 * - Each bot has its own strategy, indicators, and risk config
 * - Real-time position management with SL/TP
 * - Performance tracking per bot
 * - Shared agent credentials with trading.ts (via agents.json)
 */

import * as pythonBridge from './python-bridge.js';
import * as fs from 'fs';
import * as path from 'path';

// Shared agents file path (same as trading.ts)
const AGENTS_FILE = path.join(process.cwd(), 'data', 'agents.json');

// Use dynamic import for prisma to avoid module resolution issues
let prismaClient: any = null;
async function getPrisma(): Promise<any> {
  if (!prismaClient) {
    try {
      const mod = await import('@whalez/database');
      prismaClient = mod.prisma;
    } catch {
      // Fallback: create inline client
      const mod = await import('@prisma/client');
      prismaClient = new mod.PrismaClient();
    }
  }
  return prismaClient;
}

// Load agent credentials from shared file (same as trading.ts)
function loadAgentsFromFile(): Map<string, AgentCredentials> {
  try {
    if (fs.existsSync(AGENTS_FILE)) {
      const data = fs.readFileSync(AGENTS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      console.log(`[BotRunner] 📂 Loaded ${Object.keys(parsed).length} agent credentials from shared file`);
      return new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error('[BotRunner] Failed to load agents from file:', error);
  }
  return new Map();
}

// ============================================================================
// TYPES
// ============================================================================

export interface BotInstance {
  id: string;
  walletAddress: string;
  name: string;
  symbol: string;
  timeframe: string;
  status: 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR';
  strategyConfig: StrategyConfig;
  riskConfig: RiskConfig;
  
  // Runtime state
  intervalId: ReturnType<typeof setInterval> | null;
  lastAnalysis: Date | null;
  lastTrade: Date | null;
  errorCount: number;
  lastError: string | null;
  
  // Performance tracking
  stats: BotStats;
  
  // Trailing stop state
  trailingStop: {
    active: boolean;
    side: 'long' | 'short' | null;
    entryPrice: number | null;
    highestPrice: number | null;  // For long positions
    lowestPrice: number | null;   // For short positions
    currentStopPrice: number | null;
  };
}

export interface StrategyConfig {
  indicators: IndicatorConfig[];
  entryConditions: ConditionConfig[];
  exitConditions: ConditionConfig[];
  minConfirmations?: number;
  tradingMode?: 'conservative' | 'moderate' | 'aggressive';
}

export interface IndicatorConfig {
  name: string;
  params: Record<string, number>;
  enabled: boolean;
}

export interface ConditionConfig {
  id: string;
  indicator: string;
  operator: string;
  value: number | string;
  enabled: boolean;
}

export interface RiskConfig {
  positionSizePct: number;
  maxLeverage: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxDrawdownPct: number;
  enableTrailingStop: boolean;
  trailingStopPct: number;
}

export interface BotStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  startedAt: Date | null;
  lastTradeAt: Date | null;
}

export interface AgentCredentials {
  agentAddress: string;
  agentPrivateKey: string;
  masterAddress: string;
  agentName: string;
}

export interface TradeSignal {
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  reasoning: string;
  indicators: Record<string, number>;
  shouldTrade: boolean;
}

// ============================================================================
// BOT RUNNER SINGLETON
// ============================================================================

class BotRunnerManager {
  private runningBots: Map<string, BotInstance> = new Map();
  private userAgents: Map<string, AgentCredentials> = new Map();
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private initialized: boolean = false;
  
  // Analysis intervals per trading mode (in ms)
  private readonly ANALYSIS_INTERVALS = {
    conservative: 5 * 60 * 1000,  // 5 minutes
    moderate: 3 * 60 * 1000,      // 3 minutes
    aggressive: 1 * 60 * 1000,    // 1 minute
  };
  
  // Minimum time between trades per bot (in ms)
  private readonly MIN_TRADE_INTERVAL = 60 * 1000; // 1 minute
  
  constructor() {
    // Load agents from shared file on startup
    this.loadAgentsFromSharedFile();
  }
  
  /**
   * Load agents from shared agents.json file (synced with trading.ts)
   */
  private loadAgentsFromSharedFile(): void {
    const agents = loadAgentsFromFile();
    this.userAgents = agents;
    console.log(`[BotRunner] Initialized with ${agents.size} agents from shared file`);
  }
  
  /**
   * Reload agents from file (call this if agents.json was updated externally)
   */
  reloadAgents(): void {
    this.loadAgentsFromSharedFile();
  }
  
  // ============================================================================
  // AGENT MANAGEMENT
  // ============================================================================
  
  /**
   * Register agent credentials for a wallet (also updates in-memory cache)
   */
  registerAgent(walletAddress: string, credentials: AgentCredentials): void {
    this.userAgents.set(walletAddress.toLowerCase(), credentials);
    console.log(`[BotRunner] Registered agent for wallet ${walletAddress.slice(0, 8)}...`);
  }
  
  /**
   * Check if wallet has registered agent (checks both memory and file)
   */
  hasAgent(walletAddress: string): boolean {
    const wallet = walletAddress.toLowerCase();
    // First check in-memory
    if (this.userAgents.has(wallet)) {
      return true;
    }
    // Reload from file in case trading.ts added a new agent
    this.loadAgentsFromSharedFile();
    return this.userAgents.has(wallet);
  }
  
  /**
   * Get agent args for Python bridge
   */
  private getAgentArgs(walletAddress: string): string {
    const agent = this.userAgents.get(walletAddress.toLowerCase());
    if (!agent) return '';
    return `--agent-key=${agent.agentPrivateKey} --master=${agent.masterAddress}`;
  }
  
  // ============================================================================
  // BOT LIFECYCLE
  // ============================================================================
  
  /**
   * Start a bot
   */
  async startBot(botId: string, walletAddress: string): Promise<{ success: boolean; error?: string }> {
    const wallet = walletAddress.toLowerCase();
    
    // Check if bot is already running
    if (this.runningBots.has(botId)) {
      return { success: false, error: 'Bot is already running' };
    }
    
    // Check running bot limit per user (max 3)
    const userBots = Array.from(this.runningBots.values()).filter(b => b.walletAddress === wallet);
    if (userBots.length >= 3) {
      return { success: false, error: 'Maximum 3 bots can run simultaneously' };
    }
    
    // Check if agent is registered
    if (!this.hasAgent(wallet)) {
      return { success: false, error: 'Agent wallet not authorized. Please authorize trading first.' };
    }
    
    try {
      // Fetch bot from database
      const db = await getPrisma();
      const dbBot = await db.userBot.findUnique({
        where: { id: botId },
      });
      
      if (!dbBot) {
        return { success: false, error: 'Bot not found' };
      }
      
      if (dbBot.walletAddress !== wallet) {
        return { success: false, error: 'Not authorized to start this bot' };
      }
      
      // Check if another bot is already trading this symbol (prevent conflicts)
      const symbolConflict = userBots.find(b => b.symbol.toUpperCase() === dbBot.symbol.toUpperCase());
      if (symbolConflict) {
        return { 
          success: false, 
          error: `Another bot ("${symbolConflict.name}") is already trading ${dbBot.symbol}. Stop it first to avoid position conflicts.` 
        };
      }
      
      // Parse configs
      const strategyConfig = (dbBot.strategyConfig as StrategyConfig) || {
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        tradingMode: 'moderate',
      };
      
      const riskConfig = (dbBot.riskConfig as RiskConfig) || {
        positionSizePct: 2,
        maxLeverage: 5,
        stopLossPct: 2,
        takeProfitPct: 4,
        maxDrawdownPct: 10,
        enableTrailingStop: false,
        trailingStopPct: 1,
      };
      
      // Create bot instance
      const botInstance: BotInstance = {
        id: botId,
        walletAddress: wallet,
        name: dbBot.name,
        symbol: dbBot.symbol,
        timeframe: dbBot.timeframe,
        status: 'STARTING',
        strategyConfig,
        riskConfig,
        intervalId: null,
        lastAnalysis: null,
        lastTrade: null,
        errorCount: 0,
        lastError: null,
        stats: {
          totalTrades: dbBot.totalTrades,
          winningTrades: dbBot.winningTrades,
          losingTrades: dbBot.totalTrades - dbBot.winningTrades,
          totalPnl: dbBot.totalPnl,
          totalPnlPct: dbBot.totalPnlPct,
          maxDrawdown: dbBot.maxDrawdown,
          winRate: dbBot.totalTrades > 0 ? (dbBot.winningTrades / dbBot.totalTrades) * 100 : 0,
          profitFactor: 0,
          startedAt: new Date(),
          lastTradeAt: null,
        },
        trailingStop: {
          active: false,
          side: null,
          entryPrice: null,
          highestPrice: null,
          lowestPrice: null,
          currentStopPrice: null,
        },
      };
      
      // Store bot instance
      this.runningBots.set(botId, botInstance);
      
      // Update database status
      await db.userBot.update({
        where: { id: botId },
        data: { 
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
      
      // Start analysis loop
      this.startAnalysisLoop(botInstance);
      
      botInstance.status = 'RUNNING';
      
      console.log(`[BotRunner] ✅ Started bot "${dbBot.name}" (${botId}) for wallet ${wallet.slice(0, 8)}...`);
      console.log(`[BotRunner]    Symbol: ${dbBot.symbol} | Timeframe: ${dbBot.timeframe} | Mode: ${strategyConfig.tradingMode || 'moderate'}`);
      
      return { success: true };
      
    } catch (error: any) {
      console.error(`[BotRunner] ❌ Failed to start bot ${botId}:`, error);
      return { success: false, error: error.message || 'Failed to start bot' };
    }
  }
  
  /**
   * Stop a bot
   * @param closePosition - If true, close any open position for this bot's symbol
   */
  async stopBot(
    botId: string, 
    walletAddress: string, 
    options: { closePosition?: boolean } = {}
  ): Promise<{ success: boolean; error?: string; positionClosed?: boolean }> {
    const wallet = walletAddress.toLowerCase();
    const bot = this.runningBots.get(botId);
    
    if (!bot) {
      return { success: false, error: 'Bot is not running' };
    }
    
    if (bot.walletAddress !== wallet) {
      return { success: false, error: 'Not authorized to stop this bot' };
    }
    
    let positionClosed = false;
    
    try {
      bot.status = 'STOPPING';
      
      // Clear interval
      if (bot.intervalId) {
        clearInterval(bot.intervalId);
        bot.intervalId = null;
      }
      
      // Close position if requested
      if (options.closePosition) {
        positionClosed = await this.closePositionForBot(bot);
      }
      
      // Update database
      const db = await getPrisma();
      await db.userBot.update({
        where: { id: botId },
        data: { 
          status: 'STOPPED',
          stoppedAt: new Date(),
          totalTrades: bot.stats.totalTrades,
          winningTrades: bot.stats.winningTrades,
          totalPnl: bot.stats.totalPnl,
          totalPnlPct: bot.stats.totalPnlPct,
          maxDrawdown: bot.stats.maxDrawdown,
        },
      });
      
      // Remove from running bots
      this.runningBots.delete(botId);
      
      console.log(`[BotRunner] 🛑 Stopped bot "${bot.name}" (${botId})${positionClosed ? ' - Position closed' : ''}`);
      
      return { success: true, positionClosed };
      
    } catch (error: any) {
      console.error(`[BotRunner] ❌ Failed to stop bot ${botId}:`, error);
      return { success: false, error: error.message || 'Failed to stop bot' };
    }
  }
  
  /**
   * Close position for a bot (used when stopping with closePosition option)
   */
  private async closePositionForBot(bot: BotInstance): Promise<boolean> {
    try {
      const agentArgs = this.getAgentArgs(bot.walletAddress);
      const coin = bot.symbol.replace('-PERP', '');
      
      // Get current position
      const positions = await pythonBridge.getPositions(agentArgs);
      if (!positions.success || !positions.positions) return false;
      
      const position = positions.positions.find((p: any) => 
        p.coin === coin || p.symbol === bot.symbol
      );
      
      const positionSize = position?.szi ?? position?.size ?? 0;
      if (!position || positionSize === 0) {
        console.log(`[BotRunner] No open position to close for "${bot.name}"`);
        return false;
      }
      
      // Cancel all orders first
      await pythonBridge.cancelAllOrders(coin, agentArgs);
      
      // Close position with market order
      const side = positionSize > 0 ? 'sell' : 'buy';
      const size = Math.abs(positionSize);
      
      console.log(`[BotRunner] 📤 Closing ${positionSize > 0 ? 'long' : 'short'} position for "${bot.name}" (${size} ${coin})`);
      
      const result = await pythonBridge.executeMarketOrder(
        coin,
        side,
        size,
        agentArgs
      );
      
      if (result.success) {
        console.log(`[BotRunner] ✅ Position closed for "${bot.name}"`);
        
        // Reset trailing stop
        bot.trailingStop = {
          active: false,
          side: null,
          entryPrice: null,
          highestPrice: null,
          lowestPrice: null,
          currentStopPrice: null,
        };
        
        return true;
      } else {
        console.error(`[BotRunner] ❌ Failed to close position:`, result.error);
        return false;
      }
      
    } catch (error: any) {
      console.error(`[BotRunner] Error closing position for "${bot.name}":`, error.message);
      return false;
    }
  }
  
  /**
   * Get running bot status
   */
  getBotStatus(botId: string): BotInstance | null {
    return this.runningBots.get(botId) || null;
  }
  
  /**
   * Get all running bots for a wallet
   */
  getRunningBots(walletAddress: string): BotInstance[] {
    const wallet = walletAddress.toLowerCase();
    return Array.from(this.runningBots.values()).filter(b => b.walletAddress === wallet);
  }
  
  /**
   * Get all running bots count
   */
  getTotalRunningBots(): number {
    return this.runningBots.size;
  }
  
  // ============================================================================
  // ANALYSIS LOOP
  // ============================================================================
  
  /**
   * Start the analysis loop for a bot
   */
  private startAnalysisLoop(bot: BotInstance): void {
    const mode = bot.strategyConfig.tradingMode || 'moderate';
    const interval = this.ANALYSIS_INTERVALS[mode];
    
    console.log(`[BotRunner] Starting analysis loop for "${bot.name}" every ${interval / 1000}s`);
    
    // Run immediately
    this.runAnalysis(bot).catch(err => {
      console.error(`[BotRunner] Initial analysis error for ${bot.id}:`, err);
    });
    
    // Then run on interval
    bot.intervalId = setInterval(() => {
      if (bot.status === 'RUNNING') {
        this.runAnalysis(bot).catch(err => {
          console.error(`[BotRunner] Analysis error for ${bot.id}:`, err);
          bot.errorCount++;
          bot.lastError = err.message;
          
          // Stop bot if too many errors
          if (bot.errorCount >= 10) {
            console.error(`[BotRunner] Too many errors for bot ${bot.id}, stopping...`);
            this.stopBot(bot.id, bot.walletAddress);
          }
        });
      }
    }, interval);
  }
  
  /**
   * Run analysis for a bot
   */
  private async runAnalysis(bot: BotInstance): Promise<void> {
    if (bot.status !== 'RUNNING') return;
    
    const startTime = Date.now();
    console.log(`[BotRunner] 🔍 Analyzing ${bot.symbol} for bot "${bot.name}"...`);
    
    try {
      // Get current price
      const price = await this.getCurrentPrice(bot.symbol);
      if (!price) {
        console.log(`[BotRunner] ⚠️ Could not get price for ${bot.symbol}`);
        return;
      }
      
      // Check if we already have a position
      const agentArgs = this.getAgentArgs(bot.walletAddress);
      const hasPosition = await pythonBridge.hasOpenPosition(bot.symbol.replace('-PERP', ''), agentArgs);
      
      if (hasPosition) {
        // Monitor existing position
        await this.monitorPosition(bot, price);
      } else {
        // Look for entry signal
        const signal = await this.generateSignal(bot, price);
        
        if (signal.shouldTrade && signal.confidence >= 0.6) {
          // Check minimum trade interval
          if (bot.lastTrade && Date.now() - bot.lastTrade.getTime() < this.MIN_TRADE_INTERVAL) {
            console.log(`[BotRunner] ⏳ Trade cooldown active for "${bot.name}"`);
            return;
          }
          
          await this.executeTrade(bot, signal, price);
        }
      }
      
      bot.lastAnalysis = new Date();
      bot.errorCount = 0; // Reset error count on success
      
      const duration = Date.now() - startTime;
      console.log(`[BotRunner] ✅ Analysis complete for "${bot.name}" in ${duration}ms`);
      
    } catch (error: any) {
      console.error(`[BotRunner] ❌ Analysis failed for "${bot.name}":`, error.message);
      throw error;
    }
  }
  
  // ============================================================================
  // SIGNAL GENERATION
  // ============================================================================
  
  /**
   * Generate trading signal using bot's strategy
   */
  private async generateSignal(bot: BotInstance, currentPrice: number): Promise<TradeSignal> {
    const mode = bot.strategyConfig.tradingMode || 'moderate';
    const minConfirmations = bot.strategyConfig.minConfirmations || (mode === 'aggressive' ? 2 : mode === 'moderate' ? 3 : 4);
    
    // Build context for Grok analysis
    const context = {
      symbol: bot.symbol,
      price: currentPrice,
      timeframe: bot.timeframe,
      indicators: bot.strategyConfig.indicators,
      entryConditions: bot.strategyConfig.entryConditions,
      tradingMode: mode,
      riskConfig: bot.riskConfig,
    };
    
    // Use fallback technical analysis (Grok integration can be added later)
    // This keeps the bot runner independent and always functional
    return this.generateFallbackSignal(bot, currentPrice);
  }
  
  /**
   * Fallback signal generation without Grok
   */
  private async generateFallbackSignal(bot: BotInstance, currentPrice: number): Promise<TradeSignal> {
    // Simple momentum-based signal
    const priceHistory = await this.getPriceHistory(bot.symbol, 20);
    
    const firstPrice = priceHistory[0];
    if (priceHistory.length < 10 || firstPrice === undefined) {
      return { direction: 'neutral', confidence: 0, reasoning: 'Insufficient data', indicators: {}, shouldTrade: false };
    }
    
    // Calculate simple indicators
    const sma10 = priceHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const sma20 = priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
    
    // Price momentum
    const momentum = (currentPrice - firstPrice) / firstPrice * 100;
    
    // Generate signal
    let direction: 'long' | 'short' | 'neutral' = 'neutral';
    let confidence = 0.5;
    let reasoning = '';
    
    if (currentPrice > sma10 && sma10 > sma20 && momentum > 0.5) {
      direction = 'long';
      confidence = 0.65;
      reasoning = `Bullish: Price above SMA10 (${sma10.toFixed(2)}) > SMA20 (${sma20.toFixed(2)}), momentum +${momentum.toFixed(2)}%`;
    } else if (currentPrice < sma10 && sma10 < sma20 && momentum < -0.5) {
      direction = 'short';
      confidence = 0.65;
      reasoning = `Bearish: Price below SMA10 (${sma10.toFixed(2)}) < SMA20 (${sma20.toFixed(2)}), momentum ${momentum.toFixed(2)}%`;
    } else {
      reasoning = 'No clear trend signal';
    }
    
    return {
      direction,
      confidence,
      reasoning,
      indicators: { sma10, sma20, momentum, currentPrice },
      shouldTrade: direction !== 'neutral' && confidence >= 0.6,
    };
  }
  
  // ============================================================================
  // TRADE EXECUTION
  // ============================================================================
  
  /**
   * Execute a trade based on signal
   */
  private async executeTrade(bot: BotInstance, signal: TradeSignal, currentPrice: number): Promise<void> {
    const agentArgs = this.getAgentArgs(bot.walletAddress);
    const coin = bot.symbol.replace('-PERP', '');
    
    console.log(`[BotRunner] 📈 Executing ${signal.direction.toUpperCase()} trade for "${bot.name}" on ${bot.symbol}`);
    console.log(`[BotRunner]    Price: $${currentPrice} | Confidence: ${(signal.confidence * 100).toFixed(0)}%`);
    console.log(`[BotRunner]    Reason: ${signal.reasoning}`);
    
    try {
      // Get account balance
      const balanceResult = await pythonBridge.getBalance(agentArgs);
      if (!balanceResult.success || !balanceResult.accountValue) {
        console.error(`[BotRunner] ❌ Failed to get balance for "${bot.name}"`);
        return;
      }
      
      const equity = balanceResult.accountValue;
      
      // Calculate position size
      const positionValue = equity * (bot.riskConfig.positionSizePct / 100);
      const leverage = Math.min(bot.riskConfig.maxLeverage, 10);
      const notional = positionValue * leverage;
      const size = notional / currentPrice;
      
      // Minimum notional check ($10)
      if (notional < 10) {
        console.log(`[BotRunner] ⚠️ Position too small ($${notional.toFixed(2)}), skipping trade`);
        return;
      }
      
      // Calculate SL/TP
      const slPct = bot.riskConfig.stopLossPct / 100;
      const tpPct = bot.riskConfig.takeProfitPct / 100;
      
      const stopLoss = signal.direction === 'long' 
        ? currentPrice * (1 - slPct)
        : currentPrice * (1 + slPct);
      
      const takeProfit = signal.direction === 'long'
        ? currentPrice * (1 + tpPct)
        : currentPrice * (1 - tpPct);
      
      // Execute market order
      const side = signal.direction === 'long' ? 'buy' : 'sell';
      const orderResult = await pythonBridge.executeMarketOrder(coin, side, size, agentArgs);
      
      if (!orderResult.success) {
        console.error(`[BotRunner] ❌ Order failed for "${bot.name}": ${orderResult.error}`);
        return;
      }
      
      const fillPrice = orderResult.avgPx || currentPrice;
      const fillSize = orderResult.totalSz || size;
      
      console.log(`[BotRunner] ✅ Order filled: ${fillSize} ${coin} @ $${fillPrice}`);
      
      // Place SL/TP orders
      const exitSide = signal.direction === 'long' ? 'sell' : 'buy';
      
      const slResult = await pythonBridge.placeStopLoss(coin, exitSide, fillSize, stopLoss, agentArgs);
      if (slResult.success) {
        console.log(`[BotRunner] ✅ Stop Loss set @ $${stopLoss.toFixed(2)}`);
      }
      
      const tpResult = await pythonBridge.placeTakeProfit(coin, exitSide, fillSize, takeProfit, agentArgs);
      if (tpResult.success) {
        console.log(`[BotRunner] ✅ Take Profit set @ $${takeProfit.toFixed(2)}`);
      }
      
      // Record trade (only for long/short, not neutral)
      const tradeSide = signal.direction as 'long' | 'short';
      await this.recordTrade(bot, {
        side: tradeSide,
        symbol: bot.symbol,
        price: fillPrice,
        quantity: fillSize,
        leverage,
        stopLoss,
        takeProfit,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
      });
      
      bot.lastTrade = new Date();
      bot.stats.totalTrades++;
      
    } catch (error: any) {
      console.error(`[BotRunner] ❌ Trade execution failed for "${bot.name}":`, error.message);
    }
  }
  
  /**
   * Monitor existing position with trailing stop support
   */
  private async monitorPosition(bot: BotInstance, currentPrice: number): Promise<void> {
    const agentArgs = this.getAgentArgs(bot.walletAddress);
    
    // Get current position details
    try {
      const positions = await pythonBridge.getPositions(agentArgs);
      if (!positions.success || !positions.positions) return;
      
      const coin = bot.symbol.replace('-PERP', '');
      const position = positions.positions.find((p: any) => 
        p.coin === coin || p.symbol === bot.symbol
      );
      
      // Hyperliquid uses 'szi' for size
      const positionSize = position?.szi ?? position?.size ?? 0;
      
      if (!position || positionSize === 0) {
        // Position closed, reset trailing stop
        if (bot.trailingStop.active) {
          console.log(`[BotRunner] 📊 Position closed for "${bot.name}", resetting trailing stop`);
          bot.trailingStop = {
            active: false,
            side: null,
            entryPrice: null,
            highestPrice: null,
            lowestPrice: null,
            currentStopPrice: null,
          };
        }
        return;
      }
      
      const positionSide: 'long' | 'short' = positionSize > 0 ? 'long' : 'short';
      const entryPrice = position.entryPx;
      
      console.log(`[BotRunner] 👀 Monitoring ${positionSide} position for "${bot.name}" @ $${currentPrice} (entry: $${entryPrice})`);
      
      // Initialize trailing stop if enabled and not active
      if (bot.riskConfig.enableTrailingStop && !bot.trailingStop.active) {
        bot.trailingStop = {
          active: true,
          side: positionSide,
          entryPrice: entryPrice,
          highestPrice: positionSide === 'long' ? currentPrice : null,
          lowestPrice: positionSide === 'short' ? currentPrice : null,
          currentStopPrice: null,
        };
        console.log(`[BotRunner] 🎯 Trailing stop activated for "${bot.name}"`);
      }
      
      // Update trailing stop if active
      if (bot.trailingStop.active && bot.riskConfig.enableTrailingStop) {
        const trailingPct = bot.riskConfig.trailingStopPct || 1;
        
        if (positionSide === 'long') {
          // Update highest price
          if (currentPrice > (bot.trailingStop.highestPrice || 0)) {
            bot.trailingStop.highestPrice = currentPrice;
            // Calculate new stop price
            const newStopPrice = currentPrice * (1 - trailingPct / 100);
            
            // Only move stop up, never down
            if (!bot.trailingStop.currentStopPrice || newStopPrice > bot.trailingStop.currentStopPrice) {
              const oldStop = bot.trailingStop.currentStopPrice;
              bot.trailingStop.currentStopPrice = newStopPrice;
              
              console.log(`[BotRunner] 📈 Trailing stop updated for "${bot.name}": $${oldStop?.toFixed(2) || 'N/A'} → $${newStopPrice.toFixed(2)}`);
              
              // Update stop loss order on exchange
              await this.updateTrailingStopOrder(bot, newStopPrice, 'long', agentArgs);
            }
          }
          
          // Check if trailing stop hit
          if (bot.trailingStop.currentStopPrice && currentPrice <= bot.trailingStop.currentStopPrice) {
            console.log(`[BotRunner] 🛑 Trailing stop HIT for "${bot.name}" @ $${currentPrice}`);
            // The stop order should execute automatically on exchange
          }
          
        } else {
          // Short position - update lowest price
          if (currentPrice < (bot.trailingStop.lowestPrice || Infinity)) {
            bot.trailingStop.lowestPrice = currentPrice;
            // Calculate new stop price
            const newStopPrice = currentPrice * (1 + trailingPct / 100);
            
            // Only move stop down, never up
            if (!bot.trailingStop.currentStopPrice || newStopPrice < bot.trailingStop.currentStopPrice) {
              const oldStop = bot.trailingStop.currentStopPrice;
              bot.trailingStop.currentStopPrice = newStopPrice;
              
              console.log(`[BotRunner] 📉 Trailing stop updated for "${bot.name}": $${oldStop?.toFixed(2) || 'N/A'} → $${newStopPrice.toFixed(2)}`);
              
              // Update stop loss order on exchange
              await this.updateTrailingStopOrder(bot, newStopPrice, 'short', agentArgs);
            }
          }
          
          // Check if trailing stop hit
          if (bot.trailingStop.currentStopPrice && currentPrice >= bot.trailingStop.currentStopPrice) {
            console.log(`[BotRunner] 🛑 Trailing stop HIT for "${bot.name}" @ $${currentPrice}`);
          }
        }
      }
      
    } catch (error: any) {
      console.error(`[BotRunner] Error monitoring position for "${bot.name}":`, error.message);
    }
  }
  
  /**
   * Update trailing stop order on exchange
   */
  private async updateTrailingStopOrder(
    bot: BotInstance, 
    newStopPrice: number, 
    side: 'long' | 'short',
    agentArgs: string
  ): Promise<void> {
    try {
      const coin = bot.symbol.replace('-PERP', '');
      
      // Cancel existing stop orders for this symbol
      await pythonBridge.cancelAllOrders(coin, agentArgs);
      
      // Place new stop order
      // For long: sell stop below current price
      // For short: buy stop above current price
      const orderSide = side === 'long' ? 'sell' : 'buy';
      
      // Get position size to close
      const positions = await pythonBridge.getPositions(agentArgs);
      if (!positions.success || !positions.positions) return;
      
      const position = positions.positions.find((p: any) => 
        p.coin === coin || p.symbol === bot.symbol
      );
      
      if (!position) return;
      
      const size = Math.abs(position.szi ?? position.size ?? 0);
      
      // Place stop market order
      const result = await pythonBridge.placeStopLoss(
        coin,
        orderSide,
        size,
        newStopPrice,
        agentArgs
      );
      
      if (result.success) {
        console.log(`[BotRunner] ✅ Trailing stop order placed for "${bot.name}" @ $${newStopPrice.toFixed(2)}`);
      } else {
        console.error(`[BotRunner] ❌ Failed to place trailing stop order:`, result.error);
      }
      
    } catch (error: any) {
      console.error(`[BotRunner] Error updating trailing stop order:`, error.message);
    }
  }
  
  /**
   * Record trade in database
   */
  private async recordTrade(bot: BotInstance, trade: {
    side: 'long' | 'short';
    symbol: string;
    price: number;
    quantity: number;
    leverage: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
    reasoning: string;
  }): Promise<void> {
    try {
      const db = await getPrisma();
      const dbSide = trade.side === 'long' ? 'BUY' : 'SELL';
      
      // Record trade in UserBotTrade table
      await db.userBotTrade.create({
        data: {
          userBotId: bot.id,
          symbol: trade.symbol,
          side: dbSide,
          entryPrice: trade.price,
          quantity: trade.quantity,
          leverage: trade.leverage,
          stopLoss: trade.stopLoss,
          takeProfit: trade.takeProfit,
          status: 'OPEN',
          entryTime: new Date(),
          reasoning: trade.reasoning,
        },
      });
      
      // Update bot stats
      await db.userBot.update({
        where: { id: bot.id },
        data: {
          totalTrades: { increment: 1 },
        },
      });
      
    } catch (error) {
      console.error(`[BotRunner] Failed to record trade:`, error);
    }
  }
  
  // ============================================================================
  // PRICE DATA
  // ============================================================================
  
  /**
   * Get current price for a symbol
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    const coin = symbol.replace('-PERP', '');
    const cacheKey = coin.toUpperCase();
    
    // Check cache (valid for 5 seconds)
    const cached = this.priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.price;
    }
    
    try {
      // Fetch from Hyperliquid
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
      });
      
      const data = await response.json();
      
      const priceData = data as Record<string, string>;
      if (priceData && priceData[coin]) {
        const price = parseFloat(priceData[coin]);
        this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }
      
      return null;
    } catch (error) {
      console.error(`[BotRunner] Failed to get price for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Get price history for a symbol
   */
  private async getPriceHistory(symbol: string, periods: number): Promise<number[]> {
    const coin = symbol.replace('-PERP', '');
    
    try {
      const endTime = Date.now();
      const startTime = endTime - periods * 60 * 60 * 1000; // Assuming 1h candles
      
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: {
            coin,
            interval: '1h',
            startTime,
            endTime,
          },
        }),
      });
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        return data.map((c: any) => parseFloat(c.c)); // Close prices
      }
      
      return [];
    } catch (error) {
      console.error(`[BotRunner] Failed to get price history for ${symbol}:`, error);
      return [];
    }
  }
  
  // ============================================================================
  // CLEANUP & RECOVERY
  // ============================================================================
  
  /**
   * Stop all running bots (for graceful shutdown)
   */
  async stopAllBots(): Promise<void> {
    console.log(`[BotRunner] Stopping all ${this.runningBots.size} running bots...`);
    
    const promises = Array.from(this.runningBots.entries()).map(([botId, bot]) => 
      this.stopBot(botId, bot.walletAddress)
    );
    
    await Promise.all(promises);
    
    console.log('[BotRunner] All bots stopped');
  }
  
  /**
   * Recovery on boot: reset any "RUNNING" bots to "STOPPED"
   * This prevents ghost bots after server restart
   */
  async recoverOnBoot(): Promise<void> {
    console.log('[BotRunner] 🔄 Running boot recovery...');
    
    try {
      const db = await getPrisma();
      
      // Find all bots marked as RUNNING in DB
      const runningBots = await db.userBot.findMany({
        where: { status: 'RUNNING' },
      });
      
      if (runningBots.length === 0) {
        console.log('[BotRunner] ✅ No orphaned running bots found');
        return;
      }
      
      console.log(`[BotRunner] ⚠️ Found ${runningBots.length} orphaned running bot(s), resetting to STOPPED...`);
      
      // Reset all to STOPPED
      await db.userBot.updateMany({
        where: { status: 'RUNNING' },
        data: { 
          status: 'STOPPED',
          stoppedAt: new Date(),
        },
      });
      
      console.log(`[BotRunner] ✅ Reset ${runningBots.length} bot(s) to STOPPED`);
      
    } catch (error) {
      console.error('[BotRunner] ❌ Boot recovery failed:', error);
    }
  }
}

// Export singleton instance
export const botRunner = new BotRunnerManager();

// Setup graceful shutdown handlers
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n[BotRunner] 🛑 Received ${signal}, initiating graceful shutdown...`);
    await botRunner.stopAllBots();
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  console.log('[BotRunner] ✅ Graceful shutdown handlers registered');
}

// Initialize on module load
setupGracefulShutdown();

// Run boot recovery (async, non-blocking)
botRunner.recoverOnBoot().catch(err => {
  console.error('[BotRunner] Boot recovery error:', err);
});

export default botRunner;
