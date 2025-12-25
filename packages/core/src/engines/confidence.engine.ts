/**
 * Confidence Engine V3
 * 
 * Computes a deterministic confidence score (0-100) from 5 families:
 * A) DataQuality (0-20): freshness, ws/poll mode, gaps, latency
 * B) SignalAgreement (0-30): indicator confirmations (min 3)
 * C) RiskFit (0-25): risk constraints; if fail => hard block
 * D) RegimeMatch (0-15): trending/ranging/high-vol regime compatibility
 * E) NewsBonus (0-10): Grok grounded sources only
 * 
 * Hard rules:
 * - DataQuality < 8 => NO-TRADE (blocked)
 * - RiskFit fails => BLOCK TRADE
 * - Confirmations < 3 => NO-TRADE
 * - Grok insufficient sources => no bonus, mark UNKNOWN
 */

export interface DataQualityMetrics {
  wsConnected: boolean;
  lastCandleAgeMs: number;
  candleGapCount: number;
  latencyMs: number;
  isDelayed: boolean;
}

export interface IndicatorSignal {
  name: string;
  value: number;
  threshold: number;
  direction: 'above' | 'below' | 'cross_up' | 'cross_down';
  passed: boolean;
  weight: number;
}

export interface RiskState {
  currentDrawdownPct: number;
  maxDrawdownPct: number;
  dailyLossPct: number;
  maxDailyLossPct: number;
  positionSizePct: number;
  maxPositionSizePct: number;
  leverage: number;
  maxLeverage: number;
  openPositions: number;
  maxOpenPositions: number;
}

export interface RegimeState {
  atr14: number;
  atrPctOfPrice: number;
  trendSlope: number; // Positive = uptrend, negative = downtrend
  isRanging: boolean;
  volatilityLevel: 'low' | 'medium' | 'high';
}

export interface GrokResult {
  enabled: boolean;
  hasSources: boolean;
  sourceCount: number;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'unknown';
  confidence: number; // 0-1
  sources: Array<{ url: string; summary: string }>;
}

export interface ConfidenceBreakdown {
  dataQuality: number;    // 0-20
  signalAgreement: number; // 0-30
  riskFit: number;        // 0-25
  regimeMatch: number;    // 0-15
  newsBonus: number;      // 0-10
  total: number;          // 0-100
}

export interface Evidence {
  type: 'INDICATOR' | 'GROK' | 'RISK' | 'DATA' | 'REGIME';
  label: string;
  value: string;
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  weight: number;
  sourceUrl?: string;
}

export interface GatingResult {
  allowed: boolean;
  blockedReason: string | null;
  hardBlocks: string[];
}

export interface ConfidenceResult {
  score: number;
  breakdown: ConfidenceBreakdown;
  evidence: Evidence[];
  gating: GatingResult;
  action: 'LONG' | 'SHORT' | 'HOLD' | 'NO_TRADE';
  suggestedAction: 'LONG' | 'SHORT' | 'HOLD';
}

/**
 * Compute DataQuality score (0-20)
 */
export function computeDataQuality(metrics: DataQualityMetrics): { score: number; evidence: Evidence[] } {
  const evidence: Evidence[] = [];
  let score = 0;

  // WebSocket connected (0-5)
  if (metrics.wsConnected) {
    score += 5;
    evidence.push({ type: 'DATA', label: 'WebSocket', value: 'Connected', status: 'PASS', weight: 5 });
  } else {
    evidence.push({ type: 'DATA', label: 'WebSocket', value: 'Disconnected (polling)', status: 'FAIL', weight: 0 });
  }

  // Candle freshness (0-8)
  const freshnessMs = metrics.lastCandleAgeMs;
  if (freshnessMs < 5000) {
    score += 8;
    evidence.push({ type: 'DATA', label: 'Candle Freshness', value: `${(freshnessMs / 1000).toFixed(1)}s`, status: 'PASS', weight: 8 });
  } else if (freshnessMs < 30000) {
    score += 5;
    evidence.push({ type: 'DATA', label: 'Candle Freshness', value: `${(freshnessMs / 1000).toFixed(1)}s`, status: 'PASS', weight: 5 });
  } else if (freshnessMs < 60000) {
    score += 2;
    evidence.push({ type: 'DATA', label: 'Candle Freshness', value: `${(freshnessMs / 1000).toFixed(1)}s (stale)`, status: 'FAIL', weight: 2 });
  } else {
    evidence.push({ type: 'DATA', label: 'Candle Freshness', value: `${(freshnessMs / 1000).toFixed(1)}s (very stale)`, status: 'FAIL', weight: 0 });
  }

  // No gaps (0-4)
  if (metrics.candleGapCount === 0) {
    score += 4;
    evidence.push({ type: 'DATA', label: 'Candle Gaps', value: 'None', status: 'PASS', weight: 4 });
  } else if (metrics.candleGapCount <= 2) {
    score += 2;
    evidence.push({ type: 'DATA', label: 'Candle Gaps', value: `${metrics.candleGapCount} gaps`, status: 'FAIL', weight: 2 });
  } else {
    evidence.push({ type: 'DATA', label: 'Candle Gaps', value: `${metrics.candleGapCount} gaps`, status: 'FAIL', weight: 0 });
  }

  // Latency (0-3)
  if (metrics.latencyMs < 100) {
    score += 3;
    evidence.push({ type: 'DATA', label: 'Latency', value: `${metrics.latencyMs}ms`, status: 'PASS', weight: 3 });
  } else if (metrics.latencyMs < 500) {
    score += 2;
    evidence.push({ type: 'DATA', label: 'Latency', value: `${metrics.latencyMs}ms`, status: 'PASS', weight: 2 });
  } else {
    evidence.push({ type: 'DATA', label: 'Latency', value: `${metrics.latencyMs}ms (high)`, status: 'FAIL', weight: 0 });
  }

  return { score: Math.min(score, 20), evidence };
}

/**
 * Compute SignalAgreement score (0-30)
 */
export function computeSignalAgreement(
  signals: IndicatorSignal[],
  minConfirmations: number = 3
): { score: number; evidence: Evidence[]; passedCount: number } {
  const evidence: Evidence[] = [];
  let passedCount = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    const status = signal.passed ? 'PASS' : 'FAIL';
    if (signal.passed) {
      passedCount++;
      totalWeight += signal.weight;
    }

    const directionLabel = signal.direction === 'above' ? '>' :
                          signal.direction === 'below' ? '<' :
                          signal.direction === 'cross_up' ? '↑' : '↓';

    evidence.push({
      type: 'INDICATOR',
      label: `${signal.name} ${directionLabel} ${signal.threshold}`,
      value: signal.value.toFixed(2),
      status,
      weight: signal.passed ? signal.weight : 0,
    });
  }

  // Scale to 0-30 based on confirmations and weights
  const confirmationRatio = Math.min(passedCount / minConfirmations, 1);
  const weightRatio = signals.length > 0 ? totalWeight / (signals.length * 10) : 0;
  const score = Math.round(confirmationRatio * 20 + weightRatio * 10);

  return { score: Math.min(score, 30), evidence, passedCount };
}

/**
 * Compute RiskFit score (0-25)
 * Returns 0 if any hard limit is breached
 */
export function computeRiskFit(risk: RiskState): { score: number; evidence: Evidence[]; blocked: boolean; blockReason: string | null } {
  const evidence: Evidence[] = [];
  let score = 0;
  let blocked = false;
  let blockReason: string | null = null;

  // Drawdown check (0-8)
  const drawdownRatio = risk.currentDrawdownPct / risk.maxDrawdownPct;
  if (drawdownRatio >= 1) {
    blocked = true;
    blockReason = `Max drawdown reached: ${risk.currentDrawdownPct.toFixed(1)}% >= ${risk.maxDrawdownPct}%`;
    evidence.push({ type: 'RISK', label: 'Drawdown', value: `${risk.currentDrawdownPct.toFixed(1)}%`, status: 'FAIL', weight: 0 });
  } else if (drawdownRatio < 0.5) {
    score += 8;
    evidence.push({ type: 'RISK', label: 'Drawdown', value: `${risk.currentDrawdownPct.toFixed(1)}%`, status: 'PASS', weight: 8 });
  } else if (drawdownRatio < 0.8) {
    score += 4;
    evidence.push({ type: 'RISK', label: 'Drawdown', value: `${risk.currentDrawdownPct.toFixed(1)}% (warning)`, status: 'PASS', weight: 4 });
  } else {
    evidence.push({ type: 'RISK', label: 'Drawdown', value: `${risk.currentDrawdownPct.toFixed(1)}% (critical)`, status: 'FAIL', weight: 0 });
  }

  // Daily loss check (0-6)
  const dailyLossRatio = risk.dailyLossPct / risk.maxDailyLossPct;
  if (dailyLossRatio >= 1) {
    blocked = true;
    blockReason = blockReason || `Max daily loss reached: ${risk.dailyLossPct.toFixed(1)}%`;
    evidence.push({ type: 'RISK', label: 'Daily Loss', value: `${risk.dailyLossPct.toFixed(1)}%`, status: 'FAIL', weight: 0 });
  } else if (dailyLossRatio < 0.5) {
    score += 6;
    evidence.push({ type: 'RISK', label: 'Daily Loss', value: `${risk.dailyLossPct.toFixed(1)}%`, status: 'PASS', weight: 6 });
  } else {
    score += 2;
    evidence.push({ type: 'RISK', label: 'Daily Loss', value: `${risk.dailyLossPct.toFixed(1)}% (warning)`, status: 'PASS', weight: 2 });
  }

  // Position size check (0-5)
  if (risk.positionSizePct <= risk.maxPositionSizePct) {
    score += 5;
    evidence.push({ type: 'RISK', label: 'Position Size', value: `${risk.positionSizePct.toFixed(1)}%`, status: 'PASS', weight: 5 });
  } else {
    blocked = true;
    blockReason = blockReason || `Position too large: ${risk.positionSizePct.toFixed(1)}%`;
    evidence.push({ type: 'RISK', label: 'Position Size', value: `${risk.positionSizePct.toFixed(1)}%`, status: 'FAIL', weight: 0 });
  }

  // Leverage check (0-3)
  if (risk.leverage <= risk.maxLeverage) {
    score += 3;
    evidence.push({ type: 'RISK', label: 'Leverage', value: `${risk.leverage}x`, status: 'PASS', weight: 3 });
  } else {
    blocked = true;
    blockReason = blockReason || `Leverage too high: ${risk.leverage}x`;
    evidence.push({ type: 'RISK', label: 'Leverage', value: `${risk.leverage}x`, status: 'FAIL', weight: 0 });
  }

  // Open positions check (0-3)
  if (risk.openPositions < risk.maxOpenPositions) {
    score += 3;
    evidence.push({ type: 'RISK', label: 'Open Positions', value: `${risk.openPositions}/${risk.maxOpenPositions}`, status: 'PASS', weight: 3 });
  } else {
    evidence.push({ type: 'RISK', label: 'Open Positions', value: `${risk.openPositions}/${risk.maxOpenPositions} (max)`, status: 'FAIL', weight: 0 });
  }

  return { score: blocked ? 0 : Math.min(score, 25), evidence, blocked, blockReason };
}

/**
 * Compute RegimeMatch score (0-15)
 */
export function computeRegimeMatch(
  regime: RegimeState,
  suggestedAction: 'LONG' | 'SHORT' | 'HOLD'
): { score: number; evidence: Evidence[] } {
  const evidence: Evidence[] = [];
  let score = 0;

  // Trend alignment (0-8)
  const trendDirection = regime.trendSlope > 0.001 ? 'uptrend' : regime.trendSlope < -0.001 ? 'downtrend' : 'sideways';
  const trendAligned = (suggestedAction === 'LONG' && trendDirection === 'uptrend') ||
                       (suggestedAction === 'SHORT' && trendDirection === 'downtrend') ||
                       suggestedAction === 'HOLD';

  if (trendAligned) {
    score += 8;
    evidence.push({ type: 'REGIME', label: 'Trend Alignment', value: trendDirection, status: 'PASS', weight: 8 });
  } else if (trendDirection === 'sideways') {
    score += 4;
    evidence.push({ type: 'REGIME', label: 'Trend Alignment', value: 'sideways (neutral)', status: 'PASS', weight: 4 });
  } else {
    evidence.push({ type: 'REGIME', label: 'Trend Alignment', value: `${trendDirection} (counter-trend)`, status: 'FAIL', weight: 0 });
  }

  // Volatility suitability (0-4)
  if (regime.volatilityLevel === 'medium') {
    score += 4;
    evidence.push({ type: 'REGIME', label: 'Volatility', value: `${regime.volatilityLevel} (ATR ${(regime.atrPctOfPrice * 100).toFixed(2)}%)`, status: 'PASS', weight: 4 });
  } else if (regime.volatilityLevel === 'low') {
    score += 2;
    evidence.push({ type: 'REGIME', label: 'Volatility', value: `${regime.volatilityLevel} (tight stops)`, status: 'PASS', weight: 2 });
  } else {
    evidence.push({ type: 'REGIME', label: 'Volatility', value: `${regime.volatilityLevel} (risky)`, status: 'FAIL', weight: 0 });
  }

  // Ranging market penalty (0-3)
  if (!regime.isRanging || suggestedAction === 'HOLD') {
    score += 3;
    evidence.push({ type: 'REGIME', label: 'Market Type', value: regime.isRanging ? 'ranging' : 'trending', status: 'PASS', weight: 3 });
  } else {
    evidence.push({ type: 'REGIME', label: 'Market Type', value: 'ranging (avoid breakouts)', status: 'FAIL', weight: 0 });
  }

  return { score: Math.min(score, 15), evidence };
}

/**
 * Compute NewsBonus score (0-10)
 * Only adds bonus if Grok has grounded sources
 */
export function computeNewsBonus(
  grok: GrokResult | null,
  suggestedAction: 'LONG' | 'SHORT' | 'HOLD'
): { score: number; evidence: Evidence[] } {
  const evidence: Evidence[] = [];

  if (!grok || !grok.enabled) {
    evidence.push({ type: 'GROK', label: 'News Analysis', value: 'Disabled', status: 'UNKNOWN', weight: 0 });
    return { score: 0, evidence };
  }

  if (!grok.hasSources || grok.sourceCount === 0) {
    evidence.push({ type: 'GROK', label: 'News Analysis', value: 'Insufficient sources', status: 'UNKNOWN', weight: 0 });
    return { score: 0, evidence };
  }

  // Has sources - compute bonus based on sentiment alignment
  let score = 0;
  const sentimentAligned = (suggestedAction === 'LONG' && grok.sentiment === 'bullish') ||
                           (suggestedAction === 'SHORT' && grok.sentiment === 'bearish') ||
                           suggestedAction === 'HOLD';

  if (sentimentAligned && grok.confidence > 0.7) {
    score = 10;
  } else if (sentimentAligned && grok.confidence > 0.5) {
    score = 6;
  } else if (grok.sentiment === 'neutral') {
    score = 3;
  }

  evidence.push({
    type: 'GROK',
    label: 'News Sentiment',
    value: `${grok.sentiment} (${(grok.confidence * 100).toFixed(0)}% conf, ${grok.sourceCount} sources)`,
    status: sentimentAligned ? 'PASS' : 'FAIL',
    weight: score,
  });

  // Add source URLs as evidence
  for (const source of grok.sources.slice(0, 3)) {
    evidence.push({
      type: 'GROK',
      label: 'Source',
      value: source.summary.slice(0, 100),
      status: 'PASS',
      weight: 0,
      sourceUrl: source.url,
    });
  }

  return { score: Math.min(score, 10), evidence };
}

/**
 * Main confidence computation function
 */
export function computeConfidence(
  dataMetrics: DataQualityMetrics,
  signals: IndicatorSignal[],
  riskState: RiskState,
  regime: RegimeState,
  suggestedAction: 'LONG' | 'SHORT' | 'HOLD',
  grokResult?: GrokResult | null,
  minConfirmations: number = 3
): ConfidenceResult {
  const allEvidence: Evidence[] = [];
  const hardBlocks: string[] = [];

  // 1. Data Quality (0-20)
  const dataQuality = computeDataQuality(dataMetrics);
  allEvidence.push(...dataQuality.evidence);

  // Hard block: DataQuality < 8
  if (dataQuality.score < 8) {
    hardBlocks.push(`Data quality too low: ${dataQuality.score}/20 (min 8)`);
  }

  // 2. Signal Agreement (0-30)
  const signalAgreement = computeSignalAgreement(signals, minConfirmations);
  allEvidence.push(...signalAgreement.evidence);

  // Hard block: confirmations < minConfirmations
  if (signalAgreement.passedCount < minConfirmations) {
    hardBlocks.push(`Insufficient confirmations: ${signalAgreement.passedCount}/${minConfirmations}`);
  }

  // 3. Risk Fit (0-25)
  const riskFit = computeRiskFit(riskState);
  allEvidence.push(...riskFit.evidence);

  if (riskFit.blocked && riskFit.blockReason) {
    hardBlocks.push(riskFit.blockReason);
  }

  // 4. Regime Match (0-15)
  const regimeMatch = computeRegimeMatch(regime, suggestedAction);
  allEvidence.push(...regimeMatch.evidence);

  // 5. News Bonus (0-10)
  const newsBonus = computeNewsBonus(grokResult || null, suggestedAction);
  allEvidence.push(...newsBonus.evidence);

  // Compute total
  const breakdown: ConfidenceBreakdown = {
    dataQuality: dataQuality.score,
    signalAgreement: signalAgreement.score,
    riskFit: riskFit.score,
    regimeMatch: regimeMatch.score,
    newsBonus: newsBonus.score,
    total: dataQuality.score + signalAgreement.score + riskFit.score + regimeMatch.score + newsBonus.score,
  };

  // Gating result
  const gating: GatingResult = {
    allowed: hardBlocks.length === 0,
    blockedReason: hardBlocks.length > 0 ? hardBlocks[0]! : null,
    hardBlocks,
  };

  // Final action
  const action = gating.allowed ? suggestedAction : 'NO_TRADE';

  return {
    score: breakdown.total,
    breakdown,
    evidence: allEvidence,
    gating,
    action: action === 'HOLD' ? 'HOLD' : action,
    suggestedAction,
  };
}

/**
 * Default risk state for paper trading
 */
export function getDefaultRiskState(): RiskState {
  return {
    currentDrawdownPct: 0,
    maxDrawdownPct: parseFloat(process.env['MAX_DRAWDOWN_PCT'] || '10'),
    dailyLossPct: 0,
    maxDailyLossPct: parseFloat(process.env['MAX_DAILY_LOSS_PCT'] || '5'),
    positionSizePct: parseFloat(process.env['POSITION_SIZE_PCT'] || '2'),
    maxPositionSizePct: parseFloat(process.env['MAX_POSITION_SIZE_PCT'] || '5'),
    leverage: 1,
    maxLeverage: parseFloat(process.env['MAX_LEVERAGE'] || '3'),
    openPositions: 0,
    maxOpenPositions: parseInt(process.env['MAX_OPEN_POSITIONS'] || '3'),
  };
}

/**
 * Default data quality metrics
 */
export function getDefaultDataQualityMetrics(
  wsConnected: boolean = false,
  lastCandleAgeMs: number = 60000,
  latencyMs: number = 500
): DataQualityMetrics {
  return {
    wsConnected,
    lastCandleAgeMs,
    candleGapCount: 0,
    latencyMs,
    isDelayed: !wsConnected,
  };
}
