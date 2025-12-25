import type { 
  OrderRequest, 
  OrderResult, 
  Order, 
  Position, 
  AccountInfo,
  OrderStatus 
} from '../types/index.js';
import { BaseExecutionAdapter } from './execution.adapter.js';
import { v4 as uuid } from 'uuid';

/**
 * Paper Trading Execution Adapter
 * Simulates order execution for testing without real money.
 */
export class PaperExecutionAdapter extends BaseExecutionAdapter {
  readonly name = 'paper';

  private orders: Map<string, Order> = new Map();
  private positions: Map<string, Position> = new Map();
  private balances: Map<string, number> = new Map();
  private leverage: Map<string, number> = new Map();
  
  private initialEquity: number;
  private slippage: number;
  private fees: number;

  constructor(options: {
    initialEquity?: number;
    slippage?: number; // Percentage, e.g., 0.1 = 0.1%
    fees?: number; // Percentage, e.g., 0.05 = 0.05%
  } = {}) {
    super();
    this.initialEquity = options.initialEquity ?? 10000;
    this.slippage = options.slippage ?? 0.05;
    this.fees = options.fees ?? 0.05;

    // Initialize with USDT balance
    this.balances.set('USDT', this.initialEquity);
  }

  override async connect(): Promise<void> {
    this.connected = true;
    console.log('[PaperAdapter] Connected with $' + this.initialEquity + ' initial equity');
  }

  override async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const orderId = uuid();
    const clientOrderId = request.clientOrderId || uuid();

    // Apply slippage to market orders
    let fillPrice = request.price || 0;
    if (request.type === 'market' || request.type === 'stop_market') {
      // Simulate getting current price (in real impl, would come from market data)
      fillPrice = fillPrice || 50000; // Default for testing
      const slippageAmount = fillPrice * (this.slippage / 100);
      fillPrice = request.side === 'buy' 
        ? fillPrice + slippageAmount 
        : fillPrice - slippageAmount;
    }

    // Calculate fees
    const orderValue = fillPrice * request.quantity;
    const feeAmount = orderValue * (this.fees / 100);

    // Check balance
    const usdtBalance = this.balances.get('USDT') || 0;
    const requiredMargin = orderValue / (request.leverage || 1);
    
    if (!request.reduceOnly && requiredMargin + feeAmount > usdtBalance) {
      return {
        success: false,
        error: `Insufficient balance. Required: $${(requiredMargin + feeAmount).toFixed(2)}, Available: $${usdtBalance.toFixed(2)}`,
      };
    }

    // Create order
    const order: Order = {
      id: orderId,
      clientOrderId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      status: 'filled', // Paper trading fills immediately
      quantity: request.quantity,
      filledQuantity: request.quantity,
      price: request.price,
      avgFillPrice: fillPrice,
      stopPrice: request.stopPrice,
      reduceOnly: request.reduceOnly || false,
      leverage: request.leverage || 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.orders.set(orderId, order);

    // Update position
    if (!request.reduceOnly) {
      this.updatePosition(request.symbol, request.side, request.quantity, fillPrice, request.leverage || 1);
      
      // Deduct margin and fees
      this.balances.set('USDT', usdtBalance - requiredMargin - feeAmount);
    } else {
      // Close position
      this.closePosition(request.symbol, request.quantity, fillPrice);
    }

    // Emit order update
    this.emitOrderUpdate(order);

    return {
      success: true,
      order,
    };
  }

  override async cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
    const order = this.orders.get(orderId);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    if (order.status === 'filled' || order.status === 'cancelled') {
      return { success: false, error: `Cannot cancel order with status: ${order.status}` };
    }

    order.status = 'cancelled';
    order.updatedAt = Date.now();
    this.emitOrderUpdate(order);

    return { success: true };
  }

  override async cancelAllOrders(symbol?: string): Promise<{ success: boolean; cancelled: number }> {
    let cancelled = 0;

    for (const [orderId, order] of this.orders) {
      if (symbol && order.symbol !== symbol) continue;
      if (order.status === 'open' || order.status === 'pending') {
        order.status = 'cancelled';
        order.updatedAt = Date.now();
        cancelled++;
      }
    }

    return { success: true, cancelled };
  }

  override async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) || null;
  }

  override async getOpenOrders(symbol?: string): Promise<Order[]> {
    const openOrders: Order[] = [];
    for (const order of this.orders.values()) {
      if (order.status === 'open' || order.status === 'pending') {
        if (!symbol || order.symbol === symbol) {
          openOrders.push(order);
        }
      }
    }
    return openOrders;
  }

  override async getPositions(): Promise<Position[]> {
    return Array.from(this.positions.values());
  }

  override async getPosition(symbol: string): Promise<Position | null> {
    return this.positions.get(symbol) || null;
  }

  override async getAccountInfo(): Promise<AccountInfo> {
    const usdtBalance = this.balances.get('USDT') || 0;
    let unrealizedPnl = 0;
    let totalMargin = 0;

    for (const position of this.positions.values()) {
      unrealizedPnl += position.unrealizedPnl;
      totalMargin += position.margin;
    }

    return {
      equity: usdtBalance + totalMargin + unrealizedPnl,
      availableBalance: usdtBalance,
      totalMargin,
      unrealizedPnl,
      balances: [
        {
          asset: 'USDT',
          free: usdtBalance,
          locked: totalMargin,
          total: usdtBalance + totalMargin,
        },
      ],
    };
  }

  override async setLeverage(symbol: string, leverage: number): Promise<{ success: boolean; error?: string }> {
    if (leverage < 1 || leverage > 100) {
      return { success: false, error: 'Leverage must be between 1 and 100' };
    }

    this.leverage.set(symbol, leverage);
    return { success: true };
  }

  /**
   * Update position after order fill
   */
  private updatePosition(
    symbol: string, 
    side: 'buy' | 'sell', 
    quantity: number, 
    price: number,
    leverage: number
  ): void {
    const existing = this.positions.get(symbol);
    const positionSide = side === 'buy' ? 'long' : 'short';

    if (existing) {
      // Add to existing position
      const totalSize = existing.size + quantity;
      const avgPrice = (existing.entryPrice * existing.size + price * quantity) / totalSize;
      
      existing.size = totalSize;
      existing.entryPrice = avgPrice;
      existing.margin = (totalSize * avgPrice) / leverage;
      existing.timestamp = Date.now();
    } else {
      // Create new position
      const position: Position = {
        symbol,
        side: positionSide,
        size: quantity,
        entryPrice: price,
        markPrice: price,
        unrealizedPnl: 0,
        realizedPnl: 0,
        leverage,
        margin: (quantity * price) / leverage,
        timestamp: Date.now(),
      };
      this.positions.set(symbol, position);
    }

    const position = this.positions.get(symbol);
    if (position) {
      this.emitPositionUpdate(position);
    }
  }

  /**
   * Close position (partially or fully)
   */
  private closePosition(symbol: string, quantity: number, exitPrice: number): void {
    const position = this.positions.get(symbol);
    if (!position) return;

    // Calculate PnL
    const priceDiff = position.side === 'long'
      ? exitPrice - position.entryPrice
      : position.entryPrice - exitPrice;
    
    const pnl = priceDiff * quantity;
    
    // Update balance with PnL and return margin
    const marginReturned = (quantity * position.entryPrice) / position.leverage;
    const currentBalance = this.balances.get('USDT') || 0;
    this.balances.set('USDT', currentBalance + marginReturned + pnl);

    // Update or remove position
    if (quantity >= position.size) {
      this.positions.delete(symbol);
    } else {
      position.size -= quantity;
      position.margin = (position.size * position.entryPrice) / position.leverage;
      position.realizedPnl += pnl;
      this.emitPositionUpdate(position);
    }
  }

  /**
   * Update mark prices (call this with market data updates)
   */
  updateMarkPrice(symbol: string, price: number): void {
    const position = this.positions.get(symbol);
    if (!position) return;

    position.markPrice = price;
    
    const priceDiff = position.side === 'long'
      ? price - position.entryPrice
      : position.entryPrice - price;
    
    position.unrealizedPnl = priceDiff * position.size;
    position.timestamp = Date.now();

    this.emitPositionUpdate(position);
  }

  /**
   * Reset paper trading account
   */
  reset(): void {
    this.orders.clear();
    this.positions.clear();
    this.balances.clear();
    this.leverage.clear();
    this.balances.set('USDT', this.initialEquity);
  }
}
