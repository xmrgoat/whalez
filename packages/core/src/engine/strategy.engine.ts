import type { 
  OHLC, 
  Signal, 
  SignalAction, 
  BotConfig, 
  Timeframe,
  IndicatorConfig 
} from '../types/index.js';
import { calculateIndicators, getLatestIndicators } from './indicators.js';
import { v4 as uuid } from 'uuid';

/**
 * Strategy Engine
 * Processes market data through indicators and rules to generate trading signals.
 */

export interface StrategyContext {
  symbol: string;
  timeframe: Timeframe;
  candles: OHLC[];
  indicators: Record<string, number>;
  currentPrice: number;
  timestamp: number;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  reason: string;
}

export class StrategyEngine {
  private config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
  }

  /**
   * Update bot configuration
   */
  updateConfig(config: BotConfig): void {
    this.config = config;
  }

  /**
   * Process candles and generate signal
   */
  processCandles(candles: OHLC[], timeframe: Timeframe): Signal | null {
    if (candles.length < 200) {
      return null; // Need enough data for indicators
    }

    const context = this.buildContext(candles, timeframe);
    const action = this.evaluateRules(context);

    if (action === 'hold') {
      return null;
    }

    const reasons = this.getSignalReasons(context, action);

    return {
      id: uuid(),
      botId: this.config.id,
      symbol: this.config.symbol,
      timeframe,
      action,
      confidence: this.calculateConfidence(context, action),
      price: context.currentPrice,
      indicators: context.indicators,
      reasons,
      timestamp: Date.now(),
    };
  }

  /**
   * Build strategy context with indicators
   */
  private buildContext(candles: OHLC[], timeframe: Timeframe): StrategyContext {
    const indicatorConfig = this.buildIndicatorConfig();
    const indicators = getLatestIndicators(candles, indicatorConfig);
    const lastCandle = candles[candles.length - 1]!;

    return {
      symbol: this.config.symbol,
      timeframe,
      candles,
      indicators,
      currentPrice: lastCandle.close,
      timestamp: lastCandle.timestamp,
    };
  }

  /**
   * Build indicator configuration from bot config
   */
  private buildIndicatorConfig(): { ema?: number[]; rsi?: number; atr?: number } {
    const config: { ema?: number[]; rsi?: number; atr?: number } = {};

    for (const indicator of this.config.indicators) {
      if (!indicator.enabled) continue;

      switch (indicator.name.toLowerCase()) {
        case 'ema':
          config.ema = config.ema || [];
          if (indicator.params['period']) {
            config.ema.push(indicator.params['period']);
          }
          // Default EMA periods for swing trading
          if (config.ema.length === 0) {
            config.ema = [20, 50, 200];
          }
          break;
        case 'rsi':
          config.rsi = indicator.params['period'] || 14;
          break;
        case 'atr':
          config.atr = indicator.params['period'] || 14;
          break;
      }
    }

    // Ensure defaults
    if (!config.ema || config.ema.length === 0) {
      config.ema = [20, 50, 200];
    }
    if (!config.rsi) {
      config.rsi = 14;
    }
    if (!config.atr) {
      config.atr = 14;
    }

    return config;
  }

  /**
   * Evaluate all rules and determine action
   */
  private evaluateRules(context: StrategyContext): SignalAction {
    const { indicators, currentPrice, candles } = context;

    // Get indicator values
    const ema20 = indicators['ema20'] ?? 0;
    const ema50 = indicators['ema50'] ?? 0;
    const ema200 = indicators['ema200'] ?? 0;
    const rsi = indicators['rsi'] ?? 50;
    const atr = indicators['atr'] ?? 0;

    // Previous candle indicators for crossover detection
    const prevCandles = candles.slice(0, -1);
    const prevIndicators = getLatestIndicators(prevCandles, this.buildIndicatorConfig());
    const prevEma20 = prevIndicators['ema20'] ?? 0;
    const prevEma50 = prevIndicators['ema50'] ?? 0;

    // Default swing strategy rules
    const rules = this.config.rules.filter(r => r.enabled);

    // Trend filter: price above EMA200
    const trendBullish = currentPrice > ema200;
    const trendBearish = currentPrice < ema200;

    // EMA crossover detection
    const ema20CrossAbove50 = prevEma20 <= prevEma50 && ema20 > ema50;
    const ema20CrossBelow50 = prevEma20 >= prevEma50 && ema20 < ema50;

    // RSI conditions
    const rsiOversold = rsi < 30;
    const rsiOverbought = rsi > 70;
    const rsiBullish = rsi > 50;
    const rsiBearish = rsi < 50;

    // Entry conditions
    const longEntry = trendBullish && ema20CrossAbove50 && rsiBullish;
    const shortEntry = trendBearish && ema20CrossBelow50 && rsiBearish;

    // Exit conditions (EMA cross back)
    const longExit = ema20CrossBelow50 || rsiOverbought;
    const shortExit = ema20CrossAbove50 || rsiOversold;

    // Determine action
    if (longEntry) {
      return 'long';
    }
    if (shortEntry) {
      return 'short';
    }
    if (longExit) {
      return 'close_long';
    }
    if (shortExit) {
      return 'close_short';
    }

    return 'hold';
  }

  /**
   * Calculate signal confidence (0-100)
   */
  private calculateConfidence(context: StrategyContext, action: SignalAction): number {
    const { indicators, currentPrice } = context;
    let confidence = 50;

    const ema20 = indicators['ema20'] ?? 0;
    const ema50 = indicators['ema50'] ?? 0;
    const ema200 = indicators['ema200'] ?? 0;
    const rsi = indicators['rsi'] ?? 50;

    if (action === 'long' || action === 'short') {
      // Trend alignment bonus
      if (action === 'long' && currentPrice > ema200) {
        confidence += 15;
      }
      if (action === 'short' && currentPrice < ema200) {
        confidence += 15;
      }

      // EMA alignment bonus
      if (action === 'long' && ema20 > ema50 && ema50 > ema200) {
        confidence += 15;
      }
      if (action === 'short' && ema20 < ema50 && ema50 < ema200) {
        confidence += 15;
      }

      // RSI confirmation
      if (action === 'long' && rsi > 50 && rsi < 70) {
        confidence += 10;
      }
      if (action === 'short' && rsi < 50 && rsi > 30) {
        confidence += 10;
      }

      // RSI extreme penalty
      if (action === 'long' && rsi > 70) {
        confidence -= 10;
      }
      if (action === 'short' && rsi < 30) {
        confidence -= 10;
      }
    }

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Get reasons for signal
   */
  private getSignalReasons(context: StrategyContext, action: SignalAction): string[] {
    const reasons: string[] = [];
    const { indicators, currentPrice } = context;

    const ema20 = indicators['ema20'] ?? 0;
    const ema50 = indicators['ema50'] ?? 0;
    const ema200 = indicators['ema200'] ?? 0;
    const rsi = indicators['rsi'] ?? 50;

    if (action === 'long') {
      if (currentPrice > ema200) {
        reasons.push(`Price above EMA200 (${ema200.toFixed(2)})`);
      }
      reasons.push(`EMA20 crossed above EMA50`);
      reasons.push(`RSI at ${rsi.toFixed(1)} (bullish)`);
    }

    if (action === 'short') {
      if (currentPrice < ema200) {
        reasons.push(`Price below EMA200 (${ema200.toFixed(2)})`);
      }
      reasons.push(`EMA20 crossed below EMA50`);
      reasons.push(`RSI at ${rsi.toFixed(1)} (bearish)`);
    }

    if (action === 'close_long') {
      reasons.push(`EMA20 crossed below EMA50 or RSI overbought`);
    }

    if (action === 'close_short') {
      reasons.push(`EMA20 crossed above EMA50 or RSI oversold`);
    }

    return reasons;
  }
}
