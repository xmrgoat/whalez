/**
 * ADVANCED QUANTITATIVE INDICATORS
 * Kelly Criterion, Hurst Exponent, ADX, Z-Score, VaR, and more
 */

// ============================================================================
// POSITION SIZING
// ============================================================================

/**
 * Kelly Criterion - Optimal position sizing based on win probability
 * f* = (p * b - q) / b
 * where: p = win probability, q = 1-p, b = win/loss ratio
 * 
 * @param winRate - Historical win rate (0-1)
 * @param avgWin - Average winning trade amount
 * @param avgLoss - Average losing trade amount
 * @param fraction - Kelly fraction to use (0.25 = quarter Kelly, safer)
 * @returns Optimal position size as fraction of capital (0-1)
 */
export function kellyPositionSize(
  winRate: number,
  avgWin: number,
  avgLoss: number,
  fraction: number = 0.25
): number {
  if (avgLoss <= 0 || winRate <= 0 || winRate >= 1) return 0;
  
  const b = avgWin / avgLoss; // Risk-reward ratio
  const p = winRate;
  const q = 1 - p;
  
  const kelly = (p * b - q) / b;
  
  // Apply fraction and cap at reasonable max
  const adjustedKelly = Math.max(0, kelly * fraction);
  return Math.min(adjustedKelly, 0.1); // Max 10% of capital
}

/**
 * Value at Risk (VaR) - Maximum expected loss at confidence level
 * @param returns - Array of historical returns
 * @param confidence - Confidence level (0.95 = 95%)
 * @returns VaR as percentage
 */
export function valueAtRisk(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  return Math.abs(sorted[index] || 0);
}

/**
 * Conditional VaR (Expected Shortfall) - Average loss beyond VaR
 */
export function conditionalVaR(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoffIndex = Math.floor((1 - confidence) * sorted.length);
  const tailReturns = sorted.slice(0, cutoffIndex + 1);
  
  if (tailReturns.length === 0) return 0;
  return Math.abs(tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length);
}

// ============================================================================
// REGIME DETECTION
// ============================================================================

/**
 * Hurst Exponent - Detect mean-reversion vs trending behavior
 * H < 0.5: Mean-reverting
 * H = 0.5: Random walk
 * H > 0.5: Trending
 */
export function hurstExponent(prices: number[], maxLag: number = 20): number {
  const n = prices.length;
  if (n < maxLag * 2) return 0.5;
  
  const lags: number[] = [];
  const logRS: number[] = [];
  
  for (let lag = 10; lag <= Math.min(maxLag, Math.floor(n / 4)); lag++) {
    const chunks = Math.floor(n / lag);
    if (chunks < 2) continue;
    
    let rsSum = 0;
    let validChunks = 0;
    
    for (let i = 0; i < chunks; i++) {
      const chunk = prices.slice(i * lag, (i + 1) * lag);
      if (chunk.length < lag) continue;
      
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      const deviations = chunk.map(p => p - mean);
      
      // Cumulative deviations
      const cumDev: number[] = [];
      let sum = 0;
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
  
  // Linear regression to find slope (Hurst exponent)
  const n2 = lags.length;
  const sumX = lags.reduce((a, b) => a + b, 0);
  const sumY = logRS.reduce((a, b) => a + b, 0);
  const sumXY = lags.reduce((s, x, i) => s + x * logRS[i]!, 0);
  const sumX2 = lags.reduce((s, x) => s + x * x, 0);
  
  const slope = (n2 * sumXY - sumX * sumY) / (n2 * sumX2 - sumX * sumX);
  
  return Math.max(0, Math.min(1, slope));
}

/**
 * ADX (Average Directional Index) - Trend strength indicator
 * ADX < 20: No trend (range-bound)
 * ADX 20-40: Moderate trend
 * ADX > 40: Strong trend
 */
export function adx(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): { adx: number; plusDI: number; minusDI: number } {
  const n = highs.length;
  if (n < period + 1) return { adx: 0, plusDI: 0, minusDI: 0 };
  
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < n; i++) {
    const high = highs[i]!;
    const low = lows[i]!;
    const prevHigh = highs[i - 1]!;
    const prevLow = lows[i - 1]!;
    const prevClose = closes[i - 1]!;
    
    // True Range
    tr.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    ));
    
    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Smoothed averages
  const smoothTR = wilderSmooth(tr, period);
  const smoothPlusDM = wilderSmooth(plusDM, period);
  const smoothMinusDM = wilderSmooth(minusDM, period);
  
  const lastTR = smoothTR[smoothTR.length - 1] || 1;
  const lastPlusDM = smoothPlusDM[smoothPlusDM.length - 1] || 0;
  const lastMinusDM = smoothMinusDM[smoothMinusDM.length - 1] || 0;
  
  const plusDI = lastTR > 0 ? (lastPlusDM / lastTR) * 100 : 0;
  const minusDI = lastTR > 0 ? (lastMinusDM / lastTR) * 100 : 0;
  
  const dx = plusDI + minusDI > 0 
    ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 
    : 0;
  
  // ADX is smoothed DX
  const dxValues: number[] = [];
  for (let i = period; i < tr.length; i++) {
    const trSlice = smoothTR.slice(i - period + 1, i + 1);
    const plusSlice = smoothPlusDM.slice(i - period + 1, i + 1);
    const minusSlice = smoothMinusDM.slice(i - period + 1, i + 1);
    
    const avgTR = trSlice.reduce((a, b) => a + b, 0) / period;
    const avgPlus = plusSlice.reduce((a, b) => a + b, 0) / period;
    const avgMinus = minusSlice.reduce((a, b) => a + b, 0) / period;
    
    const pdi = avgTR > 0 ? (avgPlus / avgTR) * 100 : 0;
    const mdi = avgTR > 0 ? (avgMinus / avgTR) * 100 : 0;
    
    dxValues.push(pdi + mdi > 0 ? Math.abs(pdi - mdi) / (pdi + mdi) * 100 : 0);
  }
  
  const adxValue = dxValues.length > 0 
    ? dxValues.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, dxValues.length)
    : dx;
  
  return { adx: adxValue, plusDI, minusDI };
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

/**
 * Volatility Clustering - Detect high/low volatility regimes
 */
export function volatilityClustering(returns: number[], lookback: number = 20): number {
  if (returns.length < lookback * 2) return 1;
  
  const recentReturns = returns.slice(-lookback);
  const historicalReturns = returns.slice(0, -lookback);
  
  const recentVol = standardDeviation(recentReturns);
  const historicalVol = standardDeviation(historicalReturns);
  
  return historicalVol > 0 ? recentVol / historicalVol : 1;
}

// ============================================================================
// MEAN REVERSION INDICATORS
// ============================================================================

/**
 * Z-Score - Standard deviations from mean
 */
export function zScore(value: number, mean: number, stdDev: number): number {
  return stdDev > 0 ? (value - mean) / stdDev : 0;
}

/**
 * Rolling Z-Score for a price series
 */
export function rollingZScore(prices: number[], period: number = 20): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(0);
      continue;
    }
    
    const window = prices.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const std = standardDeviation(window);
    
    result.push(zScore(prices[i]!, mean, std));
  }
  
  return result;
}

/**
 * Autocorrelation - Correlation of series with lagged version
 * Negative = mean-reverting, Positive = trending
 */
export function autocorrelation(prices: number[], lag: number = 1): number {
  const n = prices.length;
  if (n < lag + 10) return 0;
  
  const mean = prices.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n - lag; i++) {
    numerator += (prices[i]! - mean) * (prices[i + lag]! - mean);
  }
  
  for (let i = 0; i < n; i++) {
    denominator += Math.pow(prices[i]! - mean, 2);
  }
  
  return denominator > 0 ? numerator / denominator : 0;
}

// ============================================================================
// MOMENTUM INDICATORS
// ============================================================================

/**
 * Rate of Change (ROC) - Momentum indicator
 */
export function roc(prices: number[], period: number = 10): number {
  if (prices.length < period + 1) return 0;
  
  const current = prices[prices.length - 1]!;
  const past = prices[prices.length - 1 - period]!;
  
  return past > 0 ? ((current - past) / past) * 100 : 0;
}

/**
 * Momentum Factor - Normalized momentum score
 */
export function momentumFactor(prices: number[], shortPeriod: number = 10, longPeriod: number = 30): number {
  const shortROC = roc(prices, shortPeriod);
  const longROC = roc(prices, longPeriod);
  
  // Combine short and long momentum
  return (shortROC * 0.6 + longROC * 0.4) / 100;
}

// ============================================================================
// RISK METRICS
// ============================================================================

/**
 * Maximum Adverse Excursion (MAE) - Worst drawdown during trades
 */
export function maxAdverseExcursion(
  trades: Array<{ entryPrice: number; exitPrice: number; side: 'long' | 'short'; lowestPrice?: number; highestPrice?: number }>
): number {
  if (trades.length === 0) return 0;
  
  let maxMAE = 0;
  
  for (const trade of trades) {
    let mae = 0;
    
    if (trade.side === 'long' && trade.lowestPrice) {
      mae = (trade.entryPrice - trade.lowestPrice) / trade.entryPrice;
    } else if (trade.side === 'short' && trade.highestPrice) {
      mae = (trade.highestPrice - trade.entryPrice) / trade.entryPrice;
    }
    
    maxMAE = Math.max(maxMAE, mae);
  }
  
  return maxMAE * 100;
}

/**
 * Skewness - Asymmetry of return distribution
 * Negative = more large losses, Positive = more large gains
 */
export function skewness(returns: number[]): number {
  const n = returns.length;
  if (n < 3) return 0;
  
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const std = standardDeviation(returns);
  
  if (std === 0) return 0;
  
  const m3 = returns.reduce((s, r) => s + Math.pow((r - mean) / std, 3), 0) / n;
  
  return m3;
}

/**
 * Kurtosis - Fat tails in distribution
 * > 3 = fat tails (more extreme events)
 */
export function kurtosis(returns: number[]): number {
  const n = returns.length;
  if (n < 4) return 3;
  
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const std = standardDeviation(returns);
  
  if (std === 0) return 3;
  
  const m4 = returns.reduce((s, r) => s + Math.pow((r - mean) / std, 4), 0) / n;
  
  return m4;
}

/**
 * Omega Ratio - Probability weighted ratio of gains vs losses
 */
export function omegaRatio(returns: number[], threshold: number = 0): number {
  const gains = returns.filter(r => r > threshold).reduce((a, b) => a + (b - threshold), 0);
  const losses = returns.filter(r => r < threshold).reduce((a, b) => a + (threshold - b), 0);
  
  return losses > 0 ? gains / losses : gains > 0 ? Infinity : 1;
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

/**
 * Expectancy - Expected value per trade
 */
export function expectancy(winRate: number, avgWin: number, avgLoss: number): number {
  return (winRate * avgWin) - ((1 - winRate) * avgLoss);
}

/**
 * Information Ratio - Risk-adjusted excess return vs benchmark
 */
export function informationRatio(returns: number[], benchmarkReturns: number[]): number {
  if (returns.length !== benchmarkReturns.length || returns.length === 0) return 0;
  
  const excessReturns = returns.map((r, i) => r - benchmarkReturns[i]!);
  const meanExcess = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
  const trackingError = standardDeviation(excessReturns);
  
  return trackingError > 0 ? meanExcess / trackingError : 0;
}

/**
 * Sharpe Ratio
 */
export function sharpeRatio(returns: number[], riskFreeRate: number = 0.05): number {
  if (returns.length === 0) return 0;
  
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualizedReturn = meanReturn * 252; // Daily to annual
  const annualizedVol = standardDeviation(returns) * Math.sqrt(252);
  
  return annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;
}

/**
 * Sortino Ratio - Like Sharpe but only penalizes downside
 */
export function sortinoRatio(returns: number[], riskFreeRate: number = 0.05): number {
  if (returns.length === 0) return 0;
  
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualizedReturn = meanReturn * 252;
  
  const negativeReturns = returns.filter(r => r < 0);
  const downsideVol = negativeReturns.length > 0 
    ? Math.sqrt(negativeReturns.reduce((s, r) => s + r * r, 0) / negativeReturns.length) * Math.sqrt(252)
    : 0;
  
  return downsideVol > 0 ? (annualizedReturn - riskFreeRate) / downsideVol : 0;
}

/**
 * Calmar Ratio - Return / Max Drawdown
 */
export function calmarRatio(annualizedReturn: number, maxDrawdown: number): number {
  return maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  
  return Math.sqrt(variance);
}

// ============================================================================
// MARKET MICROSTRUCTURE
// ============================================================================

/**
 * Order Book Imbalance - Ratio of bid vs ask volume
 * > 0.6 = buying pressure, < 0.4 = selling pressure
 */
export function orderBookImbalance(
  bids: Array<{ price: number; size: number }>,
  asks: Array<{ price: number; size: number }>,
  levels: number = 5
): number {
  const bidVolume = bids.slice(0, levels).reduce((s, b) => s + b.size, 0);
  const askVolume = asks.slice(0, levels).reduce((s, a) => s + a.size, 0);
  const total = bidVolume + askVolume;
  
  return total > 0 ? bidVolume / total : 0.5;
}

/**
 * Spread Analysis
 */
export function spreadAnalysis(
  bestBid: number,
  bestAsk: number,
  midPrice: number
): { spreadPct: number; spreadBps: number } {
  const spread = bestAsk - bestBid;
  const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;
  const spreadBps = spreadPct * 100; // Basis points
  
  return { spreadPct, spreadBps };
}

/**
 * VWAP (Volume Weighted Average Price)
 */
export function vwap(
  prices: number[],
  volumes: number[]
): number {
  if (prices.length !== volumes.length || prices.length === 0) return 0;
  
  let sumPV = 0;
  let sumV = 0;
  
  for (let i = 0; i < prices.length; i++) {
    sumPV += prices[i]! * volumes[i]!;
    sumV += volumes[i]!;
  }
  
  return sumV > 0 ? sumPV / sumV : 0;
}

/**
 * Volume Profile - Distribution of volume at price levels
 */
export function volumeProfile(
  candles: Array<{ high: number; low: number; close: number; volume: number }>,
  buckets: number = 20
): Array<{ price: number; volume: number; pct: number }> {
  if (candles.length === 0) return [];
  
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const range = maxPrice - minPrice;
  const bucketSize = range / buckets;
  
  const profile: Map<number, number> = new Map();
  let totalVolume = 0;
  
  for (const candle of candles) {
    const avgPrice = (candle.high + candle.low + candle.close) / 3;
    const bucket = Math.floor((avgPrice - minPrice) / bucketSize);
    const bucketPrice = minPrice + bucket * bucketSize + bucketSize / 2;
    
    profile.set(bucketPrice, (profile.get(bucketPrice) || 0) + candle.volume);
    totalVolume += candle.volume;
  }
  
  return Array.from(profile.entries())
    .map(([price, volume]) => ({
      price,
      volume,
      pct: totalVolume > 0 ? (volume / totalVolume) * 100 : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const QuantIndicators = {
  // Position Sizing
  kellyPositionSize,
  valueAtRisk,
  conditionalVaR,
  
  // Regime Detection
  hurstExponent,
  adx,
  volatilityClustering,
  
  // Mean Reversion
  zScore,
  rollingZScore,
  autocorrelation,
  
  // Momentum
  roc,
  momentumFactor,
  
  // Risk Metrics
  maxAdverseExcursion,
  skewness,
  kurtosis,
  omegaRatio,
  
  // Performance
  expectancy,
  informationRatio,
  sharpeRatio,
  sortinoRatio,
  calmarRatio,
  
  // Market Microstructure
  orderBookImbalance,
  spreadAnalysis,
  vwap,
  volumeProfile,
};

export default QuantIndicators;
