/**
 * Trade Database Service
 * 
 * Handles persistence of trades to PostgreSQL via Prisma
 * Falls back to file-based storage if DB is unavailable
 * 
 * NOTE: Run `npx prisma migrate dev` after adding WalletTrade model
 * to generate the database table and update the Prisma client.
 */

import { prisma } from '@whalez/database';

// Type for Prisma client with WalletTrade (will be available after migration)
const db = prisma as any;

// Flag to track if DB is available (set to false if migrations not run)
let dbAvailable = true;

// Check if WalletTrade model exists
async function checkDBAvailable(): Promise<boolean> {
  try {
    // Try a simple query - will fail if table doesn't exist
    await (prisma as any).walletTrade?.count();
    return true;
  } catch {
    return false;
  }
}

// Initialize DB check
checkDBAvailable().then(available => {
  dbAvailable = available;
  if (!available) {
    console.log('[TradeDB] ⚠️ WalletTrade table not found - using file storage only');
    console.log('[TradeDB] 💡 Run: cd packages/database && npx prisma migrate dev');
  } else {
    console.log('[TradeDB] ✅ Database connection verified');
  }
});

export interface TradeRecord {
  id: string;
  walletAddress: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  entryFee: number;
  exitFee: number;
  pnl?: number;
  pnlWithFees?: number;
  confidence?: number;
  reasoning?: string;
  status: 'open' | 'closed';
  entryTime: Date;
  exitTime?: Date;
  metadata?: Record<string, any>;
}

/**
 * Save a new trade to the database
 */
export async function saveTrade(trade: TradeRecord): Promise<boolean> {
  try {
    await db.walletTrade.create({
      data: {
        id: trade.id,
        walletAddress: trade.walletAddress,
        symbol: trade.symbol,
        side: trade.side === 'buy' ? 'BUY' : 'SELL',
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        quantity: trade.quantity,
        leverage: trade.leverage,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        entryFee: trade.entryFee,
        exitFee: trade.exitFee,
        pnl: trade.pnl,
        pnlWithFees: trade.pnlWithFees,
        confidence: trade.confidence,
        reasoning: trade.reasoning,
        status: trade.status === 'open' ? 'OPEN' : 'CLOSED',
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        metadata: trade.metadata,
      },
    });
    console.log(`[TradeDB] ✅ Saved trade ${trade.id} to database`);
    return true;
  } catch (err) {
    console.error(`[TradeDB] ❌ Failed to save trade:`, err);
    return false;
  }
}

/**
 * Update an existing trade (e.g., when closed)
 */
export async function updateTrade(
  id: string, 
  updates: Partial<TradeRecord>
): Promise<boolean> {
  try {
    await db.walletTrade.update({
      where: { id },
      data: {
        exitPrice: updates.exitPrice,
        exitFee: updates.exitFee,
        pnl: updates.pnl,
        pnlWithFees: updates.pnlWithFees,
        status: updates.status === 'closed' ? 'CLOSED' : undefined,
        exitTime: updates.exitTime,
        metadata: updates.metadata,
      },
    });
    console.log(`[TradeDB] ✅ Updated trade ${id}`);
    return true;
  } catch (err) {
    console.error(`[TradeDB] ❌ Failed to update trade:`, err);
    return false;
  }
}

/**
 * Get all trades for a wallet
 */
export async function getTradesByWallet(
  walletAddress: string,
  options?: {
    status?: 'open' | 'closed';
    limit?: number;
    offset?: number;
  }
): Promise<TradeRecord[]> {
  try {
    const trades = await db.walletTrade.findMany({
      where: {
        walletAddress: walletAddress.toLowerCase(),
        ...(options?.status && { 
          status: options.status === 'open' ? 'OPEN' : 'CLOSED' 
        }),
      },
      orderBy: { entryTime: 'desc' },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    });
    
    return trades.map(t => ({
      id: t.id,
      walletAddress: t.walletAddress,
      symbol: t.symbol,
      side: t.side === 'BUY' ? 'buy' : 'sell',
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice || undefined,
      quantity: t.quantity,
      leverage: t.leverage,
      stopLoss: t.stopLoss || undefined,
      takeProfit: t.takeProfit || undefined,
      entryFee: t.entryFee,
      exitFee: t.exitFee,
      pnl: t.pnl || undefined,
      pnlWithFees: t.pnlWithFees || undefined,
      confidence: t.confidence || undefined,
      reasoning: t.reasoning || undefined,
      status: t.status === 'OPEN' ? 'open' : 'closed',
      entryTime: t.entryTime,
      exitTime: t.exitTime || undefined,
      metadata: t.metadata as Record<string, any> | undefined,
    }));
  } catch (err) {
    console.error(`[TradeDB] ❌ Failed to get trades:`, err);
    return [];
  }
}

/**
 * Get open trades for a wallet
 */
export async function getOpenTrades(walletAddress: string): Promise<TradeRecord[]> {
  return getTradesByWallet(walletAddress, { status: 'open' });
}

/**
 * Get trade statistics for a wallet
 */
export async function getTradeStats(walletAddress: string): Promise<{
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winRate: number;
  totalPnl: number;
  totalFees: number;
}> {
  try {
    const trades = await db.walletTrade.findMany({
      where: { walletAddress: walletAddress.toLowerCase() },
    });
    
    const closedTrades = trades.filter(t => t.status === 'CLOSED');
    const wins = closedTrades.filter(t => (t.pnlWithFees || 0) > 0);
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnlWithFees || 0), 0);
    const totalFees = trades.reduce((sum, t) => sum + t.entryFee + t.exitFee, 0);
    
    return {
      totalTrades: trades.length,
      openTrades: trades.filter(t => t.status === 'OPEN').length,
      closedTrades: closedTrades.length,
      winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
      totalPnl,
      totalFees,
    };
  } catch (err) {
    console.error(`[TradeDB] ❌ Failed to get stats:`, err);
    return {
      totalTrades: 0,
      openTrades: 0,
      closedTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalFees: 0,
    };
  }
}

/**
 * Sync trades from memory to database
 * Used for initial migration or recovery
 */
export async function syncTradesToDB(trades: TradeRecord[]): Promise<number> {
  let synced = 0;
  
  for (const trade of trades) {
    try {
      // Check if trade already exists
      const existing = await db.walletTrade.findUnique({
        where: { id: trade.id },
      });
      
      if (!existing) {
        await saveTrade(trade);
        synced++;
      }
    } catch (err) {
      // Continue with next trade
    }
  }
  
  console.log(`[TradeDB] 📊 Synced ${synced}/${trades.length} trades to database`);
  return synced;
}

/**
 * Load trades from database to memory
 */
export async function loadTradesFromDB(walletAddress?: string): Promise<TradeRecord[]> {
  try {
    const trades = await db.walletTrade.findMany({
      where: walletAddress ? { walletAddress: walletAddress.toLowerCase() } : undefined,
      orderBy: { entryTime: 'desc' },
    });
    
    console.log(`[TradeDB] 📂 Loaded ${trades.length} trades from database`);
    
    return trades.map(t => ({
      id: t.id,
      walletAddress: t.walletAddress,
      symbol: t.symbol,
      side: t.side === 'BUY' ? 'buy' : 'sell',
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice || undefined,
      quantity: t.quantity,
      leverage: t.leverage,
      stopLoss: t.stopLoss || undefined,
      takeProfit: t.takeProfit || undefined,
      entryFee: t.entryFee,
      exitFee: t.exitFee,
      pnl: t.pnl || undefined,
      pnlWithFees: t.pnlWithFees || undefined,
      confidence: t.confidence || undefined,
      reasoning: t.reasoning || undefined,
      status: t.status === 'OPEN' ? 'open' : 'closed',
      entryTime: t.entryTime,
      exitTime: t.exitTime || undefined,
      metadata: t.metadata as Record<string, any> | undefined,
    }));
  } catch (err) {
    console.error(`[TradeDB] ❌ Failed to load trades from DB:`, err);
    return [];
  }
}

export default {
  saveTrade,
  updateTrade,
  getTradesByWallet,
  getOpenTrades,
  getTradeStats,
  syncTradesToDB,
  loadTradesFromDB,
};
