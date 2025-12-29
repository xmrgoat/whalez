/**
 * Async Python Bridge Executor
 * 
 * Provides async execution of the hl_bridge.py script with:
 * - Timeout handling
 * - Retry with exponential backoff
 * - Non-blocking execution
 */

import { spawn } from 'child_process';
import path from 'path';

const SCRIPT_PATH = path.resolve(process.cwd(), '../../scripts/hl_bridge.py');
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

export interface BridgeResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface OrderResult extends BridgeResult {
  oid?: string;
  avgPx?: number;
  totalSz?: number;
  filled?: boolean;
}

export interface BalanceResult extends BridgeResult {
  accountValue?: number;
  withdrawable?: number;
  marginUsed?: number;
}

export interface PositionsResult extends BridgeResult {
  positions?: Array<{
    coin: string;
    szi: number;
    entryPx: number;
    positionValue: number;
    unrealizedPnl: number;
    leverage: number;
  }>;
}

/**
 * Execute Python bridge command asynchronously
 */
async function execBridgeAsync(
  args: string[],
  timeout: number = DEFAULT_TIMEOUT
): Promise<BridgeResult> {
  return new Promise((resolve) => {
    const cwd = path.resolve(process.cwd(), '../..');
    const proc = spawn('python', [SCRIPT_PATH, ...args], { cwd });
    
    let stdout = '';
    let stderr = '';
    let resolved = false;
    
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill('SIGTERM');
        resolve({ success: false, error: `Timeout after ${timeout}ms` });
      }
    }, timeout);
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      
      if (code !== 0) {
        resolve({ success: false, error: stderr || `Exit code ${code}` });
        return;
      }
      
      try {
        const data = JSON.parse(stdout.trim());
        resolve({ success: true, data });
      } catch (e) {
        resolve({ success: false, error: `Invalid JSON: ${stdout}` });
      }
    });
    
    proc.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Execute with retry and exponential backoff
 */
async function execWithRetry(
  args: string[],
  maxRetries: number = MAX_RETRIES,
  timeout: number = DEFAULT_TIMEOUT
): Promise<BridgeResult> {
  let lastError = '';
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await execBridgeAsync(args, timeout);
    
    if (result.success) {
      return result;
    }
    
    lastError = result.error || 'Unknown error';
    
    // Don't retry on certain errors
    if (lastError.includes('Invalid') || lastError.includes('Unauthorized')) {
      return result;
    }
    
    // Exponential backoff
    if (attempt < maxRetries - 1) {
      const backoff = INITIAL_BACKOFF * Math.pow(2, attempt);
      console.log(`[Bridge] Retry ${attempt + 1}/${maxRetries} after ${backoff}ms...`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  
  return { success: false, error: `Failed after ${maxRetries} attempts: ${lastError}` };
}

/**
 * Get account balance
 */
export async function getBalance(agentArgs: string = ''): Promise<BalanceResult> {
  const args = agentArgs ? [...agentArgs.split(' ').filter(a => a), 'balance'] : ['balance'];
  const result = await execWithRetry(args);
  
  if (result.success && result.data) {
    return {
      success: true,
      accountValue: parseFloat(result.data.accountValue || '0'),
      withdrawable: parseFloat(result.data.withdrawable || '0'),
      marginUsed: parseFloat(result.data.marginUsed || '0'),
    };
  }
  
  return { success: false, error: result.error };
}

/**
 * Get open positions
 */
export async function getPositions(agentArgs: string = ''): Promise<PositionsResult> {
  const args = agentArgs ? [...agentArgs.split(' ').filter(a => a), 'positions'] : ['positions'];
  const result = await execWithRetry(args);
  
  if (result.success && result.data) {
    return {
      success: true,
      positions: result.data.positions || [],
    };
  }
  
  return { success: false, error: result.error, positions: [] };
}

/**
 * Check if there's an open position for a coin
 */
export async function hasOpenPosition(coin: string, agentArgs: string = ''): Promise<boolean> {
  const result = await getPositions(agentArgs);
  if (!result.success || !result.positions) return false;
  
  return result.positions.some(p => 
    p.coin && coin && p.coin.toUpperCase() === coin.toUpperCase() && Math.abs(p.szi) > 0.00001
  );
}

/**
 * Execute market order
 */
export async function executeMarketOrder(
  coin: string,
  side: 'buy' | 'sell',
  size: number,
  agentArgs: string = ''
): Promise<OrderResult> {
  const args = agentArgs 
    ? [...agentArgs.split(' ').filter(a => a), 'order', coin, side, size.toFixed(6), 'market']
    : ['order', coin, side, size.toFixed(6), 'market'];
  
  const result = await execWithRetry(args, 2, 15000); // 2 retries, 15s timeout for orders
  
  if (result.success && result.data) {
    return {
      success: result.data.success !== false,
      oid: result.data.oid?.toString(),
      avgPx: parseFloat(result.data.avgPx || '0'),
      totalSz: parseFloat(result.data.totalSz || '0'),
      filled: result.data.filled || false,
      error: result.data.error,
    };
  }
  
  return { success: false, error: result.error };
}

// Round price to max 5 significant figures as required by Hyperliquid
// Also ensure max 6 decimal places for perps
function roundToHyperliquidPrice(price: number): string {
  // Hyperliquid requires max 5 significant figures
  // For high prices like BTC (~87000), we need to round to nearest integer
  // For lower prices, we can have more decimals
  
  if (price >= 10000) {
    // BTC range: round to nearest 1
    return Math.round(price).toString();
  } else if (price >= 1000) {
    // ETH range: round to 1 decimal
    return (Math.round(price * 10) / 10).toFixed(1);
  } else if (price >= 100) {
    // SOL range: round to 2 decimals
    return (Math.round(price * 100) / 100).toFixed(2);
  } else if (price >= 10) {
    // Medium price: round to 3 decimals
    return (Math.round(price * 1000) / 1000).toFixed(3);
  } else if (price >= 1) {
    // Low price: round to 4 decimals
    return (Math.round(price * 10000) / 10000).toFixed(4);
  } else if (price >= 0.1) {
    // Very low price: round to 5 decimals
    return (Math.round(price * 100000) / 100000).toFixed(5);
  } else {
    // Ultra low price: round to 6 decimals (max for perps)
    return (Math.round(price * 1000000) / 1000000).toFixed(6);
  }
}

/**
 * Execute limit order with slippage tolerance
 */
export async function executeLimitOrder(
  coin: string,
  side: 'buy' | 'sell',
  size: number,
  price: number,
  slippagePct: number = 0.1, // 0.1% default slippage
  agentArgs: string = ''
): Promise<OrderResult> {
  // Adjust price for slippage
  const adjustedPrice = side === 'buy' 
    ? price * (1 + slippagePct / 100)  // Pay slightly more for buys
    : price * (1 - slippagePct / 100); // Accept slightly less for sells
  
  // Round to Hyperliquid's 5 significant figures requirement
  const priceStr = roundToHyperliquidPrice(adjustedPrice);
  
  const args = agentArgs 
    ? [...agentArgs.split(' ').filter(a => a), 'order', coin, side, size.toFixed(6), 'limit', priceStr]
    : ['order', coin, side, size.toFixed(6), 'limit', priceStr];
  
  const result = await execWithRetry(args, 2, 15000);
  
  if (result.success && result.data) {
    return {
      success: result.data.success !== false,
      oid: result.data.oid?.toString(),
      avgPx: parseFloat(result.data.avgPx || '0'),
      totalSz: parseFloat(result.data.totalSz || '0'),
      filled: result.data.filled || false,
      error: result.data.error,
    };
  }
  
  return { success: false, error: result.error };
}

/**
 * Place stop loss order (trigger order)
 */
export async function placeStopLoss(
  coin: string,
  side: 'buy' | 'sell', // Opposite of position side
  size: number,
  triggerPrice: number,
  agentArgs: string = ''
): Promise<OrderResult> {
  const priceStr = roundToHyperliquidPrice(triggerPrice);
  
  const args = agentArgs 
    ? [...agentArgs.split(' ').filter(a => a), 'trigger', coin, side, size.toFixed(6), 'sl', priceStr]
    : ['trigger', coin, side, size.toFixed(6), 'sl', priceStr];
  
  const result = await execWithRetry(args, 2, 15000);
  
  if (result.success && result.data) {
    return {
      success: result.data.success !== false,
      oid: result.data.oid?.toString(),
      error: result.data.error,
    };
  }
  
  return { success: false, error: result.error };
}

/**
 * Place take profit order (trigger order)
 */
export async function placeTakeProfit(
  coin: string,
  side: 'buy' | 'sell', // Opposite of position side
  size: number,
  triggerPrice: number,
  agentArgs: string = ''
): Promise<OrderResult> {
  const priceStr = roundToHyperliquidPrice(triggerPrice);
  
  const args = agentArgs 
    ? [...agentArgs.split(' ').filter(a => a), 'trigger', coin, side, size.toFixed(6), 'tp', priceStr]
    : ['trigger', coin, side, size.toFixed(6), 'tp', priceStr];
  
  const result = await execWithRetry(args, 2, 15000);
  
  if (result.success && result.data) {
    return {
      success: result.data.success !== false,
      oid: result.data.oid?.toString(),
      error: result.data.error,
    };
  }
  
  return { success: false, error: result.error };
}

/**
 * Cancel a single order by OID
 */
export async function cancelOrder(coin: string, oid: string, agentArgs: string = ''): Promise<BridgeResult> {
  const args = agentArgs 
    ? [...agentArgs.split(' ').filter(a => a), 'cancel', coin, oid]
    : ['cancel', coin, oid];
  
  return execWithRetry(args);
}

/**
 * Open orders result
 */
export interface OpenOrdersResult extends BridgeResult {
  orders?: Array<{
    oid: string;
    coin: string;
    side: string;
    size: number;
    price: number;
    orderType: string;
    reduceOnly: boolean;
    triggerPx?: number;
    tpsl?: string;
  }>;
  count?: number;
}

/**
 * Get all open orders
 */
export async function getOpenOrders(agentArgs: string = ''): Promise<OpenOrdersResult> {
  const args = agentArgs 
    ? [...agentArgs.split(' ').filter(a => a), 'open_orders']
    : ['open_orders'];
  
  const result = await execWithRetry(args);
  
  if (result.success && result.data) {
    return {
      success: true,
      orders: result.data.orders || [],
      count: result.data.count || 0,
    };
  }
  
  return { success: false, error: result.error, orders: [], count: 0 };
}

/**
 * Cancel all orders result
 */
export interface CancelAllResult extends BridgeResult {
  cancelledCount?: number;
  errorCount?: number;
  cancelled?: Array<{ coin: string; oid: string }>;
  errors?: Array<{ coin: string; oid: string; error: string }>;
}

/**
 * Cancel all open orders for a coin (or all coins if not specified)
 */
export async function cancelAllOrders(coin?: string, agentArgs: string = ''): Promise<CancelAllResult> {
  const args = agentArgs 
    ? [...agentArgs.split(' ').filter(a => a), 'cancel_all', ...(coin ? [coin] : [])]
    : ['cancel_all', ...(coin ? [coin] : [])];
  
  const result = await execWithRetry(args, 2, 30000); // Longer timeout for cancelling many orders
  
  if (result.success && result.data) {
    return {
      success: true,
      cancelledCount: result.data.cancelledCount || 0,
      errorCount: result.data.errorCount || 0,
      cancelled: result.data.cancelled || [],
      errors: result.data.errors || [],
    };
  }
  
  return { success: false, error: result.error };
}

/**
 * Close position for a coin
 */
export async function closePosition(coin: string, agentArgs: string = ''): Promise<OrderResult> {
  // First get the position
  const posResult = await getPositions(agentArgs);
  if (!posResult.success || !posResult.positions) {
    return { success: false, error: 'Failed to get positions' };
  }
  
  const position = posResult.positions.find(p => 
    p.coin.toUpperCase() === coin.toUpperCase()
  );
  
  if (!position || Math.abs(position.szi) < 0.00001) {
    return { success: true }; // No position to close
  }
  
  // Close by placing opposite order
  const side = position.szi > 0 ? 'sell' : 'buy';
  const size = Math.abs(position.szi);
  
  return executeMarketOrder(coin, side, size, agentArgs);
}

/**
 * Order Book L2 result
 */
export interface OrderBookResult extends BridgeResult {
  coin?: string;
  bids?: Array<{ price: number; size: number; numOrders: number }>;
  asks?: Array<{ price: number; size: number; numOrders: number }>;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  spreadPct?: number;
  imbalance?: number; // Positive = more buy pressure, negative = more sell pressure
  bidWall?: { price: number; size: number; numOrders: number } | null;
  askWall?: { price: number; size: number; numOrders: number } | null;
  totalBidSize?: number;
  totalAskSize?: number;
}

/**
 * Get L2 order book for a coin
 * Returns bid/ask levels, spread, imbalance, and wall detection
 */
export async function getOrderBook(coin: string, depth: number = 10): Promise<OrderBookResult> {
  const result = await execWithRetry(['orderbook', coin, depth.toString()]);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }
  
  return {
    success: true,
    coin: result.data?.coin,
    bids: result.data?.bids || [],
    asks: result.data?.asks || [],
    bestBid: result.data?.bestBid,
    bestAsk: result.data?.bestAsk,
    spread: result.data?.spread,
    spreadPct: result.data?.spreadPct,
    imbalance: result.data?.imbalance,
    bidWall: result.data?.bidWall,
    askWall: result.data?.askWall,
    totalBidSize: result.data?.totalBidSize,
    totalAskSize: result.data?.totalAskSize,
  };
}

export default {
  getBalance,
  getPositions,
  hasOpenPosition,
  executeMarketOrder,
  executeLimitOrder,
  placeStopLoss,
  placeTakeProfit,
  cancelOrder,
  cancelAllOrders,
  getOpenOrders,
  closePosition,
  getOrderBook,
};
