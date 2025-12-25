import type { 
  OrderRequest, 
  OrderResult, 
  Order, 
  Position, 
  AccountInfo,
  OrderSide,
  OrderType,
  OrderStatus
} from '../types/index.js';
import { BaseExecutionAdapter } from './execution.adapter.js';

/**
 * Hyperliquid Execution Adapter
 * Connects to Hyperliquid DEX for perpetual trading.
 * Uses Hyperliquid's HTTP API and WebSocket for real-time updates.
 * 
 * SAFETY: Live trading requires ARMED mode to be explicitly enabled.
 */

interface HyperliquidConfig {
  apiBase: string;
  accountAddress: string;
  privateKey: string;
  network: 'mainnet' | 'testnet';
  maxLeverage: number;
  maxDrawdownPercent: number;
  positionSizePercent: number;
  liveTradingEnabled: boolean;
}

export class HyperliquidExecutionAdapter extends BaseExecutionAdapter {
  readonly name = 'hyperliquid';

  private config: HyperliquidConfig;
  private ws: WebSocket | null = null;
  
  // ARMED mode - must be explicitly enabled for live trading
  private armed = false;
  private initialEquity = 0;
  private peakEquity = 0;

  constructor(config: Partial<HyperliquidConfig> = {}) {
    super();
    this.config = {
      apiBase: config.apiBase || process.env['HL_HTTP_URL'] || process.env['HL_API_BASE'] || 'https://api.hyperliquid.xyz',
      accountAddress: config.accountAddress || process.env['HL_ACCOUNT_ADDRESS'] || '',
      privateKey: config.privateKey || process.env['HL_PRIVATE_KEY'] || '',
      network: (config.network || process.env['HL_NETWORK'] || 'mainnet') as 'mainnet' | 'testnet',
      maxLeverage: config.maxLeverage || Number(process.env['MAX_LEVERAGE']) || 5,
      maxDrawdownPercent: config.maxDrawdownPercent || Number(process.env['MAX_DRAWDOWN_PCT']) || 10,
      positionSizePercent: config.positionSizePercent || Number(process.env['POSITION_SIZE_PCT']) || 2,
      liveTradingEnabled: (process.env['LIVE_TRADING_ENABLED'] === 'true') || false,
    };
  }

  // ============ ARMED Mode Control ============

  /**
   * Check if live trading is armed and enabled
   */
  isArmed(): boolean {
    return this.armed && this.config.liveTradingEnabled;
  }

  /**
   * ARM live trading - requires explicit confirmation
   * Returns false if LIVE_TRADING_ENABLED is not set
   */
  arm(): { success: boolean; error?: string } {
    if (!this.config.liveTradingEnabled) {
      return { 
        success: false, 
        error: 'LIVE_TRADING_ENABLED must be set to true in environment' 
      };
    }

    if (!this.config.accountAddress || !this.config.privateKey) {
      return { 
        success: false, 
        error: 'HL_ACCOUNT_ADDRESS and HL_PRIVATE_KEY must be configured' 
      };
    }

    this.armed = true;
    console.log('[EXEC] ⚠️ LIVE TRADING ARMED - Real funds at risk');
    return { success: true };
  }

  /**
   * DISARM live trading - safe mode
   */
  disarm(): void {
    this.armed = false;
    console.log('[EXEC] Live trading DISARMED - Safe mode');
  }

  /**
   * Get current safety status
   */
  getSafetyStatus(): {
    armed: boolean;
    liveTradingEnabled: boolean;
    maxLeverage: number;
    maxDrawdownPercent: number;
    currentDrawdown: number;
    canTrade: boolean;
  } {
    const currentDrawdown = this.peakEquity > 0 
      ? ((this.peakEquity - this.initialEquity) / this.peakEquity) * 100 
      : 0;

    return {
      armed: this.armed,
      liveTradingEnabled: this.config.liveTradingEnabled,
      maxLeverage: this.config.maxLeverage,
      maxDrawdownPercent: this.config.maxDrawdownPercent,
      currentDrawdown,
      canTrade: this.isArmed() && currentDrawdown < this.config.maxDrawdownPercent,
    };
  }

  override async connect(): Promise<void> {
    if (!this.config.accountAddress || !this.config.privateKey) {
      throw new Error('Hyperliquid credentials not configured. Set HL_ACCOUNT_ADDRESS and HL_PRIVATE_KEY.');
    }

    // Test connection
    try {
      await this.getAccountInfo();
      this.connected = true;
      console.log(`[Hyperliquid] Connected to ${this.config.network}`);
    } catch (error) {
      throw new Error(`Failed to connect to Hyperliquid: ${(error as Error).message}`);
    }
  }

  override async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  override async placeOrder(request: OrderRequest): Promise<OrderResult> {
    // SAFETY CHECK: Must be armed for live trading
    if (!this.isArmed()) {
      console.log('[EXEC] Order blocked - Live trading not armed');
      return { 
        success: false, 
        error: 'Live trading not armed. Call arm() first with LIVE_TRADING_ENABLED=true' 
      };
    }

    // SAFETY CHECK: Verify drawdown limit
    const safety = this.getSafetyStatus();
    if (!safety.canTrade) {
      console.log('[EXEC] Order blocked - Max drawdown exceeded');
      return { 
        success: false, 
        error: `Max drawdown limit (${safety.maxDrawdownPercent}%) exceeded` 
      };
    }

    // SAFETY CHECK: Leverage limit
    if (request.leverage && request.leverage > this.config.maxLeverage) {
      console.log(`[EXEC] Order blocked - Leverage ${request.leverage}x exceeds max ${this.config.maxLeverage}x`);
      return { 
        success: false, 
        error: `Leverage ${request.leverage}x exceeds maximum allowed ${this.config.maxLeverage}x` 
      };
    }

    try {
      console.log(`[EXEC] Placing ${request.side} order: ${request.quantity} ${request.symbol} @ ${request.price || 'market'}`);
      
      const hlOrder = this.convertToHLOrder(request);
      
      const response = await this.apiRequest('POST', '/exchange', {
        action: {
          type: 'order',
          orders: [hlOrder],
          grouping: 'na',
        },
        nonce: Date.now(),
        signature: await this.signRequest(hlOrder),
      });

      if (response.status === 'ok' && response.response?.data?.statuses?.[0]) {
        const status = response.response.data.statuses[0];
        
        if (status.error) {
          console.log(`[EXEC] Order rejected: ${status.error}`);
          return { success: false, error: status.error };
        }

        const order = this.convertFromHLOrder(status, request);
        this.emitOrderUpdate(order);
        
        console.log(`[EXEC] Order placed: ${order.id}`);
        return { success: true, order };
      }

      return { success: false, error: response.error || 'Unknown error' };
    } catch (error) {
      console.error('[EXEC] Order failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  override async cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.apiRequest('POST', '/exchange', {
        action: {
          type: 'cancel',
          cancels: [{ oid: orderId }],
        },
        nonce: Date.now(),
        signature: await this.signRequest({ cancel: orderId }),
      });

      if (response.status === 'ok') {
        return { success: true };
      }

      return { success: false, error: response.error || 'Failed to cancel order' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  override async cancelAllOrders(symbol?: string): Promise<{ success: boolean; cancelled: number }> {
    try {
      const openOrders = await this.getOpenOrders(symbol);
      let cancelled = 0;

      for (const order of openOrders) {
        const result = await this.cancelOrder(order.id);
        if (result.success) cancelled++;
      }

      return { success: true, cancelled };
    } catch (error) {
      return { success: false, cancelled: 0 };
    }
  }

  override async getOrder(orderId: string): Promise<Order | null> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'orderStatus',
        user: this.config.accountAddress,
        oid: orderId,
      });

      if (response.order) {
        return this.parseHLOrder(response.order);
      }

      return null;
    } catch (error) {
      console.error('[Hyperliquid] Failed to get order:', error);
      return null;
    }
  }

  override async getOpenOrders(symbol?: string): Promise<Order[]> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'openOrders',
        user: this.config.accountAddress,
      });

      const orders = (response || []).map((o: unknown) => this.parseHLOrder(o));
      
      if (symbol) {
        return orders.filter((o: Order) => o.symbol === symbol);
      }

      return orders;
    } catch (error) {
      console.error('[Hyperliquid] Failed to get open orders:', error);
      return [];
    }
  }

  override async getPositions(): Promise<Position[]> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'clearinghouseState',
        user: this.config.accountAddress,
      });

      if (!response.assetPositions) {
        return [];
      }

      return response.assetPositions
        .filter((p: { position: { szi: string } }) => parseFloat(p.position.szi) !== 0)
        .map((p: unknown) => this.parseHLPosition(p));
    } catch (error) {
      console.error('[Hyperliquid] Failed to get positions:', error);
      return [];
    }
  }

  override async getPosition(symbol: string): Promise<Position | null> {
    const positions = await this.getPositions();
    return positions.find(p => p.symbol === symbol) || null;
  }

  override async getAccountInfo(): Promise<AccountInfo> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'clearinghouseState',
        user: this.config.accountAddress,
      });

      const marginSummary = response.marginSummary || {};
      
      return {
        equity: parseFloat(marginSummary.accountValue || '0'),
        availableBalance: parseFloat(marginSummary.totalMarginUsed || '0'),
        totalMargin: parseFloat(marginSummary.totalMarginUsed || '0'),
        unrealizedPnl: parseFloat(marginSummary.totalUnrealizedPnl || '0'),
        balances: [
          {
            asset: 'USDC',
            free: parseFloat(marginSummary.accountValue || '0') - parseFloat(marginSummary.totalMarginUsed || '0'),
            locked: parseFloat(marginSummary.totalMarginUsed || '0'),
            total: parseFloat(marginSummary.accountValue || '0'),
          },
        ],
      };
    } catch (error) {
      console.error('[Hyperliquid] Failed to get account info:', error);
      throw error;
    }
  }

  override async setLeverage(symbol: string, leverage: number): Promise<{ success: boolean; error?: string }> {
    if (leverage > this.config.maxLeverage) {
      return { success: false, error: `Leverage ${leverage} exceeds max allowed ${this.config.maxLeverage}` };
    }

    try {
      const response = await this.apiRequest('POST', '/exchange', {
        action: {
          type: 'updateLeverage',
          asset: this.symbolToAssetIndex(symbol),
          isCross: true,
          leverage,
        },
        nonce: Date.now(),
        signature: await this.signRequest({ leverage }),
      });

      if (response.status === 'ok') {
        return { success: true };
      }

      return { success: false, error: response.error || 'Failed to set leverage' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ============ Private Helper Methods ============

  private async apiRequest(method: string, endpoint: string, body?: unknown): Promise<any> {
    const url = `${this.config.apiBase}${endpoint}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private async signRequest(data: unknown): Promise<string> {
    // In production, implement proper EIP-712 signing with the private key
    // This is a placeholder - actual implementation requires ethers.js or similar
    console.warn('[Hyperliquid] Signature not implemented - using placeholder');
    return '0x' + '0'.repeat(130);
  }

  private convertToHLOrder(request: OrderRequest): unknown {
    const isBuy = request.side === 'buy';
    const assetIndex = this.symbolToAssetIndex(request.symbol);

    return {
      a: assetIndex,
      b: isBuy,
      p: request.price?.toString() || '0',
      s: request.quantity.toString(),
      r: request.reduceOnly || false,
      t: this.convertOrderType(request.type),
      c: request.clientOrderId,
    };
  }

  private convertOrderType(type: OrderType): { limit?: { tif: string }; trigger?: { triggerPx: string; isMarket: boolean; tpsl: string } } {
    switch (type) {
      case 'limit':
        return { limit: { tif: 'Gtc' } };
      case 'market':
        return { limit: { tif: 'Ioc' } };
      case 'stop_market':
        return { trigger: { triggerPx: '0', isMarket: true, tpsl: 'sl' } };
      case 'stop_limit':
        return { trigger: { triggerPx: '0', isMarket: false, tpsl: 'sl' } };
      default:
        return { limit: { tif: 'Gtc' } };
    }
  }

  private convertFromHLOrder(hlStatus: any, request: OrderRequest): Order {
    return {
      id: hlStatus.resting?.oid || hlStatus.filled?.oid || Date.now().toString(),
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      status: this.parseOrderStatus(hlStatus),
      quantity: request.quantity,
      filledQuantity: parseFloat(hlStatus.filled?.totalSz || '0'),
      price: request.price,
      avgFillPrice: parseFloat(hlStatus.filled?.avgPx || '0') || undefined,
      stopPrice: request.stopPrice,
      reduceOnly: request.reduceOnly || false,
      leverage: request.leverage || 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private parseHLOrder(hlOrder: any): Order {
    return {
      id: hlOrder.oid?.toString() || '',
      symbol: this.assetIndexToSymbol(hlOrder.coin),
      side: hlOrder.side === 'B' ? 'buy' : 'sell',
      type: 'limit',
      status: 'open',
      quantity: parseFloat(hlOrder.sz || '0'),
      filledQuantity: parseFloat(hlOrder.origSz || '0') - parseFloat(hlOrder.sz || '0'),
      price: parseFloat(hlOrder.limitPx || '0'),
      reduceOnly: hlOrder.reduceOnly || false,
      leverage: 1,
      createdAt: hlOrder.timestamp || Date.now(),
      updatedAt: Date.now(),
    };
  }

  private parseHLPosition(hlPosition: any): Position {
    const pos = hlPosition.position;
    const size = parseFloat(pos.szi || '0');
    
    return {
      symbol: this.assetIndexToSymbol(hlPosition.coin || pos.coin),
      side: size > 0 ? 'long' : 'short',
      size: Math.abs(size),
      entryPrice: parseFloat(pos.entryPx || '0'),
      markPrice: parseFloat(pos.positionValue || '0') / Math.abs(size) || 0,
      liquidationPrice: parseFloat(pos.liquidationPx || '0') || undefined,
      unrealizedPnl: parseFloat(pos.unrealizedPnl || '0'),
      realizedPnl: parseFloat(pos.returnOnEquity || '0'),
      leverage: parseFloat(pos.leverage?.value || '1'),
      margin: parseFloat(pos.marginUsed || '0'),
      timestamp: Date.now(),
    };
  }

  private parseOrderStatus(hlStatus: any): OrderStatus {
    if (hlStatus.error) return 'rejected';
    if (hlStatus.filled?.totalSz) return 'filled';
    if (hlStatus.resting) return 'open';
    return 'pending';
  }

  private symbolToAssetIndex(symbol: string): number {
    // Hyperliquid uses numeric asset indices
    const mapping: Record<string, number> = {
      'BTC-PERP': 0,
      'ETH-PERP': 1,
      'BTC': 0,
      'ETH': 1,
    };
    return mapping[symbol] ?? 0;
  }

  private assetIndexToSymbol(coinOrIndex: string | number): string {
    if (typeof coinOrIndex === 'string') {
      return `${coinOrIndex}-PERP`;
    }
    const mapping: Record<number, string> = {
      0: 'BTC-PERP',
      1: 'ETH-PERP',
    };
    return mapping[coinOrIndex] ?? 'UNKNOWN';
  }
}
