/**
 * ADVANCED MARKET ANALYSIS MODULE
 * 
 * Professional-grade analysis tools including:
 * 1. Funding Rate Strategy - Exploit extreme funding rates
 * 2. Open Interest Analysis - Detect overleveraged positions
 * 3. Liquidation Heatmap - Identify liquidation zones
 * 4. Multi-Timeframe Confluence - Align signals across timeframes
 * 5. Dynamic Wallet-Based Sizing - Adapt to account size
 */

const HL_API = 'https://api.hyperliquid.xyz/info';

// ============================================================================
// SECTION 1: FUNDING RATE STRATEGY
// ============================================================================

export interface FundingRateData {
  coin: string;
  currentFunding: number;
  predictedFunding: number;
  annualizedRate: number;
  fundingDirection: 'positive' | 'negative' | 'neutral';
  isExtreme: boolean;
  signal: 'long' | 'short' | 'neutral';
  strength: number;
  historicalAvg: number;
  deviation: number;
}

export interface FundingHistory {
  time: number;
  funding: number;
  premium: number;
}

const fundingHistoryMap: Map<string, FundingHistory[]> = new Map();
const MAX_FUNDING_HISTORY = 168;

export async function fetchFundingData(coin: string): Promise<FundingRateData | null> {
  try {
    const metaRes = await fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    
    const [meta, assetCtxs] = await metaRes.json() as [any, any[]];
    const coinIndex = meta.universe.findIndex((u: any) => u.name === coin);
    
    if (coinIndex === -1 || !assetCtxs[coinIndex]) {
      return null;
    }
    
    const ctx = assetCtxs[coinIndex];
    const currentFunding = parseFloat(ctx.funding || '0');
    
    let predictedFunding = currentFunding;
    try {
      const predRes = await fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'predictedFundings' }),
      });
      const predictions = await predRes.json() as any[];
      const coinPred = predictions.find((p: any) => p.coin === coin);
      if (coinPred) {
        predictedFunding = parseFloat(coinPred.predictedFunding || currentFunding);
      }
    } catch (e) {}
    
    const now = Date.now();
    const startTime = now - 7 * 24 * 60 * 60 * 1000;
    
    try {
      const histRes = await fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'fundingHistory', coin, startTime }),
      });
      const history = await histRes.json() as any[];
      
      if (history && history.length > 0) {
        const fundingHistory: FundingHistory[] = history.map((h: any) => ({
          time: h.time,
          funding: parseFloat(h.fundingRate || '0'),
          premium: parseFloat(h.premium || '0'),
        }));
        fundingHistoryMap.set(coin, fundingHistory.slice(-MAX_FUNDING_HISTORY));
      }
    } catch (e) {}
    
    const history = fundingHistoryMap.get(coin) || [];
    const historicalRates = history.map(h => h.funding);
    const historicalAvg = historicalRates.length > 0 
      ? historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length 
      : 0;
    
    const variance = historicalRates.length > 1
      ? historicalRates.reduce((sum, r) => sum + Math.pow(r - historicalAvg, 2), 0) / historicalRates.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const deviation = stdDev > 0 ? (currentFunding - historicalAvg) / stdDev : 0;
    
    const annualizedRate = currentFunding * 8760 * 100;
    const isExtreme = Math.abs(currentFunding) > 0.0001;
    
    let fundingDirection: FundingRateData['fundingDirection'] = 'neutral';
    if (currentFunding > 0.00005) fundingDirection = 'positive';
    else if (currentFunding < -0.00005) fundingDirection = 'negative';
    
    let signal: FundingRateData['signal'] = 'neutral';
    let strength = 0;
    
    if (currentFunding > 0.0002) {
      signal = 'short';
      strength = Math.min(100, Math.abs(deviation) * 20 + 30);
    } else if (currentFunding > 0.0001) {
      signal = 'short';
      strength = Math.min(70, Math.abs(deviation) * 15 + 20);
    } else if (currentFunding < -0.0002) {
      signal = 'long';
      strength = Math.min(100, Math.abs(deviation) * 20 + 30);
    } else if (currentFunding < -0.0001) {
      signal = 'long';
      strength = Math.min(70, Math.abs(deviation) * 15 + 20);
    }
    
    return {
      coin,
      currentFunding,
      predictedFunding,
      annualizedRate,
      fundingDirection,
      isExtreme,
      signal,
      strength,
      historicalAvg,
      deviation,
    };
  } catch (error) {
    console.error(`[FundingRate] Error fetching data for ${coin}:`, error);
    return null;
  }
}

// ============================================================================
// SECTION 2: OPEN INTEREST ANALYSIS
// ============================================================================

export interface OpenInterestData {
  coin: string;
  openInterest: number;
  openInterestChange24h: number;
  oiToVolume: number;
  isOverleveraged: boolean;
  signal: 'long' | 'short' | 'neutral';
  strength: number;
  longShortRatio: number;
  crowdedSide: 'long' | 'short' | 'balanced';
}

const oiHistoryMap: Map<string, { time: number; oi: number }[]> = new Map();
const MAX_OI_HISTORY = 288;

export async function fetchOpenInterestData(coin: string): Promise<OpenInterestData | null> {
  try {
    const metaRes = await fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    
    const [meta, assetCtxs] = await metaRes.json() as [any, any[]];
    const coinIndex = meta.universe.findIndex((u: any) => u.name === coin);
    
    if (coinIndex === -1 || !assetCtxs[coinIndex]) {
      return null;
    }
    
    const ctx = assetCtxs[coinIndex];
    const openInterest = parseFloat(ctx.openInterest || '0');
    const dayVolume = parseFloat(ctx.dayNtlVlm || '0');
    const funding = parseFloat(ctx.funding || '0');
    const markPx = parseFloat(ctx.markPx || '0');
    
    const oiUsd = openInterest * markPx;
    
    const history = oiHistoryMap.get(coin) || [];
    history.push({ time: Date.now(), oi: oiUsd });
    if (history.length > MAX_OI_HISTORY) history.shift();
    oiHistoryMap.set(coin, history);
    
    const oiHistory24h = history.filter(h => h.time > Date.now() - 24 * 60 * 60 * 1000);
    const oi24hAgo = oiHistory24h.length > 0 && oiHistory24h[0] ? oiHistory24h[0].oi : oiUsd;
    const openInterestChange24h = oi24hAgo > 0 ? ((oiUsd - oi24hAgo) / oi24hAgo) * 100 : 0;
    
    const oiToVolume = dayVolume > 0 ? oiUsd / dayVolume : 0;
    const isOverleveraged = oiToVolume > 0.5;
    
    let longShortRatio = 1.0;
    if (funding > 0) {
      longShortRatio = 1 + (funding * 10000);
    } else if (funding < 0) {
      longShortRatio = 1 / (1 + Math.abs(funding) * 10000);
    }
    
    let crowdedSide: OpenInterestData['crowdedSide'] = 'balanced';
    if (longShortRatio > 1.2) crowdedSide = 'long';
    else if (longShortRatio < 0.8) crowdedSide = 'short';
    
    let signal: OpenInterestData['signal'] = 'neutral';
    let strength = 0;
    
    if (isOverleveraged) {
      if (crowdedSide === 'long') {
        signal = 'short';
        strength = Math.min(80, 40 + Math.abs(openInterestChange24h));
      } else if (crowdedSide === 'short') {
        signal = 'long';
        strength = Math.min(80, 40 + Math.abs(openInterestChange24h));
      }
    } else if (openInterestChange24h > 10) {
      signal = crowdedSide === 'long' ? 'long' : crowdedSide === 'short' ? 'short' : 'neutral';
      strength = Math.min(60, 20 + openInterestChange24h);
    }
    
    return {
      coin,
      openInterest: oiUsd,
      openInterestChange24h,
      oiToVolume,
      isOverleveraged,
      signal,
      strength,
      longShortRatio,
      crowdedSide,
    };
  } catch (error) {
    console.error(`[OpenInterest] Error fetching data for ${coin}:`, error);
    return null;
  }
}

// ============================================================================
// SECTION 3: LIQUIDATION HEATMAP
// ============================================================================

export interface LiquidationLevel {
  price: number;
  estimatedLiquidations: number;
  type: 'long' | 'short';
  intensity: 'low' | 'medium' | 'high' | 'extreme';
}

export interface LiquidationHeatmap {
  coin: string;
  currentPrice: number;
  levels: LiquidationLevel[];
  nearestLongLiq: number;
  nearestShortLiq: number;
  liquidationBias: 'long_risk' | 'short_risk' | 'balanced';
  signal: 'long' | 'short' | 'neutral';
  strength: number;
  magnetPrice: number | null;
}

export function calculateLiquidationHeatmap(
  coin: string,
  currentPrice: number,
  openInterest: number,
  funding: number,
  leverageDistribution: { leverage: number; percentage: number }[] = [
    { leverage: 2, percentage: 10 },
    { leverage: 3, percentage: 15 },
    { leverage: 5, percentage: 25 },
    { leverage: 10, percentage: 30 },
    { leverage: 20, percentage: 15 },
    { leverage: 50, percentage: 5 },
  ]
): LiquidationHeatmap {
  const levels: LiquidationLevel[] = [];
  
  const longPct = funding > 0 ? 0.5 + Math.min(0.3, funding * 1000) : 0.5 - Math.min(0.3, Math.abs(funding) * 1000);
  const shortPct = 1 - longPct;
  
  const longOI = openInterest * longPct;
  const shortOI = openInterest * shortPct;
  
  for (const tier of leverageDistribution) {
    const { leverage, percentage } = tier;
    
    const longLiqPrice = currentPrice * (1 - 0.9 / leverage);
    const longLiqAmount = (longOI * percentage / 100);
    
    const shortLiqPrice = currentPrice * (1 + 0.9 / leverage);
    const shortLiqAmount = (shortOI * percentage / 100);
    
    const getIntensity = (amount: number): LiquidationLevel['intensity'] => {
      if (amount > openInterest * 0.1) return 'extreme';
      if (amount > openInterest * 0.05) return 'high';
      if (amount > openInterest * 0.02) return 'medium';
      return 'low';
    };
    
    levels.push({
      price: longLiqPrice,
      estimatedLiquidations: longLiqAmount,
      type: 'long',
      intensity: getIntensity(longLiqAmount),
    });
    
    levels.push({
      price: shortLiqPrice,
      estimatedLiquidations: shortLiqAmount,
      type: 'short',
      intensity: getIntensity(shortLiqAmount),
    });
  }
  
  levels.sort((a, b) => a.price - b.price);
  
  const longLiqs = levels.filter(l => l.type === 'long' && l.price < currentPrice);
  const shortLiqs = levels.filter(l => l.type === 'short' && l.price > currentPrice);
  
  const nearestLongLiq = longLiqs.length > 0 ? Math.max(...longLiqs.map(l => l.price)) : currentPrice * 0.8;
  const nearestShortLiq = shortLiqs.length > 0 ? Math.min(...shortLiqs.map(l => l.price)) : currentPrice * 1.2;
  
  const distToLongLiq = (currentPrice - nearestLongLiq) / currentPrice * 100;
  const distToShortLiq = (nearestShortLiq - currentPrice) / currentPrice * 100;
  
  let liquidationBias: LiquidationHeatmap['liquidationBias'] = 'balanced';
  if (distToLongLiq < distToShortLiq * 0.7) liquidationBias = 'long_risk';
  else if (distToShortLiq < distToLongLiq * 0.7) liquidationBias = 'short_risk';
  
  const magnetLevel = levels.length > 0 ? levels.reduce((max, l) => 
    (max && l.estimatedLiquidations > max.estimatedLiquidations) ? l : max, levels[0] as LiquidationLevel) : null;
  const magnetPrice = magnetLevel ? magnetLevel.price : null;
  
  let signal: LiquidationHeatmap['signal'] = 'neutral';
  let strength = 0;
  
  if (magnetPrice) {
    if (magnetPrice < currentPrice && distToLongLiq < 5) {
      signal = 'short';
      strength = Math.min(70, 30 + (5 - distToLongLiq) * 10);
    } else if (magnetPrice > currentPrice && distToShortLiq < 5) {
      signal = 'long';
      strength = Math.min(70, 30 + (5 - distToShortLiq) * 10);
    }
  }
  
  return {
    coin,
    currentPrice,
    levels,
    nearestLongLiq,
    nearestShortLiq,
    liquidationBias,
    signal,
    strength,
    magnetPrice,
  };
}

// ============================================================================
// SECTION 4: MULTI-TIMEFRAME CONFLUENCE
// ============================================================================

export interface TimeframeSignal {
  timeframe: string;
  trend: 'up' | 'down' | 'sideways';
  momentum: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  rsi: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  emaAlignment: 'bullish' | 'bearish' | 'mixed';
}

export interface MultiTimeframeAnalysis {
  symbol: string;
  timeframes: TimeframeSignal[];
  overallSignal: 'strong_long' | 'long' | 'neutral' | 'short' | 'strong_short';
  confluenceScore: number;
  alignedTimeframes: number;
  totalTimeframes: number;
  recommendation: string;
}

export function analyzeTimeframe(prices: number[], timeframe: string): TimeframeSignal {
  if (prices.length < 30) {
    return {
      timeframe,
      trend: 'sideways',
      momentum: 'neutral',
      strength: 0,
      rsi: 50,
      macdSignal: 'neutral',
      emaAlignment: 'mixed',
    };
  }
  
  const len = prices.length;
  const currentPrice = prices[len - 1];
  
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const ema50 = calculateEMA(prices, Math.min(50, len - 1));
  
  let emaAlignment: TimeframeSignal['emaAlignment'] = 'mixed';
  if (ema9 > ema21 && ema21 > ema50) emaAlignment = 'bullish';
  else if (ema9 < ema21 && ema21 < ema50) emaAlignment = 'bearish';
  
  const price = currentPrice || 0;
  const priceVsEma50 = price > ema50 ? 'up' : price < ema50 ? 'down' : 'sideways';
  const trendStrength = ema50 > 0 ? Math.abs((price - ema50) / ema50) * 100 : 0;
  
  let trend: TimeframeSignal['trend'] = 'sideways';
  if (trendStrength > 1) {
    trend = price > ema50 ? 'up' : 'down';
  }
  
  const rsi = calculateRSI(prices, 14);
  const macd = calculateMACD(prices);
  
  let macdSignal: TimeframeSignal['macdSignal'] = 'neutral';
  if (macd.histogram > 0 && macd.histogram > macd.prevHistogram) macdSignal = 'bullish';
  else if (macd.histogram < 0 && macd.histogram < macd.prevHistogram) macdSignal = 'bearish';
  
  let momentum: TimeframeSignal['momentum'] = 'neutral';
  if (rsi > 50 && macdSignal === 'bullish') momentum = 'bullish';
  else if (rsi < 50 && macdSignal === 'bearish') momentum = 'bearish';
  
  let strength = 0;
  if (emaAlignment === 'bullish') strength += 30;
  else if (emaAlignment === 'bearish') strength += 30;
  if (momentum !== 'neutral') strength += 20;
  if (trend !== 'sideways') strength += 20;
  strength += Math.min(30, trendStrength * 3);
  
  return {
    timeframe,
    trend,
    momentum,
    strength: Math.min(100, strength),
    rsi,
    macdSignal,
    emaAlignment,
  };
}

export function calculateMultiTimeframeConfluence(
  symbol: string,
  priceData: { [timeframe: string]: number[] }
): MultiTimeframeAnalysis {
  const timeframes = ['1m', '5m', '15m', '1h'];
  const signals: TimeframeSignal[] = [];
  
  for (const tf of timeframes) {
    const prices = priceData[tf] || [];
    if (prices.length > 0) {
      signals.push(analyzeTimeframe(prices, tf));
    }
  }
  
  if (signals.length === 0) {
    return {
      symbol,
      timeframes: [],
      overallSignal: 'neutral',
      confluenceScore: 0,
      alignedTimeframes: 0,
      totalTimeframes: 0,
      recommendation: 'Insufficient data',
    };
  }
  
  const bullishCount = signals.filter(s => s.momentum === 'bullish' || s.trend === 'up').length;
  const bearishCount = signals.filter(s => s.momentum === 'bearish' || s.trend === 'down').length;
  
  const alignedTimeframes = Math.max(bullishCount, bearishCount);
  const totalTimeframes = signals.length;
  
  const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
  const alignmentBonus = (alignedTimeframes / totalTimeframes) * 50;
  const confluenceScore = Math.min(100, avgStrength * 0.5 + alignmentBonus);
  
  let overallSignal: MultiTimeframeAnalysis['overallSignal'] = 'neutral';
  if (bullishCount >= totalTimeframes * 0.75) {
    overallSignal = confluenceScore > 70 ? 'strong_long' : 'long';
  } else if (bearishCount >= totalTimeframes * 0.75) {
    overallSignal = confluenceScore > 70 ? 'strong_short' : 'short';
  } else if (bullishCount > bearishCount) {
    overallSignal = 'long';
  } else if (bearishCount > bullishCount) {
    overallSignal = 'short';
  }
  
  let recommendation = '';
  if (overallSignal === 'strong_long') {
    recommendation = `Strong bullish confluence (${alignedTimeframes}/${totalTimeframes} TFs). Consider LONG.`;
  } else if (overallSignal === 'strong_short') {
    recommendation = `Strong bearish confluence (${alignedTimeframes}/${totalTimeframes} TFs). Consider SHORT.`;
  } else if (overallSignal === 'long') {
    recommendation = `Moderate bullish bias. Wait for more confluence or reduce size.`;
  } else if (overallSignal === 'short') {
    recommendation = `Moderate bearish bias. Wait for more confluence or reduce size.`;
  } else {
    recommendation = `Mixed signals. Avoid trading or scalp only.`;
  }
  
  return {
    symbol,
    timeframes: signals,
    overallSignal,
    confluenceScore,
    alignedTimeframes,
    totalTimeframes,
    recommendation,
  };
}

// ============================================================================
// SECTION 5: DYNAMIC WALLET-BASED SIZING
// ============================================================================

export interface WalletTier {
  name: string;
  minEquity: number;
  maxEquity: number;
  basePositionPct: number;
  maxPositionPct: number;
  maxLeverage: number;
  maxSimultaneousPositions: number;
  minTradeNotional: number;
  targetProfitPct: number;
  maxStopLossPct: number;
  tradingStyle: 'micro_scalp' | 'scalp' | 'intraday' | 'swing';
  description: string;
}

export const WALLET_TIERS: WalletTier[] = [
  {
    name: 'Micro',
    minEquity: 0,
    maxEquity: 50,
    basePositionPct: 8,
    maxPositionPct: 15,
    maxLeverage: 3,
    maxSimultaneousPositions: 1,
    minTradeNotional: 12,
    targetProfitPct: 0.5,
    maxStopLossPct: 0.3,
    tradingStyle: 'micro_scalp',
    description: 'Micro account - conservative scalping with single position',
  },
  {
    name: 'Small',
    minEquity: 50,
    maxEquity: 200,
    basePositionPct: 5,
    maxPositionPct: 10,
    maxLeverage: 5,
    maxSimultaneousPositions: 2,
    minTradeNotional: 15,
    targetProfitPct: 0.6,
    maxStopLossPct: 0.35,
    tradingStyle: 'scalp',
    description: 'Small account - active scalping with 2 positions max',
  },
  {
    name: 'Medium',
    minEquity: 200,
    maxEquity: 1000,
    basePositionPct: 3,
    maxPositionPct: 8,
    maxLeverage: 5,
    maxSimultaneousPositions: 3,
    minTradeNotional: 20,
    targetProfitPct: 0.8,
    maxStopLossPct: 0.4,
    tradingStyle: 'scalp',
    description: 'Medium account - balanced scalping/intraday',
  },
  {
    name: 'Standard',
    minEquity: 1000,
    maxEquity: 5000,
    basePositionPct: 2,
    maxPositionPct: 5,
    maxLeverage: 5,
    maxSimultaneousPositions: 3,
    minTradeNotional: 30,
    targetProfitPct: 1.0,
    maxStopLossPct: 0.5,
    tradingStyle: 'intraday',
    description: 'Standard account - intraday trading with proper risk management',
  },
  {
    name: 'Professional',
    minEquity: 5000,
    maxEquity: 25000,
    basePositionPct: 1.5,
    maxPositionPct: 4,
    maxLeverage: 3,
    maxSimultaneousPositions: 4,
    minTradeNotional: 50,
    targetProfitPct: 1.5,
    maxStopLossPct: 0.75,
    tradingStyle: 'intraday',
    description: 'Professional account - diversified intraday with lower leverage',
  },
  {
    name: 'Institutional',
    minEquity: 25000,
    maxEquity: Infinity,
    basePositionPct: 1,
    maxPositionPct: 3,
    maxLeverage: 2,
    maxSimultaneousPositions: 5,
    minTradeNotional: 100,
    targetProfitPct: 2.0,
    maxStopLossPct: 1.0,
    tradingStyle: 'swing',
    description: 'Institutional account - swing trading with maximum diversification',
  },
];

export function getWalletTier(equity: number): WalletTier {
  for (const tier of WALLET_TIERS) {
    if (equity >= tier.minEquity && equity < tier.maxEquity) {
      return tier;
    }
  }
  const lastTier = WALLET_TIERS[WALLET_TIERS.length - 1];
  return lastTier as WalletTier;
}

export interface DynamicSizingResult {
  tier: WalletTier;
  recommendedPositionPct: number;
  recommendedNotional: number;
  recommendedLeverage: number;
  maxPositions: number;
  adjustedTargetPct: number;
  adjustedStopPct: number;
  warnings: string[];
  canTrade: boolean;
  reason: string;
}

export function calculateDynamicSizing(
  equity: number,
  currentPrice: number,
  volatility: number = 1.0,
  winRate: number = 0.5,
  currentOpenPositions: number = 0
): DynamicSizingResult {
  const tier = getWalletTier(equity);
  const warnings: string[] = [];
  
  if (equity < 10) {
    return {
      tier,
      recommendedPositionPct: 0,
      recommendedNotional: 0,
      recommendedLeverage: 0,
      maxPositions: 0,
      adjustedTargetPct: 0,
      adjustedStopPct: 0,
      warnings: ['Account equity too low ($10 minimum for Hyperliquid)'],
      canTrade: false,
      reason: 'Insufficient equity',
    };
  }
  
  if (currentOpenPositions >= tier.maxSimultaneousPositions) {
    return {
      tier,
      recommendedPositionPct: 0,
      recommendedNotional: 0,
      recommendedLeverage: tier.maxLeverage,
      maxPositions: tier.maxSimultaneousPositions,
      adjustedTargetPct: tier.targetProfitPct,
      adjustedStopPct: tier.maxStopLossPct,
      warnings: [`Max positions reached (${tier.maxSimultaneousPositions})`],
      canTrade: false,
      reason: 'Position limit reached',
    };
  }
  
  let volatilityMultiplier = 1.0;
  if (volatility > 3) {
    volatilityMultiplier = 0.5;
    warnings.push('High volatility - reducing position size');
  } else if (volatility > 2) {
    volatilityMultiplier = 0.7;
  } else if (volatility < 0.5) {
    volatilityMultiplier = 1.2;
  }
  
  let winRateMultiplier = 1.0;
  if (winRate > 0.6) {
    winRateMultiplier = 1.2;
  } else if (winRate < 0.4) {
    winRateMultiplier = 0.7;
    warnings.push('Low win rate - reducing position size');
  }
  
  const basePositionPct = tier.basePositionPct * volatilityMultiplier * winRateMultiplier;
  const recommendedPositionPct = Math.min(tier.maxPositionPct, Math.max(1, basePositionPct));
  
  let recommendedNotional = equity * (recommendedPositionPct / 100);
  
  if (recommendedNotional < tier.minTradeNotional) {
    if (equity * (tier.maxPositionPct / 100) >= tier.minTradeNotional) {
      recommendedNotional = tier.minTradeNotional;
      warnings.push(`Adjusted to minimum notional ($${tier.minTradeNotional})`);
    } else {
      warnings.push(`Cannot meet minimum notional ($${tier.minTradeNotional})`);
    }
  }
  
  let recommendedLeverage = tier.maxLeverage;
  if (volatility > 2) {
    recommendedLeverage = Math.max(1, tier.maxLeverage - 1);
  }
  
  const adjustedTargetPct = tier.targetProfitPct * (volatility > 1.5 ? 1.2 : 1.0);
  const adjustedStopPct = tier.maxStopLossPct * (volatility > 1.5 ? 1.3 : 1.0);
  
  return {
    tier,
    recommendedPositionPct,
    recommendedNotional,
    recommendedLeverage,
    maxPositions: tier.maxSimultaneousPositions,
    adjustedTargetPct,
    adjustedStopPct,
    warnings,
    canTrade: recommendedNotional >= tier.minTradeNotional,
    reason: recommendedNotional >= tier.minTradeNotional ? 'Ready to trade' : 'Notional too low',
  };
}

// ============================================================================
// SECTION 6: COMBINED ADVANCED SIGNAL
// ============================================================================

export interface AdvancedSignal {
  symbol: string;
  timestamp: number;
  fundingSignal: FundingRateData | null;
  openInterestSignal: OpenInterestData | null;
  liquidationSignal: LiquidationHeatmap | null;
  multiTimeframeSignal: MultiTimeframeAnalysis | null;
  overallDirection: 'long' | 'short' | 'neutral';
  overallStrength: number;
  confidence: number;
  sizing: DynamicSizingResult;
  shouldTrade: boolean;
  reasons: string[];
  warnings: string[];
}

export async function generateAdvancedSignal(
  symbol: string,
  equity: number,
  currentPrice: number,
  priceData: { [timeframe: string]: number[] },
  volatility: number = 1.0,
  winRate: number = 0.5,
  currentOpenPositions: number = 0
): Promise<AdvancedSignal> {
  const coin = symbol.replace('-PERP', '');
  const reasons: string[] = [];
  const warnings: string[] = [];
  
  const [fundingData, oiData] = await Promise.all([
    fetchFundingData(coin),
    fetchOpenInterestData(coin),
  ]);
  
  const liquidationData = oiData ? calculateLiquidationHeatmap(
    coin,
    currentPrice,
    oiData.openInterest,
    fundingData?.currentFunding || 0
  ) : null;
  
  const mtfData = calculateMultiTimeframeConfluence(symbol, priceData);
  const sizing = calculateDynamicSizing(equity, currentPrice, volatility, winRate, currentOpenPositions);
  
  let longScore = 0;
  let shortScore = 0;
  
  if (fundingData) {
    if (fundingData.signal === 'long') {
      longScore += fundingData.strength * 0.2;
      reasons.push(`Funding: ${fundingData.signal} (${fundingData.strength.toFixed(0)}%)`);
    } else if (fundingData.signal === 'short') {
      shortScore += fundingData.strength * 0.2;
      reasons.push(`Funding: ${fundingData.signal} (${fundingData.strength.toFixed(0)}%)`);
    }
    if (fundingData.isExtreme) {
      warnings.push(`Extreme funding: ${(fundingData.currentFunding * 100).toFixed(4)}%`);
    }
  }
  
  if (oiData) {
    if (oiData.signal === 'long') {
      longScore += oiData.strength * 0.2;
      reasons.push(`OI: ${oiData.signal} (${oiData.strength.toFixed(0)}%)`);
    } else if (oiData.signal === 'short') {
      shortScore += oiData.strength * 0.2;
      reasons.push(`OI: ${oiData.signal} (${oiData.strength.toFixed(0)}%)`);
    }
    if (oiData.isOverleveraged) {
      warnings.push(`Overleveraged (OI/Vol: ${oiData.oiToVolume.toFixed(2)})`);
    }
  }
  
  if (liquidationData) {
    if (liquidationData.signal === 'long') {
      longScore += liquidationData.strength * 0.15;
      reasons.push(`Liquidations: ${liquidationData.signal} (${liquidationData.strength.toFixed(0)}%)`);
    } else if (liquidationData.signal === 'short') {
      shortScore += liquidationData.strength * 0.15;
      reasons.push(`Liquidations: ${liquidationData.signal} (${liquidationData.strength.toFixed(0)}%)`);
    }
  }
  
  if (mtfData.overallSignal !== 'neutral') {
    const mtfStrength = mtfData.confluenceScore;
    if (mtfData.overallSignal.includes('long')) {
      longScore += mtfStrength * 0.45;
      reasons.push(`MTF: ${mtfData.overallSignal} (${mtfStrength.toFixed(0)}%)`);
    } else if (mtfData.overallSignal.includes('short')) {
      shortScore += mtfStrength * 0.45;
      reasons.push(`MTF: ${mtfData.overallSignal} (${mtfStrength.toFixed(0)}%)`);
    }
  }
  
  const netScore = longScore - shortScore;
  let overallDirection: AdvancedSignal['overallDirection'] = 'neutral';
  if (netScore > 15) overallDirection = 'long';
  else if (netScore < -15) overallDirection = 'short';
  
  const overallStrength = Math.min(100, Math.abs(netScore));
  const confidence = Math.min(100, reasons.length * 15 + overallStrength * 0.5);
  
  const shouldTrade = sizing.canTrade && 
    overallDirection !== 'neutral' && 
    overallStrength >= 30 &&
    confidence >= 40;
  
  warnings.push(...sizing.warnings);
  
  return {
    symbol,
    timestamp: Date.now(),
    fundingSignal: fundingData,
    openInterestSignal: oiData,
    liquidationSignal: liquidationData,
    multiTimeframeSignal: mtfData,
    overallDirection,
    overallStrength,
    confidence,
    sizing,
    shouldTrade,
    reasons,
    warnings,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices.reduce((a, b) => a + b, 0) / prices.length;
  
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    const p = prices[i];
    if (p !== undefined) {
      ema = p * k + ema * (1 - k);
    }
  }
  
  return ema;
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const prevPrice = prices[i - 1];
    const currPrice = prices[i];
    if (prevPrice === undefined || currPrice === undefined) continue;
    const change = currPrice - prevPrice;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number; prevHistogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  const signal = macd * 0.9;
  const histogram = macd - signal;
  
  const prevPrices = prices.slice(0, -1);
  const prevEma12 = calculateEMA(prevPrices, 12);
  const prevEma26 = calculateEMA(prevPrices, 26);
  const prevMacd = prevEma12 - prevEma26;
  const prevSignal = prevMacd * 0.9;
  const prevHistogram = prevMacd - prevSignal;
  
  return { macd, signal, histogram, prevHistogram };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  fetchFundingData,
  fetchOpenInterestData,
  calculateLiquidationHeatmap,
  analyzeTimeframe,
  calculateMultiTimeframeConfluence,
  getWalletTier,
  calculateDynamicSizing,
  WALLET_TIERS,
  generateAdvancedSignal,
};
