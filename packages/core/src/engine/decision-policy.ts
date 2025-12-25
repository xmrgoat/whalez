import type { OHLC, Signal, BotConfig } from '../types/index.js';

/**
 * Decision Policy Engine
 * Requires minimum confirmations before executing trades.
 * Each confirmation is a separate check that must pass.
 */

export interface Confirmation {
  name: string;
  passed: boolean;
  reason: string;
  weight: number; // 0-1, higher = more important
}

export interface DecisionResult {
  action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE';
  confirmations: Confirmation[];
  passedCount: number;
  requiredCount: number;
  confidence: number; // 0-100
  reason: string;
  canExecute: boolean;
}

export interface DecisionPolicyConfig {
  minConfirmations: number;
  minConfidence: number;
  confirmations: {
    emaTrend: boolean;
    ichimoku: boolean;
    rsiRegime: boolean;
    atrVolatility: boolean;
    newsGate: boolean;
  };
}

const DEFAULT_CONFIG: DecisionPolicyConfig = {
  minConfirmations: parseInt(process.env['MIN_CONFIRMATIONS'] || '3'),
  minConfidence: 60,
  confirmations: {
    emaTrend: true,
    ichimoku: true,
    rsiRegime: true,
    atrVolatility: true,
    newsGate: false, // Requires external API
  },
};

export class DecisionPolicy {
  private config: DecisionPolicyConfig;

  constructor(config: Partial<DecisionPolicyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate a signal and determine if it should be executed
   */
  evaluate(
    signal: Signal | null,
    candles: OHLC[],
    botConfig: BotConfig,
    newsGateResult?: { passed: boolean; reason: string }
  ): DecisionResult {
    const confirmations: Confirmation[] = [];

    // If no signal, return HOLD
    if (!signal || signal.action === 'hold') {
      return {
        action: 'HOLD',
        confirmations: [],
        passedCount: 0,
        requiredCount: this.config.minConfirmations,
        confidence: 0,
        reason: 'No signal generated',
        canExecute: false,
      };
    }

    // Determine base action from signal
    const baseAction = this.signalToAction(signal);

    // Run confirmations
    if (this.config.confirmations.emaTrend) {
      confirmations.push(this.checkEmaTrend(candles, signal));
    }

    if (this.config.confirmations.ichimoku) {
      confirmations.push(this.checkIchimoku(candles, signal));
    }

    if (this.config.confirmations.rsiRegime) {
      confirmations.push(this.checkRsiRegime(candles, signal, botConfig));
    }

    if (this.config.confirmations.atrVolatility) {
      confirmations.push(this.checkAtrVolatility(candles, botConfig));
    }

    if (this.config.confirmations.newsGate && newsGateResult) {
      confirmations.push({
        name: 'News Gate',
        passed: newsGateResult.passed,
        reason: newsGateResult.reason,
        weight: 0.8,
      });
    }

    // Calculate results
    const passedCount = confirmations.filter(c => c.passed).length;
    const totalWeight = confirmations.reduce((sum, c) => sum + c.weight, 0);
    const passedWeight = confirmations
      .filter(c => c.passed)
      .reduce((sum, c) => sum + c.weight, 0);

    const confidence = totalWeight > 0 
      ? Math.round((passedWeight / totalWeight) * 100)
      : 0;

    const canExecute = passedCount >= this.config.minConfirmations && 
                       confidence >= this.config.minConfidence;

    const action = canExecute ? baseAction : 'HOLD';

    const reason = canExecute
      ? `${passedCount}/${confirmations.length} confirmations passed (${confidence}% confidence)`
      : `Insufficient confirmations: ${passedCount}/${this.config.minConfirmations} required`;

    return {
      action,
      confirmations,
      passedCount,
      requiredCount: this.config.minConfirmations,
      confidence,
      reason,
      canExecute,
    };
  }

  private signalToAction(signal: Signal): 'LONG' | 'SHORT' | 'CLOSE' | 'HOLD' {
    switch (signal.action) {
      case 'long': return 'LONG';
      case 'short': return 'SHORT';
      case 'close_long':
      case 'close_short': return 'CLOSE';
      default: return 'HOLD';
    }
  }

  // ============ Confirmation Checks ============

  private checkEmaTrend(candles: OHLC[], signal: Signal): Confirmation {
    if (candles.length < 200) {
      return {
        name: 'EMA Trend',
        passed: false,
        reason: 'Insufficient data for EMA calculation',
        weight: 1.0,
      };
    }

    // Calculate EMAs
    const ema20 = this.calculateEMA(candles, 20);
    const ema50 = this.calculateEMA(candles, 50);
    const ema200 = this.calculateEMA(candles, 200);

    const currentPrice = candles[candles.length - 1]!.close;

    // Check trend alignment
    const bullishTrend = ema20 > ema50 && ema50 > ema200 && currentPrice > ema20;
    const bearishTrend = ema20 < ema50 && ema50 < ema200 && currentPrice < ema20;

    const isLong = signal.action === 'long';
    const isShort = signal.action === 'short';

    const passed = (isLong && bullishTrend) || (isShort && bearishTrend);

    return {
      name: 'EMA Trend',
      passed,
      reason: passed
        ? `Trend aligned: EMA20=${ema20.toFixed(2)}, EMA50=${ema50.toFixed(2)}, EMA200=${ema200.toFixed(2)}`
        : `Trend not aligned for ${signal.action}`,
      weight: 1.0,
    };
  }

  private checkIchimoku(candles: OHLC[], signal: Signal): Confirmation {
    if (candles.length < 52) {
      return {
        name: 'Ichimoku',
        passed: false,
        reason: 'Insufficient data for Ichimoku calculation',
        weight: 0.9,
      };
    }

    // Calculate Ichimoku components
    const tenkan = this.calculateIchimokuLine(candles, 9);
    const kijun = this.calculateIchimokuLine(candles, 26);
    const currentPrice = candles[candles.length - 1]!.close;

    // Simplified Ichimoku check
    const bullish = currentPrice > tenkan && tenkan > kijun;
    const bearish = currentPrice < tenkan && tenkan < kijun;

    const isLong = signal.action === 'long';
    const isShort = signal.action === 'short';

    const passed = (isLong && bullish) || (isShort && bearish);

    return {
      name: 'Ichimoku',
      passed,
      reason: passed
        ? `Ichimoku ${bullish ? 'bullish' : 'bearish'}: Tenkan=${tenkan.toFixed(2)}, Kijun=${kijun.toFixed(2)}`
        : `Ichimoku not confirming ${signal.action}`,
      weight: 0.9,
    };
  }

  private checkRsiRegime(candles: OHLC[], signal: Signal, config: BotConfig): Confirmation {
    if (candles.length < 14) {
      return {
        name: 'RSI Regime',
        passed: false,
        reason: 'Insufficient data for RSI calculation',
        weight: 0.8,
      };
    }

    const rsi = this.calculateRSI(candles, 14);
    
    // Get thresholds from config or use defaults
    const overbought = 70;
    const oversold = 30;

    const isLong = signal.action === 'long';
    const isShort = signal.action === 'short';

    // For longs: RSI should not be overbought
    // For shorts: RSI should not be oversold
    const passed = (isLong && rsi < overbought) || (isShort && rsi > oversold);

    return {
      name: 'RSI Regime',
      passed,
      reason: passed
        ? `RSI=${rsi.toFixed(1)} is in valid range for ${signal.action}`
        : `RSI=${rsi.toFixed(1)} is ${rsi >= overbought ? 'overbought' : 'oversold'}`,
      weight: 0.8,
    };
  }

  private checkAtrVolatility(candles: OHLC[], config: BotConfig): Confirmation {
    if (candles.length < 14) {
      return {
        name: 'ATR Volatility',
        passed: false,
        reason: 'Insufficient data for ATR calculation',
        weight: 0.7,
      };
    }

    const atr = this.calculateATR(candles, 14);
    const currentPrice = candles[candles.length - 1]!.close;
    const atrPercent = (atr / currentPrice) * 100;

    // Check if volatility is within acceptable range (0.5% - 5%)
    const minVolatility = 0.5;
    const maxVolatility = 5.0;

    const passed = atrPercent >= minVolatility && atrPercent <= maxVolatility;

    return {
      name: 'ATR Volatility',
      passed,
      reason: passed
        ? `Volatility ${atrPercent.toFixed(2)}% is within range`
        : `Volatility ${atrPercent.toFixed(2)}% is ${atrPercent < minVolatility ? 'too low' : 'too high'}`,
      weight: 0.7,
    };
  }

  // ============ Indicator Calculations ============

  private calculateEMA(candles: OHLC[], period: number): number {
    if (candles.length < period) return 0;

    const multiplier = 2 / (period + 1);
    let ema = candles[0]!.close;

    for (let i = 1; i < candles.length; i++) {
      ema = (candles[i]!.close - ema) * multiplier + ema;
    }

    return ema;
  }

  private calculateIchimokuLine(candles: OHLC[], period: number): number {
    const slice = candles.slice(-period);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    return (high + low) / 2;
  }

  private calculateRSI(candles: OHLC[], period: number): number {
    if (candles.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
      const change = candles[i]!.close - candles[i - 1]!.close;
      if (change > 0) gains += change;
      else losses -= change;
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

  // ============ Config Management ============

  updateConfig(config: Partial<DecisionPolicyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): DecisionPolicyConfig {
    return { ...this.config };
  }
}
