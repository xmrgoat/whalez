import type { OHLC, Ticker, Timeframe } from '../types/index.js';
import { BaseMarketDataAdapter } from './market-data.adapter.js';

/**
 * Paper Market Data Adapter
 * Provides simulated market data for testing.
 * Can be fed real data or generate synthetic data.
 */
export class PaperMarketDataAdapter extends BaseMarketDataAdapter {
  readonly name = 'paper';

  private candles: Map<string, OHLC[]> = new Map();
  private tickers: Map<string, Ticker> = new Map();
  private subscriptions: Map<string, Array<(candle: OHLC) => void>> = new Map();
  private symbols: string[] = ['BTC-PERP', 'ETH-PERP'];

  constructor(options: { symbols?: string[] } = {}) {
    super();
    if (options.symbols) {
      this.symbols = options.symbols;
    }
    this.initializeData();
  }

  /**
   * Initialize with sample data
   */
  private initializeData(): void {
    for (const symbol of this.symbols) {
      // Generate sample historical data
      const candles = this.generateSampleCandles(symbol, 500);
      this.candles.set(symbol, candles);

      // Set initial ticker
      const lastCandle = candles[candles.length - 1]!;
      this.tickers.set(symbol, {
        symbol,
        bid: lastCandle.close * 0.9999,
        ask: lastCandle.close * 1.0001,
        last: lastCandle.close,
        volume24h: 1000000000,
        change24h: 2.5,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Generate sample OHLC candles
   */
  private generateSampleCandles(symbol: string, count: number): OHLC[] {
    const candles: OHLC[] = [];
    const basePrice = symbol.includes('BTC') ? 50000 : 3000;
    const volatility = 0.02;
    const now = Date.now();
    const interval = 4 * 60 * 60 * 1000; // 4h candles

    let price = basePrice;

    for (let i = count - 1; i >= 0; i--) {
      const change = (Math.random() - 0.5) * 2 * volatility;
      const open = price;
      const close = price * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
      const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
      const volume = Math.random() * 10000 + 1000;

      candles.push({
        timestamp: now - i * interval,
        open,
        high,
        low,
        close,
        volume,
      });

      price = close;
    }

    return candles;
  }

  override subscribeOHLC(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: OHLC) => void
  ): () => void {
    const key = `${symbol}:${timeframe}`;
    
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, []);
    }
    
    this.subscriptions.get(key)!.push(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(key);
      if (subs) {
        const index = subs.indexOf(callback);
        if (index > -1) {
          subs.splice(index, 1);
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
    const allCandles = this.candles.get(symbol) || [];
    return allCandles.filter(c => c.timestamp >= from && c.timestamp <= to);
  }

  override async getTicker(symbol: string): Promise<Ticker> {
    const ticker = this.tickers.get(symbol);
    if (!ticker) {
      throw new Error(`Ticker not found for symbol: ${symbol}`);
    }
    return ticker;
  }

  override async getSymbols(): Promise<string[]> {
    return [...this.symbols];
  }

  /**
   * Feed new candle data (for simulation)
   */
  feedCandle(symbol: string, timeframe: Timeframe, candle: OHLC): void {
    // Add to candles
    const candles = this.candles.get(symbol) || [];
    candles.push(candle);
    this.candles.set(symbol, candles);

    // Update ticker
    this.tickers.set(symbol, {
      symbol,
      bid: candle.close * 0.9999,
      ask: candle.close * 1.0001,
      last: candle.close,
      volume24h: 1000000000,
      change24h: 0,
      timestamp: candle.timestamp,
    });

    // Notify subscribers
    const key = `${symbol}:${timeframe}`;
    const subs = this.subscriptions.get(key);
    if (subs) {
      for (const callback of subs) {
        callback(candle);
      }
    }
  }

  /**
   * Update ticker price (for simulation)
   */
  updatePrice(symbol: string, price: number): void {
    const existing = this.tickers.get(symbol);
    this.tickers.set(symbol, {
      symbol,
      bid: price * 0.9999,
      ask: price * 1.0001,
      last: price,
      volume24h: existing?.volume24h || 1000000000,
      change24h: existing?.change24h || 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all candles for a symbol
   */
  getAllCandles(symbol: string): OHLC[] {
    return this.candles.get(symbol) || [];
  }
}
