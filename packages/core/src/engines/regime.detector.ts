/**
 * Regime Detector
 * 
 * Detects market regime: trending vs ranging, volatility level
 * Uses ATR, trend slope, and range detection
 */

export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RegimeState {
  atr14: number;
  atrPctOfPrice: number;
  trendSlope: number;
  isRanging: boolean;
  volatilityLevel: 'low' | 'medium' | 'high';
}

/**
 * Calculate ATR (Average True Range)
 */
export function calculateATR(candles: OHLC[], period: number = 14): number {
  if (candles.length < period + 1) {
    return 0;
  }

  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i]!;
    const previous = candles[i - 1]!;

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );
    trueRanges.push(tr);
  }

  // Take last 'period' true ranges
  const recentTRs = trueRanges.slice(-period);
  if (recentTRs.length < period) {
    return 0;
  }

  return recentTRs.reduce((sum, tr) => sum + tr, 0) / period;
}

/**
 * Calculate trend slope using linear regression on closes
 */
export function calculateTrendSlope(candles: OHLC[], period: number = 20): number {
  if (candles.length < period) {
    return 0;
  }

  const recentCandles = candles.slice(-period);
  const n = recentCandles.length;

  // Linear regression: y = mx + b
  // m = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = recentCandles[i]!.close;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return 0;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;

  // Normalize slope by average price to get percentage change per candle
  const avgPrice = sumY / n;
  return avgPrice > 0 ? slope / avgPrice : 0;
}

/**
 * Detect if market is ranging (price oscillating within bounds)
 */
export function detectRanging(candles: OHLC[], period: number = 20, threshold: number = 0.02): boolean {
  if (candles.length < period) {
    return false;
  }

  const recentCandles = candles.slice(-period);
  const closes = recentCandles.map(c => c.close);
  
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const mid = (high + low) / 2;
  const range = (high - low) / mid;

  // Count how many times price crosses the midpoint
  let crossings = 0;
  let aboveMid = closes[0]! > mid;

  for (let i = 1; i < closes.length; i++) {
    const currentAbove = closes[i]! > mid;
    if (currentAbove !== aboveMid) {
      crossings++;
      aboveMid = currentAbove;
    }
  }

  // Ranging if: small range AND multiple crossings
  return range < threshold && crossings >= 3;
}

/**
 * Determine volatility level based on ATR percentage
 */
export function getVolatilityLevel(atrPctOfPrice: number): 'low' | 'medium' | 'high' {
  if (atrPctOfPrice < 0.01) {
    return 'low';
  } else if (atrPctOfPrice < 0.03) {
    return 'medium';
  } else {
    return 'high';
  }
}

/**
 * Main regime detection function
 */
export function detectRegime(candles: OHLC[]): RegimeState {
  if (candles.length < 20) {
    // Not enough data - return neutral regime
    return {
      atr14: 0,
      atrPctOfPrice: 0,
      trendSlope: 0,
      isRanging: false,
      volatilityLevel: 'medium',
    };
  }

  const lastPrice = candles[candles.length - 1]!.close;
  const atr14 = calculateATR(candles, 14);
  const atrPctOfPrice = lastPrice > 0 ? atr14 / lastPrice : 0;
  const trendSlope = calculateTrendSlope(candles, 20);
  const isRanging = detectRanging(candles, 20);
  const volatilityLevel = getVolatilityLevel(atrPctOfPrice);

  return {
    atr14,
    atrPctOfPrice,
    trendSlope,
    isRanging,
    volatilityLevel,
  };
}

/**
 * Get regime description for UI
 */
export function getRegimeDescription(regime: RegimeState): string {
  const trend = regime.trendSlope > 0.001 ? 'Uptrend' :
                regime.trendSlope < -0.001 ? 'Downtrend' : 'Sideways';
  const vol = regime.volatilityLevel.charAt(0).toUpperCase() + regime.volatilityLevel.slice(1);
  const type = regime.isRanging ? 'Ranging' : 'Trending';

  return `${trend} | ${vol} Vol | ${type}`;
}
