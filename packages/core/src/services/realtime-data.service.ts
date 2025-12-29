/**
 * REAL-TIME DATA SERVICE
 * Orderbook, Liquidations, Funding Rate, Open Interest from Hyperliquid
 */

import WebSocket from 'ws';

const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';
const HL_API_URL = 'https://api.hyperliquid.xyz/info';

// ============================================================================
// TYPES
// ============================================================================

export interface OrderBookLevel {
  price: number;
  size: number;
  numOrders?: number;
}

export interface OrderBook {
  coin: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  midPrice: number;
  spread: number;
  spreadPct: number;
  imbalance: number; // > 0.5 = more bids, < 0.5 = more asks
}

export interface FundingData {
  coin: string;
  fundingRate: number; // Current funding rate
  predictedRate: number; // Predicted next funding
  openInterest: number; // Total open interest in USD
  timestamp: number;
}

export interface LiquidationData {
  coin: string;
  side: 'long' | 'short';
  price: number;
  size: number;
  timestamp: number;
}

export interface TradeData {
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  timestamp: number;
  hash?: string;
}

export interface MarketInfo {
  coin: string;
  maxLeverage: number;
  tickSize: number;
  stepSize: number;
  minOrderSize: number;
  fundingInterval: string;
  marginType: string;
}

export interface MarketContext {
  coin: string;
  price: number;
  orderBook: OrderBook | null;
  funding: FundingData | null;
  recentTrades: TradeData[];
  recentLiquidations: LiquidationData[];
  volumeProfile: { buyVolume: number; sellVolume: number; ratio: number };
  marketInfo: MarketInfo | null;
  timestamp: number;
}

// ============================================================================
// REALTIME DATA SERVICE
// ============================================================================

export class RealtimeDataService {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  private orderBooks: Map<string, OrderBook> = new Map();
  private fundingData: Map<string, FundingData> = new Map();
  private recentTrades: Map<string, TradeData[]> = new Map();
  private recentLiquidations: Map<string, LiquidationData[]> = new Map();
  private marketInfoCache: Map<string, MarketInfo> = new Map();
  
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();
  private subscribedCoins: Set<string> = new Set();
  
  private readonly MAX_TRADES = 100;
  private readonly MAX_LIQUIDATIONS = 50;

  constructor() {}

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(HL_WS_URL);

        this.ws.on('open', () => {
          console.log('[RealtimeData] WebSocket connected');
          this.connected = true;
          this.reconnectAttempts = 0;
          
          // Resubscribe to all coins
          for (const coin of this.subscribedCoins) {
            this.subscribeToL2Book(coin);
            this.subscribeTrades(coin);
          }
          
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
          console.log('[RealtimeData] WebSocket closed');
          this.connected = false;
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('[RealtimeData] WebSocket error:', error);
          if (!this.connected) {
            reject(error);
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[RealtimeData] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`[RealtimeData] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  // ============================================================================
  // SUBSCRIPTIONS
  // ============================================================================

  private send(message: object): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(message));
    }
  }

  subscribeToL2Book(coin: string): void {
    this.subscribedCoins.add(coin);
    this.send({
      method: 'subscribe',
      subscription: { type: 'l2Book', coin }
    });
  }

  subscribeTrades(coin: string): void {
    this.subscribedCoins.add(coin);
    this.send({
      method: 'subscribe',
      subscription: { type: 'trades', coin }
    });
  }

  subscribeToActiveAssetCtx(coin: string): void {
    this.subscribedCoins.add(coin);
    this.send({
      method: 'subscribe',
      subscription: { type: 'activeAssetCtx', coin }
    });
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  private handleMessage(rawData: string): void {
    try {
      const message = JSON.parse(rawData);
      
      if (message.channel === 'l2Book') {
        this.handleL2BookUpdate(message.data);
      } else if (message.channel === 'trades') {
        this.handleTradesUpdate(message.data);
      } else if (message.channel === 'activeAssetCtx') {
        this.handleAssetCtxUpdate(message.data);
      } else if (message.channel === 'userNonFundingLedgerUpdates') {
        this.handleLiquidationUpdate(message.data);
      }
    } catch (error) {
      // Ignore parse errors for non-JSON messages
    }
  }

  private handleL2BookUpdate(data: any): void {
    if (!data || !data.coin) return;

    const coin = data.coin;
    const bids: OrderBookLevel[] = (data.levels?.[0] || []).map((l: any) => ({
      price: parseFloat(l.px),
      size: parseFloat(l.sz),
      numOrders: l.n,
    }));
    const asks: OrderBookLevel[] = (data.levels?.[1] || []).map((l: any) => ({
      price: parseFloat(l.px),
      size: parseFloat(l.sz),
      numOrders: l.n,
    }));

    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    // Calculate imbalance (top 5 levels)
    const bidVolume = bids.slice(0, 5).reduce((s, b) => s + b.size, 0);
    const askVolume = asks.slice(0, 5).reduce((s, a) => s + a.size, 0);
    const imbalance = (bidVolume + askVolume) > 0 
      ? bidVolume / (bidVolume + askVolume) 
      : 0.5;

    const orderBook: OrderBook = {
      coin,
      bids,
      asks,
      timestamp: Date.now(),
      midPrice,
      spread,
      spreadPct,
      imbalance,
    };

    this.orderBooks.set(coin, orderBook);
    this.notifySubscribers('orderBook', { coin, orderBook });
  }

  private handleTradesUpdate(data: any[]): void {
    if (!Array.isArray(data)) return;

    for (const trade of data) {
      const coin = trade.coin;
      const tradeData: TradeData = {
        coin,
        side: trade.side === 'B' ? 'buy' : 'sell',
        price: parseFloat(trade.px),
        size: parseFloat(trade.sz),
        timestamp: trade.time,
        hash: trade.hash,
      };

      if (!this.recentTrades.has(coin)) {
        this.recentTrades.set(coin, []);
      }

      const trades = this.recentTrades.get(coin)!;
      trades.unshift(tradeData);
      
      // Keep only recent trades
      if (trades.length > this.MAX_TRADES) {
        trades.pop();
      }

      this.notifySubscribers('trade', { coin, trade: tradeData });
    }
  }

  private handleAssetCtxUpdate(data: any): void {
    if (!data || !data.ctx) return;

    const ctx = data.ctx;
    const coin = ctx.coin || data.coin;
    
    const fundingData: FundingData = {
      coin,
      fundingRate: parseFloat(ctx.funding || '0'),
      predictedRate: parseFloat(ctx.premium || '0'),
      openInterest: parseFloat(ctx.openInterest || '0'),
      timestamp: Date.now(),
    };

    this.fundingData.set(coin, fundingData);
    this.notifySubscribers('funding', { coin, funding: fundingData });
  }

  private handleLiquidationUpdate(data: any): void {
    if (!data || !Array.isArray(data.ledgerUpdates)) return;

    for (const update of data.ledgerUpdates) {
      if (update.delta?.type === 'liquidation') {
        const liq = update.delta.liquidation;
        const coin = liq.coin;
        
        const liquidation: LiquidationData = {
          coin,
          side: liq.side === 'B' ? 'long' : 'short',
          price: parseFloat(liq.px),
          size: parseFloat(liq.sz),
          timestamp: update.time,
        };

        if (!this.recentLiquidations.has(coin)) {
          this.recentLiquidations.set(coin, []);
        }

        const liqs = this.recentLiquidations.get(coin)!;
        liqs.unshift(liquidation);
        
        if (liqs.length > this.MAX_LIQUIDATIONS) {
          liqs.pop();
        }

        this.notifySubscribers('liquidation', { coin, liquidation });
      }
    }
  }

  // ============================================================================
  // SUBSCRIBER MANAGEMENT
  // ============================================================================

  subscribe(event: string, callback: (data: any) => void): () => void {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event)!.add(callback);
    
    return () => {
      this.subscribers.get(event)?.delete(callback);
    };
  }

  private notifySubscribers(event: string, data: any): void {
    const subs = this.subscribers.get(event);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(data);
        } catch (error) {
          console.error('[RealtimeData] Subscriber error:', error);
        }
      }
    }
  }

  // ============================================================================
  // DATA GETTERS
  // ============================================================================

  getOrderBook(coin: string): OrderBook | null {
    return this.orderBooks.get(coin) || null;
  }

  getFunding(coin: string): FundingData | null {
    return this.fundingData.get(coin) || null;
  }

  getRecentTrades(coin: string, limit: number = 50): TradeData[] {
    return (this.recentTrades.get(coin) || []).slice(0, limit);
  }

  getRecentLiquidations(coin: string, limit: number = 20): LiquidationData[] {
    return (this.recentLiquidations.get(coin) || []).slice(0, limit);
  }

  getVolumeProfile(coin: string, periodMs: number = 60000): { buyVolume: number; sellVolume: number; ratio: number } {
    const trades = this.recentTrades.get(coin) || [];
    const cutoff = Date.now() - periodMs;
    
    let buyVolume = 0;
    let sellVolume = 0;
    
    for (const trade of trades) {
      if (trade.timestamp < cutoff) break;
      
      const value = trade.price * trade.size;
      if (trade.side === 'buy') {
        buyVolume += value;
      } else {
        sellVolume += value;
      }
    }
    
    const total = buyVolume + sellVolume;
    return {
      buyVolume,
      sellVolume,
      ratio: total > 0 ? buyVolume / total : 0.5,
    };
  }

  getMarketInfo(coin: string): MarketInfo | null {
    return this.marketInfoCache.get(coin) || null;
  }

  getMarketContext(coin: string): MarketContext {
    return {
      coin,
      price: this.orderBooks.get(coin)?.midPrice || 0,
      orderBook: this.getOrderBook(coin),
      funding: this.getFunding(coin),
      recentTrades: this.getRecentTrades(coin, 20),
      recentLiquidations: this.getRecentLiquidations(coin, 10),
      volumeProfile: this.getVolumeProfile(coin),
      marketInfo: this.getMarketInfo(coin),
      timestamp: Date.now(),
    };
  }

  // ============================================================================
  // HTTP API CALLS (for data not available via WebSocket)
  // ============================================================================

  async fetchFundingHistory(coin: string, startTime: number, endTime?: number): Promise<any[]> {
    try {
      const response = await fetch(HL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fundingHistory',
          coin,
          startTime,
          endTime: endTime || Date.now(),
        }),
      });
      return await response.json() as any[];
    } catch (error) {
      console.error('[RealtimeData] Failed to fetch funding history:', error);
      return [];
    }
  }

  async fetchOpenInterestHistory(coin: string): Promise<any> {
    try {
      const response = await fetch(HL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'metaAndAssetCtxs',
        }),
      });
      const data = await response.json() as any;
      
      // Find the specific coin
      const assetCtxs = data[1] || [];
      const coinData = assetCtxs.find((ctx: any) => ctx.coin === coin);
      
      return coinData || null;
    } catch (error) {
      console.error('[RealtimeData] Failed to fetch OI:', error);
      return null;
    }
  }

  async fetchAllAssetContexts(): Promise<Map<string, FundingData>> {
    try {
      const response = await fetch(HL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      });
      const data = await response.json() as any;
      
      const result = new Map<string, FundingData>();
      const meta = data[0]?.universe || [];
      const ctxs = data[1] || [];
      
      for (let i = 0; i < meta.length && i < ctxs.length; i++) {
        const coinMeta = meta[i];
        const coin = coinMeta.name;
        const ctx = ctxs[i];
        
        result.set(coin, {
          coin,
          fundingRate: parseFloat(ctx.funding || '0'),
          predictedRate: parseFloat(ctx.premium || '0'),
          openInterest: parseFloat(ctx.openInterest || '0'),
          timestamp: Date.now(),
        });
        
        // Also update local cache
        this.fundingData.set(coin, result.get(coin)!);
        
        // Cache market info
        this.marketInfoCache.set(coin, {
          coin,
          maxLeverage: coinMeta.maxLeverage || 50,
          tickSize: parseFloat(coinMeta.tickSize || '0.1'),
          stepSize: Math.pow(10, -(coinMeta.szDecimals || 5)),
          minOrderSize: Math.pow(10, -(coinMeta.szDecimals || 5)),
          fundingInterval: '1 hour',
          marginType: 'USD',
        });
      }
      
      return result;
    } catch (error) {
      console.error('[RealtimeData] Failed to fetch asset contexts:', error);
      return new Map();
    }
  }

  async fetchMarketInfo(coin: string): Promise<MarketInfo | null> {
    try {
      const response = await fetch(HL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      });
      const data = await response.json() as any;
      
      const universe = data.universe || [];
      const coinMeta = universe.find((u: any) => u.name === coin);
      
      if (!coinMeta) return null;
      
      const marketInfo: MarketInfo = {
        coin,
        maxLeverage: coinMeta.maxLeverage || 50,
        tickSize: parseFloat(coinMeta.tickSize || '0.1'),
        stepSize: Math.pow(10, -(coinMeta.szDecimals || 5)),
        minOrderSize: Math.pow(10, -(coinMeta.szDecimals || 5)),
        fundingInterval: '1 hour',
        marginType: 'USD',
      };
      
      this.marketInfoCache.set(coin, marketInfo);
      return marketInfo;
    } catch (error) {
      console.error('[RealtimeData] Failed to fetch market info:', error);
      return null;
    }
  }

  // Get comprehensive market data for trading decisions
  async getFullMarketData(coin: string): Promise<{
    context: MarketContext;
    fundingAPY: number;
    orderBookImbalance: number;
    recentLiquidationPressure: 'long' | 'short' | 'neutral';
    volumeTrend: 'bullish' | 'bearish' | 'neutral';
  }> {
    // Ensure we have fresh data
    if (!this.marketInfoCache.has(coin)) {
      await this.fetchMarketInfo(coin);
    }
    
    const context = this.getMarketContext(coin);
    
    // Calculate funding APY (annualized)
    const fundingRate = context.funding?.fundingRate || 0;
    const fundingAPY = fundingRate * 24 * 365 * 100; // Convert to annual %
    
    // Orderbook imbalance
    const orderBookImbalance = context.orderBook?.imbalance || 0.5;
    
    // Recent liquidation pressure
    const liqs = context.recentLiquidations;
    const longLiqs = liqs.filter(l => l.side === 'long').length;
    const shortLiqs = liqs.filter(l => l.side === 'short').length;
    const recentLiquidationPressure = longLiqs > shortLiqs * 1.5 ? 'long' 
      : shortLiqs > longLiqs * 1.5 ? 'short' 
      : 'neutral';
    
    // Volume trend
    const volumeRatio = context.volumeProfile.ratio;
    const volumeTrend = volumeRatio > 0.6 ? 'bullish' 
      : volumeRatio < 0.4 ? 'bearish' 
      : 'neutral';
    
    return {
      context,
      fundingAPY,
      orderBookImbalance,
      recentLiquidationPressure,
      volumeTrend,
    };
  }
}

// Singleton instance
let instance: RealtimeDataService | null = null;

export function getRealtimeDataService(): RealtimeDataService {
  if (!instance) {
    instance = new RealtimeDataService();
  }
  return instance;
}

export default RealtimeDataService;
