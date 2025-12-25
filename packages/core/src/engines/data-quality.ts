/**
 * Data Quality Measurement
 * 
 * Measures candle freshness, gaps, latency, and connection status
 */

export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DataQualityMetrics {
  wsConnected: boolean;
  lastCandleAgeMs: number;
  candleGapCount: number;
  latencyMs: number;
  isDelayed: boolean;
}

/**
 * Timeframe to milliseconds mapping
 */
const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

/**
 * Count gaps in candle data
 * A gap is when the time difference between consecutive candles
 * is greater than expected for the timeframe
 */
export function countCandleGaps(candles: OHLC[], timeframe: string): number {
  if (candles.length < 2) {
    return 0;
  }

  const expectedInterval = TIMEFRAME_MS[timeframe] || 60000;
  const tolerance = expectedInterval * 0.1; // 10% tolerance
  let gaps = 0;

  for (let i = 1; i < candles.length; i++) {
    const timeDiff = candles[i]!.timestamp - candles[i - 1]!.timestamp;
    if (timeDiff > expectedInterval + tolerance) {
      gaps++;
    }
  }

  return gaps;
}

/**
 * Calculate candle freshness (age of last candle)
 */
export function getCandleFreshness(candles: OHLC[]): number {
  if (candles.length === 0) {
    return Infinity;
  }

  const lastCandle = candles[candles.length - 1]!;
  return Date.now() - lastCandle.timestamp;
}

/**
 * Measure data quality
 */
export function measureDataQuality(
  candles: OHLC[],
  timeframe: string,
  wsConnected: boolean,
  latencyMs: number
): DataQualityMetrics {
  const lastCandleAgeMs = getCandleFreshness(candles);
  const candleGapCount = countCandleGaps(candles, timeframe);
  
  // Consider delayed if no WS or candle is older than 2x timeframe
  const expectedInterval = TIMEFRAME_MS[timeframe] || 60000;
  const isDelayed = !wsConnected || lastCandleAgeMs > expectedInterval * 2;

  return {
    wsConnected,
    lastCandleAgeMs,
    candleGapCount,
    latencyMs,
    isDelayed,
  };
}

/**
 * Get data quality summary for UI
 */
export function getDataQualitySummary(metrics: DataQualityMetrics): string {
  const parts: string[] = [];

  if (metrics.wsConnected) {
    parts.push('WS ✓');
  } else {
    parts.push('Polling');
  }

  const ageSeconds = Math.round(metrics.lastCandleAgeMs / 1000);
  if (ageSeconds < 10) {
    parts.push(`${ageSeconds}s fresh`);
  } else if (ageSeconds < 60) {
    parts.push(`${ageSeconds}s ago`);
  } else {
    parts.push(`${Math.round(ageSeconds / 60)}m stale`);
  }

  if (metrics.candleGapCount > 0) {
    parts.push(`${metrics.candleGapCount} gaps`);
  }

  if (metrics.latencyMs > 500) {
    parts.push(`${metrics.latencyMs}ms lag`);
  }

  return parts.join(' | ');
}
