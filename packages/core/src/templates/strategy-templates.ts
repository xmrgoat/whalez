/**
 * STRATEGY TEMPLATES
 * Pre-built strategy configurations for quick bot creation
 * Each template is fully customizable
 */

import type { 
  UserBotStrategyConfig, 
  UserIndicatorConfig, 
  TradingCondition, 
  EntryRule, 
  ExitRule,
  UserRiskConfig,
  StrategyTemplate,
} from '../types/user-bot.types.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const createIndicator = (
  id: string,
  type: string,
  name: string,
  params: Array<{ name: string; value: number; min?: number; max?: number }>
): UserIndicatorConfig => ({
  id,
  type: type as any,
  name,
  enabled: true,
  params: params.map(p => ({
    name: p.name,
    type: 'number' as const,
    value: p.value,
    min: p.min,
    max: p.max,
  })),
  overlay: ['ema', 'sma', 'bollinger', 'vwap'].includes(type),
});

const createCondition = (
  id: string,
  name: string,
  sourceType: 'indicator' | 'price',
  sourceId: string | undefined,
  operator: string,
  compareType: string,
  compareValue: number | string,
  weight: number = 1
): TradingCondition => ({
  id,
  name,
  enabled: true,
  source: {
    type: sourceType,
    indicatorId: sourceId,
  },
  operator: operator as any,
  compareValue: {
    type: compareType as any,
    value: compareValue,
  },
  weight,
});

// ============================================================================
// TREND FOLLOWING TEMPLATE
// ============================================================================

export const trendFollowingTemplate: StrategyTemplate = {
  id: 'trend-following-ema',
  name: 'Trend Following (EMA Crossover)',
  description: 'Classic trend following strategy using EMA crossovers with RSI confirmation. Best for trending markets.',
  category: 'trend',
  difficulty: 'beginner',
  tags: ['trend', 'ema', 'crossover', 'beginner-friendly'],
  
  highlightedParams: [
    { path: 'indicators[0].params[0].value', name: 'Fast EMA Period', description: 'Shorter EMA for faster signals' },
    { path: 'indicators[1].params[0].value', name: 'Slow EMA Period', description: 'Longer EMA for trend direction' },
    { path: 'risk.positionSizing.basePercentage', name: 'Position Size %', description: 'Percentage of capital per trade' },
  ],
  
  backtestResults: {
    period: '2023-01-01 to 2024-01-01',
    winRate: 52.3,
    totalReturn: 47.8,
    maxDrawdown: 12.4,
    sharpeRatio: 1.42,
  },
  
  defaultConfig: {
    version: '1.0.0',
    primaryTimeframe: '4h',
    additionalTimeframes: ['1h', '1d'],
    
    dataSources: [
      { type: 'ohlc', enabled: true },
      { type: 'orderbook', enabled: true },
      { type: 'funding', enabled: true },
    ],
    
    indicators: [
      createIndicator('ema_fast', 'ema', 'Fast EMA', [{ name: 'period', value: 20, min: 5, max: 50 }]),
      createIndicator('ema_slow', 'ema', 'Slow EMA', [{ name: 'period', value: 50, min: 20, max: 200 }]),
      createIndicator('ema_trend', 'ema', 'Trend EMA', [{ name: 'period', value: 200, min: 100, max: 500 }]),
      createIndicator('rsi', 'rsi', 'RSI', [{ name: 'period', value: 14, min: 7, max: 21 }]),
      createIndicator('atr', 'atr', 'ATR', [{ name: 'period', value: 14, min: 7, max: 21 }]),
    ],
    
    conditions: [
      createCondition('price_above_trend', 'Price above trend EMA', 'price', undefined, 'greater_than', 'indicator', 'ema_trend', 2),
      createCondition('price_below_trend', 'Price below trend EMA', 'price', undefined, 'less_than', 'indicator', 'ema_trend', 2),
      createCondition('ema_cross_up', 'Fast EMA crosses above Slow', 'indicator', 'ema_fast', 'crosses_above', 'indicator', 'ema_slow', 3),
      createCondition('ema_cross_down', 'Fast EMA crosses below Slow', 'indicator', 'ema_fast', 'crosses_below', 'indicator', 'ema_slow', 3),
      createCondition('rsi_bullish', 'RSI above 50', 'indicator', 'rsi', 'greater_than', 'number', 50, 1),
      createCondition('rsi_bearish', 'RSI below 50', 'indicator', 'rsi', 'less_than', 'number', 50, 1),
      createCondition('rsi_not_overbought', 'RSI not overbought', 'indicator', 'rsi', 'less_than', 'number', 70, 1),
      createCondition('rsi_not_oversold', 'RSI not oversold', 'indicator', 'rsi', 'greater_than', 'number', 30, 1),
    ],
    
    entryRules: [
      {
        id: 'long_entry',
        name: 'Long Entry',
        enabled: true,
        side: 'long' as const,
        conditionGroups: [
          { id: 'trend_group', conditions: ['price_above_trend', 'ema_cross_up'], logic: 'AND' as const },
          { id: 'momentum_group', conditions: ['rsi_bullish', 'rsi_not_overbought'], logic: 'AND' as const },
        ],
        groupLogic: 'AND' as const,
        priority: 1,
      },
      {
        id: 'short_entry',
        name: 'Short Entry',
        enabled: true,
        side: 'short' as const,
        conditionGroups: [
          { id: 'trend_group', conditions: ['price_below_trend', 'ema_cross_down'], logic: 'AND' as const },
          { id: 'momentum_group', conditions: ['rsi_bearish', 'rsi_not_oversold'], logic: 'AND' as const },
        ],
        groupLogic: 'AND' as const,
        priority: 1,
      },
    ],
    
    exitRules: [
      {
        id: 'stop_loss',
        name: 'Stop Loss',
        enabled: true,
        type: 'stop_loss' as const,
        config: { value: 2, valueType: 'atr_multiple' as const },
        priority: 1,
      },
      {
        id: 'take_profit',
        name: 'Take Profit',
        enabled: true,
        type: 'take_profit' as const,
        config: { value: 3, valueType: 'atr_multiple' as const },
        priority: 2,
      },
      {
        id: 'trailing_stop',
        name: 'Trailing Stop',
        enabled: true,
        type: 'trailing_stop' as const,
        config: {
          trailingDistance: 1.5,
          trailingStep: 0.5,
          activationProfit: 2,
        },
        priority: 3,
      },
    ],
    
    risk: {
      positionSizing: {
        method: 'fixed_percentage' as const,
        basePercentage: 2,
        maxPercentage: 5,
        minPercentage: 0.5,
      },
      stopLoss: { enabled: true, type: 'atr_multiple' as const, value: 2 },
      takeProfit: { enabled: true, type: 'atr_multiple' as const, value: 3 },
      limits: {
        maxOpenPositions: 1,
        maxDrawdownPercent: 10,
        maxDailyLoss: 5,
        maxDailyTrades: 5,
        maxLeverage: 5,
        cooldownAfterLossMs: 3600000,
        maxConsecutiveLosses: 3,
      },
    },
  },
};

// ============================================================================
// MEAN REVERSION TEMPLATE
// ============================================================================

export const meanReversionTemplate: StrategyTemplate = {
  id: 'mean-reversion-bb',
  name: 'Mean Reversion (Bollinger Bands)',
  description: 'Mean reversion strategy using Bollinger Bands and RSI extremes. Best for ranging markets.',
  category: 'mean_reversion',
  difficulty: 'intermediate',
  tags: ['mean-reversion', 'bollinger', 'rsi', 'range-trading'],
  
  highlightedParams: [
    { path: 'indicators[0].params[0].value', name: 'BB Period', description: 'Bollinger Bands lookback period' },
    { path: 'indicators[0].params[1].value', name: 'BB StdDev', description: 'Standard deviation multiplier' },
    { path: 'conditions[0].compareValue.value', name: 'RSI Oversold', description: 'RSI level for long entries' },
  ],
  
  backtestResults: {
    period: '2023-01-01 to 2024-01-01',
    winRate: 58.7,
    totalReturn: 32.4,
    maxDrawdown: 8.2,
    sharpeRatio: 1.65,
  },
  
  defaultConfig: {
    version: '1.0.0',
    primaryTimeframe: '1h',
    additionalTimeframes: ['15m', '4h'],
    
    dataSources: [
      { type: 'ohlc', enabled: true },
      { type: 'orderbook', enabled: true },
    ],
    
    indicators: [
      createIndicator('bb', 'bollinger', 'Bollinger Bands', [
        { name: 'period', value: 20, min: 10, max: 50 },
        { name: 'stdDev', value: 2, min: 1, max: 3 },
      ]),
      createIndicator('rsi', 'rsi', 'RSI', [{ name: 'period', value: 14, min: 7, max: 21 }]),
      createIndicator('atr', 'atr', 'ATR', [{ name: 'period', value: 14, min: 7, max: 21 }]),
      createIndicator('zscore', 'zscore', 'Z-Score', [{ name: 'period', value: 20, min: 10, max: 50 }]),
    ],
    
    conditions: [
      createCondition('rsi_oversold', 'RSI Oversold', 'indicator', 'rsi', 'less_than', 'number', 30, 2),
      createCondition('rsi_overbought', 'RSI Overbought', 'indicator', 'rsi', 'greater_than', 'number', 70, 2),
      createCondition('bb_lower', 'Price at lower BB', 'indicator', 'bb', 'less_than', 'number', -0.9, 2),
      createCondition('bb_upper', 'Price at upper BB', 'indicator', 'bb', 'greater_than', 'number', 0.9, 2),
      createCondition('zscore_low', 'Z-Score below -2', 'indicator', 'zscore', 'less_than', 'number', -2, 1),
      createCondition('zscore_high', 'Z-Score above 2', 'indicator', 'zscore', 'greater_than', 'number', 2, 1),
    ],
    
    entryRules: [
      {
        id: 'long_entry',
        name: 'Long Entry (Oversold)',
        enabled: true,
        side: 'long' as const,
        conditionGroups: [
          { id: 'main', conditions: ['rsi_oversold', 'bb_lower'], logic: 'AND' as const },
        ],
        groupLogic: 'AND' as const,
        priority: 1,
      },
      {
        id: 'short_entry',
        name: 'Short Entry (Overbought)',
        enabled: true,
        side: 'short' as const,
        conditionGroups: [
          { id: 'main', conditions: ['rsi_overbought', 'bb_upper'], logic: 'AND' as const },
        ],
        groupLogic: 'AND' as const,
        priority: 1,
      },
    ],
    
    exitRules: [
      {
        id: 'stop_loss',
        name: 'Stop Loss',
        enabled: true,
        type: 'stop_loss' as const,
        config: { value: 1.5, valueType: 'atr_multiple' as const },
        priority: 1,
      },
      {
        id: 'take_profit',
        name: 'Take Profit (Mean)',
        enabled: true,
        type: 'take_profit' as const,
        config: { value: 2, valueType: 'atr_multiple' as const },
        priority: 2,
      },
    ],
    
    risk: {
      positionSizing: {
        method: 'volatility_adjusted' as const,
        basePercentage: 1.5,
        maxPercentage: 4,
        minPercentage: 0.5,
        volatilityLookback: 20,
      },
      stopLoss: { enabled: true, type: 'atr_multiple' as const, value: 1.5 },
      takeProfit: { enabled: true, type: 'atr_multiple' as const, value: 2 },
      limits: {
        maxOpenPositions: 2,
        maxDrawdownPercent: 8,
        maxDailyLoss: 4,
        maxDailyTrades: 8,
        maxLeverage: 3,
        cooldownAfterLossMs: 1800000,
        maxConsecutiveLosses: 4,
      },
    },
  },
};

// ============================================================================
// MOMENTUM SCALPING TEMPLATE
// ============================================================================

export const momentumScalpingTemplate: StrategyTemplate = {
  id: 'momentum-scalping',
  name: 'Momentum Scalping',
  description: 'Fast momentum scalping strategy using MACD and volume confirmation. High frequency, small profits.',
  category: 'scalping',
  difficulty: 'advanced',
  tags: ['scalping', 'momentum', 'macd', 'high-frequency'],
  
  highlightedParams: [
    { path: 'indicators[0].params[0].value', name: 'MACD Fast', description: 'Fast EMA period for MACD' },
    { path: 'risk.limits.maxDailyTrades', name: 'Max Daily Trades', description: 'Maximum trades per day' },
    { path: 'risk.positionSizing.basePercentage', name: 'Position Size %', description: 'Risk per trade' },
  ],
  
  backtestResults: {
    period: '2023-01-01 to 2024-01-01',
    winRate: 61.2,
    totalReturn: 89.3,
    maxDrawdown: 15.7,
    sharpeRatio: 1.28,
  },
  
  defaultConfig: {
    version: '1.0.0',
    primaryTimeframe: '5m',
    additionalTimeframes: ['1m', '15m'],
    
    dataSources: [
      { type: 'ohlc', enabled: true },
      { type: 'orderbook', enabled: true },
      { type: 'trades', enabled: true },
    ],
    
    indicators: [
      createIndicator('macd', 'macd', 'MACD', [
        { name: 'fast', value: 12, min: 8, max: 20 },
        { name: 'slow', value: 26, min: 20, max: 40 },
        { name: 'signal', value: 9, min: 5, max: 15 },
      ]),
      createIndicator('rsi', 'rsi', 'RSI', [{ name: 'period', value: 7, min: 5, max: 14 }]),
      createIndicator('atr', 'atr', 'ATR', [{ name: 'period', value: 10, min: 5, max: 20 }]),
      createIndicator('ema_fast', 'ema', 'Fast EMA', [{ name: 'period', value: 9, min: 5, max: 20 }]),
      createIndicator('vwap', 'vwap', 'VWAP', []),
    ],
    
    conditions: [
      createCondition('macd_bullish', 'MACD Bullish', 'indicator', 'macd', 'greater_than', 'number', 0, 2),
      createCondition('macd_bearish', 'MACD Bearish', 'indicator', 'macd', 'less_than', 'number', 0, 2),
      createCondition('rsi_momentum_up', 'RSI Momentum Up', 'indicator', 'rsi', 'greater_than', 'number', 55, 1),
      createCondition('rsi_momentum_down', 'RSI Momentum Down', 'indicator', 'rsi', 'less_than', 'number', 45, 1),
      createCondition('price_above_vwap', 'Price above VWAP', 'price', undefined, 'greater_than', 'indicator', 'vwap', 1),
      createCondition('price_below_vwap', 'Price below VWAP', 'price', undefined, 'less_than', 'indicator', 'vwap', 1),
    ],
    
    entryRules: [
      {
        id: 'long_scalp',
        name: 'Long Scalp',
        enabled: true,
        side: 'long' as const,
        conditionGroups: [
          { id: 'momentum', conditions: ['macd_bullish', 'rsi_momentum_up', 'price_above_vwap'], logic: 'AND' as const },
        ],
        groupLogic: 'AND' as const,
        priority: 1,
      },
      {
        id: 'short_scalp',
        name: 'Short Scalp',
        enabled: true,
        side: 'short' as const,
        conditionGroups: [
          { id: 'momentum', conditions: ['macd_bearish', 'rsi_momentum_down', 'price_below_vwap'], logic: 'AND' as const },
        ],
        groupLogic: 'AND' as const,
        priority: 1,
      },
    ],
    
    exitRules: [
      {
        id: 'stop_loss',
        name: 'Tight Stop',
        enabled: true,
        type: 'stop_loss' as const,
        config: { value: 0.5, valueType: 'percentage' as const },
        priority: 1,
      },
      {
        id: 'take_profit',
        name: 'Quick Profit',
        enabled: true,
        type: 'take_profit' as const,
        config: { value: 0.8, valueType: 'percentage' as const },
        priority: 2,
      },
    ],
    
    risk: {
      positionSizing: {
        method: 'fixed_percentage' as const,
        basePercentage: 1,
        maxPercentage: 2,
        minPercentage: 0.5,
      },
      stopLoss: { enabled: true, type: 'percentage' as const, value: 0.5 },
      takeProfit: { enabled: true, type: 'percentage' as const, value: 0.8 },
      limits: {
        maxOpenPositions: 1,
        maxDrawdownPercent: 5,
        maxDailyLoss: 3,
        maxDailyTrades: 20,
        maxLeverage: 10,
        cooldownAfterLossMs: 300000,
        maxConsecutiveLosses: 5,
      },
    },
  },
};

// ============================================================================
// BREAKOUT TEMPLATE
// ============================================================================

export const breakoutTemplate: StrategyTemplate = {
  id: 'breakout-donchian',
  name: 'Breakout (Donchian Channel)',
  description: 'Classic breakout strategy using Donchian channels with volume confirmation.',
  category: 'breakout',
  difficulty: 'intermediate',
  tags: ['breakout', 'donchian', 'volume', 'trend'],
  
  highlightedParams: [
    { path: 'indicators[0].params[0].value', name: 'Channel Period', description: 'Donchian channel lookback' },
    { path: 'risk.limits.maxLeverage', name: 'Max Leverage', description: 'Maximum leverage allowed' },
  ],
  
  defaultConfig: {
    version: '1.0.0',
    primaryTimeframe: '4h',
    additionalTimeframes: ['1h', '1d'],
    
    dataSources: [
      { type: 'ohlc', enabled: true },
      { type: 'orderbook', enabled: true },
    ],
    
    indicators: [
      createIndicator('donchian', 'donchian', 'Donchian Channel', [{ name: 'period', value: 20, min: 10, max: 50 }]),
      createIndicator('atr', 'atr', 'ATR', [{ name: 'period', value: 14, min: 7, max: 21 }]),
      createIndicator('adx', 'adx', 'ADX', [{ name: 'period', value: 14, min: 7, max: 21 }]),
      createIndicator('obv', 'obv', 'OBV', []),
    ],
    
    conditions: [
      createCondition('adx_strong', 'ADX Strong Trend', 'indicator', 'adx', 'greater_than', 'number', 25, 2),
    ],
    
    entryRules: [
      {
        id: 'long_breakout',
        name: 'Long Breakout',
        enabled: true,
        side: 'long' as const,
        conditionGroups: [
          { id: 'breakout', conditions: ['adx_strong'], logic: 'AND' as const },
        ],
        groupLogic: 'AND' as const,
        priority: 1,
      },
    ],
    
    exitRules: [
      {
        id: 'stop_loss',
        name: 'Stop Loss',
        enabled: true,
        type: 'stop_loss' as const,
        config: { value: 2, valueType: 'atr_multiple' as const },
        priority: 1,
      },
      {
        id: 'trailing_stop',
        name: 'Trailing Stop',
        enabled: true,
        type: 'trailing_stop' as const,
        config: {
          trailingDistance: 2,
          trailingStep: 0.5,
          activationProfit: 3,
        },
        priority: 2,
      },
    ],
    
    risk: {
      positionSizing: {
        method: 'kelly' as const,
        basePercentage: 2,
        maxPercentage: 5,
        minPercentage: 0.5,
        kellyFraction: 0.25,
      },
      stopLoss: { enabled: true, type: 'atr_multiple' as const, value: 2 },
      takeProfit: { enabled: false, type: 'atr_multiple' as const, value: 0 },
      limits: {
        maxOpenPositions: 1,
        maxDrawdownPercent: 12,
        maxDailyLoss: 6,
        maxDailyTrades: 3,
        maxLeverage: 5,
        cooldownAfterLossMs: 7200000,
        maxConsecutiveLosses: 3,
      },
    },
  },
};

// ============================================================================
// AI-ASSISTED TEMPLATE
// ============================================================================

export const aiAssistedTemplate: StrategyTemplate = {
  id: 'ai-assisted',
  name: 'AI-Assisted Trading',
  description: 'Combines technical analysis with Grok AI confirmation for higher confidence trades.',
  category: 'trend',
  difficulty: 'beginner',
  tags: ['ai', 'grok', 'confirmation', 'smart'],
  author: 'Watchtower Team',
  verified: true,
  
  highlightedParams: [
    { path: 'ai.minConfidenceToTrade', name: 'AI Confidence Threshold', description: 'Minimum AI confidence to trade' },
    { path: 'ai.maxCallsPerDay', name: 'Max AI Calls/Day', description: 'Daily limit for AI analysis' },
  ],
  
  defaultConfig: {
    version: '1.0.0',
    primaryTimeframe: '1h',
    additionalTimeframes: ['4h'],
    
    dataSources: [
      { type: 'ohlc', enabled: true },
      { type: 'orderbook', enabled: true },
      { type: 'funding', enabled: true },
      { type: 'liquidations', enabled: true },
    ],
    
    indicators: [
      createIndicator('ema_20', 'ema', 'EMA 20', [{ name: 'period', value: 20 }]),
      createIndicator('ema_50', 'ema', 'EMA 50', [{ name: 'period', value: 50 }]),
      createIndicator('rsi', 'rsi', 'RSI', [{ name: 'period', value: 14 }]),
      createIndicator('atr', 'atr', 'ATR', [{ name: 'period', value: 14 }]),
      createIndicator('orderbook_imbalance', 'orderbook_imbalance', 'Orderbook Imbalance', []),
    ],
    
    conditions: [
      createCondition('ema_bullish', 'EMA Bullish', 'indicator', 'ema_20', 'greater_than', 'indicator', 'ema_50', 2),
      createCondition('ema_bearish', 'EMA Bearish', 'indicator', 'ema_20', 'less_than', 'indicator', 'ema_50', 2),
      createCondition('rsi_neutral', 'RSI Neutral', 'indicator', 'rsi', 'between', 'number', 40, 1),
    ],
    
    entryRules: [
      {
        id: 'ai_long',
        name: 'AI-Confirmed Long',
        enabled: true,
        side: 'long' as const,
        conditionGroups: [
          { id: 'technical', conditions: ['ema_bullish'], logic: 'AND' as const },
        ],
        groupLogic: 'AND' as const,
        priority: 1,
      },
      {
        id: 'ai_short',
        name: 'AI-Confirmed Short',
        enabled: true,
        side: 'short' as const,
        conditionGroups: [
          { id: 'technical', conditions: ['ema_bearish'], logic: 'AND' as const },
        ],
        groupLogic: 'AND' as const,
        priority: 1,
      },
    ],
    
    exitRules: [
      {
        id: 'stop_loss',
        name: 'Stop Loss',
        enabled: true,
        type: 'stop_loss' as const,
        config: { value: 2, valueType: 'atr_multiple' as const },
        priority: 1,
      },
      {
        id: 'take_profit',
        name: 'Take Profit',
        enabled: true,
        type: 'take_profit' as const,
        config: { value: 3, valueType: 'atr_multiple' as const },
        priority: 2,
      },
    ],
    
    risk: {
      positionSizing: {
        method: 'fixed_percentage' as const,
        basePercentage: 2,
        maxPercentage: 5,
        minPercentage: 0.5,
      },
      stopLoss: { enabled: true, type: 'atr_multiple' as const, value: 2 },
      takeProfit: { enabled: true, type: 'atr_multiple' as const, value: 3 },
      limits: {
        maxOpenPositions: 1,
        maxDrawdownPercent: 10,
        maxDailyLoss: 5,
        maxDailyTrades: 5,
        maxLeverage: 5,
        cooldownAfterLossMs: 3600000,
        maxConsecutiveLosses: 3,
      },
    },
    
    ai: {
      enabled: true,
      provider: 'grok' as const,
      mode: 'confirmation' as const,
      minConfidenceToTrade: 65,
      minConfidenceToOverride: 80,
      maxCallsPerDay: 20,
      minCooldownMs: 300000,
      includeContext: {
        technicalIndicators: true,
        orderbook: true,
        funding: true,
        recentTrades: true,
        marketSentiment: true,
        news: false,
      },
    },
  },
};

// ============================================================================
// ALL TEMPLATES
// ============================================================================

export const ALL_STRATEGY_TEMPLATES: StrategyTemplate[] = [
  trendFollowingTemplate,
  meanReversionTemplate,
  momentumScalpingTemplate,
  breakoutTemplate,
  aiAssistedTemplate,
];

export const getTemplateById = (id: string): StrategyTemplate | undefined => {
  return ALL_STRATEGY_TEMPLATES.find(t => t.id === id);
};

export const getTemplatesByCategory = (category: string): StrategyTemplate[] => {
  return ALL_STRATEGY_TEMPLATES.filter(t => t.category === category);
};

export const getTemplatesByDifficulty = (difficulty: string): StrategyTemplate[] => {
  return ALL_STRATEGY_TEMPLATES.filter(t => t.difficulty === difficulty);
};

export default ALL_STRATEGY_TEMPLATES;
