// Bot Builder Types

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'trend' | 'momentum' | 'mean-reversion' | 'breakout' | 'scalping' | 'custom';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  defaultConfig: Partial<BotConfig>;
  indicators: string[];
  winRate?: number;
  avgReturn?: number;
}

export interface Indicator {
  id: string;
  name: string;
  type: 'trend' | 'momentum' | 'volatility' | 'volume' | 'custom';
  params: IndicatorParam[];
  description: string;
}

export interface IndicatorParam {
  name: string;
  type: 'number' | 'select' | 'boolean';
  default: number | string | boolean;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}

export interface IndicatorConfig {
  id: string;
  indicatorId: string;
  params: Record<string, number | string | boolean>;
  enabled: boolean;
}

export interface EntryCondition {
  id: string;
  indicator1: string;
  operator: 'crosses_above' | 'crosses_below' | 'greater_than' | 'less_than' | 'equals';
  indicator2: string;
  value?: number;
  logic: 'AND' | 'OR';
}

export interface ExitCondition {
  id: string;
  type: 'take_profit' | 'stop_loss' | 'trailing_stop' | 'indicator' | 'time';
  value: number;
  indicator?: string;
  operator?: string;
}

export interface RiskManagement {
  positionSizeType: 'fixed' | 'percentage' | 'risk_based';
  positionSize: number;
  maxPositions: number;
  maxDrawdown: number;
  dailyLossLimit: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopEnabled: boolean;
  trailingStopPct: number;
  riskRewardRatio: number;
}

export interface BotConfig {
  // Basic Info
  name: string;
  description: string;
  symbol: string;
  timeframe: string;
  
  // Strategy
  strategyType: string;
  templateId?: string;
  
  // Indicators
  indicators: IndicatorConfig[];
  
  // Entry/Exit
  entryConditions: EntryCondition[];
  exitConditions: ExitCondition[];
  
  // Risk Management
  riskManagement: RiskManagement;
  
  // Advanced
  leverage: number;
  marginType: 'cross' | 'isolated';
  orderType: 'market' | 'limit';
  slippage: number;
}

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  avgHoldingTime: string;
  trades: BacktestTrade[];
  equityCurve: { date: string; equity: number }[];
}

export interface BacktestTrade {
  id: string;
  entryTime: string;
  exitTime: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  reason: string;
}

export type BuilderStep = 'template' | 'ai' | 'config' | 'indicators' | 'conditions' | 'risk' | 'backtest' | 'deploy';

export const TIMEFRAMES = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: '1 Day' },
];

export const SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'MATIC', 'LINK', 'DOT',
  'UNI', 'ATOM', 'LTC', 'BCH', 'NEAR', 'APT', 'ARB', 'OP', 'INJ', 'SUI'
];

export const DEFAULT_RISK_MANAGEMENT: RiskManagement = {
  positionSizeType: 'percentage',
  positionSize: 10,
  maxPositions: 3,
  maxDrawdown: 20,
  dailyLossLimit: 5,
  takeProfitPct: 3,
  stopLossPct: 1.5,
  trailingStopEnabled: false,
  trailingStopPct: 1,
  riskRewardRatio: 2,
};

export const DEFAULT_BOT_CONFIG: BotConfig = {
  name: '',
  description: '',
  symbol: 'BTC',
  timeframe: '15m',
  strategyType: 'custom',
  indicators: [],
  entryConditions: [],
  exitConditions: [],
  riskManagement: DEFAULT_RISK_MANAGEMENT,
  leverage: 1,
  marginType: 'cross',
  orderType: 'market',
  slippage: 0.1,
};
