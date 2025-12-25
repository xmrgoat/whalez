import type { 
  OrderRequest, 
  OrderResult, 
  Order, 
  Position, 
  AccountInfo 
} from '../types/index.js';

/**
 * ExecutionAdapter Interface
 * Handles order placement, position management, and account operations.
 * Implementations: HyperliquidExecutionAdapter, MegaETHExecutionAdapter, PaperExecutionAdapter
 */
export interface ExecutionAdapter {
  readonly name: string;

  /**
   * Place an order
   */
  placeOrder(request: OrderRequest): Promise<OrderResult>;

  /**
   * Cancel an order by ID
   */
  cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Cancel all open orders for a symbol
   */
  cancelAllOrders(symbol?: string): Promise<{ success: boolean; cancelled: number }>;

  /**
   * Get order by ID
   */
  getOrder(orderId: string): Promise<Order | null>;

  /**
   * Get all open orders
   */
  getOpenOrders(symbol?: string): Promise<Order[]>;

  /**
   * Get all positions
   */
  getPositions(): Promise<Position[]>;

  /**
   * Get position for a specific symbol
   */
  getPosition(symbol: string): Promise<Position | null>;

  /**
   * Get account balances and info
   */
  getAccountInfo(): Promise<AccountInfo>;

  /**
   * Set leverage for a symbol
   */
  setLeverage(symbol: string, leverage: number): Promise<{ success: boolean; error?: string }>;

  /**
   * Connect to execution venue
   */
  connect(): Promise<void>;

  /**
   * Disconnect from execution venue
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * Subscribe to order updates
   */
  onOrderUpdate(callback: (order: Order) => void): () => void;

  /**
   * Subscribe to position updates
   */
  onPositionUpdate(callback: (position: Position) => void): () => void;
}

/**
 * Base class with common functionality
 */
export abstract class BaseExecutionAdapter implements ExecutionAdapter {
  abstract readonly name: string;
  protected connected = false;
  protected orderCallbacks: Array<(order: Order) => void> = [];
  protected positionCallbacks: Array<(position: Position) => void> = [];

  abstract placeOrder(request: OrderRequest): Promise<OrderResult>;
  abstract cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }>;
  abstract cancelAllOrders(symbol?: string): Promise<{ success: boolean; cancelled: number }>;
  abstract getOrder(orderId: string): Promise<Order | null>;
  abstract getOpenOrders(symbol?: string): Promise<Order[]>;
  abstract getPositions(): Promise<Position[]>;
  abstract getPosition(symbol: string): Promise<Position | null>;
  abstract getAccountInfo(): Promise<AccountInfo>;
  abstract setLeverage(symbol: string, leverage: number): Promise<{ success: boolean; error?: string }>;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.orderCallbacks = [];
    this.positionCallbacks = [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  onOrderUpdate(callback: (order: Order) => void): () => void {
    this.orderCallbacks.push(callback);
    return () => {
      this.orderCallbacks = this.orderCallbacks.filter(cb => cb !== callback);
    };
  }

  onPositionUpdate(callback: (position: Position) => void): () => void {
    this.positionCallbacks.push(callback);
    return () => {
      this.positionCallbacks = this.positionCallbacks.filter(cb => cb !== callback);
    };
  }

  protected emitOrderUpdate(order: Order): void {
    for (const cb of this.orderCallbacks) {
      cb(order);
    }
  }

  protected emitPositionUpdate(position: Position): void {
    for (const cb of this.positionCallbacks) {
      cb(position);
    }
  }
}
