/**
 * QUANTITATIVE TRADING ENGINE
 * 
 * Professional-grade quantitative analysis tools including:
 * 1. Kelly Criterion - Optimal position sizing
 * 2. Z-Score - Mean reversion signals
 * 3. Sharpe/Sortino Ratios - Risk-adjusted performance
 * 4. Max Drawdown Protection - Capital preservation
 * 5. Volatility-Adjusted Sizing - ATR-based position sizing
 * 6. VWAP Execution - Volume-weighted execution
 * 7. Order Flow Delta - Institutional activity detection
 * 8. Pairs Trading - Multi-asset correlation trading (dynamic pairs from settings)
 * 9. ML Features - Feature extraction for machine learning
 */

// ============================================================================
// SECTION 1: KELLY CRITERION - OPTIMAL POSITION SIZING
// ============================================================================

export interface KellyResult {
  kellyFraction: number;
  halfKelly: number;
  quarterKelly: number;
  recommendedRiskPct: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
}

export interface TradeRecord {
  pnl: number;
  pnlPct: number;
  timestamp: number;
  symbol: string;
}

const tradeRecords: TradeRecord[] = [];
const MAX_TRADE_RECORDS = 100;

export function recordTradeForKelly(pnl: number, pnlPct: number, symbol: string): void {
  tradeRecords.unshift({ pnl, pnlPct, timestamp: Date.now(), symbol });
  if (tradeRecords.length > MAX_TRADE_RECORDS) tradeRecords.pop();
}

export function calculateKellyCriterion(minTrades: number = 20): KellyResult {
  const defaultResult: KellyResult = {
    kellyFraction: 0.02, halfKelly: 0.01, quarterKelly: 0.005,
    recommendedRiskPct: 1, winRate: 0.5, avgWin: 0, avgLoss: 0, expectancy: 0,
  };
  
  if (tradeRecords.length < minTrades) {
    return defaultResult;
  }
  
  const wins = tradeRecords.filter(t => t.pnlPct > 0);
  const losses = tradeRecords.filter(t => t.pnlPct <= 0);
  
  if (wins.length === 0 || losses.length === 0) return defaultResult;
  
  const winRate = wins.length / tradeRecords.length;
  const avgWin = wins.reduce((sum, t) => sum + t.pnlPct, 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnlPct, 0) / losses.length);
  
  if (avgLoss === 0) return defaultResult;
  
  const b = avgWin / avgLoss; // Odds ratio
  const p = winRate;
  const q = 1 - p;
  
  // Kelly formula: f* = (bp - q) / b
  let kellyFraction = (b * p - q) / b;
  kellyFraction = Math.max(0, Math.min(0.25, kellyFraction)); // Cap at 25%
  
  const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);
  
  return {
    kellyFraction,
    halfKelly: kellyFraction / 2,
    quarterKelly: kellyFraction / 4,
    recommendedRiskPct: Math.max(0.5, Math.min(5, kellyFraction * 100 / 2)),
    winRate, avgWin, avgLoss, expectancy,
  };
}

// ============================================================================
// SECTION 2: Z-SCORE - MEAN REVERSION SIGNALS
// ============================================================================

export interface ZScoreResult {
  zScore: number;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  deviation: number;
  mean: number;
  stdDev: number;
  percentile: number;
}

export function calculateZScore(prices: number[], lookback: number = 20): ZScoreResult {
  if (prices.length < lookback) {
    return { zScore: 0, signal: 'neutral', deviation: 0, mean: 0, stdDev: 0, percentile: 50 };
  }
  
  const recentPrices = prices.slice(-lookback);
  const currentPrice = prices[prices.length - 1];
  
  const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / recentPrices.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) {
    return { zScore: 0, signal: 'neutral', deviation: 0, mean, stdDev: 0, percentile: 50 };
  }
  
  const zScore = (currentPrice - mean) / stdDev;
  const deviation = currentPrice - mean;
  
  // Calculate percentile using normal distribution approximation
  const percentile = 50 + 50 * Math.tanh(zScore * 0.7);
  
  let signal: ZScoreResult['signal'] = 'neutral';
  if (zScore <= -2.5) signal = 'strong_buy';
  else if (zScore <= -1.5) signal = 'buy';
  else if (zScore >= 2.5) signal = 'strong_sell';
  else if (zScore >= 1.5) signal = 'sell';
  
  return { zScore, signal, deviation, mean, stdDev, percentile };
}

// ============================================================================
// SECTION 3: SHARPE & SORTINO RATIOS - RISK-ADJUSTED PERFORMANCE
// ============================================================================

export interface PerformanceMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  profitFactor: number;
  winRate: number;
  avgReturn: number;
  volatility: number;
  downsideVolatility: number;
  maxDrawdown: number;
  totalReturn: number;
  tradesCount: number;
}

const dailyReturns: number[] = [];
const MAX_DAILY_RETURNS = 365;

export function recordDailyReturn(returnPct: number): void {
  dailyReturns.unshift(returnPct);
  if (dailyReturns.length > MAX_DAILY_RETURNS) dailyReturns.pop();
}

export function calculatePerformanceMetrics(riskFreeRate: number = 0): PerformanceMetrics {
  const defaultMetrics: PerformanceMetrics = {
    sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0, profitFactor: 1,
    winRate: 0, avgReturn: 0, volatility: 0, downsideVolatility: 0,
    maxDrawdown: 0, totalReturn: 0, tradesCount: tradeRecords.length,
  };
  
  if (tradeRecords.length < 10) return defaultMetrics;
  
  const returns = tradeRecords.map(t => t.pnlPct);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const totalReturn = returns.reduce((a, b) => a + b, 0);
  
  // Volatility (standard deviation of returns)
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance);
  
  // Downside volatility (only negative returns)
  const negativeReturns = returns.filter(r => r < 0);
  const downsideVariance = negativeReturns.length > 0
    ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
    : 0;
  const downsideVolatility = Math.sqrt(downsideVariance);
  
  // Sharpe Ratio: (Return - RiskFree) / Volatility
  const sharpeRatio = volatility > 0 ? (avgReturn - riskFreeRate) / volatility : 0;
  
  // Sortino Ratio: (Return - RiskFree) / Downside Volatility
  const sortinoRatio = downsideVolatility > 0 ? (avgReturn - riskFreeRate) / downsideVolatility : 0;
  
  // Max Drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let cumReturn = 0;
  for (const r of returns.reverse()) {
    cumReturn += r;
    if (cumReturn > peak) peak = cumReturn;
    const drawdown = peak - cumReturn;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // Calmar Ratio: Annual Return / Max Drawdown
  const calmarRatio = maxDrawdown > 0 ? (avgReturn * 252) / maxDrawdown : 0;
  
  // Profit Factor
  const grossProfit = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 1;
  
  // Win Rate
  const winRate = returns.filter(r => r > 0).length / returns.length;
  
  return {
    sharpeRatio, sortinoRatio, calmarRatio, profitFactor,
    winRate, avgReturn, volatility, downsideVolatility,
    maxDrawdown, totalReturn, tradesCount: tradeRecords.length,
  };
}

// ============================================================================
// SECTION 4: MAX DRAWDOWN PROTECTION
// ============================================================================

export interface DrawdownState {
  currentDrawdown: number;
  maxDrawdown: number;
  peakEquity: number;
  currentEquity: number;
  drawdownPct: number;
  isInDrawdown: boolean;
  shouldReduceSize: boolean;
  shouldPause: boolean;
  sizeMultiplier: number;
}

let peakEquity = 0;
let maxHistoricalDrawdown = 0;

export function updateDrawdownState(currentEquity: number, maxAllowedDrawdown: number = 10): DrawdownState {
  if (currentEquity > peakEquity) {
    peakEquity = currentEquity;
  }
  
  const currentDrawdown = peakEquity - currentEquity;
  const drawdownPct = peakEquity > 0 ? (currentDrawdown / peakEquity) * 100 : 0;
  
  if (drawdownPct > maxHistoricalDrawdown) {
    maxHistoricalDrawdown = drawdownPct;
  }
  
  const isInDrawdown = drawdownPct > 2;
  const shouldReduceSize = drawdownPct > 5;
  const shouldPause = drawdownPct >= maxAllowedDrawdown;
  
  // Dynamic size multiplier based on drawdown
  let sizeMultiplier = 1.0;
  if (drawdownPct > 2) sizeMultiplier = 0.8;
  if (drawdownPct > 5) sizeMultiplier = 0.5;
  if (drawdownPct > 8) sizeMultiplier = 0.25;
  if (drawdownPct >= maxAllowedDrawdown) sizeMultiplier = 0;
  
  return {
    currentDrawdown,
    maxDrawdown: maxHistoricalDrawdown,
    peakEquity,
    currentEquity,
    drawdownPct,
    isInDrawdown,
    shouldReduceSize,
    shouldPause,
    sizeMultiplier,
  };
}

export function resetDrawdownTracking(equity: number): void {
  peakEquity = equity;
  maxHistoricalDrawdown = 0;
}

// ============================================================================
// SECTION 5: VOLATILITY-ADJUSTED POSITION SIZING
// ============================================================================

export interface VolatilityPositionSize {
  positionSize: number;
  notional: number;
  riskAmount: number;
  atrValue: number;
  atrPct: number;
  volatilityMultiplier: number;
  stopDistance: number;
}

export function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  
  const recentTRs = trueRanges.slice(-period);
  return recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length;
}

export function calculateVolatilityAdjustedSize(
  equity: number,
  riskPct: number,
  currentPrice: number,
  atr: number,
  atrMultiplier: number = 2.0
): VolatilityPositionSize {
  const riskAmount = equity * (riskPct / 100);
  const stopDistance = atr * atrMultiplier;
  const atrPct = (atr / currentPrice) * 100;
  
  // Volatility multiplier: reduce size in high volatility
  let volatilityMultiplier = 1.0;
  if (atrPct > 5) volatilityMultiplier = 0.5;
  else if (atrPct > 3) volatilityMultiplier = 0.7;
  else if (atrPct > 2) volatilityMultiplier = 0.85;
  else if (atrPct < 1) volatilityMultiplier = 1.2; // Increase in low vol
  
  // Position size = Risk Amount / Stop Distance
  const rawPositionSize = riskAmount / stopDistance;
  const adjustedPositionSize = rawPositionSize * volatilityMultiplier;
  const notional = adjustedPositionSize * currentPrice;
  
  return {
    positionSize: adjustedPositionSize,
    notional,
    riskAmount,
    atrValue: atr,
    atrPct,
    volatilityMultiplier,
    stopDistance,
  };
}

// ============================================================================
// SECTION 6: VWAP EXECUTION
// ============================================================================

export interface VWAPData {
  vwap: number;
  upperBand: number;
  lowerBand: number;
  deviation: number;
  priceVsVwap: 'above' | 'below' | 'at';
  signal: 'buy' | 'sell' | 'neutral';
  cumulativeVolume: number;
}

export function calculateVWAP(
  prices: number[],
  volumes: number[],
  stdDevMultiplier: number = 2
): VWAPData {
  if (prices.length === 0 || volumes.length === 0) {
    return {
      vwap: 0, upperBand: 0, lowerBand: 0, deviation: 0,
      priceVsVwap: 'at', signal: 'neutral', cumulativeVolume: 0,
    };
  }
  
  const len = Math.min(prices.length, volumes.length);
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < len; i++) {
    cumulativePV += prices[i] * volumes[i];
    cumulativeVolume += volumes[i];
  }
  
  const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : prices[prices.length - 1];
  
  // Calculate standard deviation from VWAP
  let sumSquaredDev = 0;
  for (let i = 0; i < len; i++) {
    sumSquaredDev += Math.pow(prices[i] - vwap, 2) * volumes[i];
  }
  const variance = cumulativeVolume > 0 ? sumSquaredDev / cumulativeVolume : 0;
  const stdDev = Math.sqrt(variance);
  
  const upperBand = vwap + (stdDev * stdDevMultiplier);
  const lowerBand = vwap - (stdDev * stdDevMultiplier);
  
  const currentPrice = prices[prices.length - 1];
  const deviation = ((currentPrice - vwap) / vwap) * 100;
  
  let priceVsVwap: VWAPData['priceVsVwap'] = 'at';
  if (currentPrice > vwap * 1.001) priceVsVwap = 'above';
  else if (currentPrice < vwap * 0.999) priceVsVwap = 'below';
  
  let signal: VWAPData['signal'] = 'neutral';
  if (currentPrice <= lowerBand) signal = 'buy';
  else if (currentPrice >= upperBand) signal = 'sell';
  
  return { vwap, upperBand, lowerBand, deviation, priceVsVwap, signal, cumulativeVolume };
}

export interface VWAPExecutionPlan {
  slices: number;
  intervalMs: number;
  sizePerSlice: number;
  totalSize: number;
  estimatedVwap: number;
}

export function createVWAPExecutionPlan(
  totalSize: number,
  executionTimeMs: number = 300000, // 5 minutes default
  minSlices: number = 5,
  maxSlices: number = 20
): VWAPExecutionPlan {
  const slices = Math.min(maxSlices, Math.max(minSlices, Math.ceil(totalSize * 10)));
  const intervalMs = executionTimeMs / slices;
  const sizePerSlice = totalSize / slices;
  
  return {
    slices,
    intervalMs,
    sizePerSlice,
    totalSize,
    estimatedVwap: 0, // Will be updated during execution
  };
}

// ============================================================================
// SECTION 7: ORDER FLOW DELTA ANALYSIS
// ============================================================================

export interface OrderFlowDelta {
  delta: number;
  cumulativeDelta: number;
  deltaPercent: number;
  buyVolume: number;
  sellVolume: number;
  imbalance: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  institutionalActivity: boolean;
  largeOrdersDetected: number;
}

const cumulativeDeltaHistory: number[] = [];

export function analyzeOrderFlow(
  bids: Array<{ price: number; size: number }>,
  asks: Array<{ price: number; size: number }>,
  recentTrades?: Array<{ price: number; size: number; side: 'buy' | 'sell' }>
): OrderFlowDelta {
  // Calculate bid/ask volume
  const bidVolume = bids.reduce((sum, b) => sum + b.size, 0);
  const askVolume = asks.reduce((sum, a) => sum + a.size, 0);
  
  // Delta = Buy Volume - Sell Volume
  const delta = bidVolume - askVolume;
  const totalVolume = bidVolume + askVolume;
  const deltaPercent = totalVolume > 0 ? (delta / totalVolume) * 100 : 0;
  
  // Update cumulative delta
  cumulativeDeltaHistory.push(delta);
  if (cumulativeDeltaHistory.length > 100) cumulativeDeltaHistory.shift();
  const cumulativeDelta = cumulativeDeltaHistory.reduce((a, b) => a + b, 0);
  
  // Detect imbalance
  let imbalance: OrderFlowDelta['imbalance'] = 'neutral';
  if (deltaPercent > 30) imbalance = 'strong_buy';
  else if (deltaPercent > 15) imbalance = 'buy';
  else if (deltaPercent < -30) imbalance = 'strong_sell';
  else if (deltaPercent < -15) imbalance = 'sell';
  
  // Detect large orders (institutional activity)
  const avgBidSize = bidVolume / Math.max(1, bids.length);
  const avgAskSize = askVolume / Math.max(1, asks.length);
  const largeThreshold = Math.max(avgBidSize, avgAskSize) * 5;
  
  let largeOrdersDetected = 0;
  for (const bid of bids) {
    if (bid.size > largeThreshold) largeOrdersDetected++;
  }
  for (const ask of asks) {
    if (ask.size > largeThreshold) largeOrdersDetected++;
  }
  
  const institutionalActivity = largeOrdersDetected >= 3 || Math.abs(deltaPercent) > 40;
  
  // Analyze recent trades if available
  let buyVolume = bidVolume;
  let sellVolume = askVolume;
  if (recentTrades && recentTrades.length > 0) {
    buyVolume = recentTrades.filter(t => t.side === 'buy').reduce((sum, t) => sum + t.size, 0);
    sellVolume = recentTrades.filter(t => t.side === 'sell').reduce((sum, t) => sum + t.size, 0);
  }
  
  return {
    delta, cumulativeDelta, deltaPercent, buyVolume, sellVolume,
    imbalance, institutionalActivity, largeOrdersDetected,
  };
}

// ============================================================================
// SECTION 8: PAIRS TRADING - MULTI-ASSET CORRELATION
// ============================================================================

export interface PairCorrelation {
  pair: [string, string];
  correlation: number;
  cointegrationScore: number;
  spread: number;
  spreadZScore: number;
  signal: 'long_a_short_b' | 'short_a_long_b' | 'neutral';
  hedgeRatio: number;
}

export interface PairsAnalysis {
  pairs: PairCorrelation[];
  bestPair: PairCorrelation | null;
  tradingOpportunities: PairCorrelation[];
}

// Store price history for each symbol
const priceHistoryMap: Map<string, number[]> = new Map();
const MAX_PRICE_HISTORY = 100;

export function updatePriceHistory(symbol: string, price: number): void {
  const history = priceHistoryMap.get(symbol) || [];
  history.push(price);
  if (history.length > MAX_PRICE_HISTORY) history.shift();
  priceHistoryMap.set(symbol, history);
}

function calculateCorrelation(pricesA: number[], pricesB: number[]): number {
  const len = Math.min(pricesA.length, pricesB.length);
  if (len < 20) return 0;
  
  const a = pricesA.slice(-len);
  const b = pricesB.slice(-len);
  
  const meanA = a.reduce((s, v) => s + v, 0) / len;
  const meanB = b.reduce((s, v) => s + v, 0) / len;
  
  let covariance = 0;
  let varA = 0;
  let varB = 0;
  
  for (let i = 0; i < len; i++) {
    const diffA = a[i] - meanA;
    const diffB = b[i] - meanB;
    covariance += diffA * diffB;
    varA += diffA * diffA;
    varB += diffB * diffB;
  }
  
  const stdA = Math.sqrt(varA / len);
  const stdB = Math.sqrt(varB / len);
  
  if (stdA === 0 || stdB === 0) return 0;
  
  return covariance / (len * stdA * stdB);
}

function calculateHedgeRatio(pricesA: number[], pricesB: number[]): number {
  const len = Math.min(pricesA.length, pricesB.length);
  if (len < 20) return 1;
  
  const a = pricesA.slice(-len);
  const b = pricesB.slice(-len);
  
  // Simple OLS regression: A = beta * B + alpha
  const meanA = a.reduce((s, v) => s + v, 0) / len;
  const meanB = b.reduce((s, v) => s + v, 0) / len;
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < len; i++) {
    numerator += (b[i] - meanB) * (a[i] - meanA);
    denominator += (b[i] - meanB) * (b[i] - meanB);
  }
  
  return denominator !== 0 ? numerator / denominator : 1;
}

function calculateSpreadZScore(pricesA: number[], pricesB: number[], hedgeRatio: number): { spread: number; zScore: number } {
  const len = Math.min(pricesA.length, pricesB.length);
  if (len < 20) return { spread: 0, zScore: 0 };
  
  const spreads: number[] = [];
  for (let i = 0; i < len; i++) {
    spreads.push(pricesA[pricesA.length - len + i] - hedgeRatio * pricesB[pricesB.length - len + i]);
  }
  
  const currentSpread = spreads[spreads.length - 1];
  const meanSpread = spreads.reduce((s, v) => s + v, 0) / spreads.length;
  const variance = spreads.reduce((s, v) => s + Math.pow(v - meanSpread, 2), 0) / spreads.length;
  const stdDev = Math.sqrt(variance);
  
  const zScore = stdDev > 0 ? (currentSpread - meanSpread) / stdDev : 0;
  
  return { spread: currentSpread, zScore };
}

// Simplified cointegration score (Hurst exponent approximation)
function calculateCointegrationScore(pricesA: number[], pricesB: number[], hedgeRatio: number): number {
  const len = Math.min(pricesA.length, pricesB.length);
  if (len < 30) return 0;
  
  const spreads: number[] = [];
  for (let i = 0; i < len; i++) {
    spreads.push(pricesA[pricesA.length - len + i] - hedgeRatio * pricesB[pricesB.length - len + i]);
  }
  
  // Calculate variance ratio (simplified Hurst exponent proxy)
  const halfLen = Math.floor(len / 2);
  const firstHalf = spreads.slice(0, halfLen);
  const secondHalf = spreads.slice(halfLen);
  
  const var1 = firstHalf.reduce((s, v, _, arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return s + Math.pow(v - mean, 2);
  }, 0) / halfLen;
  
  const var2 = secondHalf.reduce((s, v, _, arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return s + Math.pow(v - mean, 2);
  }, 0) / halfLen;
  
  // If variance is stable, more likely cointegrated
  const varianceRatio = var1 > 0 && var2 > 0 ? Math.min(var1, var2) / Math.max(var1, var2) : 0;
  
  return varianceRatio * 100; // 0-100 score
}

export function analyzePairs(symbols: string[]): PairsAnalysis {
  const pairs: PairCorrelation[] = [];
  
  // Generate all unique pairs
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const symbolA = symbols[i];
      const symbolB = symbols[j];
      
      const pricesA = priceHistoryMap.get(symbolA);
      const pricesB = priceHistoryMap.get(symbolB);
      
      if (!pricesA || !pricesB || pricesA.length < 20 || pricesB.length < 20) {
        continue;
      }
      
      const correlation = calculateCorrelation(pricesA, pricesB);
      const hedgeRatio = calculateHedgeRatio(pricesA, pricesB);
      const { spread, zScore } = calculateSpreadZScore(pricesA, pricesB, hedgeRatio);
      const cointegrationScore = calculateCointegrationScore(pricesA, pricesB, hedgeRatio);
      
      let signal: PairCorrelation['signal'] = 'neutral';
      if (zScore > 2) signal = 'short_a_long_b';
      else if (zScore < -2) signal = 'long_a_short_b';
      
      pairs.push({
        pair: [symbolA, symbolB],
        correlation,
        cointegrationScore,
        spread,
        spreadZScore: zScore,
        signal,
        hedgeRatio,
      });
    }
  }
  
  // Sort by cointegration score
  pairs.sort((a, b) => b.cointegrationScore - a.cointegrationScore);
  
  // Find trading opportunities (high correlation + extreme z-score)
  const tradingOpportunities = pairs.filter(p => 
    Math.abs(p.correlation) > 0.7 && 
    Math.abs(p.spreadZScore) > 1.5 &&
    p.cointegrationScore > 50
  );
  
  return {
    pairs,
    bestPair: pairs.length > 0 ? pairs[0] : null,
    tradingOpportunities,
  };
}

// ============================================================================
// SECTION 9: ML FEATURES EXTRACTION
// ============================================================================

export interface MLFeatures {
  // Price features
  priceChange1: number;
  priceChange5: number;
  priceChange10: number;
  priceChange20: number;
  
  // Momentum features
  rsi: number;
  macdHistogram: number;
  momentum: number;
  
  // Volatility features
  atrPct: number;
  bbWidth: number;
  volatility: number;
  
  // Volume features
  volumeChange: number;
  vwapDeviation: number;
  
  // Order flow features
  orderFlowDelta: number;
  bidAskImbalance: number;
  
  // Statistical features
  zScore: number;
  skewness: number;
  kurtosis: number;
  
  // Trend features
  trendStrength: number;
  trendDirection: number;
  
  // Time features
  hourOfDay: number;
  dayOfWeek: number;
  
  // Target (for training)
  futureReturn?: number;
}

export function extractMLFeatures(
  prices: number[],
  volumes: number[],
  orderBook: { bids: Array<{ size: number }>; asks: Array<{ size: number }> },
  indicators: {
    rsi?: number;
    macdHistogram?: number;
    atr?: number;
    bbWidth?: number;
  }
): MLFeatures {
  const len = prices.length;
  const currentPrice = prices[len - 1] || 0;
  
  // Price changes
  const priceChange1 = len > 1 ? ((currentPrice - prices[len - 2]) / prices[len - 2]) * 100 : 0;
  const priceChange5 = len > 5 ? ((currentPrice - prices[len - 6]) / prices[len - 6]) * 100 : 0;
  const priceChange10 = len > 10 ? ((currentPrice - prices[len - 11]) / prices[len - 11]) * 100 : 0;
  const priceChange20 = len > 20 ? ((currentPrice - prices[len - 21]) / prices[len - 21]) * 100 : 0;
  
  // Momentum
  const momentum = priceChange5;
  
  // Volatility
  const returns = [];
  for (let i = 1; i < Math.min(20, len); i++) {
    returns.push((prices[len - i] - prices[len - i - 1]) / prices[len - i - 1]);
  }
  const volatility = returns.length > 0 
    ? Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * 100 
    : 0;
  
  // Volume change
  const volumeLen = volumes.length;
  const recentVolume = volumeLen > 5 ? volumes.slice(-5).reduce((a, b) => a + b, 0) / 5 : 0;
  const olderVolume = volumeLen > 10 ? volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5 : recentVolume;
  const volumeChange = olderVolume > 0 ? ((recentVolume - olderVolume) / olderVolume) * 100 : 0;
  
  // Order flow
  const bidVolume = orderBook.bids.reduce((s, b) => s + b.size, 0);
  const askVolume = orderBook.asks.reduce((s, a) => s + a.size, 0);
  const totalVolume = bidVolume + askVolume;
  const orderFlowDelta = totalVolume > 0 ? ((bidVolume - askVolume) / totalVolume) * 100 : 0;
  const bidAskImbalance = askVolume > 0 ? bidVolume / askVolume : 1;
  
  // Z-Score
  const zScoreResult = calculateZScore(prices, 20);
  
  // Skewness and Kurtosis
  const mean = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
  const std = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / Math.max(1, returns.length));
  
  let skewness = 0;
  let kurtosis = 0;
  if (std > 0 && returns.length > 3) {
    skewness = returns.reduce((s, r) => s + Math.pow((r - mean) / std, 3), 0) / returns.length;
    kurtosis = returns.reduce((s, r) => s + Math.pow((r - mean) / std, 4), 0) / returns.length - 3;
  }
  
  // Trend
  const ema10 = len > 10 ? prices.slice(-10).reduce((a, b) => a + b, 0) / 10 : currentPrice;
  const ema20 = len > 20 ? prices.slice(-20).reduce((a, b) => a + b, 0) / 20 : currentPrice;
  const trendDirection = ema10 > ema20 ? 1 : ema10 < ema20 ? -1 : 0;
  const trendStrength = ema20 > 0 ? Math.abs((ema10 - ema20) / ema20) * 100 : 0;
  
  // Time features
  const now = new Date();
  const hourOfDay = now.getUTCHours();
  const dayOfWeek = now.getUTCDay();
  
  // VWAP deviation
  const vwapData = calculateVWAP(prices.slice(-20), volumes.slice(-20));
  
  return {
    priceChange1, priceChange5, priceChange10, priceChange20,
    rsi: indicators.rsi || 50,
    macdHistogram: indicators.macdHistogram || 0,
    momentum,
    atrPct: indicators.atr ? (indicators.atr / currentPrice) * 100 : volatility,
    bbWidth: indicators.bbWidth || volatility * 2,
    volatility,
    volumeChange,
    vwapDeviation: vwapData.deviation,
    orderFlowDelta,
    bidAskImbalance,
    zScore: zScoreResult.zScore,
    skewness,
    kurtosis,
    trendStrength,
    trendDirection,
    hourOfDay,
    dayOfWeek,
  };
}

// ============================================================================
// SECTION 10: UNIFIED QUANT SIGNAL
// ============================================================================

export interface QuantSignal {
  direction: 'long' | 'short' | 'neutral';
  strength: number; // 0-100
  confidence: number; // 0-100
  sources: string[];
  
  // Position sizing
  recommendedSizePct: number;
  kellyFraction: number;
  volatilityMultiplier: number;
  drawdownMultiplier: number;
  
  // Risk management
  suggestedStopPct: number;
  suggestedTakeProfitPct: number;
  riskRewardRatio: number;
  
  // Performance context
  sharpeRatio: number;
  currentDrawdownPct: number;
  
  // Warnings
  warnings: string[];
}

export function generateQuantSignal(
  symbol: string,
  prices: number[],
  volumes: number[],
  orderBook: { bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }> },
  equity: number,
  baseRiskPct: number = 2,
  indicators?: { rsi?: number; macdHistogram?: number; atr?: number; bbWidth?: number }
): QuantSignal {
  const warnings: string[] = [];
  const sources: string[] = [];
  let longScore = 0;
  let shortScore = 0;
  
  // 1. Z-Score signal
  const zScore = calculateZScore(prices, 20);
  if (zScore.signal === 'strong_buy') { longScore += 30; sources.push('Z-Score strong buy'); }
  else if (zScore.signal === 'buy') { longScore += 15; sources.push('Z-Score buy'); }
  else if (zScore.signal === 'strong_sell') { shortScore += 30; sources.push('Z-Score strong sell'); }
  else if (zScore.signal === 'sell') { shortScore += 15; sources.push('Z-Score sell'); }
  
  // 2. VWAP signal
  const vwap = calculateVWAP(prices.slice(-50), volumes.slice(-50));
  if (vwap.signal === 'buy') { longScore += 20; sources.push('VWAP buy'); }
  else if (vwap.signal === 'sell') { shortScore += 20; sources.push('VWAP sell'); }
  
  // 3. Order flow signal
  const orderFlow = analyzeOrderFlow(orderBook.bids, orderBook.asks);
  if (orderFlow.imbalance === 'strong_buy') { longScore += 25; sources.push('Order flow strong buy'); }
  else if (orderFlow.imbalance === 'buy') { longScore += 12; sources.push('Order flow buy'); }
  else if (orderFlow.imbalance === 'strong_sell') { shortScore += 25; sources.push('Order flow strong sell'); }
  else if (orderFlow.imbalance === 'sell') { shortScore += 12; sources.push('Order flow sell'); }
  
  if (orderFlow.institutionalActivity) {
    warnings.push('Institutional activity detected');
  }
  
  // 4. Kelly criterion for sizing
  const kelly = calculateKellyCriterion();
  
  // 5. Drawdown state
  const drawdown = updateDrawdownState(equity);
  if (drawdown.shouldPause) {
    warnings.push(`Max drawdown reached (${drawdown.drawdownPct.toFixed(1)}%)`);
  } else if (drawdown.shouldReduceSize) {
    warnings.push(`In drawdown (${drawdown.drawdownPct.toFixed(1)}%), reducing size`);
  }
  
  // 6. Volatility sizing
  const currentPrice = prices[prices.length - 1];
  const atr = indicators?.atr || (currentPrice * 0.02); // Default 2% if no ATR
  const volSize = calculateVolatilityAdjustedSize(equity, baseRiskPct, currentPrice, atr);
  
  // 7. Performance metrics
  const performance = calculatePerformanceMetrics();
  
  // Determine direction
  let direction: QuantSignal['direction'] = 'neutral';
  const netScore = longScore - shortScore;
  if (netScore > 20) direction = 'long';
  else if (netScore < -20) direction = 'short';
  
  const strength = Math.min(100, Math.abs(netScore));
  const confidence = Math.min(100, sources.length * 20 + strength / 2);
  
  // Calculate recommended size
  const kellyMultiplier = kelly.halfKelly > 0 ? Math.min(1.5, kelly.halfKelly / 0.01) : 1;
  const recommendedSizePct = baseRiskPct * kellyMultiplier * volSize.volatilityMultiplier * drawdown.sizeMultiplier;
  
  // Risk management
  const suggestedStopPct = volSize.atrPct * 1.5;
  const suggestedTakeProfitPct = suggestedStopPct * 2; // 2:1 R:R minimum
  const riskRewardRatio = suggestedTakeProfitPct / suggestedStopPct;
  
  return {
    direction,
    strength,
    confidence,
    sources,
    recommendedSizePct: Math.max(0.5, Math.min(5, recommendedSizePct)),
    kellyFraction: kelly.halfKelly,
    volatilityMultiplier: volSize.volatilityMultiplier,
    drawdownMultiplier: drawdown.sizeMultiplier,
    suggestedStopPct,
    suggestedTakeProfitPct,
    riskRewardRatio,
    sharpeRatio: performance.sharpeRatio,
    currentDrawdownPct: drawdown.drawdownPct,
    warnings,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Kelly Criterion
  recordTradeForKelly,
  calculateKellyCriterion,
  
  // Z-Score
  calculateZScore,
  
  // Performance Metrics
  recordDailyReturn,
  calculatePerformanceMetrics,
  
  // Drawdown
  updateDrawdownState,
  resetDrawdownTracking,
  
  // Volatility Sizing
  calculateATR,
  calculateVolatilityAdjustedSize,
  
  // VWAP
  calculateVWAP,
  createVWAPExecutionPlan,
  
  // Order Flow
  analyzeOrderFlow,
  
  // Pairs Trading
  updatePriceHistory,
  analyzePairs,
  
  // ML Features
  extractMLFeatures,
  
  // Unified Signal
  generateQuantSignal,
};
