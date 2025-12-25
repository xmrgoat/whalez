// Types
export * from './types/index.js';

// Adapters
export * from './adapters/index.js';

// Engine
export * from './engine/index.js';

// Engines V3 - Confidence
export {
  computeConfidence,
  computeDataQuality,
  computeSignalAgreement,
  computeRiskFit,
  computeRegimeMatch,
  computeNewsBonus,
  getDefaultRiskState,
  getDefaultDataQualityMetrics,
  type ConfidenceResult,
  type ConfidenceBreakdown,
  type Evidence,
  type GatingResult,
  type IndicatorSignal,
  type GrokResult,
  type DataQualityMetrics as ConfidenceDataQualityMetrics,
  type RiskState as ConfidenceRiskState,
  type RegimeState as ConfidenceRegimeState,
} from './engines/confidence.engine.js';

// Engines V3 - Regime Detector
export {
  detectRegime,
  calculateATR,
  calculateTrendSlope,
  detectRanging,
  getVolatilityLevel,
  getRegimeDescription,
} from './engines/regime.detector.js';

// Engines V3 - Data Quality
export {
  measureDataQuality,
  countCandleGaps,
  getCandleFreshness,
  getDataQualitySummary,
} from './engines/data-quality.js';

// Services
export * from './services/grok-client.js';
