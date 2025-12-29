/**
 * USER BOT RUNNER
 * Exécute les bots personnalisés créés par les utilisateurs
 * Ultra complet et professionnel
 */

import { prisma } from '@whalez/database';
import {
  StrategyEngine,
  RiskEngine,
  ExecutionEngine,
  PaperExecutionAdapter,
  HyperliquidExecutionAdapter,
  HyperliquidMarketDataAdapter,
  PaperMarketDataAdapter,
  EnhancedGrokService,
  RealtimeDataService,
  getRealtimeDataService,
  type BotConfig,
  type RiskConfig,
  type OHLC,
  type Signal,
  type Trade,
  type MarketDataAdapter,
  type ExecutionAdapter,
  type MarketContext,
  type Timeframe,
} from '@whalez/core';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

import type {
  UserBotStrategyConfig,
  UserBotStatus,
  UserBotEvent,
  UserBotRuntimeState,
  UserIndicatorConfig,
  TradingCondition,
  EntryRule,
  ExitRule,
  UserRiskConfig,
  ConditionGroup,
} from '@whalez/core';

// UUID helper
const uuid = (): string => randomUUID();

interface UserBotRecord {
  id: string;
  walletAddress: string;
  name: string;
  symbol: string;
  timeframe: string;
  status: string;
  strategyConfig: any;
  riskConfig: any;
  paperTrading: boolean;
  initialCapital: number;
}

interface IndicatorValues {
  [key: string]: number | number[];
}

interface ConditionResult {
  conditionId: string;
  passed: boolean;
  reason: string;
}

// ============================================================================
// USER BOT RUNNER CLASS
// ============================================================================

export class UserBotRunner extends EventEmitter {
  private userBot: UserBotRecord;
  private strategyConfig: UserBotStrategyConfig;
  private running = false;
  private paused = false;

  // Engines
  private riskEngine: RiskEngine;
  private executionEngine: ExecutionEngine;

  // Adapters
  private marketDataAdapter: MarketDataAdapter;
  private executionAdapter: ExecutionAdapter;
  private realtimeDataService: RealtimeDataService | null = null;

  // State
  private state: UserBotRuntimeState;
  private candleHistory: Map<string, OHLC[]> = new Map();
  private indicatorCache: Map<string, IndicatorValues> = new Map();
  private previousIndicators: Map<string, IndicatorValues> = new Map();
  
  // Subscriptions
  private unsubscribes: Array<() => void> = [];
  
  // Stats
  private closedTradeCount = 0;
  private sessionStartTime = 0;

  constructor(userBot: UserBotRecord) {
    super();
    this.userBot = userBot;
    this.strategyConfig = this.parseStrategyConfig(userBot.strategyConfig);
    
    // Initialize state
    this.state = this.initializeState();
    
    // Initialize adapters
    const isPaper = userBot.paperTrading;
    const initialEquity = userBot.initialCapital || 10000;
    
    if (isPaper) {
      this.executionAdapter = new PaperExecutionAdapter({ initialEquity });
      this.marketDataAdapter = new PaperMarketDataAdapter({ symbols: [this.strategyConfig.symbol] });
    } else {
      this.executionAdapter = new HyperliquidExecutionAdapter();
      this.marketDataAdapter = new HyperliquidMarketDataAdapter();
    }
    
    // Initialize engines with mapped config
    const botConfig = this.mapToBotConfig();
    const riskConfig = this.mapToRiskConfig();
    
    this.riskEngine = new RiskEngine(riskConfig, initialEquity);
    this.executionEngine = new ExecutionEngine(this.executionAdapter, botConfig);
  }

  // ============================================================================
  // CONFIGURATION PARSING
  // ============================================================================

  private parseStrategyConfig(config: any): UserBotStrategyConfig {
    // Validate and parse the strategy config
    if (!config) {
      return this.getDefaultStrategyConfig();
    }
    
    // Ensure all required fields exist
    return {
      version: config.version || '1.0.0',
      createdAt: config.createdAt || Date.now(),
      updatedAt: config.updatedAt || Date.now(),
      symbol: config.symbol || this.userBot.symbol,
      primaryTimeframe: config.primaryTimeframe || this.userBot.timeframe,
      additionalTimeframes: config.additionalTimeframes || [],
      dataSources: config.dataSources || this.getDefaultDataSources(),
      indicators: config.indicators || [],
      conditions: config.conditions || [],
      entryRules: config.entryRules || [],
      exitRules: config.exitRules || [],
      risk: config.risk || this.getDefaultRiskConfig(),
      ai: config.ai,
      advanced: config.advanced || this.getDefaultAdvancedConfig(),
    };
  }

  private getDefaultStrategyConfig(): UserBotStrategyConfig {
    return {
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      symbol: this.userBot.symbol,
      primaryTimeframe: this.userBot.timeframe,
      additionalTimeframes: [],
      dataSources: this.getDefaultDataSources(),
      indicators: this.getDefaultIndicators(),
      conditions: [],
      entryRules: [],
      exitRules: [],
      risk: this.getDefaultRiskConfig(),
      advanced: this.getDefaultAdvancedConfig(),
    };
  }

  private getDefaultDataSources(): any[] {
    return [
      { type: 'ohlc', enabled: true },
      { type: 'orderbook', enabled: true },
      { type: 'trades', enabled: true },
      { type: 'funding', enabled: true },
      { type: 'liquidations', enabled: true },
    ];
  }

  private getDefaultIndicators(): UserIndicatorConfig[] {
    return [
      {
        id: 'ema_20',
        type: 'ema',
        name: 'EMA 20',
        enabled: true,
        params: [{ name: 'period', type: 'number', value: 20, min: 5, max: 200 }],
        overlay: true,
      },
      {
        id: 'ema_50',
        type: 'ema',
        name: 'EMA 50',
        enabled: true,
        params: [{ name: 'period', type: 'number', value: 50, min: 5, max: 200 }],
        overlay: true,
      },
      {
        id: 'rsi_14',
        type: 'rsi',
        name: 'RSI 14',
        enabled: true,
        params: [{ name: 'period', type: 'number', value: 14, min: 2, max: 50 }],
        overlay: false,
      },
      {
        id: 'atr_14',
        type: 'atr',
        name: 'ATR 14',
        enabled: true,
        params: [{ name: 'period', type: 'number', value: 14, min: 5, max: 50 }],
        overlay: false,
      },
    ];
  }

  private getDefaultRiskConfig(): UserRiskConfig {
    const riskConfig = this.userBot.riskConfig || {};
    return {
      positionSizing: {
        method: riskConfig.positionSizingMethod || 'fixed_percentage',
        basePercentage: riskConfig.positionSizePct || 2,
        maxPercentage: riskConfig.maxPositionSizePct || 5,
        minPercentage: riskConfig.minPositionSizePct || 0.5,
        kellyFraction: 0.25,
      },
      stopLoss: {
        enabled: true,
        type: 'atr_multiple',
        value: riskConfig.stopLossAtrMultiplier || 2,
      },
      takeProfit: {
        enabled: true,
        type: 'atr_multiple',
        value: riskConfig.takeProfitAtrMultiplier || 3,
      },
      limits: {
        maxOpenPositions: riskConfig.maxOpenPositions || 1,
        maxDrawdownPercent: riskConfig.maxDrawdownPct || 10,
        maxDailyLoss: riskConfig.maxDailyLossPct || 5,
        maxDailyTrades: riskConfig.maxDailyTrades || 10,
        maxLeverage: riskConfig.maxLeverage || 5,
        cooldownAfterLossMs: riskConfig.cooldownAfterLossMs || 3600000,
        maxConsecutiveLosses: riskConfig.maxConsecutiveLosses || 3,
      },
    };
  }

  private getDefaultAdvancedConfig() {
    return {
      maxSlippagePercent: 0.1,
      orderType: 'market' as const,
      limitOrderOffset: 0,
      maxRetries: 3,
      retryDelayMs: 1000,
      logLevel: 'info' as const,
      saveAllSignals: true,
      paperTrading: this.userBot.paperTrading,
      paperBalance: this.userBot.initialCapital || 10000,
    };
  }

  // ============================================================================
  // CONFIG MAPPING (UserBot -> BotConfig)
  // ============================================================================

  private mapToBotConfig(): BotConfig {
    const timeframes = [
      this.strategyConfig.primaryTimeframe,
      ...(this.strategyConfig.additionalTimeframes || []),
    ] as Timeframe[];

    return {
      id: this.userBot.id,
      name: this.userBot.name,
      symbol: this.strategyConfig.symbol,
      timeframes,
      indicators: this.strategyConfig.indicators.map(ind => ({
        name: ind.type,
        enabled: ind.enabled,
        params: ind.params.reduce((acc, p) => ({ ...acc, [p.name]: p.value }), {}),
      })),
      rules: this.strategyConfig.entryRules.map(rule => ({
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        condition: JSON.stringify(rule.conditionGroups),
        priority: rule.priority || 1,
      })),
      risk: this.mapToRiskConfig(),
      paperTrading: this.userBot.paperTrading,
      enabled: true,
    };
  }

  private mapToRiskConfig(): RiskConfig {
    const risk = this.strategyConfig.risk;
    return {
      maxPositionSizePercent: risk.positionSizing.basePercentage,
      stopLossAtrMultiplier: risk.stopLoss.type === 'atr_multiple' ? risk.stopLoss.value : 2,
      takeProfitAtrMultiplier: risk.takeProfit.type === 'atr_multiple' ? risk.takeProfit.value : undefined,
      maxOpenPositions: risk.limits.maxOpenPositions,
      maxDrawdownPercent: risk.limits.maxDrawdownPercent,
      cooldownAfterLossMs: risk.limits.cooldownAfterLossMs,
      maxLeverage: risk.limits.maxLeverage,
    };
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  private initializeState(): UserBotRuntimeState {
    return {
      status: 'STOPPED',
      currentIndicators: {},
      conditionResults: {},
      sessionStats: {
        trades: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
        pnlPercent: 0,
        maxDrawdown: 0,
        winRate: 0,
      },
      recentErrors: [],
    };
  }

  getState(): UserBotRuntimeState {
    return { ...this.state };
  }

  getConfig(): UserBotStrategyConfig {
    return { ...this.strategyConfig };
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  async start(): Promise<void> {
    if (this.running) {
      console.log(`[UserBotRunner] Bot ${this.userBot.id} already running`);
      return;
    }

    console.log(`[UserBotRunner] Starting bot ${this.userBot.id} (${this.userBot.name})`);
    this.state.status = 'STARTING';
    this.emitEvent('started', { botId: this.userBot.id });

    try {
      // Connect adapters
      await this.marketDataAdapter.connect();
      await this.executionAdapter.connect();

      // Connect realtime data service
      if (this.isDataSourceEnabled('orderbook') || 
          this.isDataSourceEnabled('trades') || 
          this.isDataSourceEnabled('funding')) {
        try {
          this.realtimeDataService = getRealtimeDataService();
          await this.realtimeDataService.connect();
          
          if (this.isDataSourceEnabled('orderbook')) {
            this.realtimeDataService.subscribeToL2Book(this.strategyConfig.symbol);
          }
          if (this.isDataSourceEnabled('trades')) {
            this.realtimeDataService.subscribeTrades(this.strategyConfig.symbol);
          }
          
          console.log(`[UserBotRunner] Connected to realtime data for ${this.strategyConfig.symbol}`);
        } catch (e) {
          console.warn(`[UserBotRunner] Realtime data service unavailable:`, e);
        }
      }

      this.running = true;
      this.paused = false;
      this.sessionStartTime = Date.now();
      this.state.status = 'RUNNING';
      this.state.startedAt = Date.now();

      // Subscribe to market data for each timeframe
      const allTimeframes = [
        this.strategyConfig.primaryTimeframe,
        ...(this.strategyConfig.additionalTimeframes || []),
      ];

      for (const timeframe of allTimeframes) {
        const unsub = this.marketDataAdapter.subscribeOHLC(
          this.strategyConfig.symbol,
          timeframe as Timeframe,
          (candle) => this.onCandle(candle, timeframe)
        );
        this.unsubscribes.push(unsub);
      }

      // Subscribe to order updates
      const unsubOrders = this.executionAdapter.onOrderUpdate((order) => {
        console.log(`[UserBotRunner] Order update: ${order.id} - ${order.status}`);
        this.emitEvent('trade_opened', { order });
      });
      this.unsubscribes.push(unsubOrders);

      // Subscribe to position updates
      const unsubPositions = this.executionAdapter.onPositionUpdate((position) => {
        console.log(`[UserBotRunner] Position update: ${position.symbol} - ${position.size}`);
        this.updateCurrentPosition(position);
      });
      this.unsubscribes.push(unsubPositions);

      // Load historical data
      await this.loadHistoricalData();

      // Update database status
      await this.updateBotStatus('RUNNING');

      console.log(`[UserBotRunner] Bot ${this.userBot.id} started successfully`);

    } catch (error: any) {
      console.error(`[UserBotRunner] Failed to start bot:`, error);
      this.state.status = 'ERROR';
      this.state.recentErrors.push({
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack,
      });
      this.emitEvent('error', { error: error.message });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    console.log(`[UserBotRunner] Stopping bot ${this.userBot.id}`);
    this.state.status = 'STOPPING';

    this.running = false;
    this.paused = false;

    // Unsubscribe from all
    for (const unsub of this.unsubscribes) {
      try {
        unsub();
      } catch (e) {
        // Ignore unsubscribe errors
      }
    }
    this.unsubscribes = [];

    // Disconnect adapters
    try {
      await this.marketDataAdapter.disconnect();
      await this.executionAdapter.disconnect();
    } catch (e) {
      console.warn(`[UserBotRunner] Error disconnecting adapters:`, e);
    }

    this.state.status = 'STOPPED';
    await this.updateBotStatus('STOPPED');
    this.emitEvent('stopped', { botId: this.userBot.id, stats: this.state.sessionStats });

    console.log(`[UserBotRunner] Bot ${this.userBot.id} stopped`);
  }

  async pause(): Promise<void> {
    if (!this.running || this.paused) return;
    
    this.paused = true;
    this.state.status = 'PAUSED';
    await this.updateBotStatus('PAUSED');
    this.emitEvent('paused', { botId: this.userBot.id });
    
    console.log(`[UserBotRunner] Bot ${this.userBot.id} paused`);
  }

  async resume(): Promise<void> {
    if (!this.running || !this.paused) return;
    
    this.paused = false;
    this.state.status = 'RUNNING';
    await this.updateBotStatus('RUNNING');
    this.emitEvent('resumed', { botId: this.userBot.id });
    
    console.log(`[UserBotRunner] Bot ${this.userBot.id} resumed`);
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  private async loadHistoricalData(): Promise<void> {
    const now = Date.now();
    const from = now - 30 * 24 * 60 * 60 * 1000; // 30 days

    const allTimeframes = [
      this.strategyConfig.primaryTimeframe,
      ...(this.strategyConfig.additionalTimeframes || []),
    ];

    for (const timeframe of allTimeframes) {
      try {
        const candles = await this.marketDataAdapter.getOHLC(
          this.strategyConfig.symbol,
          timeframe as Timeframe,
          from,
          now
        );
        this.candleHistory.set(timeframe, candles);
        console.log(`[UserBotRunner] Loaded ${candles.length} ${timeframe} candles`);
      } catch (e) {
        console.warn(`[UserBotRunner] Failed to load ${timeframe} candles:`, e);
      }
    }
  }

  private isDataSourceEnabled(type: string): boolean {
    return this.strategyConfig.dataSources.some(ds => ds.type === type && ds.enabled);
  }

  // ============================================================================
  // CANDLE PROCESSING
  // ============================================================================

  private async onCandle(candle: OHLC, timeframe: string): Promise<void> {
    if (!this.running || this.paused) return;

    try {
      this.state.lastActivityAt = Date.now();

      // Update candle history
      const history = this.candleHistory.get(timeframe) || [];
      history.push(candle);
      if (history.length > 1000) {
        history.shift();
      }
      this.candleHistory.set(timeframe, history);

      // Only process on primary timeframe
      if (timeframe !== this.strategyConfig.primaryTimeframe) {
        return;
      }

      const candles = this.candleHistory.get(timeframe) || [];
      if (candles.length < 200) {
        return; // Not enough data
      }

      // Calculate all indicators
      const indicators = await this.calculateIndicators(candles);
      this.previousIndicators.set(timeframe, this.indicatorCache.get(timeframe) || {});
      this.indicatorCache.set(timeframe, indicators);
      this.state.currentIndicators = this.flattenIndicators(indicators);

      // Get market context
      const marketContext = await this.getMarketContext();

      // Evaluate all conditions
      const conditionResults = this.evaluateConditions(indicators, candles, marketContext);
      this.state.conditionResults = conditionResults.reduce((acc, r) => {
        acc[r.conditionId] = r.passed;
        return acc;
      }, {} as Record<string, boolean>);

      // Evaluate entry rules
      const entrySignal = this.evaluateEntryRules(conditionResults);

      // Evaluate exit rules for open positions
      if (this.state.currentPosition) {
        const exitSignal = this.evaluateExitRules(conditionResults, candles);
        if (exitSignal) {
          await this.handleExitSignal(exitSignal, candles);
          return;
        }
      }

      // Handle entry signal
      if (entrySignal && !this.state.currentPosition) {
        await this.handleEntrySignal(entrySignal, candles, indicators);
      }

      // Update risk state
      const account = await this.executionAdapter.getAccountInfo();
      const positions = await this.executionAdapter.getPositions();
      this.riskEngine.updateState(account, positions);

      // Check risk limits
      const shouldStop = this.riskEngine.shouldStopBot();
      if (shouldStop.stop) {
        console.log(`[UserBotRunner] Stopping bot due to risk: ${shouldStop.reason}`);
        await this.emergencyStop(shouldStop.reason || 'Risk limit exceeded');
      }

    } catch (error: any) {
      console.error(`[UserBotRunner] Error processing candle:`, error);
      this.state.recentErrors.push({
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack,
      });
      if (this.state.recentErrors.length > 10) {
        this.state.recentErrors.shift();
      }
    }
  }

  // ============================================================================
  // INDICATOR CALCULATION
  // ============================================================================

  private async calculateIndicators(candles: OHLC[]): Promise<IndicatorValues> {
    const indicators: IndicatorValues = {};
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    for (const config of this.strategyConfig.indicators) {
      if (!config.enabled) continue;

      try {
        const value = this.calculateSingleIndicator(config, closes, highs, lows, volumes, candles);
        indicators[config.id] = value;
      } catch (e) {
        console.warn(`[UserBotRunner] Failed to calculate indicator ${config.id}:`, e);
      }
    }

    return indicators;
  }

  private calculateSingleIndicator(
    config: UserIndicatorConfig,
    closes: number[],
    highs: number[],
    lows: number[],
    volumes: number[],
    candles: OHLC[]
  ): number | number[] {
    const getParam = (name: string, defaultValue: number): number => {
      const param = config.params.find(p => p.name === name);
      return param ? Number(param.value) : defaultValue;
    };

    switch (config.type) {
      case 'ema':
        return this.calculateEMA(closes, getParam('period', 20));
      
      case 'sma':
        return this.calculateSMA(closes, getParam('period', 20));
      
      case 'rsi':
        return this.calculateRSI(closes, getParam('period', 14));
      
      case 'atr':
        return this.calculateATR(candles, getParam('period', 14));
      
      case 'macd': {
        const fast = getParam('fast', 12);
        const slow = getParam('slow', 26);
        const signal = getParam('signal', 9);
        return this.calculateMACD(closes, fast, slow, signal);
      }
      
      case 'bollinger': {
        const period = getParam('period', 20);
        const stdDev = getParam('stdDev', 2);
        return this.calculateBollinger(closes, period, stdDev);
      }
      
      case 'stochastic': {
        const kPeriod = getParam('kPeriod', 14);
        const dPeriod = getParam('dPeriod', 3);
        return this.calculateStochastic(highs, lows, closes, kPeriod, dPeriod);
      }
      
      case 'adx':
        return this.calculateADX(highs, lows, closes, getParam('period', 14));
      
      case 'zscore':
        return this.calculateZScore(closes, getParam('period', 20));
      
      case 'vwap':
        return this.calculateVWAP(candles);
      
      case 'obv':
        return this.calculateOBV(closes, volumes);
      
      case 'orderbook_imbalance':
        return this.getOrderbookImbalance();
      
      default:
        return 0;
    }
  }

  // Indicator implementations
  private calculateEMA(data: number[], period: number): number {
    if (data.length < period) return 0;
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = (data[i]! - ema) * multiplier + ema;
    }
    return ema;
  }

  private calculateSMA(data: number[], period: number): number {
    if (data.length < period) return 0;
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  private calculateRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i]! - closes[i - 1]!;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateATR(candles: OHLC[], period: number): number {
    if (candles.length < period + 1) return 0;
    
    let atrSum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const current = candles[i]!;
      const prev = candles[i - 1]!;
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - prev.close),
        Math.abs(current.low - prev.close)
      );
      atrSum += tr;
    }
    return atrSum / period;
  }

  private calculateMACD(closes: number[], fast: number, slow: number, signal: number): number {
    const fastEma = this.calculateEMA(closes, fast);
    const slowEma = this.calculateEMA(closes, slow);
    return fastEma - slowEma;
  }

  private calculateBollinger(closes: number[], period: number, stdDev: number): number {
    const sma = this.calculateSMA(closes, period);
    const slice = closes.slice(-period);
    const variance = slice.reduce((s, v) => s + Math.pow(v - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    const lastClose = closes[closes.length - 1]!;
    return (lastClose - sma) / (std * stdDev); // Returns position within bands (-1 to 1)
  }

  private calculateStochastic(highs: number[], lows: number[], closes: number[], kPeriod: number, dPeriod: number): number {
    if (closes.length < kPeriod) return 50;
    
    const highSlice = highs.slice(-kPeriod);
    const lowSlice = lows.slice(-kPeriod);
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    const lastClose = closes[closes.length - 1]!;
    
    if (highestHigh === lowestLow) return 50;
    return ((lastClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  }

  private calculateADX(highs: number[], lows: number[], closes: number[], period: number): number {
    // Simplified ADX calculation
    if (closes.length < period * 2) return 25;
    
    let plusDM = 0;
    let minusDM = 0;
    let tr = 0;
    
    for (let i = closes.length - period; i < closes.length; i++) {
      const upMove = highs[i]! - highs[i - 1]!;
      const downMove = lows[i - 1]! - lows[i]!;
      
      if (upMove > downMove && upMove > 0) plusDM += upMove;
      if (downMove > upMove && downMove > 0) minusDM += downMove;
      
      tr += Math.max(
        highs[i]! - lows[i]!,
        Math.abs(highs[i]! - closes[i - 1]!),
        Math.abs(lows[i]! - closes[i - 1]!)
      );
    }
    
    const plusDI = (plusDM / tr) * 100;
    const minusDI = (minusDM / tr) * 100;
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
    
    return dx;
  }

  private calculateZScore(closes: number[], period: number): number {
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    const lastClose = closes[closes.length - 1]!;
    return std > 0 ? (lastClose - mean) / std : 0;
  }

  private calculateVWAP(candles: OHLC[]): number {
    let sumPV = 0;
    let sumV = 0;
    for (const c of candles.slice(-100)) {
      const typicalPrice = (c.high + c.low + c.close) / 3;
      sumPV += typicalPrice * c.volume;
      sumV += c.volume;
    }
    return sumV > 0 ? sumPV / sumV : 0;
  }

  private calculateOBV(closes: number[], volumes: number[]): number {
    let obv = 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i]! > closes[i - 1]!) {
        obv += volumes[i]!;
      } else if (closes[i]! < closes[i - 1]!) {
        obv -= volumes[i]!;
      }
    }
    return obv;
  }

  private getOrderbookImbalance(): number {
    if (!this.realtimeDataService) return 0.5;
    const orderbook = this.realtimeDataService.getOrderBook(this.strategyConfig.symbol);
    return orderbook?.imbalance || 0.5;
  }

  private flattenIndicators(indicators: IndicatorValues): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(indicators)) {
      if (typeof value === 'number') {
        result[key] = value;
      } else if (Array.isArray(value) && value.length > 0) {
        result[key] = value[value.length - 1]!;
      }
    }
    return result;
  }

  // ============================================================================
  // CONDITION EVALUATION
  // ============================================================================

  private evaluateConditions(
    indicators: IndicatorValues,
    candles: OHLC[],
    marketContext: MarketContext | null
  ): ConditionResult[] {
    const results: ConditionResult[] = [];
    const lastCandle = candles[candles.length - 1]!;
    const prevIndicators = this.previousIndicators.get(this.strategyConfig.primaryTimeframe) || {};

    for (const condition of this.strategyConfig.conditions) {
      if (!condition.enabled) continue;

      try {
        const result = this.evaluateSingleCondition(
          condition,
          indicators,
          prevIndicators,
          lastCandle,
          candles,
          marketContext
        );
        results.push(result);
      } catch (e) {
        results.push({
          conditionId: condition.id,
          passed: false,
          reason: `Error: ${e}`,
        });
      }
    }

    return results;
  }

  private evaluateSingleCondition(
    condition: TradingCondition,
    indicators: IndicatorValues,
    prevIndicators: IndicatorValues,
    lastCandle: OHLC,
    candles: OHLC[],
    marketContext: MarketContext | null
  ): ConditionResult {
    // Get source value
    let sourceValue: number;
    let prevSourceValue: number | undefined;

    switch (condition.source.type) {
      case 'indicator':
        const indValue = indicators[condition.source.indicatorId!];
        sourceValue = typeof indValue === 'number' ? indValue : (indValue as number[])?.[0] || 0;
        const prevIndValue = prevIndicators[condition.source.indicatorId!];
        prevSourceValue = typeof prevIndValue === 'number' ? prevIndValue : (prevIndValue as number[])?.[0];
        break;
      case 'price':
        sourceValue = lastCandle[condition.source.field as keyof OHLC] as number || lastCandle.close;
        prevSourceValue = candles[candles.length - 2]?.[condition.source.field as keyof OHLC] as number;
        break;
      case 'volume':
        sourceValue = lastCandle.volume;
        prevSourceValue = candles[candles.length - 2]?.volume;
        break;
      case 'orderbook':
        sourceValue = marketContext?.orderBook?.imbalance || 0.5;
        break;
      case 'funding':
        sourceValue = marketContext?.funding?.fundingRate || 0;
        break;
      default:
        sourceValue = 0;
    }

    // Get compare value
    let compareValue: number;
    switch (condition.compareValue.type) {
      case 'number':
        compareValue = Number(condition.compareValue.value);
        break;
      case 'indicator':
        const cv = indicators[condition.compareValue.indicatorId!];
        compareValue = typeof cv === 'number' ? cv : (cv as number[])?.[0] || 0;
        break;
      case 'price':
        compareValue = lastCandle.close;
        break;
      case 'percentage':
        compareValue = sourceValue * (1 + Number(condition.compareValue.value) / 100);
        break;
      case 'atr_multiple':
        const atr = this.calculateATR(candles, 14);
        compareValue = atr * Number(condition.compareValue.value);
        break;
      default:
        compareValue = 0;
    }

    // Evaluate operator
    let passed = false;
    let reason = '';

    switch (condition.operator) {
      case 'greater_than':
        passed = sourceValue > compareValue;
        reason = `${sourceValue.toFixed(4)} > ${compareValue.toFixed(4)}`;
        break;
      case 'less_than':
        passed = sourceValue < compareValue;
        reason = `${sourceValue.toFixed(4)} < ${compareValue.toFixed(4)}`;
        break;
      case 'equals':
        passed = Math.abs(sourceValue - compareValue) < 0.0001;
        reason = `${sourceValue.toFixed(4)} == ${compareValue.toFixed(4)}`;
        break;
      case 'crosses_above':
        passed = prevSourceValue !== undefined && prevSourceValue <= compareValue && sourceValue > compareValue;
        reason = `Crossed above ${compareValue.toFixed(4)}`;
        break;
      case 'crosses_below':
        passed = prevSourceValue !== undefined && prevSourceValue >= compareValue && sourceValue < compareValue;
        reason = `Crossed below ${compareValue.toFixed(4)}`;
        break;
      case 'between':
        const compareValue2 = Number(condition.compareValue2?.value || 0);
        passed = sourceValue >= compareValue && sourceValue <= compareValue2;
        reason = `${sourceValue.toFixed(4)} between ${compareValue.toFixed(4)} and ${compareValue2.toFixed(4)}`;
        break;
      case 'increasing':
        const lookback = condition.lookbackPeriods || 3;
        const recentValues = candles.slice(-lookback).map(c => c.close);
        passed = recentValues.every((v, i) => i === 0 || v > recentValues[i - 1]!);
        reason = `Increasing over ${lookback} periods`;
        break;
      case 'decreasing':
        const lb = condition.lookbackPeriods || 3;
        const rv = candles.slice(-lb).map(c => c.close);
        passed = rv.every((v, i) => i === 0 || v < rv[i - 1]!);
        reason = `Decreasing over ${lb} periods`;
        break;
      default:
        passed = false;
        reason = 'Unknown operator';
    }

    return {
      conditionId: condition.id,
      passed,
      reason: passed ? reason : `Failed: ${reason}`,
    };
  }

  // ============================================================================
  // RULE EVALUATION
  // ============================================================================

  private evaluateEntryRules(conditionResults: ConditionResult[]): Signal | null {
    const passedConditions = new Set(
      conditionResults.filter(r => r.passed).map(r => r.conditionId)
    );

    for (const rule of this.strategyConfig.entryRules) {
      if (!rule.enabled) continue;

      const ruleMatches = this.evaluateConditionGroups(
        rule.conditionGroups,
        rule.groupLogic,
        passedConditions
      );

      if (ruleMatches) {
        const candles = this.candleHistory.get(this.strategyConfig.primaryTimeframe) || [];
        const lastCandle = candles[candles.length - 1];
        
        return {
          id: uuid(),
          botId: this.userBot.id,
          symbol: this.strategyConfig.symbol,
          timeframe: this.strategyConfig.primaryTimeframe as Timeframe,
          action: rule.side === 'long' ? 'long' : 'short',
          confidence: this.calculateConfidence(conditionResults, rule),
          price: lastCandle?.close || 0,
          indicators: this.state.currentIndicators,
          reasons: conditionResults.filter(r => r.passed).map(r => r.reason),
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  private evaluateExitRules(conditionResults: ConditionResult[], candles: OHLC[]): Signal | null {
    const passedConditions = new Set(
      conditionResults.filter(r => r.passed).map(r => r.conditionId)
    );

    for (const rule of this.strategyConfig.exitRules) {
      if (!rule.enabled) continue;

      // Check signal-based exits
      if (rule.type === 'signal_based' && rule.config.conditionGroups) {
        const matches = this.evaluateConditionGroups(
          rule.config.conditionGroups,
          'AND',
          passedConditions
        );

        if (matches) {
          const lastCandle = candles[candles.length - 1];
          const action = this.state.currentPosition?.side === 'long' ? 'close_long' : 'close_short';
          
          return {
            id: uuid(),
            botId: this.userBot.id,
            symbol: this.strategyConfig.symbol,
            timeframe: this.strategyConfig.primaryTimeframe as Timeframe,
            action,
            confidence: 100,
            price: lastCandle?.close || 0,
            indicators: this.state.currentIndicators,
            reasons: [`Exit rule: ${rule.name}`],
            timestamp: Date.now(),
          };
        }
      }

      // Check time-based exits
      if (rule.type === 'time_based' && rule.config.maxHoldingTimeMs) {
        const position = this.state.currentPosition;
        // Would need entry time tracking - simplified for now
      }
    }

    return null;
  }

  private evaluateConditionGroups(
    groups: ConditionGroup[],
    groupLogic: 'AND' | 'OR',
    passedConditions: Set<string>
  ): boolean {
    const groupResults = groups.map(group => {
      const conditionsPassed = group.conditions.filter(id => passedConditions.has(id)).length;
      
      if (group.logic === 'AND') {
        return conditionsPassed === group.conditions.length;
      } else {
        const minRequired = group.minConditionsMet || 1;
        return conditionsPassed >= minRequired;
      }
    });

    if (groupLogic === 'AND') {
      return groupResults.every(r => r);
    } else {
      return groupResults.some(r => r);
    }
  }

  private calculateConfidence(conditionResults: ConditionResult[], rule: EntryRule): number {
    const passedCount = conditionResults.filter(r => r.passed).length;
    const totalCount = conditionResults.length;
    
    if (totalCount === 0) return 50;
    
    // Base confidence from condition pass rate
    let confidence = (passedCount / totalCount) * 100;
    
    // Apply weights if defined
    const conditions = this.strategyConfig.conditions;
    let weightedScore = 0;
    let totalWeight = 0;
    
    for (const result of conditionResults) {
      const condition = conditions.find(c => c.id === result.conditionId);
      const weight = condition?.weight || 1;
      totalWeight += weight;
      if (result.passed) {
        weightedScore += weight;
      }
    }
    
    if (totalWeight > 0) {
      confidence = (weightedScore / totalWeight) * 100;
    }
    
    return Math.min(100, Math.max(0, confidence));
  }

  // ============================================================================
  // SIGNAL HANDLING
  // ============================================================================

  private async handleEntrySignal(signal: Signal, candles: OHLC[], indicators: IndicatorValues): Promise<void> {
    console.log(`[UserBotRunner] Entry signal: ${signal.action} (confidence: ${signal.confidence}%)`);
    this.emitEvent('signal_generated', { signal });

    // AI confirmation if enabled
    if (this.strategyConfig.ai?.enabled && this.strategyConfig.ai.mode !== 'analysis_only') {
      const aiApproved = await this.getAIConfirmation(signal, candles);
      if (!aiApproved) {
        console.log(`[UserBotRunner] AI rejected signal`);
        return;
      }
    }

    // Calculate ATR for risk
    const atr = this.calculateATR(candles, 14);
    const lastCandle = candles[candles.length - 1]!;

    // Check risk
    const riskCheck = this.riskEngine.checkTradeAllowed(signal, lastCandle.close, atr);
    if (!riskCheck.allowed) {
      console.log(`[UserBotRunner] Trade not allowed: ${riskCheck.reason}`);
      return;
    }

    // Execute trade
    const trade = await this.executionEngine.executeSignal({
      signal,
      quantity: riskCheck.adjustedQuantity!,
      stopLoss: riskCheck.stopLoss,
      takeProfit: riskCheck.takeProfit,
      leverage: this.strategyConfig.risk.limits.maxLeverage,
    });

    if (trade) {
      await this.saveTradeToDb(trade);
      this.state.sessionStats.trades++;
      this.emitEvent('trade_opened', { trade });
      console.log(`[UserBotRunner] Trade opened: ${trade.id}`);
    }
  }

  private async handleExitSignal(signal: Signal, candles: OHLC[]): Promise<void> {
    console.log(`[UserBotRunner] Exit signal: ${signal.action}`);

    const trade = await this.executionEngine.closeBySignal(signal);
    if (trade) {
      await this.handleClosedTrade(trade);
    }
  }

  private async handleClosedTrade(trade: Trade): Promise<void> {
    await this.updateTradeInDb(trade);
    this.riskEngine.recordTrade(trade);

    // Update stats
    this.state.sessionStats.trades++;
    if ((trade.pnl || 0) > 0) {
      this.state.sessionStats.wins++;
    } else {
      this.state.sessionStats.losses++;
    }
    this.state.sessionStats.pnl += trade.pnl || 0;
    this.state.sessionStats.winRate = this.state.sessionStats.trades > 0
      ? (this.state.sessionStats.wins / this.state.sessionStats.trades) * 100
      : 0;

    this.closedTradeCount++;
    this.state.currentPosition = undefined;

    this.emitEvent('trade_closed', { trade, stats: this.state.sessionStats });
    console.log(`[UserBotRunner] Trade closed: ${trade.id}, PnL: $${trade.pnl?.toFixed(2)}`);
  }

  // ============================================================================
  // AI INTEGRATION
  // ============================================================================

  private async getAIConfirmation(signal: Signal, candles: OHLC[]): Promise<boolean> {
    const aiConfig = this.strategyConfig.ai;
    if (!aiConfig?.enabled) return true;

    try {
      const grok = EnhancedGrokService.getInstance();
      if (!grok.isAvailable()) return true;

      // Check rate limits
      if (this.state.aiState) {
        const now = Date.now();
        if (now - this.state.aiState.lastCallAt < (aiConfig.minCooldownMs || 60000)) {
          return true; // Skip AI, allow trade
        }
        if (this.state.aiState.callsToday >= (aiConfig.maxCallsPerDay || 20)) {
          return true; // Skip AI, allow trade
        }
      }

      const lastCandle = candles[candles.length - 1]!;
      const analysis = await grok.analyzeMarket({
        symbol: this.strategyConfig.symbol,
        price: lastCandle.close,
        change24h: 0,
        indicators: this.state.currentIndicators,
        volume: lastCandle.volume,
        guardrails: {
          maxLeverage: this.strategyConfig.risk.limits.maxLeverage,
          maxPositionPct: this.strategyConfig.risk.positionSizing.maxPercentage,
          maxDrawdown: this.strategyConfig.risk.limits.maxDrawdownPercent,
        },
      });

      // Update AI state
      this.state.aiState = {
        lastCallAt: Date.now(),
        callsToday: (this.state.aiState?.callsToday || 0) + 1,
        lastAnalysis: analysis,
      };

      this.emitEvent('ai_analysis', { analysis });

      // Check if AI approves
      const minConfidence = aiConfig.minConfidenceToTrade || 60;
      if (analysis.confidence < minConfidence) {
        return false;
      }

      // Check if AI action matches signal
      const aiAction = analysis.action.toLowerCase();
      const signalAction = signal.action;
      
      if (aiConfig.mode === 'confirmation') {
        return (aiAction === 'long' && signalAction === 'long') ||
               (aiAction === 'short' && signalAction === 'short') ||
               aiAction === 'hold';
      }

      return true;
    } catch (e) {
      console.warn(`[UserBotRunner] AI confirmation failed:`, e);
      return true; // Allow trade on AI error
    }
  }

  // ============================================================================
  // MARKET CONTEXT
  // ============================================================================

  private async getMarketContext(): Promise<MarketContext | null> {
    if (!this.realtimeDataService) return null;

    try {
      return this.realtimeDataService.getMarketContext(this.strategyConfig.symbol);
    } catch (e) {
      return null;
    }
  }

  private updateCurrentPosition(position: any): void {
    if (position.size === 0) {
      this.state.currentPosition = undefined;
    } else {
      this.state.currentPosition = {
        side: position.side,
        size: Math.abs(position.size),
        entryPrice: position.entryPrice,
        unrealizedPnl: position.unrealizedPnl || 0,
        unrealizedPnlPercent: position.unrealizedPnl && position.entryPrice
          ? (position.unrealizedPnl / (position.entryPrice * Math.abs(position.size))) * 100
          : 0,
      };
    }
  }

  // ============================================================================
  // DATABASE OPERATIONS
  // ============================================================================

  private async updateBotStatus(status: string): Promise<void> {
    try {
      await prisma.userBot.update({
        where: { id: this.userBot.id },
        data: { status: status as any },
      });
    } catch (e) {
      console.warn(`[UserBotRunner] Failed to update bot status:`, e);
    }
  }

  private async saveTradeToDb(trade: Trade): Promise<void> {
    try {
      await prisma.userBotTrade.create({
        data: {
          id: trade.id,
          userBotId: this.userBot.id,
          symbol: trade.symbol,
          side: trade.side.toUpperCase() as any,
          entryPrice: trade.entryPrice,
          quantity: trade.quantity,
          entryTime: new Date(trade.entryTime),
          fees: trade.fees,
          status: 'OPEN',
          stopLoss: trade.stopLoss,
          takeProfit: trade.takeProfit,
        },
      });
    } catch (e) {
      console.warn(`[UserBotRunner] Failed to save trade:`, e);
    }
  }

  private async updateTradeInDb(trade: Trade): Promise<void> {
    try {
      await prisma.userBotTrade.update({
        where: { id: trade.id },
        data: {
          exitPrice: trade.exitPrice,
          exitTime: trade.exitTime ? new Date(trade.exitTime) : undefined,
          pnl: trade.pnl,
          pnlPercent: trade.pnlPercent,
          status: 'CLOSED',
        },
      });

      // Update bot stats
      await prisma.userBot.update({
        where: { id: this.userBot.id },
        data: {
          totalTrades: { increment: 1 },
          winningTrades: trade.pnl && trade.pnl > 0 ? { increment: 1 } : undefined,
          totalPnl: { increment: trade.pnl || 0 },
        },
      });
    } catch (e) {
      console.warn(`[UserBotRunner] Failed to update trade:`, e);
    }
  }

  private async emergencyStop(reason: string): Promise<void> {
    console.log(`[UserBotRunner] Emergency stop: ${reason}`);
    
    // Cancel all orders
    await this.executionEngine.cancelAllOrders();
    
    // Update status
    await prisma.userBot.update({
      where: { id: this.userBot.id },
      data: { 
        status: 'STOPPED',
        lastError: reason,
      },
    });

    this.emitEvent('error', { reason, severity: 'critical' });
    await this.stop();
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  private emitEvent(type: string, data: any): void {
    const event: UserBotEvent = {
      id: uuid(),
      botId: this.userBot.id,
      type: type as any,
      timestamp: Date.now(),
      data,
    };
    this.emit(type, event);
    this.emit('event', event);
  }
}

export default UserBotRunner;
