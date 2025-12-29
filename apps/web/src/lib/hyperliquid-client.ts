/**
 * Hyperliquid Client-Side Trading
 * Allows users to trade with their connected MetaMask wallet
 * Uses the @nktkas/hyperliquid SDK with viem for signing
 */

import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { createWalletClient, custom, type WalletClient } from 'viem';
import { mainnet } from 'viem/chains';

// Hyperliquid API URL
const HL_API_URL = 'https://api.hyperliquid.xyz';

// Asset index mapping
const ASSET_INDEX: Record<string, number> = {
  'BTC': 0,
  'ETH': 1,
  'SOL': 2,
  'ARB': 3,
  'DOGE': 4,
};

export interface HLOrderParams {
  coin: string;
  isBuy: boolean;
  size: number;
  price?: number; // If not provided, market order
  reduceOnly?: boolean;
}

export interface HLOrderResult {
  success: boolean;
  oid?: number;
  avgPx?: string;
  totalSz?: string;
  error?: string;
}

export interface HLPosition {
  coin: string;
  size: number;
  entryPx: number;
  unrealizedPnl: number;
  leverage: number;
}

export interface HLAccountInfo {
  accountValue: string;
  withdrawable: string;
  positions: HLPosition[];
}

/**
 * Get Hyperliquid Info Client (read-only, no wallet needed)
 */
export function getInfoClient(): InfoClient {
  return new InfoClient({
    transport: new HttpTransport(),
  });
}

/**
 * Get account info for any address
 */
export async function getAccountInfo(address: string): Promise<HLAccountInfo> {
  const info = getInfoClient();
  const state = await info.clearinghouseState({ user: address });
  
  const positions: HLPosition[] = (state.assetPositions || [])
    .filter((p: any) => parseFloat(p.position?.szi || '0') !== 0)
    .map((p: any) => ({
      coin: p.position?.coin || '',
      size: parseFloat(p.position?.szi || '0'),
      entryPx: parseFloat(p.position?.entryPx || '0'),
      unrealizedPnl: parseFloat(p.position?.unrealizedPnl || '0'),
      leverage: p.position?.leverage?.value || 1,
    }));

  return {
    accountValue: state.marginSummary?.accountValue || '0',
    withdrawable: state.withdrawable || '0',
    positions,
  };
}

/**
 * Get all mid prices
 */
export async function getAllMids(): Promise<Record<string, string>> {
  const info = getInfoClient();
  return await info.allMids();
}

/**
 * Create Exchange Client with MetaMask wallet
 * This requires the user to have MetaMask connected
 */
export async function createExchangeClient(): Promise<ExchangeClient | null> {
  if (typeof window === 'undefined' || !window.ethereum) {
    console.error('MetaMask not available');
    return null;
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    }) as string[];

    if (!accounts || accounts.length === 0) {
      console.error('No accounts found');
      return null;
    }

    // Create viem wallet client with MetaMask
    const walletClient = createWalletClient({
      chain: mainnet,
      transport: custom(window.ethereum),
    });

    // Create Hyperliquid exchange client
    const exchange = new ExchangeClient({
      transport: new HttpTransport(),
      wallet: walletClient as any, // viem wallet client
    });

    return exchange;
  } catch (error) {
    console.error('Failed to create exchange client:', error);
    return null;
  }
}

/**
 * Place an order using MetaMask signature
 */
export async function placeOrder(params: HLOrderParams): Promise<HLOrderResult> {
  const exchange = await createExchangeClient();
  if (!exchange) {
    return { success: false, error: 'MetaMask not connected' };
  }

  try {
    const assetIndex = ASSET_INDEX[params.coin.toUpperCase()] ?? 0;
    
    // Get current price if not provided (for market orders)
    let price = params.price;
    if (!price) {
      const mids = await getAllMids();
      const midPrice = parseFloat(mids[params.coin.toUpperCase()] || '0');
      // For market orders, use IOC with price slightly worse than market
      price = params.isBuy ? Math.round(midPrice * 1.001) : Math.round(midPrice * 0.999);
    }

    const result = await exchange.order({
      orders: [{
        a: assetIndex,
        b: params.isBuy,
        p: price.toString(),
        s: params.size.toString(),
        r: params.reduceOnly || false,
        t: params.price ? { limit: { tif: 'Gtc' } } : { limit: { tif: 'Ioc' } },
      }],
      grouping: 'na',
    });

    if (result.status === 'ok') {
      const statuses = result.response?.data?.statuses;
      if (statuses && statuses[0]) {
        const status = statuses[0] as any;
        if (status.error) {
          return { success: false, error: status.error };
        }
        if (status.filled) {
          return {
            success: true,
            oid: status.filled.oid,
            avgPx: status.filled.avgPx,
            totalSz: status.filled.totalSz,
          };
        }
        if (status.resting) {
          return {
            success: true,
            oid: status.resting.oid,
          };
        }
      }
      return { success: true };
    }

    return { success: false, error: JSON.stringify(result) };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Cancel an order
 */
export async function cancelOrder(coin: string, oid: number): Promise<{ success: boolean; error?: string }> {
  const exchange = await createExchangeClient();
  if (!exchange) {
    return { success: false, error: 'MetaMask not connected' };
  }

  try {
    const assetIndex = ASSET_INDEX[coin.toUpperCase()] ?? 0;
    
    const result = await exchange.cancel({
      cancels: [{ a: assetIndex, o: oid }],
    });

    if (result.status === 'ok') {
      return { success: true };
    }

    return { success: false, error: JSON.stringify(result) };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Close all positions
 */
export async function closeAllPositions(address: string): Promise<{ success: boolean; closed: number; error?: string }> {
  try {
    const accountInfo = await getAccountInfo(address);
    let closed = 0;

    for (const pos of accountInfo.positions) {
      const result = await placeOrder({
        coin: pos.coin,
        isBuy: pos.size < 0, // Close by doing opposite
        size: Math.abs(pos.size),
        reduceOnly: true,
      });

      if (result.success) {
        closed++;
      }
    }

    return { success: true, closed };
  } catch (error) {
    return { success: false, closed: 0, error: (error as Error).message };
  }
}

// Type declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
    };
  }
}
