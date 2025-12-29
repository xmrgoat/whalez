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
export { default as EnhancedGrokService, enhancedGrok } from './services/grok-enhanced.js';
export { 
  default as GrokMacroService, 
  grokMacroService,
  type GrokMacroAnalysis,
  type GrokCostStats,
  type GrokMacroConfig,
  type SymbolMacroAnalysis,
  type MacroEvent,
  type NewsItem,
} from './services/grok-macro.service.js';

// Quant Indicators
export * from './lib/quant-indicators.js';

// Realtime Data Service
export { 
  RealtimeDataService, 
  getRealtimeDataService,
  type OrderBook,
  type OrderBookLevel,
  type FundingData,
  type LiquidationData,
  type TradeData,
  type MarketContext,
  type MarketInfo,
} from './services/realtime-data.service.js';
