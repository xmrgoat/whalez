// Strategy Templates

import { StrategyTemplate, Indicator } from './types';

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'ema-crossover',
    name: 'EMA Crossover',
    description: 'Classic trend-following strategy using fast/slow EMA crossovers',
    icon: 'TrendingUp',
    category: 'trend',
    difficulty: 'beginner',
    winRate: 52,
    avgReturn: 1.8,
    indicators: ['ema_fast', 'ema_slow'],
    defaultConfig: {
      strategyType: 'ema_crossover',
      indicators: [
        { id: '1', indicatorId: 'ema', params: { period: 9, source: 'close' }, enabled: true },
        { id: '2', indicatorId: 'ema', params: { period: 21, source: 'close' }, enabled: true },
      ],
    },
  },
  {
    id: 'rsi-oversold',
    name: 'RSI Mean Reversion',
    description: 'Buy oversold, sell overbought using RSI levels',
    icon: 'Activity',
    category: 'mean-reversion',
    difficulty: 'beginner',
    winRate: 58,
    avgReturn: 1.2,
    indicators: ['rsi'],
    defaultConfig: {
      strategyType: 'rsi_mean_reversion',
      indicators: [
        { id: '1', indicatorId: 'rsi', params: { period: 14, overbought: 70, oversold: 30 }, enabled: true },
      ],
    },
  },
  {
    id: 'macd-momentum',
    name: 'MACD Momentum',
    description: 'Trade momentum using MACD histogram and signal line',
    icon: 'BarChart3',
    category: 'momentum',
    difficulty: 'intermediate',
    winRate: 48,
    avgReturn: 2.4,
    indicators: ['macd'],
    defaultConfig: {
      strategyType: 'macd_momentum',
      indicators: [
        { id: '1', indicatorId: 'macd', params: { fast: 12, slow: 26, signal: 9 }, enabled: true },
      ],
    },
  },
  {
    id: 'bollinger-breakout',
    name: 'Bollinger Breakout',
    description: 'Trade breakouts from Bollinger Bands with volume confirmation',
    icon: 'Zap',
    category: 'breakout',
    difficulty: 'intermediate',
    winRate: 45,
    avgReturn: 3.2,
    indicators: ['bollinger', 'volume'],
    defaultConfig: {
      strategyType: 'bollinger_breakout',
      indicators: [
        { id: '1', indicatorId: 'bollinger', params: { period: 20, stdDev: 2 }, enabled: true },
        { id: '2', indicatorId: 'volume_sma', params: { period: 20 }, enabled: true },
      ],
    },
  },
  {
    id: 'supertrend',
    name: 'SuperTrend',
    description: 'Follow the trend with SuperTrend indicator and ATR-based stops',
    icon: 'Rocket',
    category: 'trend',
    difficulty: 'beginner',
    winRate: 50,
    avgReturn: 2.1,
    indicators: ['supertrend', 'atr'],
    defaultConfig: {
      strategyType: 'supertrend',
      indicators: [
        { id: '1', indicatorId: 'supertrend', params: { period: 10, multiplier: 3 }, enabled: true },
      ],
    },
  },
  {
    id: 'scalping-pro',
    name: 'Scalping Pro',
    description: 'High-frequency scalping with multiple confirmations',
    icon: 'Timer',
    category: 'scalping',
    difficulty: 'advanced',
    winRate: 62,
    avgReturn: 0.5,
    indicators: ['ema', 'rsi', 'vwap', 'volume'],
    defaultConfig: {
      strategyType: 'scalping',
      timeframe: '1m',
      indicators: [
        { id: '1', indicatorId: 'ema', params: { period: 9 }, enabled: true },
        { id: '2', indicatorId: 'rsi', params: { period: 7 }, enabled: true },
        { id: '3', indicatorId: 'vwap', params: {}, enabled: true },
      ],
    },
  },
  {
    id: 'grid-trading',
    name: 'Grid Trading',
    description: 'Automated grid orders for ranging markets',
    icon: 'Grid3x3',
    category: 'mean-reversion',
    difficulty: 'advanced',
    winRate: 70,
    avgReturn: 0.8,
    indicators: ['atr', 'bollinger'],
    defaultConfig: {
      strategyType: 'grid',
    },
  },
  {
    id: 'custom',
    name: 'Custom Strategy',
    description: 'Build your own strategy from scratch',
    icon: 'Wrench',
    category: 'custom',
    difficulty: 'advanced',
    indicators: [],
    defaultConfig: {
      strategyType: 'custom',
    },
  },
];

export const AVAILABLE_INDICATORS: Indicator[] = [
  {
    id: 'ema',
    name: 'EMA',
    type: 'trend',
    description: 'Exponential Moving Average',
    params: [
      { name: 'period', type: 'number', default: 20, min: 1, max: 500 },
      { name: 'source', type: 'select', default: 'close', options: [
        { value: 'close', label: 'Close' },
        { value: 'open', label: 'Open' },
        { value: 'high', label: 'High' },
        { value: 'low', label: 'Low' },
        { value: 'hl2', label: 'HL2' },
        { value: 'hlc3', label: 'HLC3' },
      ]},
    ],
  },
  {
    id: 'sma',
    name: 'SMA',
    type: 'trend',
    description: 'Simple Moving Average',
    params: [
      { name: 'period', type: 'number', default: 20, min: 1, max: 500 },
      { name: 'source', type: 'select', default: 'close', options: [
        { value: 'close', label: 'Close' },
        { value: 'open', label: 'Open' },
        { value: 'high', label: 'High' },
        { value: 'low', label: 'Low' },
      ]},
    ],
  },
  {
    id: 'rsi',
    name: 'RSI',
    type: 'momentum',
    description: 'Relative Strength Index',
    params: [
      { name: 'period', type: 'number', default: 14, min: 2, max: 100 },
      { name: 'overbought', type: 'number', default: 70, min: 50, max: 100 },
      { name: 'oversold', type: 'number', default: 30, min: 0, max: 50 },
    ],
  },
  {
    id: 'macd',
    name: 'MACD',
    type: 'momentum',
    description: 'Moving Average Convergence Divergence',
    params: [
      { name: 'fast', type: 'number', default: 12, min: 1, max: 100 },
      { name: 'slow', type: 'number', default: 26, min: 1, max: 200 },
      { name: 'signal', type: 'number', default: 9, min: 1, max: 50 },
    ],
  },
  {
    id: 'bollinger',
    name: 'Bollinger Bands',
    type: 'volatility',
    description: 'Bollinger Bands with standard deviation',
    params: [
      { name: 'period', type: 'number', default: 20, min: 5, max: 100 },
      { name: 'stdDev', type: 'number', default: 2, min: 0.5, max: 5 },
    ],
  },
  {
    id: 'atr',
    name: 'ATR',
    type: 'volatility',
    description: 'Average True Range',
    params: [
      { name: 'period', type: 'number', default: 14, min: 1, max: 100 },
    ],
  },
  {
    id: 'supertrend',
    name: 'SuperTrend',
    type: 'trend',
    description: 'SuperTrend indicator',
    params: [
      { name: 'period', type: 'number', default: 10, min: 1, max: 100 },
      { name: 'multiplier', type: 'number', default: 3, min: 0.5, max: 10 },
    ],
  },
  {
    id: 'stochastic',
    name: 'Stochastic',
    type: 'momentum',
    description: 'Stochastic Oscillator',
    params: [
      { name: 'kPeriod', type: 'number', default: 14, min: 1, max: 100 },
      { name: 'dPeriod', type: 'number', default: 3, min: 1, max: 50 },
      { name: 'smooth', type: 'number', default: 3, min: 1, max: 50 },
    ],
  },
  {
    id: 'vwap',
    name: 'VWAP',
    type: 'volume',
    description: 'Volume Weighted Average Price',
    params: [],
  },
  {
    id: 'volume_sma',
    name: 'Volume SMA',
    type: 'volume',
    description: 'Volume Simple Moving Average',
    params: [
      { name: 'period', type: 'number', default: 20, min: 1, max: 100 },
    ],
  },
  {
    id: 'adx',
    name: 'ADX',
    type: 'trend',
    description: 'Average Directional Index',
    params: [
      { name: 'period', type: 'number', default: 14, min: 1, max: 100 },
    ],
  },
  {
    id: 'cci',
    name: 'CCI',
    type: 'momentum',
    description: 'Commodity Channel Index',
    params: [
      { name: 'period', type: 'number', default: 20, min: 1, max: 100 },
    ],
  },
];

export const CONDITION_OPERATORS = [
  { value: 'crosses_above', label: 'Crosses Above' },
  { value: 'crosses_below', label: 'Crosses Below' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'equals', label: 'Equals' },
];
