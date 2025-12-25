import type { OHLC } from '../types/index.js';
import Decimal from 'decimal.js';

/**
 * Technical Indicators Library
 */

export interface IndicatorResult {
  value: number;
  timestamp: number;
}

/**
 * Simple Moving Average
 */
export function SMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j]!;
    }
    result.push(sum / period);
  }
  return result;
}

/**
 * Exponential Moving Average
 */
export function EMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    if (i === period - 1) {
      // First EMA is SMA
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j]!;
      }
      result.push(sum / period);
      continue;
    }
    const prevEma = result[i - 1]!;
    const currentValue = data[i]!;
    result.push((currentValue - prevEma) * multiplier + prevEma);
  }
  return result;
}

/**
 * Relative Strength Index
 */
export function RSI(closes: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
      result.push(NaN);
      continue;
    }

    const change = closes[i]! - closes[i - 1]!;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);

    if (i < period) {
      result.push(NaN);
      continue;
    }

    let avgGain: number;
    let avgLoss: number;

    if (i === period) {
      // First RSI uses simple average
      avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
    } else {
      // Subsequent RSI uses smoothed average
      const prevAvgGain = result[i - 1] !== undefined ? 
        (100 - result[i - 1]!) > 0 ? 
          gains[i - 1]! / (100 / result[i - 1]! - 1) : 0 
        : 0;
      const prevAvgLoss = result[i - 1] !== undefined ?
        result[i - 1]! > 0 ?
          losses[i - 1]! * (100 / result[i - 1]! - 1) / 100 : 0
        : 0;
      
      avgGain = (prevAvgGain * (period - 1) + gains[i]!) / period;
      avgLoss = (prevAvgLoss * (period - 1) + losses[i]!) / period;
    }

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  return result;
}

/**
 * Simplified RSI calculation
 */
export function RSISimple(closes: number[], period: number = 14): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(NaN);
      continue;
    }

    let gains = 0;
    let losses = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j]! - closes[j - 1]!;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  return result;
}

/**
 * Average True Range
 */
export function ATR(candles: OHLC[], period: number = 14): number[] {
  const result: number[] = [];
  const trueRanges: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!;
    let tr: number;

    if (i === 0) {
      tr = candle.high - candle.low;
    } else {
      const prevClose = candles[i - 1]!.close;
      tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevClose),
        Math.abs(candle.low - prevClose)
      );
    }

    trueRanges.push(tr);

    if (i < period - 1) {
      result.push(NaN);
      continue;
    }

    if (i === period - 1) {
      // First ATR is simple average
      const sum = trueRanges.reduce((a, b) => a + b, 0);
      result.push(sum / period);
      continue;
    }

    // Smoothed ATR
    const prevAtr = result[i - 1]!;
    result.push((prevAtr * (period - 1) + tr) / period);
  }

  return result;
}

/**
 * Bollinger Bands
 */
export function BollingerBands(
  closes: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = SMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }

    // Calculate standard deviation
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i]!;
    const squaredDiffs = slice.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(variance);

    upper.push(mean + stdDev * std);
    lower.push(mean - stdDev * std);
  }

  return { upper, middle, lower };
}

/**
 * MACD (Moving Average Convergence Divergence)
 */
export function MACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEma = EMA(closes, fastPeriod);
  const slowEma = EMA(closes, slowPeriod);
  
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(fastEma[i]!) || isNaN(slowEma[i]!)) {
      macdLine.push(NaN);
    } else {
      macdLine.push(fastEma[i]! - slowEma[i]!);
    }
  }

  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalLine = EMA(validMacd, signalPeriod);
  
  // Align signal line with macd line
  const signal: number[] = [];
  let signalIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i]!)) {
      signal.push(NaN);
    } else {
      signal.push(signalLine[signalIdx] ?? NaN);
      signalIdx++;
    }
  }

  const histogram: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i]!) || isNaN(signal[i]!)) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i]! - signal[i]!);
    }
  }

  return { macd: macdLine, signal, histogram };
}

/**
 * Calculate all indicators for a set of candles
 */
export function calculateIndicators(
  candles: OHLC[],
  config: {
    ema?: number[];
    rsi?: number;
    atr?: number;
    macd?: { fast: number; slow: number; signal: number };
    bollinger?: { period: number; stdDev: number };
  }
): Record<string, number[]> {
  const closes = candles.map(c => c.close);
  const result: Record<string, number[]> = {};

  if (config.ema) {
    for (const period of config.ema) {
      result[`ema${period}`] = EMA(closes, period);
    }
  }

  if (config.rsi) {
    result['rsi'] = RSISimple(closes, config.rsi);
  }

  if (config.atr) {
    result['atr'] = ATR(candles, config.atr);
  }

  if (config.macd) {
    const macd = MACD(closes, config.macd.fast, config.macd.slow, config.macd.signal);
    result['macd'] = macd.macd;
    result['macdSignal'] = macd.signal;
    result['macdHistogram'] = macd.histogram;
  }

  if (config.bollinger) {
    const bb = BollingerBands(closes, config.bollinger.period, config.bollinger.stdDev);
    result['bbUpper'] = bb.upper;
    result['bbMiddle'] = bb.middle;
    result['bbLower'] = bb.lower;
  }

  return result;
}

/**
 * Get latest indicator values
 */
export function getLatestIndicators(
  candles: OHLC[],
  config: {
    ema?: number[];
    rsi?: number;
    atr?: number;
  }
): Record<string, number> {
  const indicators = calculateIndicators(candles, config);
  const result: Record<string, number> = {};

  for (const [key, values] of Object.entries(indicators)) {
    const lastValue = values[values.length - 1];
    if (lastValue !== undefined && !isNaN(lastValue)) {
      result[key] = lastValue;
    }
  }

  return result;
}
