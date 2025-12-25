import type { OHLC, Ticker, Timeframe } from '../types/index.js';
import { BaseMarketDataAdapter } from './market-data.adapter.js';

/**
 * MegaETH Market Data Adapter (Placeholder)
 * 
 * This adapter will fetch market data from MegaETH.
 * Currently a placeholder - implementation pending MegaETH mainnet launch.
 * 
 * To enable: Set MARKETDATA_ADAPTER=megaeth in environment
 */

interface MegaETHMarketConfig {
  rpcUrl: string;
  wsUrl: string;
  chainId: number;
  blockscoutUrl: string;
}

export class MegaETHMarketDataAdapter extends BaseMarketDataAdapter {
  readonly name = 'megaeth';

  private config: MegaETHMarketConfig;

  constructor(config: Partial<MegaETHMarketConfig> = {}) {
    super();
    this.config = {
      rpcUrl: config.rpcUrl || process.env['MEGAETH_RPC_URL'] || process.env['MEGAETH_RPC_HTTP'] || 'https://timothy.megaeth.com/rpc',
      wsUrl: config.wsUrl || process.env['MEGAETH_WS_URL'] || process.env['MEGAETH_RPC_WS'] || '',
      chainId: config.chainId || Number(process.env['MEGAETH_CHAIN_ID']) || 6343,
      blockscoutUrl: config.blockscoutUrl || process.env['MEGAETH_BLOCKSCOUT_URL'] || process.env['BLOCKSCOUT_BASE_URL'] || 'https://megaeth-testnet-v2.blockscout.com',
    };
  }

  override async connect(): Promise<void> {
    throw new Error('MegaETH market data adapter not yet implemented. Coming soon!');
  }

  override async disconnect(): Promise<void> {
    this.connected = false;
  }

  override subscribeOHLC(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: OHLC) => void
  ): () => void {
    console.warn('MegaETH market data adapter not yet implemented');
    return () => {};
  }

  override async getOHLC(
    symbol: string,
    timeframe: Timeframe,
    from: number,
    to: number
  ): Promise<OHLC[]> {
    console.warn('MegaETH market data adapter not yet implemented');
    return [];
  }

  override async getTicker(symbol: string): Promise<Ticker> {
    throw new Error('MegaETH market data adapter not yet implemented');
  }

  override async getSymbols(): Promise<string[]> {
    return [];
  }
}
