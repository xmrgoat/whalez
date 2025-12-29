/**
 * Order Manager
 * 
 * Manages SL/TP orders to prevent duplicates and ensure proper cleanup.
 * Tracks active orders per coin and handles cancellation before placing new ones.
 */

import * as pythonBridge from './python-bridge';

// Store active SL/TP order IDs per coin
interface ActiveOrders {
  slOid?: string;
  tpOid?: string;
  lastUpdated: number;
}

const activeOrdersMap: Map<string, ActiveOrders> = new Map();

// Minimum time between SL updates (prevents spam)
const MIN_SL_UPDATE_INTERVAL_MS = 30000; // 30 seconds

// Fee constants for HyperLiquid
export const HL_TAKER_FEE = 0.00035; // 0.035%
export const HL_MAKER_FEE = 0.0001;  // 0.01%

/**
 * Calculate minimum profit target to cover fees
 * Returns the minimum profit percentage needed to break even after fees
 */
export function calculateMinProfitPct(leverage: number = 1): number {
  // Entry fee (taker) + Exit fee (taker worst case)
  const totalFeePct = (HL_TAKER_FEE + HL_TAKER_FEE) * 100;
  // Add 50% margin for safety
  const minProfitPct = totalFeePct * 1.5;
  return minProfitPct; // ~0.105% minimum
}

/**
 * Calculate fees for a trade
 */
export function calculateTradeFees(notional: number, isMaker: boolean = false): {
  entryFee: number;
  exitFee: number;
  totalFees: number;
  breakEvenPct: number;
} {
  const feeRate = isMaker ? HL_MAKER_FEE : HL_TAKER_FEE;
  const entryFee = notional * feeRate;
  const exitFee = notional * feeRate; // Assume taker for exit
  const totalFees = entryFee + exitFee;
  const breakEvenPct = (totalFees / notional) * 100;
  
  return { entryFee, exitFee, totalFees, breakEvenPct };
}

/**
 * Validate that TP is profitable after fees
 */
export function validateTakeProfit(
  entryPrice: number,
  takeProfit: number,
  side: 'buy' | 'sell',
  quantity: number
): { valid: boolean; adjustedTP?: number; reason?: string } {
  const notional = entryPrice * quantity;
  const { breakEvenPct } = calculateTradeFees(notional);
  const minProfitPct = breakEvenPct * 1.5; // 50% margin above break-even
  
  let tpPct: number;
  if (side === 'buy') {
    tpPct = ((takeProfit - entryPrice) / entryPrice) * 100;
  } else {
    tpPct = ((entryPrice - takeProfit) / entryPrice) * 100;
  }
  
  if (tpPct < minProfitPct) {
    // Adjust TP to be profitable
    const adjustedTP = side === 'buy'
      ? entryPrice * (1 + minProfitPct / 100)
      : entryPrice * (1 - minProfitPct / 100);
    
    return {
      valid: false,
      adjustedTP,
      reason: `TP too close (${tpPct.toFixed(3)}% < ${minProfitPct.toFixed(3)}% min). Adjusted to ${adjustedTP.toFixed(2)}`,
    };
  }
  
  return { valid: true };
}

/**
 * Cancel existing SL/TP orders for a coin before placing new ones
 */
export async function cancelExistingOrders(
  coin: string,
  agentArgs: string = ''
): Promise<{ cancelled: number; errors: number }> {
  console.log(`[OrderManager] 🗑️ Cancelling existing orders for ${coin}...`);
  
  const result = await pythonBridge.cancelAllOrders(coin, agentArgs);
  
  if (result.success) {
    console.log(`[OrderManager] ✅ Cancelled ${result.cancelledCount} orders for ${coin}`);
    // Clear tracked orders
    activeOrdersMap.delete(coin);
    return { cancelled: result.cancelledCount || 0, errors: result.errorCount || 0 };
  } else {
    console.log(`[OrderManager] ⚠️ Failed to cancel orders: ${result.error}`);
    return { cancelled: 0, errors: 1 };
  }
}

/**
 * Place SL/TP orders with proper management
 * - Cancels existing orders first
 * - Validates TP is profitable
 * - Tracks order IDs
 */
export async function placeSlTpOrders(
  coin: string,
  side: 'buy' | 'sell', // Position side
  quantity: number,
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  agentArgs: string = ''
): Promise<{ success: boolean; slOid?: string; tpOid?: string; error?: string }> {
  const closeSide = side === 'buy' ? 'sell' : 'buy';
  
  // Validate TP is profitable
  const tpValidation = validateTakeProfit(entryPrice, takeProfit, side, quantity);
  if (!tpValidation.valid && tpValidation.adjustedTP) {
    console.log(`[OrderManager] ⚠️ ${tpValidation.reason}`);
    takeProfit = tpValidation.adjustedTP;
  }
  
  // Cancel existing orders first
  await cancelExistingOrders(coin, agentArgs);
  
  // Small delay to avoid rate limiting
  await new Promise(r => setTimeout(r, 500));
  
  let slOid: string | undefined;
  let tpOid: string | undefined;
  
  // Place Stop Loss
  try {
    const slResult = await pythonBridge.placeStopLoss(coin, closeSide, quantity, stopLoss, agentArgs);
    if (slResult.success && slResult.oid) {
      slOid = slResult.oid;
      console.log(`[OrderManager] ✅ SL placed @ $${stopLoss.toFixed(2)} (oid: ${slOid})`);
    } else {
      console.log(`[OrderManager] ⚠️ Failed to place SL: ${slResult.error}`);
    }
  } catch (err) {
    console.error(`[OrderManager] ❌ SL error:`, err);
  }
  
  // Small delay between orders
  await new Promise(r => setTimeout(r, 300));
  
  // Place Take Profit
  try {
    const tpResult = await pythonBridge.placeTakeProfit(coin, closeSide, quantity, takeProfit, agentArgs);
    if (tpResult.success && tpResult.oid) {
      tpOid = tpResult.oid;
      console.log(`[OrderManager] ✅ TP placed @ $${takeProfit.toFixed(2)} (oid: ${tpOid})`);
    } else {
      console.log(`[OrderManager] ⚠️ Failed to place TP: ${tpResult.error}`);
    }
  } catch (err) {
    console.error(`[OrderManager] ❌ TP error:`, err);
  }
  
  // Track the orders
  activeOrdersMap.set(coin, {
    slOid,
    tpOid,
    lastUpdated: Date.now(),
  });
  
  return {
    success: !!(slOid || tpOid),
    slOid,
    tpOid,
    error: (!slOid && !tpOid) ? 'Failed to place both SL and TP' : undefined,
  };
}

/**
 * Update Stop Loss (for trailing stop)
 * - Checks minimum update interval
 * - Cancels old SL before placing new one
 */
export async function updateStopLoss(
  coin: string,
  side: 'buy' | 'sell', // Position side
  quantity: number,
  newStopLoss: number,
  agentArgs: string = '',
  force: boolean = false
): Promise<{ success: boolean; oid?: string; error?: string }> {
  const existing = activeOrdersMap.get(coin);
  
  // Check minimum update interval (unless forced)
  if (!force && existing && (Date.now() - existing.lastUpdated) < MIN_SL_UPDATE_INTERVAL_MS) {
    return { success: false, error: 'Too soon to update SL (rate limit)' };
  }
  
  const closeSide = side === 'buy' ? 'sell' : 'buy';
  
  // Cancel existing SL if we have it tracked
  if (existing?.slOid) {
    try {
      await pythonBridge.cancelOrder(coin, existing.slOid, agentArgs);
      console.log(`[OrderManager] 🗑️ Cancelled old SL (oid: ${existing.slOid})`);
    } catch (err) {
      // Ignore cancel errors - order might already be filled/cancelled
    }
  }
  
  // Small delay
  await new Promise(r => setTimeout(r, 300));
  
  // Place new SL
  try {
    const slResult = await pythonBridge.placeStopLoss(coin, closeSide, quantity, newStopLoss, agentArgs);
    if (slResult.success && slResult.oid) {
      // Update tracking
      activeOrdersMap.set(coin, {
        ...existing,
        slOid: slResult.oid,
        lastUpdated: Date.now(),
      });
      console.log(`[OrderManager] ✅ SL updated to $${newStopLoss.toFixed(2)} (oid: ${slResult.oid})`);
      return { success: true, oid: slResult.oid };
    } else {
      return { success: false, error: slResult.error };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Get active orders for a coin
 */
export function getActiveOrders(coin: string): ActiveOrders | undefined {
  return activeOrdersMap.get(coin);
}

/**
 * Clear tracked orders for a coin (when position is closed)
 */
export function clearTrackedOrders(coin: string): void {
  activeOrdersMap.delete(coin);
}

/**
 * Get count of all tracked orders
 */
export function getTrackedOrdersCount(): number {
  let count = 0;
  activeOrdersMap.forEach(orders => {
    if (orders.slOid) count++;
    if (orders.tpOid) count++;
  });
  return count;
}

export default {
  calculateMinProfitPct,
  calculateTradeFees,
  validateTakeProfit,
  cancelExistingOrders,
  placeSlTpOrders,
  updateStopLoss,
  getActiveOrders,
  clearTrackedOrders,
  getTrackedOrdersCount,
  HL_TAKER_FEE,
  HL_MAKER_FEE,
};
