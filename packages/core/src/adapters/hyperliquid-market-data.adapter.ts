import type { OHLC, Ticker, Timeframe } from '../types/index.js';
import { BaseMarketDataAdapter } from './market-data.adapter.js';
import { EventEmitter } from 'eventemitter3';

/**
 * Hyperliquid Market Data Adapter
 * Fetches OHLC and ticker data from Hyperliquid PERPS.
 * Supports real-time WebSocket subscriptions with polling fallback.
 */

interface HyperliquidMarketConfig {
  apiBase: string;
  wsBase: string;
  pollIntervalMs: number;
  candleLimit: number;
}

export interface MarkPrice {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  timestamp: number;
}

export interface FundingRate {
  symbol: string;
  fundingRate: number;
  nextFundingTime: number;
  timestamp: number;
}

export interface OpenInterest {
  symbol: string;
  openInterest: number;
  openInterestValue: number;
  timestamp: number;
}

export class HyperliquidMarketDataAdapter extends BaseMarketDataAdapter {
  readonly name = 'hyperliquid';

  private config: HyperliquidMarketConfig;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Array<(candle: OHLC) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastCandles: Map<string, OHLC> = new Map();
  private wsConnected = false;
  private events = new EventEmitter();

  // Status tracking
  public isDelayed = false;
  public lastDataTime = 0;

  constructor(config: Partial<HyperliquidMarketConfig> = {}) {
    super();
    this.config = {
      apiBase: config.apiBase || process.env['HL_HTTP_URL'] || process.env['HL_API_BASE'] || 'https://api.hyperliquid.xyz',
      wsBase: config.wsBase || process.env['HL_WS_URL'] || 'wss://api.hyperliquid.xyz/ws',
      pollIntervalMs: parseInt(process.env['DATA_REFRESH_MS'] || '1000'),
      candleLimit: parseInt(process.env['CANDLE_LIMIT'] || '500'),
    };
  }

  // Event emitter for external listeners
  on(event: string, listener: (...args: any[]) => void): void {
    this.events.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.events.off(event, listener);
  }

  override async connect(): Promise<void> {
    await this.connectWebSocket();
    this.connected = true;
    console.log('[Hyperliquid Market] Connected');
  }

  override async disconnect(): Promise<void> {
    // Clear all poll intervals
    for (const interval of this.pollIntervals.values()) {
      clearInterval(interval);
    }
    this.pollIntervals.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.lastCandles.clear();
    this.connected = false;
    this.wsConnected = false;
    console.log('[DATA] Hyperliquid Market disconnected');
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsBase);

        this.ws.onopen = () => {
          console.log('[Hyperliquid Market] WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleWebSocketMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('[Hyperliquid Market] WebSocket error:', error);
        };

        this.ws.onclose = () => {
          console.log('[Hyperliquid Market] WebSocket closed');
          this.handleReconnect();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`[Hyperliquid Market] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connectWebSocket(), delay);
    }
  }

  private handleWebSocketMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      if (message.channel === 'candle') {
        const candle = this.parseCandle(message.data);
        const key = `${message.data.s}:${message.data.i}`;
        const callbacks = this.subscriptions.get(key);
        
        if (callbacks) {
          for (const cb of callbacks) {
            cb(candle);
          }
        }
      }
    } catch (error) {
      console.error('[Hyperliquid Market] Failed to parse message:', error);
    }
  }

  override subscribeOHLC(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: OHLC) => void
  ): () => void {
    const key = `${symbol}:${timeframe}`;
    
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, []);
      
      // Subscribe via WebSocket
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: {
            type: 'candle',
            coin: this.symbolToCoin(symbol),
            interval: this.timeframeToInterval(timeframe),
          },
        }));
      }
    }

    this.subscriptions.get(key)!.push(callback);

    return () => {
      const subs = this.subscriptions.get(key);
      if (subs) {
        const index = subs.indexOf(callback);
        if (index > -1) {
          subs.splice(index, 1);
        }
        
        if (subs.length === 0) {
          this.subscriptions.delete(key);
          // Unsubscribe via WebSocket
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              method: 'unsubscribe',
              subscription: {
                type: 'candle',
                coin: this.symbolToCoin(symbol),
                interval: this.timeframeToInterval(timeframe),
              },
            }));
          }
        }
      }
    };
  }

  override async getOHLC(
    symbol: string,
    timeframe: Timeframe,
    from: number,
    to: number
  ): Promise<OHLC[]> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'candleSnapshot',
        req: {
          coin: this.symbolToCoin(symbol),
          interval: this.timeframeToInterval(timeframe),
          startTime: from,
          endTime: to,
        },
      });

      if (!Array.isArray(response)) {
        return [];
      }

      return response.map((c: any) => this.parseCandle(c));
    } catch (error) {
      console.error('[Hyperliquid Market] Failed to get OHLC:', error);
      return [];
    }
  }

  override async getTicker(symbol: string): Promise<Ticker> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'allMids',
      });

      const coin = this.symbolToCoin(symbol);
      const mid = response[coin];

      if (!mid) {
        throw new Error(`Ticker not found for ${symbol}`);
      }

      const price = parseFloat(mid);

      return {
        symbol,
        bid: price * 0.9999,
        ask: price * 1.0001,
        last: price,
        volume24h: 0, // Would need separate call
        change24h: 0,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[Hyperliquid Market] Failed to get ticker:', error);
      throw error;
    }
  }

  override async getSymbols(): Promise<string[]> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'meta',
      });

      if (response.universe) {
        return response.universe.map((u: { name: string }) => `${u.name}-PERP`);
      }

      return ['BTC-PERP', 'ETH-PERP'];
    } catch (error) {
      console.error('[DATA] Failed to get symbols:', error);
      return ['BTC-PERP', 'ETH-PERP'];
    }
  }

  // ============ Extended Market Data Methods ============

  /**
   * Get mark price for a symbol
   */
  async getMarkPrice(symbol: string): Promise<MarkPrice> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'allMids',
      });

      const coin = this.symbolToCoin(symbol);
      const mid = response[coin];

      if (!mid) {
        throw new Error(`Mark price not found for ${symbol}`);
      }

      const markPrice = parseFloat(mid);
      this.lastDataTime = Date.now();

      return {
        symbol,
        markPrice,
        indexPrice: markPrice, // HL uses same for mark/index
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[DATA] Failed to get mark price:', error);
      throw error;
    }
  }

  /**
   * Get funding rate for a symbol
   */
  async getFundingRate(symbol: string): Promise<FundingRate> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'meta',
      });

      const coin = this.symbolToCoin(symbol);
      const assetInfo = response.universe?.find((u: any) => u.name === coin);

      if (!assetInfo) {
        throw new Error(`Funding rate not found for ${symbol}`);
      }

      // Hyperliquid funding is hourly
      const fundingRate = parseFloat(assetInfo.funding || '0');
      const nextFundingTime = Date.now() + (60 - new Date().getMinutes()) * 60 * 1000;

      return {
        symbol,
        fundingRate,
        nextFundingTime,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[DATA] Failed to get funding rate:', error);
      throw error;
    }
  }

  /**
   * Get open interest for a symbol
   */
  async getOpenInterest(symbol: string): Promise<OpenInterest> {
    try {
      const response = await this.apiRequest('POST', '/info', {
        type: 'metaAndAssetCtxs',
      });

      const coin = this.symbolToCoin(symbol);
      const assetCtxs = response[1] || [];
      const universe = response[0]?.universe || [];
      
      const idx = universe.findIndex((u: any) => u.name === coin);
      const ctx = assetCtxs[idx];

      if (!ctx) {
        throw new Error(`Open interest not found for ${symbol}`);
      }

      const markPrice = parseFloat(ctx.markPx || '0');
      const openInterest = parseFloat(ctx.openInterest || '0');

      return {
        symbol,
        openInterest,
        openInterestValue: openInterest * markPrice,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[DATA] Failed to get open interest:', error);
      throw error;
    }
  }

  /**
   * Get candles with limit (simpler API for chart)
   */
  async getCandles(symbol: string, timeframe: Timeframe, limit: number = 500): Promise<OHLC[]> {
    const now = Date.now();
    const intervalMs = this.timeframeToMs(timeframe);
    const from = now - (limit * intervalMs);

    const candles = await this.getOHLC(symbol, timeframe, from, now);
    
    // Ensure sorted by timestamp ascending
    candles.sort((a, b) => a.timestamp - b.timestamp);
    
    // Ensure all timestamps are in ms
    for (const candle of candles) {
      if (candle.timestamp < 1e12) {
        candle.timestamp *= 1000; // Convert seconds to ms
      }
    }

    this.lastDataTime = Date.now();
    this.isDelayed = false;

    return candles;
  }

  /**
   * Subscribe to candles with polling fallback
   */
  subscribeCandles(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: OHLC, isClosed: boolean) => void
  ): () => void {
    const key = `${symbol}:${timeframe}`;

    // Try WebSocket first
    const wsUnsub = this.subscribeOHLC(symbol, timeframe, (candle) => {
      this.lastDataTime = Date.now();
      this.isDelayed = false;
      callback(candle, false);
    });

    // Setup polling fallback
    const pollInterval = setInterval(async () => {
      // Check if WS is working
      if (this.wsConnected && Date.now() - this.lastDataTime < 5000) {
        return; // WS is working, skip poll
      }

      this.isDelayed = !this.wsConnected;

      try {
        const candles = await this.getCandles(symbol, timeframe, 2);
        if (candles.length > 0) {
          const lastCandle = candles[candles.length - 1]!;
          const prevKey = `${key}:last`;
          const prev = this.lastCandles.get(prevKey);

          // Check if candle closed
          const isClosed = !!(prev && prev.timestamp !== lastCandle.timestamp);
          
          this.lastCandles.set(prevKey, lastCandle);
          callback(lastCandle, isClosed);
        }
      } catch (error) {
        console.error('[DATA] Poll fallback error:', error);
      }
    }, this.config.pollIntervalMs);

    this.pollIntervals.set(key, pollInterval);

    return () => {
      wsUnsub();
      const interval = this.pollIntervals.get(key);
      if (interval) {
        clearInterval(interval);
        this.pollIntervals.delete(key);
      }
    };
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

  private parseCandle(data: any): OHLC {
    return {
      timestamp: data.t || data.T || Date.now(),
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

  private timeframeToInterval(timeframe: Timeframe): string {
    const mapping: Record<Timeframe, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d',
      '1w': '1w',
    };
    return mapping[timeframe] || '1h';
  }

  private timeframeToMs(timeframe: Timeframe): number {
    const mapping: Record<Timeframe, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
    };
    return mapping[timeframe] || 60 * 60 * 1000;
  }
}
