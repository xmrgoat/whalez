/**
 * MarketDataService
 * 
 * Manages real-time market data from Hyperliquid and broadcasts to WebSocket clients.
 * Provides REST endpoints for historical data and real-time streaming.
 */

import { EventEmitter } from 'events';

// Hyperliquid API configuration
const HL_HTTP_URL = process.env['HL_HTTP_URL'] || 'https://api.hyperliquid.xyz';
const HL_WS_URL = process.env['HL_WS_URL'] || 'wss://api.hyperliquid.xyz/ws';
const POLL_INTERVAL_MS = parseInt(process.env['DATA_REFRESH_MS'] || '5000');
const CANDLE_LIMIT = parseInt(process.env['CANDLE_LIMIT'] || '500');

export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface MarketStatus {
  connected: boolean;
  isDelayed: boolean;
  lastDataTime: number;
  latencyMs: number;
}

type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1M';

interface CandleSubscription {
  symbol: string;
  timeframe: Timeframe;
  callbacks: Set<(candle: OHLC, isClosed: boolean) => void>;
  lastCandle: OHLC | null;
  pollInterval: NodeJS.Timeout | null;
}

class MarketDataService extends EventEmitter {
  private static instance: MarketDataService;
  
  private ws: WebSocket | null = null;
  private wsConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  
  private subscriptions = new Map<string, CandleSubscription>();
  private tickerCache = new Map<string, Ticker>();
  
  private lastDataTime = 0;
  private isDelayed = false;
  private latencyMs = 0;

  private constructor() {
    super();
  }

  static getInstance(): MarketDataService {
    if (!MarketDataService.instance) {
      MarketDataService.instance = new MarketDataService();
    }
    return MarketDataService.instance;
  }

  // ============ Connection Management ============

  async connect(): Promise<void> {
    console.log('[MarketData] Connecting to Hyperliquid...');
    await this.connectWebSocket();
  }

  async disconnect(): Promise<void> {
    // Clear all subscriptions
    for (const sub of this.subscriptions.values()) {
      if (sub.pollInterval) {
        clearInterval(sub.pollInterval);
      }
    }
    this.subscriptions.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
    console.log('[MarketData] Disconnected');
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(HL_WS_URL);

        this.ws.onopen = () => {
          console.log('[MarketData] WebSocket connected');
          this.wsConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleWebSocketMessage(event.data as string);
        };

        this.ws.onerror = (error) => {
          console.error('[MarketData] WebSocket error:', error);
          this.emit('error', error);
        };

        this.ws.onclose = () => {
          console.log('[MarketData] WebSocket closed');
          this.wsConnected = false;
          this.emit('disconnected');
          this.handleReconnect();
        };

        // Resolve after timeout if WS doesn't connect (will use polling)
        setTimeout(() => resolve(), 5000);
      } catch (error) {
        console.error('[MarketData] WebSocket connection failed:', error);
        resolve(); // Continue with polling fallback
      }
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`[MarketData] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connectWebSocket(), delay);
    } else {
      console.log('[MarketData] Max reconnect attempts reached, using polling only');
    }
  }

  private handleWebSocketMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      const startTime = Date.now();
      
      if (message.channel === 'candle') {
        const candle = this.parseCandle(message.data);
        const key = `${message.data.s}:${message.data.i}`;
        const sub = this.subscriptions.get(key);
        
        if (sub) {
          const isClosed = sub.lastCandle?.timestamp !== candle.timestamp;
          sub.lastCandle = candle;
          
          for (const callback of sub.callbacks) {
            callback(candle, isClosed);
          }
          
          this.emit('candle', { symbol: sub.symbol, timeframe: sub.timeframe, candle, isClosed });
        }
        
        this.lastDataTime = Date.now();
        this.latencyMs = Date.now() - startTime;
        this.isDelayed = false;
      }
    } catch (error) {
      console.error('[MarketData] Failed to parse WS message:', error);
    }
  }

  // ============ Public API ============

  getStatus(): MarketStatus {
    return {
      connected: this.wsConnected,
      isDelayed: this.isDelayed,
      lastDataTime: this.lastDataTime,
      latencyMs: this.latencyMs,
    };
  }

  /**
   * Get historical candles
   */
  async getCandles(symbol: string, timeframe: Timeframe, limit: number = CANDLE_LIMIT): Promise<OHLC[]> {
    const now = Date.now();
    const intervalMs = this.timeframeToMs(timeframe);
    const from = now - (limit * intervalMs);

    const startTime = Date.now();
    
    try {
      const response = await this.apiRequest('/info', {
        type: 'candleSnapshot',
        req: {
          coin: this.symbolToCoin(symbol),
          interval: timeframe,
          startTime: from,
          endTime: now,
        },
      });

      this.latencyMs = Date.now() - startTime;
      this.lastDataTime = Date.now();
      this.isDelayed = false;

      if (!Array.isArray(response)) {
        return [];
      }

      const candles = response.map((c: any) => this.parseCandle(c));
      candles.sort((a, b) => a.timestamp - b.timestamp);

      return candles;
    } catch (error) {
      console.error('[MarketData] Failed to get candles:', error);
      this.isDelayed = true;
      return [];
    }
  }

  /**
   * Get current ticker
   */
  async getTicker(symbol: string): Promise<Ticker | null> {
    try {
      const [midsResponse, metaResponse] = await Promise.all([
        this.apiRequest('/info', { type: 'allMids' }),
        this.apiRequest('/info', { type: 'metaAndAssetCtxs' }),
      ]);

      const coin = this.symbolToCoin(symbol);
      const mid = midsResponse[coin];

      if (!mid) {
        return null;
      }

      const price = parseFloat(mid);
      const universe = metaResponse[0]?.universe || [];
      const assetCtxs = metaResponse[1] || [];
      const idx = universe.findIndex((u: any) => u.name === coin);
      const ctx = assetCtxs[idx];

      const ticker: Ticker = {
        symbol,
        price,
        change24h: ctx?.dayNtlVlm ? parseFloat(ctx.dayNtlVlm) : 0,
        volume24h: ctx?.dayNtlVlm ? parseFloat(ctx.dayNtlVlm) : 0,
        high24h: price * 1.01, // Approximate
        low24h: price * 0.99,
        timestamp: Date.now(),
      };

      this.tickerCache.set(symbol, ticker);
      return ticker;
    } catch (error) {
      console.error('[MarketData] Failed to get ticker:', error);
      return this.tickerCache.get(symbol) || null;
    }
  }

  /**
   * Subscribe to real-time candle updates
   */
  subscribeCandles(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: OHLC, isClosed: boolean) => void
  ): () => void {
    const key = `${symbol}:${timeframe}`;

    if (!this.subscriptions.has(key)) {
      const sub: CandleSubscription = {
        symbol,
        timeframe,
        callbacks: new Set(),
        lastCandle: null,
        pollInterval: null,
      };
      this.subscriptions.set(key, sub);

      // Subscribe via WebSocket
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: {
            type: 'candle',
            coin: this.symbolToCoin(symbol),
            interval: timeframe,
          },
        }));
      }

      // Setup polling fallback (always runs, WS updates override)
      sub.pollInterval = setInterval(async () => {
        // Mark as delayed if no recent WS data
        this.isDelayed = this.lastDataTime === 0 || (Date.now() - this.lastDataTime > 10000);

        try {
          const candles = await this.getCandles(symbol, timeframe, 2);
          if (candles.length > 0) {
            const lastCandle = candles[candles.length - 1]!;
            const isClosed = sub.lastCandle?.timestamp !== lastCandle.timestamp;
            sub.lastCandle = lastCandle;

            for (const cb of sub.callbacks) {
              cb(lastCandle, isClosed);
            }

            this.emit('candle', { symbol, timeframe, candle: lastCandle, isClosed });
          }
        } catch (error) {
          console.error('[MarketData] Poll error:', error);
        }
      }, POLL_INTERVAL_MS);
    }

    const sub = this.subscriptions.get(key)!;
    sub.callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      sub.callbacks.delete(callback);
      
      if (sub.callbacks.size === 0) {
        if (sub.pollInterval) {
          clearInterval(sub.pollInterval);
        }
        this.subscriptions.delete(key);

        // Unsubscribe via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            method: 'unsubscribe',
            subscription: {
              type: 'candle',
              coin: this.symbolToCoin(symbol),
              interval: timeframe,
            },
          }));
        }
      }
    };
  }

  /**
   * Get available symbols
   */
  async getSymbols(): Promise<string[]> {
    try {
      const response = await this.apiRequest('/info', { type: 'meta' });
      
      if (response.universe) {
        return response.universe.map((u: { name: string }) => `${u.name}-PERP`);
      }
      
      return ['BTC-PERP', 'ETH-PERP'];
    } catch (error) {
      console.error('[MarketData] Failed to get symbols:', error);
      return ['BTC-PERP', 'ETH-PERP'];
    }
  }

  /**
   * Get funding rate
   */
  async getFundingRate(symbol: string): Promise<{ rate: number; nextFundingTime: number } | null> {
    try {
      const response = await this.apiRequest('/info', { type: 'metaAndAssetCtxs' });
      
      const coin = this.symbolToCoin(symbol);
      const universe = response[0]?.universe || [];
      const assetCtxs = response[1] || [];
      const idx = universe.findIndex((u: any) => u.name === coin);
      const ctx = assetCtxs[idx];

      if (!ctx) return null;

      return {
        rate: parseFloat(ctx.funding || '0'),
        nextFundingTime: Date.now() + (60 - new Date().getMinutes()) * 60 * 1000,
      };
    } catch (error) {
      console.error('[MarketData] Failed to get funding rate:', error);
      return null;
    }
  }

  // ============ Private Helpers ============

  private async apiRequest(endpoint: string, body: unknown): Promise<any> {
    const response = await fetch(`${HL_HTTP_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
  }

  private parseCandle(data: any): OHLC {
    // Handle both REST and WS formats
    let timestamp = data.t || data.T || Date.now();
    
    // Ensure timestamp is in milliseconds
    if (timestamp < 1e12) {
      timestamp *= 1000;
    }

    return {
      timestamp,
      open: parseFloat(data.o || data.O || '0'),
      high: parseFloat(data.h || data.H || '0'),
      low: parseFloat(data.l || data.L || '0'),
      close: parseFloat(data.c || data.C || '0'),
      volume: parseFloat(data.v || data.V || '0'),
    };
  }

  private symbolToCoin(symbol: string): string {
    return symbol.replace('-PERP', '').replace('-USD', '');
  }

  private timeframeToMs(timeframe: Timeframe): number {
    const mapping: Record<Timeframe, number> = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '8h': 8 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000,
    };
    return mapping[timeframe] || 60 * 60 * 1000;
  }
}

// Export singleton instance
export const marketDataService = MarketDataService.getInstance();
export default marketDataService;
