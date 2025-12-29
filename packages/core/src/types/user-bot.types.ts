/**
 * USER BOT TYPES
 * Types et interfaces pour le système de bots personnalisables
 * Ultra complet et professionnel
 */

import { z } from 'zod';

// ============================================================================
// DATA SOURCE CONFIGURATION
// Sources de données que le bot peut utiliser
// ============================================================================

export type DataSourceType = 
  | 'ohlc'           // Candles OHLC
  | 'orderbook'      // Orderbook L2
  | 'trades'         // Trades en temps réel
  | 'funding'        // Funding rate
  | 'liquidations'   // Liquidations
  | 'open_interest'  // Open Interest
  | 'volume_profile' // Volume Profile
  | 'market_info';   // Info marché (leverage, tick size, etc.)

export interface DataSourceConfig {
  type: DataSourceType;
  enabled: boolean;
  params?: Record<string, any>;
}

export const DataSourceConfigSchema = z.object({
  type: z.enum(['ohlc', 'orderbook', 'trades', 'funding', 'liquidations', 'open_interest', 'volume_profile', 'market_info']),
  enabled: z.boolean(),
  params: z.record(z.any()).optional(),
});

// ============================================================================
// INDICATOR CONFIGURATION
// Configuration complète des indicateurs
// ============================================================================

export type IndicatorType = 
  // Trend
  | 'ema' | 'sma' | 'wma' | 'vwma'
  // Momentum
  | 'rsi' | 'macd' | 'stochastic' | 'cci' | 'williams_r' | 'roc' | 'momentum'
  // Volatility
  | 'atr' | 'bollinger' | 'keltner' | 'donchian' | 'adr'
  // Volume
  | 'obv' | 'vwap' | 'mfi' | 'ad' | 'cmf'
  // Quantitative
  | 'zscore' | 'hurst' | 'adx' | 'kelly' | 'var'
  // Microstructure
  | 'orderbook_imbalance' | 'spread' | 'volume_delta' | 'cvd'
  // Custom
  | 'custom';

export interface IndicatorParam {
  name: string;
  type: 'number' | 'boolean' | 'string' | 'select';
  value: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  description?: string;
}

export interface UserIndicatorConfig {
  id: string;
  type: IndicatorType;
  name: string;
  enabled: boolean;
  params: IndicatorParam[];
  // Pour les indicateurs custom
  customFormula?: string;
  // Affichage
  color?: string;
  lineWidth?: number;
  overlay?: boolean; // Sur le chart ou panneau séparé
}

export const UserIndicatorConfigSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  params: z.array(z.object({
    name: z.string(),
    type: z.enum(['number', 'boolean', 'string', 'select']),
    value: z.any(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    options: z.array(z.string()).optional(),
    description: z.string().optional(),
  })),
  customFormula: z.string().optional(),
  color: z.string().optional(),
  lineWidth: z.number().optional(),
  overlay: z.boolean().optional(),
});

// ============================================================================
// CONDITION CONFIGURATION
// Conditions d'entrée/sortie personnalisables
// ============================================================================

export type ConditionOperator = 
  | 'greater_than' | 'less_than' 
  | 'equals' | 'not_equals'
  | 'crosses_above' | 'crosses_below'
  | 'between' | 'outside'
  | 'increasing' | 'decreasing'
  | 'is_bullish' | 'is_bearish';

export type ConditionValueType = 
  | 'number'           // Valeur fixe
  | 'indicator'        // Autre indicateur
  | 'price'            // Prix actuel
  | 'percentage'       // Pourcentage
  | 'atr_multiple';    // Multiple de l'ATR

export interface ConditionValue {
  type: ConditionValueType;
  value: number | string;
  indicatorId?: string; // Si type = 'indicator'
}

export interface TradingCondition {
  id: string;
  name: string;
  enabled: boolean;
  
  // Source de la condition
  source: {
    type: 'indicator' | 'price' | 'volume' | 'orderbook' | 'funding' | 'custom';
    indicatorId?: string;
    field?: string; // ex: 'close', 'high', 'imbalance'
  };
  
  // Opérateur
  operator: ConditionOperator;
  
  // Valeur de comparaison
  compareValue: ConditionValue;
  
  // Valeur secondaire (pour 'between', 'outside')
  compareValue2?: ConditionValue;
  
  // Lookback (pour 'increasing', 'decreasing')
  lookbackPeriods?: number;
  
  // Poids de la condition (pour scoring)
  weight?: number;
  
  // Description pour l'UI
  description?: string;
}

export const TradingConditionSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  source: z.object({
    type: z.enum(['indicator', 'price', 'volume', 'orderbook', 'funding', 'custom']),
    indicatorId: z.string().optional(),
    field: z.string().optional(),
  }),
  operator: z.enum([
    'greater_than', 'less_than', 'equals', 'not_equals',
    'crosses_above', 'crosses_below', 'between', 'outside',
    'increasing', 'decreasing', 'is_bullish', 'is_bearish'
  ]),
  compareValue: z.object({
    type: z.enum(['number', 'indicator', 'price', 'percentage', 'atr_multiple']),
    value: z.union([z.number(), z.string()]),
    indicatorId: z.string().optional(),
  }),
  compareValue2: z.object({
    type: z.enum(['number', 'indicator', 'price', 'percentage', 'atr_multiple']),
    value: z.union([z.number(), z.string()]),
    indicatorId: z.string().optional(),
  }).optional(),
  lookbackPeriods: z.number().optional(),
  weight: z.number().optional(),
  description: z.string().optional(),
});

// ============================================================================
// ENTRY/EXIT RULES
// Règles d'entrée et de sortie
// ============================================================================

export type LogicOperator = 'AND' | 'OR';

export interface ConditionGroup {
  id: string;
  conditions: string[]; // IDs des conditions
  logic: LogicOperator;
  minConditionsMet?: number; // Pour OR avec minimum
}

export interface EntryRule {
  id: string;
  name: string;
  enabled: boolean;
  side: 'long' | 'short' | 'both';
  
  // Groupes de conditions (avec logique entre groupes)
  conditionGroups: ConditionGroup[];
  groupLogic: LogicOperator;
  
  // Filtres additionnels
  filters?: {
    minVolatility?: number;
    maxVolatility?: number;
    minVolume?: number;
    trendFilter?: 'with_trend' | 'counter_trend' | 'any';
    sessionFilter?: string[]; // ex: ['london', 'new_york']
    dayFilter?: number[]; // 0-6 (dimanche-samedi)
  };
  
  // Confirmation
  confirmationTimeframes?: string[];
  minConfirmations?: number;
  
  // Priorité (si plusieurs règles matchent)
  priority?: number;
}

export interface ExitRule {
  id: string;
  name: string;
  enabled: boolean;
  type: 'stop_loss' | 'take_profit' | 'trailing_stop' | 'time_based' | 'signal_based' | 'partial';
  
  // Configuration selon le type
  config: {
    // Stop Loss / Take Profit
    value?: number;
    valueType?: 'percentage' | 'atr_multiple' | 'fixed_price' | 'indicator';
    indicatorId?: string;
    
    // Trailing Stop
    trailingDistance?: number;
    trailingStep?: number;
    activationProfit?: number;
    
    // Time-based
    maxHoldingTimeMs?: number;
    closeAtTime?: string; // HH:MM
    
    // Signal-based
    conditionGroups?: ConditionGroup[];
    
    // Partial exit
    partialPercentage?: number;
    partialConditions?: string[];
  };
  
  priority?: number;
}

// ============================================================================
// RISK CONFIGURATION
// Configuration du risque personnalisable
// ============================================================================

export interface UserRiskConfig {
  // Position Sizing
  positionSizing: {
    method: 'fixed_percentage' | 'kelly' | 'volatility_adjusted' | 'risk_parity' | 'custom';
    basePercentage: number; // % du capital
    maxPercentage: number;
    minPercentage: number;
    kellyFraction?: number; // 0.25 = quarter Kelly
    volatilityLookback?: number;
  };
  
  // Stop Loss
  stopLoss: {
    enabled: boolean;
    type: 'atr_multiple' | 'percentage' | 'fixed' | 'indicator' | 'swing';
    value: number;
    indicatorId?: string;
  };
  
  // Take Profit
  takeProfit: {
    enabled: boolean;
    type: 'atr_multiple' | 'percentage' | 'fixed' | 'indicator' | 'risk_reward';
    value: number;
    indicatorId?: string;
    riskRewardRatio?: number;
  };
  
  // Trailing Stop
  trailingStop?: {
    enabled: boolean;
    activationProfit: number; // % profit pour activer
    trailingDistance: number;
    trailingStep: number;
  };
  
  // Limites globales
  limits: {
    maxOpenPositions: number;
    maxDrawdownPercent: number;
    maxDailyLoss: number;
    maxDailyTrades: number;
    maxLeverage: number;
    cooldownAfterLossMs: number;
    maxConsecutiveLosses: number;
  };
  
  // Ajustements dynamiques
  dynamicAdjustments?: {
    reduceAfterLoss: boolean;
    lossReductionFactor: number;
    increaseAfterWin: boolean;
    winIncreaseFactor: number;
    volatilityScaling: boolean;
  };
}

export const UserRiskConfigSchema = z.object({
  positionSizing: z.object({
    method: z.enum(['fixed_percentage', 'kelly', 'volatility_adjusted', 'risk_parity', 'custom']),
    basePercentage: z.number().min(0.1).max(100),
    maxPercentage: z.number().min(0.1).max(100),
    minPercentage: z.number().min(0.1).max(100),
    kellyFraction: z.number().optional(),
    volatilityLookback: z.number().optional(),
  }),
  stopLoss: z.object({
    enabled: z.boolean(),
    type: z.enum(['atr_multiple', 'percentage', 'fixed', 'indicator', 'swing']),
    value: z.number(),
    indicatorId: z.string().optional(),
  }),
  takeProfit: z.object({
    enabled: z.boolean(),
    type: z.enum(['atr_multiple', 'percentage', 'fixed', 'indicator', 'risk_reward']),
    value: z.number(),
    indicatorId: z.string().optional(),
    riskRewardRatio: z.number().optional(),
  }),
  trailingStop: z.object({
    enabled: z.boolean(),
    activationProfit: z.number(),
    trailingDistance: z.number(),
    trailingStep: z.number(),
  }).optional(),
  limits: z.object({
    maxOpenPositions: z.number().min(1).max(10),
    maxDrawdownPercent: z.number().min(1).max(50),
    maxDailyLoss: z.number(),
    maxDailyTrades: z.number().min(1).max(100),
    maxLeverage: z.number().min(1).max(100),
    cooldownAfterLossMs: z.number(),
    maxConsecutiveLosses: z.number().min(1).max(20),
  }),
  dynamicAdjustments: z.object({
    reduceAfterLoss: z.boolean(),
    lossReductionFactor: z.number(),
    increaseAfterWin: z.boolean(),
    winIncreaseFactor: z.number(),
    volatilityScaling: z.boolean(),
  }).optional(),
});

// ============================================================================
// AI CONFIGURATION
// Configuration de l'IA (Grok)
// ============================================================================

export interface AIConfig {
  enabled: boolean;
  provider: 'grok' | 'openai' | 'anthropic' | 'local';
  
  // Mode d'utilisation
  mode: 'confirmation' | 'signal_generation' | 'analysis_only' | 'full_control';
  
  // Seuils
  minConfidenceToTrade: number;
  minConfidenceToOverride: number;
  
  // Limites d'appels
  maxCallsPerDay: number;
  minCooldownMs: number;
  
  // Prompt personnalisé
  customPrompt?: string;
  
  // Contexte à inclure
  includeContext: {
    technicalIndicators: boolean;
    orderbook: boolean;
    funding: boolean;
    recentTrades: boolean;
    marketSentiment: boolean;
    news: boolean;
  };
}

// ============================================================================
// COMPLETE USER BOT STRATEGY CONFIG
// Configuration complète de la stratégie
// ============================================================================

export interface UserBotStrategyConfig {
  // Métadonnées
  version: string;
  createdAt: number;
  updatedAt: number;
  
  // Trading pair et timeframe
  symbol: string;
  primaryTimeframe: string;
  additionalTimeframes?: string[];
  
  // Sources de données
  dataSources: DataSourceConfig[];
  
  // Indicateurs
  indicators: UserIndicatorConfig[];
  
  // Conditions
  conditions: TradingCondition[];
  
  // Règles d'entrée
  entryRules: EntryRule[];
  
  // Règles de sortie
  exitRules: ExitRule[];
  
  // Configuration du risque
  risk: UserRiskConfig;
  
  // Configuration AI
  ai?: AIConfig;
  
  // Paramètres avancés
  advanced?: {
    // Slippage
    maxSlippagePercent: number;
    
    // Exécution
    orderType: 'market' | 'limit' | 'adaptive';
    limitOrderOffset: number;
    
    // Retry
    maxRetries: number;
    retryDelayMs: number;
    
    // Logging
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    saveAllSignals: boolean;
    
    // Paper trading
    paperTrading: boolean;
    paperBalance: number;
  };
}

export const UserBotStrategyConfigSchema = z.object({
  version: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  symbol: z.string(),
  primaryTimeframe: z.string(),
  additionalTimeframes: z.array(z.string()).optional(),
  dataSources: z.array(DataSourceConfigSchema),
  indicators: z.array(UserIndicatorConfigSchema),
  conditions: z.array(TradingConditionSchema),
  entryRules: z.array(z.any()), // Simplified for now
  exitRules: z.array(z.any()),
  risk: UserRiskConfigSchema,
  ai: z.any().optional(),
  advanced: z.any().optional(),
});

// ============================================================================
// USER BOT STATUS & EVENTS
// ============================================================================

export type UserBotStatus = 
  | 'DRAFT'      // En cours de création
  | 'READY'      // Prêt à démarrer
  | 'STARTING'   // En cours de démarrage
  | 'RUNNING'    // En cours d'exécution
  | 'PAUSED'     // En pause
  | 'STOPPING'   // En cours d'arrêt
  | 'STOPPED'    // Arrêté
  | 'ERROR';     // Erreur

export type UserBotEventType =
  | 'started'
  | 'stopped'
  | 'paused'
  | 'resumed'
  | 'signal_generated'
  | 'trade_opened'
  | 'trade_closed'
  | 'error'
  | 'config_updated'
  | 'risk_alert'
  | 'ai_analysis';

export interface UserBotEvent {
  id: string;
  botId: string;
  type: UserBotEventType;
  timestamp: number;
  data: any;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

// ============================================================================
// USER BOT RUNTIME STATE
// État runtime du bot
// ============================================================================

export interface UserBotRuntimeState {
  status: UserBotStatus;
  startedAt?: number;
  lastActivityAt?: number;
  
  // Indicateurs calculés
  currentIndicators: Record<string, number>;
  
  // Conditions évaluées
  conditionResults: Record<string, boolean>;
  
  // Position actuelle
  currentPosition?: {
    side: 'long' | 'short';
    size: number;
    entryPrice: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
  };
  
  // Stats de session
  sessionStats: {
    trades: number;
    wins: number;
    losses: number;
    pnl: number;
    pnlPercent: number;
    maxDrawdown: number;
    winRate: number;
  };
  
  // Erreurs récentes
  recentErrors: Array<{
    timestamp: number;
    message: string;
    stack?: string;
  }>;
  
  // AI state
  aiState?: {
    lastCallAt: number;
    callsToday: number;
    lastAnalysis?: any;
  };
}

// ============================================================================
// TEMPLATES
// Templates de stratégies prédéfinies
// ============================================================================

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'trend' | 'mean_reversion' | 'momentum' | 'breakout' | 'scalping' | 'swing';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  
  // Configuration par défaut
  defaultConfig: Partial<UserBotStrategyConfig>;
  
  // Paramètres personnalisables mis en avant
  highlightedParams: Array<{
    path: string;
    name: string;
    description: string;
  }>;
  
  // Backtest results (si disponible)
  backtestResults?: {
    period: string;
    winRate: number;
    totalReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
  
  // Tags
  tags: string[];
  
  // Auteur
  author?: string;
  verified?: boolean;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  DataSourceType,
  DataSourceConfig,
  IndicatorType,
  IndicatorParam,
  UserIndicatorConfig,
  ConditionOperator,
  ConditionValueType,
  ConditionValue,
  TradingCondition,
  LogicOperator,
  ConditionGroup,
  EntryRule,
  ExitRule,
  UserRiskConfig,
  AIConfig,
  UserBotStrategyConfig,
  UserBotStatus,
  UserBotEventType,
  UserBotEvent,
  UserBotRuntimeState,
  StrategyTemplate,
};
