import { z } from 'zod';

// ============ OHLC / Candle Types ============

export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export interface Ticker {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume24h: number;
  change24h: number;
  timestamp: number;
}

// ============ Order Types ============

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_market' | 'stop_limit';
export type OrderStatus = 'pending' | 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
  leverage?: number;
  clientOrderId?: string;
}

export interface Order {
  id: string;
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  quantity: number;
  filledQuantity: number;
  price?: number;
  avgFillPrice?: number;
  stopPrice?: number;
  reduceOnly: boolean;
  leverage: number;
  createdAt: number;
  updatedAt: number;
}

export interface OrderResult {
  success: boolean;
  order?: Order;
  error?: string;
}

// ============ Position Types ============

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice?: number;
  unrealizedPnl: number;
  realizedPnl: number;
  leverage: number;
  margin: number;
  timestamp: number;
}

// ============ Balance Types ============

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface AccountInfo {
  equity: number;
  availableBalance: number;
  totalMargin: number;
  unrealizedPnl: number;
  balances: Balance[];
}

// ============ Signal Types ============

export type SignalAction = 'long' | 'short' | 'close_long' | 'close_short' | 'hold';

export interface Signal {
  id: string;
  botId: string;
  symbol: string;
  timeframe: Timeframe;
  action: SignalAction;
  confidence: number;
  price: number;
  indicators: Record<string, number>;
  reasons: string[];
  timestamp: number;
}

// ============ Trade Types ============

export interface Trade {
  id: string;
  botId: string;
  symbol: string;
  side: OrderSide;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  entryTime: number;
  exitTime?: number;
  pnl?: number;
  pnlPercent?: number;
  fees: number;
  status: 'open' | 'closed';
  signalId: string;
  orderId: string;
  exitOrderId?: string;
  stopLoss?: number;
  takeProfit?: number;
  notes?: string;
}

// ============ Bot Configuration ============

export const IndicatorConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  params: z.record(z.number()),
});

export const RuleConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  condition: z.string(),
  priority: z.number(),
});

export const RiskConfigSchema = z.object({
  maxPositionSizePercent: z.number().min(0.1).max(100).default(2),
  stopLossAtrMultiplier: z.number().min(0.5).max(10).default(2),
  takeProfitAtrMultiplier: z.number().min(0.5).max(20).optional(),
  maxOpenPositions: z.number().min(1).max(10).default(1),
  maxDrawdownPercent: z.number().min(1).max(50).default(10),
  cooldownAfterLossMs: z.number().min(0).default(6 * 60 * 60 * 1000), // 6h default
  maxLeverage: z.number().min(1).max(100).default(5),
});

export const BotConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  timeframes: z.array(z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w'])),
  indicators: z.array(IndicatorConfigSchema),
  rules: z.array(RuleConfigSchema),
  risk: RiskConfigSchema,
  paperTrading: z.boolean().default(true),
  enabled: z.boolean().default(false),
});

export type IndicatorConfig = z.infer<typeof IndicatorConfigSchema>;
export type RuleConfig = z.infer<typeof RuleConfigSchema>;
export type RiskConfig = z.infer<typeof RiskConfigSchema>;
export type BotConfig = z.infer<typeof BotConfigSchema>;

// ============ Critique Types ============

export interface CritiqueMetrics {
  totalTrades: number;
  winRate: number;
  expectancy: number;
  avgRMultiple: number;
  avgHoldingTimeMs: number;
  stopHitRate: number;
  takeProfitHitRate: number;
  avgSlippage: number;
  maxDrawdown: number;
  sharpeRatio?: number;
}

export interface CritiqueReport {
  id: string;
  botId: string;
  tradeIds: string[];
  metrics: CritiqueMetrics;
  whatWorked: string[];
  whatDidntWork: string[];
  failurePatterns: string[];
  recommendations: ParameterChange[];
  appliedChanges: ParameterChange[];
  createdAt: number;
}

export interface ParameterChange {
  parameter: string;
  previousValue: number | string | boolean;
  newValue: number | string | boolean;
  reason: string;
  applied: boolean;
  rolledBack?: boolean;
}

// ============ Whitelisted Parameters for Auto-Tuning ============

export const WHITELISTED_PARAMS = {
  'indicators.rsi.overbought': { min: 65, max: 80, step: 2 },
  'indicators.rsi.oversold': { min: 20, max: 35, step: 2 },
  'indicators.atr.multiplier': { min: 1.5, max: 3.0, step: 0.2 },
  'risk.cooldownAfterLossMs': { min: 2 * 60 * 60 * 1000, max: 12 * 60 * 60 * 1000, step: 60 * 60 * 1000 },
  'rules.*.enabled': { type: 'boolean' }, // Can only disable optional rules
} as const;

// ============ Event Types ============

export type BotEventType = 
  | 'bot:started'
  | 'bot:stopped'
  | 'bot:error'
  | 'signal:generated'
  | 'order:placed'
  | 'order:filled'
  | 'order:cancelled'
  | 'trade:opened'
  | 'trade:closed'
  | 'critique:generated'
  | 'params:changed'
  | 'params:rolledback';

export interface BotEvent {
  type: BotEventType;
  botId: string;
  timestamp: number;
  data: unknown;
}

// ============ Adapter Types ============

export type ExecutionAdapterType = 'hyperliquid' | 'megaeth' | 'paper';
export type MarketDataAdapterType = 'hyperliquid' | 'coingecko' | 'megaeth' | 'paper';
