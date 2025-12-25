import type { 
  Signal, 
  OrderRequest, 
  OrderResult, 
  Trade,
  Position,
  BotConfig 
} from '../types/index.js';
import type { ExecutionAdapter } from '../adapters/execution.adapter.js';
import { v4 as uuid } from 'uuid';

/**
 * Execution Engine
 * Handles order placement and trade management through adapters.
 */

export interface ExecutionContext {
  signal: Signal;
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage: number;
}

export class ExecutionEngine {
  private adapter: ExecutionAdapter;
  private config: BotConfig;
  private activeTrades: Map<string, Trade> = new Map();

  constructor(adapter: ExecutionAdapter, config: BotConfig) {
    this.adapter = adapter;
    this.config = config;
  }

  /**
   * Update execution adapter
   */
  setAdapter(adapter: ExecutionAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Update bot configuration
   */
  updateConfig(config: BotConfig): void {
    this.config = config;
  }

  /**
   * Execute a signal
   */
  async executeSignal(context: ExecutionContext): Promise<Trade | null> {
    const { signal, quantity, stopLoss, takeProfit, leverage } = context;

    // Set leverage if needed
    if (leverage > 1) {
      const leverageResult = await this.adapter.setLeverage(signal.symbol, leverage);
      if (!leverageResult.success) {
        console.error(`Failed to set leverage: ${leverageResult.error}`);
        return null;
      }
    }

    // Build order request
    const orderRequest: OrderRequest = {
      symbol: signal.symbol,
      side: signal.action === 'long' ? 'buy' : 'sell',
      type: 'market',
      quantity,
      leverage,
      clientOrderId: uuid(),
    };

    // Place entry order
    const result = await this.adapter.placeOrder(orderRequest);

    if (!result.success || !result.order) {
      console.error(`Failed to place order: ${result.error}`);
      return null;
    }

    // Create trade record
    const trade: Trade = {
      id: uuid(),
      botId: this.config.id,
      symbol: signal.symbol,
      side: orderRequest.side,
      entryPrice: result.order.avgFillPrice || result.order.price || signal.price,
      quantity,
      entryTime: Date.now(),
      fees: 0, // Will be updated from exchange
      status: 'open',
      signalId: signal.id,
      orderId: result.order.id,
      stopLoss,
      takeProfit,
    };

    this.activeTrades.set(trade.id, trade);

    // Place stop loss order if configured
    if (stopLoss) {
      await this.placeStopLoss(trade, stopLoss);
    }

    // Place take profit order if configured
    if (takeProfit) {
      await this.placeTakeProfit(trade, takeProfit);
    }

    return trade;
  }

  /**
   * Close a trade
   */
  async closeTrade(tradeId: string, exitPrice?: number): Promise<Trade | null> {
    const trade = this.activeTrades.get(tradeId);
    if (!trade || trade.status !== 'open') {
      return null;
    }

    // Place closing order
    const orderRequest: OrderRequest = {
      symbol: trade.symbol,
      side: trade.side === 'buy' ? 'sell' : 'buy',
      type: 'market',
      quantity: trade.quantity,
      reduceOnly: true,
      clientOrderId: uuid(),
    };

    const result = await this.adapter.placeOrder(orderRequest);

    if (!result.success || !result.order) {
      console.error(`Failed to close trade: ${result.error}`);
      return null;
    }

    // Update trade record
    trade.exitPrice = result.order.avgFillPrice || exitPrice || result.order.price;
    trade.exitTime = Date.now();
    trade.exitOrderId = result.order.id;
    trade.status = 'closed';

    // Calculate PnL
    if (trade.exitPrice && trade.entryPrice) {
      const priceDiff = trade.side === 'buy' 
        ? trade.exitPrice - trade.entryPrice
        : trade.entryPrice - trade.exitPrice;
      
      trade.pnl = priceDiff * trade.quantity - trade.fees;
      trade.pnlPercent = (priceDiff / trade.entryPrice) * 100;
    }

    this.activeTrades.delete(tradeId);

    return trade;
  }

  /**
   * Close position by signal
   */
  async closeBySignal(signal: Signal): Promise<Trade | null> {
    // Find matching open trade
    for (const [tradeId, trade] of this.activeTrades) {
      if (trade.symbol === signal.symbol && trade.status === 'open') {
        const shouldClose = 
          (signal.action === 'close_long' && trade.side === 'buy') ||
          (signal.action === 'close_short' && trade.side === 'sell');

        if (shouldClose) {
          return this.closeTrade(tradeId, signal.price);
        }
      }
    }

    return null;
  }

  /**
   * Place stop loss order
   */
  private async placeStopLoss(trade: Trade, stopPrice: number): Promise<void> {
    const orderRequest: OrderRequest = {
      symbol: trade.symbol,
      side: trade.side === 'buy' ? 'sell' : 'buy',
      type: 'stop_market',
      quantity: trade.quantity,
      stopPrice,
      reduceOnly: true,
      clientOrderId: `sl-${trade.id}`,
    };

    const result = await this.adapter.placeOrder(orderRequest);
    if (!result.success) {
      console.error(`Failed to place stop loss: ${result.error}`);
    }
  }

  /**
   * Place take profit order
   */
  private async placeTakeProfit(trade: Trade, price: number): Promise<void> {
    const orderRequest: OrderRequest = {
      symbol: trade.symbol,
      side: trade.side === 'buy' ? 'sell' : 'buy',
      type: 'limit',
      quantity: trade.quantity,
      price,
      reduceOnly: true,
      clientOrderId: `tp-${trade.id}`,
    };

    const result = await this.adapter.placeOrder(orderRequest);
    if (!result.success) {
      console.error(`Failed to place take profit: ${result.error}`);
    }
  }

  /**
   * Get active trades
   */
  getActiveTrades(): Trade[] {
    return Array.from(this.activeTrades.values());
  }

  /**
   * Get trade by ID
   */
  getTrade(tradeId: string): Trade | undefined {
    return this.activeTrades.get(tradeId);
  }

  /**
   * Cancel all orders for a symbol
   */
  async cancelAllOrders(symbol?: string): Promise<void> {
    await this.adapter.cancelAllOrders(symbol);
  }

  /**
   * Get current positions from adapter
   */
  async getPositions(): Promise<Position[]> {
    return this.adapter.getPositions();
  }

  /**
   * Sync trades with positions
   */
  async syncWithPositions(): Promise<void> {
    const positions = await this.adapter.getPositions();

    // Close trades that no longer have positions
    for (const [tradeId, trade] of this.activeTrades) {
      const hasPosition = positions.some(
        p => p.symbol === trade.symbol && 
             ((p.side === 'long' && trade.side === 'buy') ||
              (p.side === 'short' && trade.side === 'sell'))
      );

      if (!hasPosition && trade.status === 'open') {
        // Position was closed externally (stop loss hit, etc.)
        trade.status = 'closed';
        trade.exitTime = Date.now();
        this.activeTrades.delete(tradeId);
      }
    }
  }
}
