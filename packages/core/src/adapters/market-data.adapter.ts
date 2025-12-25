import type { OHLC, Ticker, Timeframe } from '../types/index.js';

/**
 * MarketDataAdapter Interface
 * Provides market data (OHLC, tickers) from various sources.
 * Implementations: HyperliquidMarketDataAdapter, MegaETHMarketDataAdapter, PaperMarketDataAdapter
 */
export interface MarketDataAdapter {
  readonly name: string;

  /**
   * Subscribe to real-time OHLC updates
   */
  subscribeOHLC(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: OHLC) => void
  ): () => void;

  /**
   * Get historical OHLC data
   */
  getOHLC(
    symbol: string,
    timeframe: Timeframe,
    from: number,
    to: number
  ): Promise<OHLC[]>;

  /**
   * Get current ticker for a symbol
   */
  getTicker(symbol: string): Promise<Ticker>;

  /**
   * Get available symbols
   */
  getSymbols(): Promise<string[]>;

  /**
   * Connect to data source
   */
  connect(): Promise<void>;

  /**
   * Disconnect from data source
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;
}

/**
 * Base class with common functionality
 */
export abstract class BaseMarketDataAdapter implements MarketDataAdapter {
  abstract readonly name: string;
  protected connected = false;

  abstract subscribeOHLC(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: OHLC) => void
  ): () => void;

  abstract getOHLC(
    symbol: string,
    timeframe: Timeframe,
    from: number,
    to: number
  ): Promise<OHLC[]>;

  abstract getTicker(symbol: string): Promise<Ticker>;

  abstract getSymbols(): Promise<string[]>;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
