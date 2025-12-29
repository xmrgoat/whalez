/**
 * BACKTESTING ENGINE v2
 * Uses the EXACT same logic as the live trading bot
 * Real Hyperliquid data + Same indicators + Same entry/exit rules
 */

const HL_API = 'https://api.hyperliquid.xyz/info';

// ============================================================================
// BOT STRATEGY - EXACT SAME LOGIC AS LIVE BOT (strategy.engine.ts)
// ============================================================================
// Entry Long: Trend bullish (price > EMA200) + EMA20 crosses above EMA50 + RSI > 50
// Entry Short: Trend bearish (price < EMA200) + EMA20 crosses below EMA50 + RSI < 50
// Exit Long: EMA20 crosses below EMA50 OR RSI > 70
// Exit Short: EMA20 crosses above EMA50 OR RSI < 30

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

export interface BacktestConfig {
  symbol: string;
  startTime: number;
  endTime: number;
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  initialCapital: number;
  positionSizePct: number;
  maxLeverage: number;
  stopLossPct: number;
  takeProfitPct: number;
  tradingFee: number;
  slippage: number;
  strategy: string;
  strategyParams: Record<string, number>;
  enableTrailingStop: boolean;
  trailingStopPct: number;
  // Grok AI simulation options
  enableGrokSimulation?: boolean;
  grokFilterStrength?: number; // 0-100, how much Grok filters bad trades
  grokBoostStrength?: number;  // 0-100, how much Grok boosts good trades
}

export interface BacktestTrade {
  id: number;
  entryTime: number;
  exitTime: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  fees: number;
  netPnl: number;
  exitReason: 'tp' | 'sl' | 'trailing' | 'signal' | 'end';
  holdingBars: number;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  drawdown: number;
  drawdownPct: number;
}

export interface BacktestMetrics {
  totalReturn: number;
  totalReturnPct: number;
  annualizedReturn: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  // Advanced Quant Metrics
  kellyFraction: number;
  optimalPositionSize: number;
  valueAtRisk95: number;
  omegaRatio: number;
  skewness: number;
  kurtosis: number;
  avgHoldingPeriod: number;
  riskRewardRatio: number;
  buyAndHoldReturn: number;
  alphaVsBuyHold: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  candles: Candle[];
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  returnDistribution: { bucket: string; count: number }[];
  monthlyReturns: { month: string; returnPct: number }[];
  hourlyPerformance: { hour: number; winRate: number; trades: number }[];
}

// ============================================================================
// DATA FETCHING
// ============================================================================

export async function fetchHistoricalCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<Candle[]> {
  const allCandles: Candle[] = [];
  let currentStart = startTime;
  const intervalMs: Record<string, number> = {
    '1m': 60000, '5m': 300000, '15m': 900000,
    '1h': 3600000, '4h': 14400000, '1d': 86400000,
  };
  const maxTimeRange = 5000 * (intervalMs[interval] || 60000);
  
  while (currentStart < endTime) {
    const currentEnd = Math.min(currentStart + maxTimeRange, endTime);
    try {
      const response = await fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: { coin: coin.replace('-PERP', ''), interval, startTime: currentStart, endTime: currentEnd },
        }),
      });
      const data = await response.json() as any[];
      if (data && Array.isArray(data)) {
        for (const c of data) {
          allCandles.push({
            timestamp: c.t, open: parseFloat(c.o), high: parseFloat(c.h),
            low: parseFloat(c.l), close: parseFloat(c.c), volume: parseFloat(c.v), trades: c.n || 0,
          });
        }
      }
      currentStart = currentEnd;
      await new Promise(r => setTimeout(r, 100));
    } catch (e) { console.error('[Backtest] Fetch error:', e); break; }
  }
  return allCandles.sort((a, b) => a.timestamp - b.timestamp);
}

// ============================================================================
// INDICATORS
// ============================================================================

function ema(prices: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) result.push(prices[i] || 0);
    else result.push((prices[i] || 0) * k + (result[i - 1] || 0) * (1 - k));
  }
  return result;
}

function sma(prices: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) result.push(NaN);
    else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function rsi(prices: number[], period: number = 14): number[] {
  const result: number[] = [50];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < prices.length; i++) {
    const change = (prices[i] || 0) - (prices[i - 1] || 0);
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (i <= period) {
      avgGain = (avgGain * (i - 1) + gain) / i;
      avgLoss = (avgLoss * (i - 1) + loss) / i;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
  }
  return result;
}

function macd(prices: number[]): { macd: number[]; signal: number[]; histogram: number[] } {
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const macdLine = ema12.map((v, i) => v - (ema26[i] || 0));
  const signalLine = ema(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - (signalLine[i] || 0));
  return { macd: macdLine, signal: signalLine, histogram };
}

function bollingerBands(prices: number[], period: number = 20, stdDev: number = 2) {
  const middle = sma(prices, period);
  const upper: number[] = [], lower: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { upper.push(NaN); lower.push(NaN); }
    else {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = middle[i] || 0;
      const variance = slice.reduce((s, p) => s + Math.pow((p || 0) - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
  }
  return { upper, middle, lower };
}

function atr(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = i === 0 ? (c?.high || 0) - (c?.low || 0)
      : Math.max((c?.high || 0) - (c?.low || 0), Math.abs((c?.high || 0) - (prev?.close || 0)), Math.abs((c?.low || 0) - (prev?.close || 0)));
    if (i < period) { sum += tr; result.push(sum / (i + 1)); }
    else result.push(((result[i - 1] || 0) * (period - 1) + tr) / period);
  }
  return result;
}

// ============================================================================
// STRATEGIES
// ============================================================================

type Signal = { signal: 'long' | 'short' | 'none'; strength: number };

const strategies: Record<string, (candles: Candle[], i: number, params: Record<string, number>) => Signal> = {
  
  ema_crossover: (candles, i, params) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    const fast = params.fast || 9, slow = params.slow || 21;
    if (closes.length < slow + 1) return { signal: 'none', strength: 0 };
    const fastEma = ema(closes, fast), slowEma = ema(closes, slow);
    if ((fastEma[i - 1] || 0) <= (slowEma[i - 1] || 0) && (fastEma[i] || 0) > (slowEma[i] || 0))
      return { signal: 'long', strength: 70 };
    if ((fastEma[i - 1] || 0) >= (slowEma[i - 1] || 0) && (fastEma[i] || 0) < (slowEma[i] || 0))
      return { signal: 'short', strength: 70 };
    return { signal: 'none', strength: 0 };
  },

  triple_ema: (candles, i, params) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    const f = params.fast || 8, m = params.medium || 21, s = params.slow || 55;
    if (closes.length < s + 1) return { signal: 'none', strength: 0 };
    const ef = ema(closes, f), em = ema(closes, m), es = ema(closes, s);
    if ((ef[i] || 0) > (em[i] || 0) && (em[i] || 0) > (es[i] || 0) && (ef[i - 1] || 0) <= (em[i - 1] || 0))
      return { signal: 'long', strength: 80 };
    if ((ef[i] || 0) < (em[i] || 0) && (em[i] || 0) < (es[i] || 0) && (ef[i - 1] || 0) >= (em[i - 1] || 0))
      return { signal: 'short', strength: 80 };
    return { signal: 'none', strength: 0 };
  },

  rsi_reversal: (candles, i, params) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    const period = params.period || 14;
    if (closes.length < period + 1) return { signal: 'none', strength: 0 };
    const r = rsi(closes, period);
    const curr = r[i] || 50, prev = r[i - 1] || 50;
    if (prev < 30 && curr > 30) return { signal: 'long', strength: 65 };
    if (prev > 70 && curr < 70) return { signal: 'short', strength: 65 };
    return { signal: 'none', strength: 0 };
  },

  rsi_trend: (candles, i, params) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    const period = params.period || 14;
    if (closes.length < period + 1) return { signal: 'none', strength: 0 };
    const r = rsi(closes, period);
    const curr = r[i] || 50;
    if (curr > 50 && curr < 70 && (r[i - 1] || 50) < 50) return { signal: 'long', strength: 60 };
    if (curr < 50 && curr > 30 && (r[i - 1] || 50) > 50) return { signal: 'short', strength: 60 };
    return { signal: 'none', strength: 0 };
  },

  macd_cross: (candles, i) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    if (closes.length < 35) return { signal: 'none', strength: 0 };
    const { histogram } = macd(closes);
    const curr = histogram[i] || 0, prev = histogram[i - 1] || 0;
    if (prev < 0 && curr > 0) return { signal: 'long', strength: 65 };
    if (prev > 0 && curr < 0) return { signal: 'short', strength: 65 };
    return { signal: 'none', strength: 0 };
  },

  macd_divergence: (candles, i) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    if (closes.length < 50) return { signal: 'none', strength: 0 };
    const { histogram } = macd(closes);
    const priceUp = (closes[i] || 0) > (closes[i - 10] || 0);
    const macdUp = (histogram[i] || 0) > (histogram[i - 10] || 0);
    if (!priceUp && macdUp && (histogram[i] || 0) > (histogram[i - 1] || 0)) return { signal: 'long', strength: 75 };
    if (priceUp && !macdUp && (histogram[i] || 0) < (histogram[i - 1] || 0)) return { signal: 'short', strength: 75 };
    return { signal: 'none', strength: 0 };
  },

  bollinger_bounce: (candles, i, params) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    const period = params.period || 20;
    if (closes.length < period + 1) return { signal: 'none', strength: 0 };
    const bb = bollingerBands(closes, period, 2);
    const close = closes[i] || 0, prevClose = closes[i - 1] || 0;
    if (prevClose <= (bb.lower[i - 1] || 0) && close > (bb.lower[i] || 0)) return { signal: 'long', strength: 70 };
    if (prevClose >= (bb.upper[i - 1] || 0) && close < (bb.upper[i] || 0)) return { signal: 'short', strength: 70 };
    return { signal: 'none', strength: 0 };
  },

  bollinger_breakout: (candles, i, params) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    const period = params.period || 20;
    if (closes.length < period + 1) return { signal: 'none', strength: 0 };
    const bb = bollingerBands(closes, period, 2);
    const close = closes[i] || 0, prevClose = closes[i - 1] || 0;
    if (prevClose <= (bb.upper[i - 1] || 0) && close > (bb.upper[i] || 0)) return { signal: 'long', strength: 75 };
    if (prevClose >= (bb.lower[i - 1] || 0) && close < (bb.lower[i] || 0)) return { signal: 'short', strength: 75 };
    return { signal: 'none', strength: 0 };
  },

  // EXACT BOT STRATEGY - Same as strategy.engine.ts
  bot_strategy: (candles, i, params) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    if (closes.length < 201) return { signal: 'none', strength: 0 };
    
    // Calculate EMAs (same as bot)
    const ema20Arr = ema(closes, 20);
    const ema50Arr = ema(closes, 50);
    const ema200Arr = ema(closes, 200);
    const rsiArr = rsi(closes, 14);
    
    const currentPrice = closes[i] || 0;
    const ema20 = ema20Arr[i] || 0;
    const ema50 = ema50Arr[i] || 0;
    const ema200 = ema200Arr[i] || 0;
    const rsiVal = rsiArr[i] || 50;
    
    const prevEma20 = ema20Arr[i - 1] || 0;
    const prevEma50 = ema50Arr[i - 1] || 0;
    
    // Trend filter (same as bot)
    const trendBullish = currentPrice > ema200;
    const trendBearish = currentPrice < ema200;
    
    // EMA crossover detection (same as bot)
    const ema20CrossAbove50 = prevEma20 <= prevEma50 && ema20 > ema50;
    const ema20CrossBelow50 = prevEma20 >= prevEma50 && ema20 < ema50;
    
    // RSI conditions (same as bot)
    const rsiBullish = rsiVal > 50;
    const rsiBearish = rsiVal < 50;
    
    // Entry conditions (EXACT same as bot)
    const longEntry = trendBullish && ema20CrossAbove50 && rsiBullish;
    const shortEntry = trendBearish && ema20CrossBelow50 && rsiBearish;
    
    // Calculate confidence (same as bot)
    let confidence = 50;
    if (longEntry) {
      if (currentPrice > ema200) confidence += 15;
      if (ema20 > ema50 && ema50 > ema200) confidence += 15;
      if (rsiVal > 50 && rsiVal < 70) confidence += 10;
      if (rsiVal > 70) confidence -= 10;
      return { signal: 'long', strength: Math.max(0, Math.min(100, confidence)) };
    }
    if (shortEntry) {
      if (currentPrice < ema200) confidence += 15;
      if (ema20 < ema50 && ema50 < ema200) confidence += 15;
      if (rsiVal < 50 && rsiVal > 30) confidence += 10;
      if (rsiVal < 30) confidence -= 10;
      return { signal: 'short', strength: Math.max(0, Math.min(100, confidence)) };
    }
    
    return { signal: 'none', strength: 0 };
  },

  confluence: (candles, i, params) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    if (closes.length < 55) return { signal: 'none', strength: 0 };
    let bull = 0, bear = 0;
    const e9 = ema(closes, 9), e21 = ema(closes, 21), e55 = ema(closes, 55);
    if ((e9[i] || 0) > (e21[i] || 0) && (e21[i] || 0) > (e55[i] || 0)) bull++;
    if ((e9[i] || 0) < (e21[i] || 0) && (e21[i] || 0) < (e55[i] || 0)) bear++;
    const r = rsi(closes, 14);
    if ((r[i] || 50) > 50 && (r[i] || 50) < 70) bull++;
    if ((r[i] || 50) < 50 && (r[i] || 50) > 30) bear++;
    const { histogram } = macd(closes);
    if ((histogram[i] || 0) > 0 && (histogram[i] || 0) > (histogram[i - 1] || 0)) bull++;
    if ((histogram[i] || 0) < 0 && (histogram[i] || 0) < (histogram[i - 1] || 0)) bear++;
    if ((closes[i] || 0) > (e21[i] || 0)) bull++;
    if ((closes[i] || 0) < (e21[i] || 0)) bear++;
    const min = params.minSignals || 3;
    if (bull >= min && bull > bear) return { signal: 'long', strength: 50 + bull * 10 };
    if (bear >= min && bear > bull) return { signal: 'short', strength: 50 + bear * 10 };
    return { signal: 'none', strength: 0 };
  },

  mean_reversion: (candles, i, params) => {
    const closes = candles.slice(0, i + 1).map(c => c.close);
    const period = params.period || 20;
    if (closes.length < period + 1) return { signal: 'none', strength: 0 };
    const s = sma(closes, period);
    const mean = s[i] || 0;
    const slice = closes.slice(i - period + 1, i + 1);
    const std = Math.sqrt(slice.reduce((sum, p) => sum + Math.pow((p || 0) - mean, 2), 0) / period);
    const zScore = std > 0 ? ((closes[i] || 0) - mean) / std : 0;
    if (zScore < -2) return { signal: 'long', strength: 70 + Math.abs(zScore) * 5 };
    if (zScore > 2) return { signal: 'short', strength: 70 + Math.abs(zScore) * 5 };
    return { signal: 'none', strength: 0 };
  },

  breakout: (candles, i, params) => {
    const period = params.period || 20;
    if (i < period) return { signal: 'none', strength: 0 };
    const highs = candles.slice(i - period, i).map(c => c.high);
    const lows = candles.slice(i - period, i).map(c => c.low);
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    const close = candles[i]?.close || 0;
    if (close > highest) return { signal: 'long', strength: 75 };
    if (close < lowest) return { signal: 'short', strength: 75 };
    return { signal: 'none', strength: 0 };
  },

  volume_breakout: (candles, i, params) => {
    const period = params.period || 20;
    if (i < period) return { signal: 'none', strength: 0 };
    const volumes = candles.slice(i - period, i).map(c => c.volume);
    const avgVol = volumes.reduce((a, b) => a + b, 0) / period;
    const currVol = candles[i]?.volume || 0;
    const close = candles[i]?.close || 0;
    const prevClose = candles[i - 1]?.close || 0;
    if (currVol > avgVol * 2 && close > prevClose) return { signal: 'long', strength: 80 };
    if (currVol > avgVol * 2 && close < prevClose) return { signal: 'short', strength: 80 };
    return { signal: 'none', strength: 0 };
  },

  // ADVANCED STRATEGIES

  // Adaptive Regime - Uses Hurst exponent to switch between momentum and mean reversion
  adaptive_regime: (candles, i, params) => {
    const hurstPeriod = params['hurstPeriod'] || 100;
    if (i < hurstPeriod) return { signal: 'none', strength: 0 };
    
    const closes = candles.slice(i - hurstPeriod, i + 1).map(c => c.close);
    const hurst = calculateHurst(closes);
    const r = rsi(closes, 14);
    const rsiVal = r[r.length - 1] || 50;
    
    // H > 0.5 = trending, use momentum
    // H < 0.5 = mean-reverting, use mean reversion
    if (hurst > 0.55) {
      // Trending regime - follow momentum
      const roc10 = (closes[closes.length - 1]! - closes[closes.length - 11]!) / closes[closes.length - 11]! * 100;
      if (roc10 > 2 && rsiVal > 50 && rsiVal < 70) return { signal: 'long', strength: 70 + Math.min(hurst * 20, 15) };
      if (roc10 < -2 && rsiVal < 50 && rsiVal > 30) return { signal: 'short', strength: 70 + Math.min(hurst * 20, 15) };
    } else if (hurst < 0.45) {
      // Mean-reverting regime
      const period = 20;
      const slice = closes.slice(-period);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(slice.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / period);
      const zScore = std > 0 ? (closes[closes.length - 1]! - mean) / std : 0;
      
      if (zScore < -2) return { signal: 'long', strength: 75 };
      if (zScore > 2) return { signal: 'short', strength: 75 };
    }
    return { signal: 'none', strength: 0 };
  },

  // Momentum + ADX - Trade with trend when ADX confirms strong trend
  momentum_adx: (candles, i, params) => {
    const adxPeriod = params['adxPeriod'] || 14;
    const rocPeriod = params['rocPeriod'] || 10;
    if (i < Math.max(adxPeriod + 1, rocPeriod + 1)) return { signal: 'none', strength: 0 };
    
    const highs = candles.slice(0, i + 1).map(c => c.high);
    const lows = candles.slice(0, i + 1).map(c => c.low);
    const closes = candles.slice(0, i + 1).map(c => c.close);
    
    const adxResult = calculateADX(highs, lows, closes, adxPeriod);
    const roc = (closes[i]! - closes[i - rocPeriod]!) / closes[i - rocPeriod]! * 100;
    
    // Only trade when ADX > 25 (strong trend)
    if (adxResult.adx < 25) return { signal: 'none', strength: 0 };
    
    // Use +DI/-DI for direction
    if (adxResult.plusDI > adxResult.minusDI && roc > 1) {
      return { signal: 'long', strength: 60 + Math.min(adxResult.adx, 30) };
    }
    if (adxResult.minusDI > adxResult.plusDI && roc < -1) {
      return { signal: 'short', strength: 60 + Math.min(adxResult.adx, 30) };
    }
    return { signal: 'none', strength: 0 };
  },

  // Z-Score Mean Reversion - Classic statistical mean reversion
  zscore_mean_reversion: (candles, i, params) => {
    const period = params['period'] || 20;
    const threshold = params['threshold'] || 2;
    if (i < period) return { signal: 'none', strength: 0 };
    
    const closes = candles.slice(i - period + 1, i + 1).map(c => c.close);
    const mean = closes.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(closes.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / period);
    const current = candles[i]?.close || 0;
    const zScore = std > 0 ? (current - mean) / std : 0;
    
    // Enter when price is extreme, exit when it returns to mean
    if (zScore < -threshold) return { signal: 'long', strength: 70 + Math.abs(zScore) * 5 };
    if (zScore > threshold) return { signal: 'short', strength: 70 + Math.abs(zScore) * 5 };
    return { signal: 'none', strength: 0 };
  },

  // IMPROVED BOT STRATEGY - With regime filter, volume confirmation, and better R:R
  improved_bot: (candles, i, params) => {
    if (i < 201) return { signal: 'none', strength: 0 };
    
    const closes = candles.slice(0, i + 1).map(c => c.close);
    const volumes = candles.slice(0, i + 1).map(c => c.volume);
    const highs = candles.slice(0, i + 1).map(c => c.high);
    const lows = candles.slice(0, i + 1).map(c => c.low);
    
    // Calculate indicators
    const ema20Arr = ema(closes, 20);
    const ema50Arr = ema(closes, 50);
    const ema200Arr = ema(closes, 200);
    const rsiArr = rsi(closes, 14);
    
    const currentPrice = closes[i] || 0;
    const ema20 = ema20Arr[i] || 0;
    const ema50 = ema50Arr[i] || 0;
    const ema200 = ema200Arr[i] || 0;
    const rsiVal = rsiArr[i] || 50;
    const prevEma20 = ema20Arr[i - 1] || 0;
    const prevEma50 = ema50Arr[i - 1] || 0;
    
    // FILTER 1: Regime Detection using Hurst-like volatility check
    const recentCloses = closes.slice(-50);
    const returns: number[] = [];
    for (let j = 1; j < recentCloses.length; j++) {
      returns.push((recentCloses[j]! - recentCloses[j-1]!) / recentCloses[j-1]!);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const volatility = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length);
    
    // Calculate trend strength (slope of EMA50)
    const ema50Slope = ((ema50Arr[i] || 0) - (ema50Arr[i - 10] || 0)) / (ema50Arr[i - 10] || 1);
    const isTrending = Math.abs(ema50Slope) > 0.002; // 0.2% slope = trending
    
    // FILTER 2: Volume confirmation
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentVolume = volumes[i] || 0;
    const volumeConfirm = currentVolume > avgVolume * 0.8;
    
    // FILTER 3: ATR-based volatility filter (avoid low volatility)
    let atrSum = 0;
    for (let j = i - 13; j <= i; j++) {
      const tr = Math.max(
        highs[j]! - lows[j]!,
        Math.abs(highs[j]! - closes[j - 1]!),
        Math.abs(lows[j]! - closes[j - 1]!)
      );
      atrSum += tr;
    }
    const atr = atrSum / 14;
    const atrPct = (atr / currentPrice) * 100;
    const volatilityOk = atrPct > 0.5 && atrPct < 5; // Between 0.5% and 5% ATR
    
    // Trend conditions
    const trendBullish = currentPrice > ema200 && ema20 > ema50;
    const trendBearish = currentPrice < ema200 && ema20 < ema50;
    
    // EMA crossover detection (exact crossover)
    const ema20CrossAbove50 = prevEma20 <= prevEma50 && ema20 > ema50;
    const ema20CrossBelow50 = prevEma20 >= prevEma50 && ema20 < ema50;
    
    // EMA momentum (recent crossover within last 5 candles OR strong alignment)
    const ema20Above50 = ema20 > ema50;
    const ema20Below50 = ema20 < ema50;
    const emaSpreadPct = Math.abs(ema20 - ema50) / ema50 * 100;
    const strongEmaAlignment = emaSpreadPct > 0.3; // 0.3% spread = strong alignment
    
    // RSI conditions - more conservative
    const rsiBullish = rsiVal > 40 && rsiVal < 70;
    const rsiBearish = rsiVal < 60 && rsiVal > 30;
    
    // Entry conditions - relaxed to allow more trades
    // Option 1: Exact crossover with all filters
    // Option 2: Strong EMA alignment with trend and volume
    const longEntry = (isTrending && trendBullish && rsiBullish && volumeConfirm && volatilityOk) && 
                      (ema20CrossAbove50 || (ema20Above50 && strongEmaAlignment));
    const shortEntry = (isTrending && trendBearish && rsiBearish && volumeConfirm && volatilityOk) && 
                       (ema20CrossBelow50 || (ema20Below50 && strongEmaAlignment));
    
    // Calculate confidence
    let confidence = 50;
    if (longEntry || shortEntry) {
      if (isTrending) confidence += 10;
      if (volumeConfirm) confidence += 10;
      if (volatilityOk) confidence += 5;
      if (Math.abs(ema50Slope) > 0.005) confidence += 10; // Strong trend
      
      // EMA alignment bonus
      if (longEntry && ema20 > ema50 && ema50 > ema200) confidence += 10;
      if (shortEntry && ema20 < ema50 && ema50 < ema200) confidence += 10;
      
      // RSI sweet spot
      if (longEntry && rsiVal > 50 && rsiVal < 60) confidence += 5;
      if (shortEntry && rsiVal < 50 && rsiVal > 40) confidence += 5;
    }
    
    if (longEntry) return { signal: 'long', strength: Math.min(95, confidence) };
    if (shortEntry) return { signal: 'short', strength: Math.min(95, confidence) };
    return { signal: 'none', strength: 0 };
  },
};

// Helper: Calculate Hurst Exponent
function calculateHurst(prices: number[]): number {
  const n = prices.length;
  if (n < 20) return 0.5;
  
  const lags: number[] = [];
  const logRS: number[] = [];
  
  for (let lag = 4; lag <= Math.min(20, Math.floor(n / 4)); lag++) {
    const chunks = Math.floor(n / lag);
    if (chunks < 2) continue;
    
    let rsSum = 0;
    let validChunks = 0;
    
    for (let j = 0; j < chunks; j++) {
      const chunk = prices.slice(j * lag, (j + 1) * lag);
      if (chunk.length < lag) continue;
      
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      const deviations = chunk.map(p => p - mean);
      
      let sum = 0;
      const cumDev: number[] = [];
      for (const d of deviations) {
        sum += d;
        cumDev.push(sum);
      }
      
      const R = Math.max(...cumDev) - Math.min(...cumDev);
      const variance = deviations.reduce((s, d) => s + d * d, 0) / chunk.length;
      const S = Math.sqrt(variance);
      
      if (S > 0) {
        rsSum += R / S;
        validChunks++;
      }
    }
    
    if (validChunks > 0) {
      lags.push(Math.log(lag));
      logRS.push(Math.log(rsSum / validChunks));
    }
  }
  
  if (lags.length < 3) return 0.5;
  
  // Linear regression
  const n2 = lags.length;
  const sumX = lags.reduce((a, b) => a + b, 0);
  const sumY = logRS.reduce((a, b) => a + b, 0);
  const sumXY = lags.reduce((s, x, idx) => s + x * logRS[idx]!, 0);
  const sumX2 = lags.reduce((s, x) => s + x * x, 0);
  
  const slope = (n2 * sumXY - sumX * sumY) / (n2 * sumX2 - sumX * sumX);
  return Math.max(0, Math.min(1, slope));
}

// Helper: Calculate ADX
function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): { adx: number; plusDI: number; minusDI: number } {
  const n = highs.length;
  if (n < period + 1) return { adx: 0, plusDI: 0, minusDI: 0 };
  
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < n; i++) {
    tr.push(Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!)
    ));
    
    const upMove = highs[i]! - highs[i - 1]!;
    const downMove = lows[i - 1]! - lows[i]!;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Smoothed averages (Wilder's smoothing)
  const smoothTR = wilderSmooth(tr, period);
  const smoothPlusDM = wilderSmooth(plusDM, period);
  const smoothMinusDM = wilderSmooth(minusDM, period);
  
  const lastIdx = smoothTR.length - 1;
  const lastTR = smoothTR[lastIdx] || 1;
  const plusDI = lastTR > 0 ? (smoothPlusDM[lastIdx]! / lastTR) * 100 : 0;
  const minusDI = lastTR > 0 ? (smoothMinusDM[lastIdx]! / lastTR) * 100 : 0;
  
  const dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  
  return { adx: dx, plusDI, minusDI };
}

function wilderSmooth(data: number[], period: number): number[] {
  const result: number[] = [];
  let sum = 0;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      sum += data[i]!;
      result.push(sum / (i + 1));
    } else {
      const prev = result[i - 1]!;
      result.push(prev - prev / period + data[i]!);
    }
  }
  return result;
}

// ============================================================================
// GROK AI SIMULATION FOR BACKTEST
// ============================================================================

/**
 * Simulates Grok AI decision-making for backtesting
 * This uses technical indicators as a proxy for what Grok would analyze
 * (macro events, sentiment, news) since we can't call Grok API for historical data
 * 
 * The simulation:
 * 1. Filters out trades in choppy/uncertain conditions
 * 2. Boosts position size when conditions are favorable
 * 3. Uses volatility, trend strength, and momentum as proxies
 */
function simulateGrokDecision(
  candles: Candle[],
  i: number,
  signal: 'long' | 'short',
  signalStrength: number,
  config: BacktestConfig
): { shouldTrade: boolean; positionMultiplier: number; reason: string } {
  const filterStrength = config.grokFilterStrength ?? 50;
  const boostStrength = config.grokBoostStrength ?? 30;
  
  if (i < 50) {
    return { shouldTrade: true, positionMultiplier: 1, reason: 'Insufficient data for Grok simulation' };
  }
  
  const closes = candles.slice(Math.max(0, i - 50), i + 1).map(c => c.close);
  const volumes = candles.slice(Math.max(0, i - 20), i + 1).map(c => c.volume);
  
  // Calculate market conditions
  const currentPrice = closes[closes.length - 1] || 0;
  const price20Ago = closes[closes.length - 21] || currentPrice;
  const price50Ago = closes[0] || currentPrice;
  
  // 1. Trend strength (proxy for macro regime)
  const shortTermTrend = ((currentPrice - price20Ago) / price20Ago) * 100;
  const longTermTrend = ((currentPrice - price50Ago) / price50Ago) * 100;
  const trendAlignment = (shortTermTrend > 0 && longTermTrend > 0) || (shortTermTrend < 0 && longTermTrend < 0);
  
  // 2. Volatility (proxy for risk-off conditions)
  const returns = closes.slice(-20).map((c, idx, arr) => idx > 0 ? (c - arr[idx - 1]!) / arr[idx - 1]! : 0);
  const volatility = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * 100;
  const isHighVolatility = volatility > 3; // >3% daily volatility = risky
  
  // 3. Volume confirmation (proxy for institutional activity)
  const avgVolume = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
  const currentVolume = volumes[volumes.length - 1] || avgVolume;
  const volumeRatio = currentVolume / avgVolume;
  const hasVolumeConfirmation = volumeRatio > 1.2;
  
  // 4. RSI extremes (proxy for sentiment)
  const rsiValues = rsi(closes, 14);
  const currentRsi = rsiValues[rsiValues.length - 1] || 50;
  const isOverbought = currentRsi > 75;
  const isOversold = currentRsi < 25;
  
  // Calculate Grok "confidence" score
  let grokScore = 50; // Base score
  
  // Trend alignment bonus
  if (trendAlignment) {
    if (signal === 'long' && shortTermTrend > 0) grokScore += 15;
    if (signal === 'short' && shortTermTrend < 0) grokScore += 15;
  } else {
    grokScore -= 10; // Penalty for counter-trend
  }
  
  // Volume confirmation
  if (hasVolumeConfirmation) grokScore += 10;
  
  // Volatility adjustment
  if (isHighVolatility) grokScore -= 15;
  
  // RSI extremes (contrarian signals)
  if (signal === 'long' && isOversold) grokScore += 10;
  if (signal === 'short' && isOverbought) grokScore += 10;
  if (signal === 'long' && isOverbought) grokScore -= 20;
  if (signal === 'short' && isOversold) grokScore -= 20;
  
  // Signal strength bonus
  grokScore += (signalStrength - 50) * 0.3;
  
  // Apply filter threshold
  const filterThreshold = 30 + (filterStrength * 0.4); // 30-70 range
  const shouldTrade = grokScore >= filterThreshold;
  
  // Calculate position multiplier for boost
  let positionMultiplier = 1;
  if (shouldTrade && grokScore > 60) {
    const boostFactor = ((grokScore - 60) / 40) * (boostStrength / 100);
    positionMultiplier = 1 + boostFactor; // Up to 1 + boostStrength/100
  } else if (grokScore < 50) {
    positionMultiplier = 0.7; // Reduce size for weak signals
  }
  
  const reason = shouldTrade 
    ? `Grok score: ${grokScore.toFixed(0)}, multiplier: ${positionMultiplier.toFixed(2)}`
    : `Filtered: score ${grokScore.toFixed(0)} < threshold ${filterThreshold.toFixed(0)}`;
  
  return { shouldTrade, positionMultiplier, reason };
}

// ============================================================================
// BACKTEST ENGINE
// ============================================================================

// Check for signal exit conditions (same as bot)
function checkSignalExit(candles: Candle[], i: number, side: 'long' | 'short'): boolean {
  const closes = candles.slice(0, i + 1).map(c => c.close);
  if (closes.length < 201) return false;
  
  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, 50);
  const rsiArr = rsi(closes, 14);
  
  const ema20 = ema20Arr[i] || 0;
  const ema50 = ema50Arr[i] || 0;
  const prevEma20 = ema20Arr[i - 1] || 0;
  const prevEma50 = ema50Arr[i - 1] || 0;
  const rsiVal = rsiArr[i] || 50;
  
  const ema20CrossAbove50 = prevEma20 <= prevEma50 && ema20 > ema50;
  const ema20CrossBelow50 = prevEma20 >= prevEma50 && ema20 < ema50;
  const rsiOverbought = rsiVal > 70;
  const rsiOversold = rsiVal < 30;
  
  // Exit conditions (EXACT same as bot)
  if (side === 'long') {
    return ema20CrossBelow50 || rsiOverbought;
  } else {
    return ema20CrossAbove50 || rsiOversold;
  }
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  console.log('[Backtest] Starting for', config.symbol, 'with strategy:', config.strategy);
  
  const candles = await fetchHistoricalCandles(config.symbol, config.interval, config.startTime, config.endTime);
  if (candles.length === 0) throw new Error('No historical data available');
  console.log('[Backtest] Loaded', candles.length, 'candles from Hyperliquid');

  let equity = config.initialCapital;
  let position: { side: 'long' | 'short'; entry: number; qty: number; time: number; idx: number; peak: number; trough: number } | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let peakEquity = equity;
  let tradeId = 0;

  // Determine minimum candles needed based on strategy
  const strategiesNeedingEMA200 = ['bot_strategy', 'improved_bot'];
  const needsEMA200 = strategiesNeedingEMA200.includes(config.strategy);
  let effectiveStrategy = config.strategy;
  let startIdx = needsEMA200 ? 201 : 55;
  
  // If not enough candles for EMA200 strategies, fallback to a simpler strategy
  if (needsEMA200 && candles.length <= 201) {
    console.log(`[Backtest] Warning: Only ${candles.length} candles, need 202 for ${config.strategy}. Falling back to 'confluence' strategy.`);
    effectiveStrategy = 'confluence';
    startIdx = 55;
  }
  
  // Use selected strategy or fallback
  const strategyFn = strategies[effectiveStrategy] || strategies['confluence'];
  const atrValues = atr(candles);
  
  // Final check - if still not enough candles, use minimum
  if (candles.length <= startIdx) {
    startIdx = Math.min(20, candles.length - 1);
    console.log(`[Backtest] Using minimal startIdx: ${startIdx}`);
  }

  for (let i = startIdx; i < candles.length; i++) {
    const c = candles[i];
    if (!c) continue;
    const price = c.close;

    if (position) {
      position.peak = Math.max(position.peak, c.high);
      position.trough = Math.min(position.trough, c.low);

      let exitReason: BacktestTrade['exitReason'] | null = null;
      let exitPrice = price;

      if (position.side === 'long') {
        const sl = position.entry * (1 - config.stopLossPct / 100);
        const tp = position.entry * (1 + config.takeProfitPct / 100);
        if (c.low <= sl) { exitPrice = sl; exitReason = 'sl'; }
        else if (c.high >= tp) { exitPrice = tp; exitReason = 'tp'; }
        else if (config.enableTrailingStop) {
          const profit = (position.peak - position.entry) / position.entry * 100;
          if (profit >= 1) {
            const trail = position.peak * (1 - config.trailingStopPct / 100);
            if (c.low <= trail) { exitPrice = trail; exitReason = 'trailing'; }
          }
        }
        // Signal-based exit for bot_strategy (same as live bot)
        if (!exitReason && config.strategy === 'bot_strategy' && checkSignalExit(candles, i, 'long')) {
          exitReason = 'signal';
        }
      } else {
        const sl = position.entry * (1 + config.stopLossPct / 100);
        const tp = position.entry * (1 - config.takeProfitPct / 100);
        if (c.high >= sl) { exitPrice = sl; exitReason = 'sl'; }
        else if (c.low <= tp) { exitPrice = tp; exitReason = 'tp'; }
        else if (config.enableTrailingStop) {
          const profit = (position.entry - position.trough) / position.entry * 100;
          if (profit >= 1) {
            const trail = position.trough * (1 + config.trailingStopPct / 100);
            if (c.high >= trail) { exitPrice = trail; exitReason = 'trailing'; }
          }
        }
        // Signal-based exit for bot_strategy (same as live bot)
        if (!exitReason && config.strategy === 'bot_strategy' && checkSignalExit(candles, i, 'short')) {
          exitReason = 'signal';
        }
      }

      if (exitReason) {
        const pnl = position.side === 'long'
          ? (exitPrice - position.entry) * position.qty
          : (position.entry - exitPrice) * position.qty;
        const fees = (position.entry * position.qty + exitPrice * position.qty) * config.tradingFee / 100;
        trades.push({
          id: tradeId++, entryTime: position.time, exitTime: c.timestamp,
          side: position.side, entryPrice: position.entry, exitPrice,
          quantity: position.qty, pnl, pnlPct: (pnl / (position.entry * position.qty)) * 100,
          fees, netPnl: pnl - fees, exitReason, holdingBars: i - position.idx,
        });
        equity += pnl - fees;
        position = null;
      }
    }

    if (!position) {
      const { signal, strength } = strategyFn(candles, i, config.strategyParams);
      if (signal === 'long' || signal === 'short') {
        // Grok AI Simulation - filters and boosts trades based on market conditions
        let shouldTrade = true;
        let positionMultiplier = 1;
        
        if (config.enableGrokSimulation) {
          const grokDecision = simulateGrokDecision(candles, i, signal, strength, config);
          shouldTrade = grokDecision.shouldTrade;
          positionMultiplier = grokDecision.positionMultiplier;
        }
        
        if (shouldTrade) {
          const risk = equity * (config.positionSizePct / 100) * positionMultiplier;
          const atrVal = atrValues[i] || price * 0.02;
          const stopDist = Math.max(config.stopLossPct / 100, atrVal / price);
          let qty = risk / (price * stopDist);
          qty = Math.min(qty, (equity * config.maxLeverage) / price);
          const entry = signal === 'long' ? price * (1 + config.slippage / 100) : price * (1 - config.slippage / 100);
          position = { side: signal, entry, qty, time: c.timestamp, idx: i, peak: c.high, trough: c.low };
        }
      }
    }

    let currEquity = equity;
    if (position) {
      const unrealized = position.side === 'long'
        ? (price - position.entry) * position.qty
        : (position.entry - price) * position.qty;
      currEquity = equity + unrealized;
    }
    peakEquity = Math.max(peakEquity, currEquity);
    equityCurve.push({
      timestamp: c.timestamp, equity: currEquity,
      drawdown: peakEquity - currEquity, drawdownPct: ((peakEquity - currEquity) / peakEquity) * 100,
    });
  }

  // Close remaining position
  if (position && candles.length > 0) {
    const last = candles[candles.length - 1];
    if (last) {
      const exitPrice = last.close;
      const pnl = position.side === 'long'
        ? (exitPrice - position.entry) * position.qty
        : (position.entry - exitPrice) * position.qty;
      const fees = (position.entry * position.qty + exitPrice * position.qty) * config.tradingFee / 100;
      trades.push({
        id: tradeId++, entryTime: position.time, exitTime: last.timestamp,
        side: position.side, entryPrice: position.entry, exitPrice,
        quantity: position.qty, pnl, pnlPct: (pnl / (position.entry * position.qty)) * 100,
        fees, netPnl: pnl - fees, exitReason: 'end', holdingBars: candles.length - 1 - position.idx,
      });
      equity += pnl - fees;
    }
  }

  const metrics = calculateMetrics(config.initialCapital, trades, equityCurve, candles);
  return {
    config, candles, trades, equityCurve, metrics,
    returnDistribution: calcReturnDist(trades),
    monthlyReturns: calcMonthlyReturns(trades, config.initialCapital),
    hourlyPerformance: calcHourlyPerf(trades),
  };
}

// ============================================================================
// METRICS CALCULATION
// ============================================================================

function calculateMetrics(initialCapital: number, trades: BacktestTrade[], equityCurve: EquityPoint[], candles: Candle[]): BacktestMetrics {
  const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1]?.equity || initialCapital : initialCapital;
  const totalReturn = finalEquity - initialCapital;
  const totalReturnPct = (totalReturn / initialCapital) * 100;

  const startTime = candles[0]?.timestamp || 0;
  const endTime = candles[candles.length - 1]?.timestamp || 0;
  const days = (endTime - startTime) / 86400000;
  const annualizedReturn = days > 0 ? (Math.pow(finalEquity / initialCapital, 365 / days) - 1) * 100 : 0;

  let maxDD = 0, maxDDPct = 0, peak = initialCapital;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    else {
      const dd = peak - p.equity;
      if (dd > maxDD) { maxDD = dd; maxDDPct = (dd / peak) * 100; }
    }
  }

  const wins = trades.filter(t => t.netPnl > 0);
  const losses = trades.filter(t => t.netPnl <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const totalWins = wins.reduce((s, t) => s + t.netPnl, 0);
  const totalLosses = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;
  const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
  const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

  let maxConsecWins = 0, maxConsecLosses = 0, cw = 0, cl = 0;
  for (const t of trades) {
    if (t.netPnl > 0) { cw++; cl = 0; maxConsecWins = Math.max(maxConsecWins, cw); }
    else { cl++; cw = 0; maxConsecLosses = Math.max(maxConsecLosses, cl); }
  }

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]?.equity || 1;
    const curr = equityCurve[i]?.equity || prev;
    returns.push((curr - prev) / prev);
  }
  const avgRet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const vol = returns.length > 0 ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgRet, 2), 0) / returns.length) * Math.sqrt(252) : 0;
  const negRets = returns.filter(r => r < 0);
  const downVol = negRets.length > 0 ? Math.sqrt(negRets.reduce((s, r) => s + r * r, 0) / negRets.length) * Math.sqrt(252) : 0;
  const excess = annualizedReturn / 100 - 0.05;
  const sharpe = vol > 0 ? excess / vol : 0;
  const sortino = downVol > 0 ? excess / downVol : 0;
  const calmar = maxDDPct > 0 ? annualizedReturn / maxDDPct : 0;

  // Advanced Quant Metrics
  const winRateFrac = winRate / 100;
  const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
  const kellyFraction = avgLoss > 0 && winRateFrac > 0 && winRateFrac < 1
    ? Math.max(0, (winRateFrac * riskRewardRatio - (1 - winRateFrac)) / riskRewardRatio) * 0.25
    : 0;
  const optimalPositionSize = kellyFraction * 100;

  // VaR 95%
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const varIndex = Math.floor(0.05 * sortedReturns.length);
  const valueAtRisk95 = sortedReturns.length > 0 ? Math.abs(sortedReturns[varIndex] || 0) * 100 : 0;

  // Omega Ratio
  const gains = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const lossesSum = returns.filter(r => r < 0).reduce((a, b) => a + Math.abs(b), 0);
  const omegaRatio = lossesSum > 0 ? gains / lossesSum : gains > 0 ? 10 : 1;

  // Skewness
  const n = returns.length;
  const skewness = n > 2 && vol > 0
    ? (returns.reduce((s, r) => s + Math.pow((r - avgRet) / (vol / Math.sqrt(252)), 3), 0) / n)
    : 0;

  // Kurtosis
  const kurtosis = n > 3 && vol > 0
    ? (returns.reduce((s, r) => s + Math.pow((r - avgRet) / (vol / Math.sqrt(252)), 4), 0) / n)
    : 3;

  // Average holding period
  const avgHoldingPeriod = trades.length > 0
    ? trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length
    : 0;

  // Buy and Hold comparison
  const firstPrice = candles[0]?.close || 1;
  const lastPrice = candles[candles.length - 1]?.close || firstPrice;
  const buyAndHoldReturn = ((lastPrice - firstPrice) / firstPrice) * 100;
  const alphaVsBuyHold = totalReturnPct - buyAndHoldReturn;

  return {
    totalReturn, totalReturnPct, annualizedReturn, maxDrawdown: maxDD, maxDrawdownPct: maxDDPct,
    sharpeRatio: sharpe, sortinoRatio: sortino, calmarRatio: calmar,
    totalTrades: trades.length, winningTrades: wins.length, losingTrades: losses.length,
    winRate, profitFactor, avgWin, avgLoss, expectancy, maxConsecutiveWins: maxConsecWins, maxConsecutiveLosses: maxConsecLosses,
    kellyFraction, optimalPositionSize, valueAtRisk95, omegaRatio, skewness, kurtosis,
    avgHoldingPeriod, riskRewardRatio, buyAndHoldReturn, alphaVsBuyHold,
  };
}

function calcReturnDist(trades: BacktestTrade[]) {
  const buckets = [
    { min: -Infinity, max: -5, label: '< -5%' }, { min: -5, max: -2, label: '-5% to -2%' },
    { min: -2, max: 0, label: '-2% to 0%' }, { min: 0, max: 2, label: '0% to 2%' },
    { min: 2, max: 5, label: '2% to 5%' }, { min: 5, max: Infinity, label: '> 5%' },
  ];
  return buckets.map(b => ({ bucket: b.label, count: trades.filter(t => t.pnlPct > b.min && t.pnlPct <= b.max).length }));
}

function calcMonthlyReturns(trades: BacktestTrade[], initialCapital: number) {
  const map = new Map<string, number>();
  for (const t of trades) {
    const d = new Date(t.exitTime);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    map.set(key, (map.get(key) || 0) + t.netPnl);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, ret]) => ({ month, returnPct: (ret / initialCapital) * 100 }));
}

function calcHourlyPerf(trades: BacktestTrade[]) {
  const map = new Map<number, { wins: number; total: number }>();
  for (const t of trades) {
    const h = new Date(t.entryTime).getUTCHours();
    const e = map.get(h) || { wins: 0, total: 0 };
    e.total++; if (t.netPnl > 0) e.wins++;
    map.set(h, e);
  }
  return Array.from({ length: 24 }, (_, h) => {
    const d = map.get(h) || { wins: 0, total: 0 };
    return { hour: h, winRate: d.total > 0 ? (d.wins / d.total) * 100 : 0, trades: d.total };
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const AVAILABLE_STRATEGIES = [
  { name: 'improved_bot', label: '⭐ Improved Bot', description: 'Enhanced strategy with regime filter, volume confirmation, and ATR filter', params: {}, isDefault: true },
  { name: 'bot_strategy', label: '🤖 Bot Strategy (Live)', description: 'EXACT same logic as live bot: EMA20/50/200 + RSI crossover', params: {} },
  { name: 'adaptive_regime', label: '📊 Adaptive Regime', description: 'Switches between momentum/mean-reversion based on Hurst exponent', params: { hurstPeriod: 100 } },
  { name: 'momentum_adx', label: '🚀 Momentum + ADX', description: 'Trade with trend when ADX > 25, uses ROC for momentum', params: { adxPeriod: 14, rocPeriod: 10 } },
  { name: 'zscore_mean_reversion', label: '📉 Z-Score Mean Reversion', description: 'Enter when Z-score > 2 or < -2, exit at mean', params: { period: 20, threshold: 2 } },
  { name: 'confluence', label: 'Confluence (Multi-Indicator)', description: 'EMA + RSI + MACD combined signals', params: { minSignals: 3 } },
  { name: 'ema_crossover', label: 'EMA Crossover', description: 'Fast/slow EMA crossover signals', params: { fast: 9, slow: 21 } },
  { name: 'triple_ema', label: 'Triple EMA', description: '3 EMA trend alignment', params: { fast: 8, medium: 21, slow: 55 } },
  { name: 'rsi_reversal', label: 'RSI Reversal', description: 'Oversold/overbought reversals', params: { period: 14 } },
  { name: 'rsi_trend', label: 'RSI Trend', description: 'RSI 50-line crossover', params: { period: 14 } },
  { name: 'macd_cross', label: 'MACD Cross', description: 'MACD histogram zero-line cross', params: {} },
  { name: 'macd_divergence', label: 'MACD Divergence', description: 'Price/MACD divergence signals', params: {} },
  { name: 'bollinger_bounce', label: 'Bollinger Bounce', description: 'Mean reversion from bands', params: { period: 20 } },
  { name: 'bollinger_breakout', label: 'Bollinger Breakout', description: 'Breakout from bands', params: { period: 20 } },
  { name: 'mean_reversion', label: 'Mean Reversion', description: 'Z-score based mean reversion', params: { period: 20 } },
  { name: 'breakout', label: 'Price Breakout', description: 'N-period high/low breakout', params: { period: 20 } },
  { name: 'volume_breakout', label: 'Volume Breakout', description: 'High volume breakout signals', params: { period: 20 } },
];

export default { fetchHistoricalCandles, runBacktest, AVAILABLE_STRATEGIES };
