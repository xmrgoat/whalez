/**
 * useBotActions Hook
 * 
 * Provides actions to control bots (start, stop, arm) and fetch stats.
 */

import { useState, useCallback } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

export interface BotStats {
  totalTrades: number;
  winRate: number;
  expectancy: number;
  avgRMultiple: number;
  totalPnl: number;
  maxDrawdown: number;
  avgHoldingTimeMs: number;
  stopHitRate: number;
  takeProfitHitRate: number;
}

export interface CritiqueReport {
  id: string;
  botId: string;
  metrics: BotStats;
  whatWorked: string[];
  whatDidntWork: string[];
  failurePatterns: string[];
  recommendations: Array<{
    parameter: string;
    previousValue: any;
    newValue: any;
    reason: string;
    applied: boolean;
  }>;
  createdAt: number;
}

export interface Bot {
  id: string;
  name: string;
  symbol: string;
  status: 'IDLE' | 'RUNNING' | 'STOPPED' | 'ERROR';
  paperTrading: boolean;
  config: any;
  createdAt: string;
}

interface UseBotActionsOptions {
  botId?: string;
  token?: string;
}

export function useBotActions(options: UseBotActionsOptions = {}) {
  const { botId, token } = options;
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bot, setBot] = useState<Bot | null>(null);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [latestCritique, setLatestCritique] = useState<CritiqueReport | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  // Fetch bot details
  const fetchBot = useCallback(async (id?: string) => {
    const targetId = id || botId;
    if (!targetId) return null;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/bots/${targetId}`, { headers });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch bot: ${response.status}`);
      }

      const data = await response.json();
      setBot(data.bot);
      return data.bot;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [botId, token]);

  // Fetch bot stats from trading API
  const fetchStats = useCallback(async (id?: string) => {
    try {
      // Fetch from trading trade-history endpoint
      const response = await fetch(`${API_URL}/trading/trade-history?limit=100`, { headers });
      
      if (response.ok) {
        const { trades } = await response.json();
        const calculatedStats = calculateStatsFromTrades(trades || []);
        setStats(calculatedStats);
        return calculatedStats;
      }
      
      return null;
    } catch (err) {
      console.error('[useBotActions] Failed to fetch stats:', err);
      return null;
    }
  }, [token]);

  // Fetch latest critique
  const fetchLatestCritique = useCallback(async (id?: string) => {
    const targetId = id || botId;
    if (!targetId) return null;

    try {
      const response = await fetch(`${API_URL}/api/bots/${targetId}/critique`, { headers });
      
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const latest = data.reports?.[0] || null;
      setLatestCritique(latest);
      return latest;
    } catch (err) {
      console.error('[useBotActions] Failed to fetch critique:', err);
      return null;
    }
  }, [botId, token]);

  // Start bot
  const startBot = useCallback(async (id?: string) => {
    const targetId = id || botId;
    if (!targetId) {
      setError('No bot ID provided');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/bots/${targetId}/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to start bot: ${response.status}`);
      }

      // Refresh bot data
      await fetchBot(targetId);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [botId, token, fetchBot]);

  // Stop bot
  const stopBot = useCallback(async (id?: string) => {
    const targetId = id || botId;
    if (!targetId) {
      setError('No bot ID provided');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/bots/${targetId}/stop`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to stop bot: ${response.status}`);
      }

      // Refresh bot data
      await fetchBot(targetId);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [botId, token, fetchBot]);

  // Create bot
  const createBot = useCallback(async (data: {
    name: string;
    symbol: string;
    config: any;
    paperTrading?: boolean;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/bots`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create bot: ${response.status}`);
      }

      const result = await response.json();
      setBot(result.bot);
      return result.bot;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Update bot config
  const updateConfig = useCallback(async (config: any, id?: string) => {
    const targetId = id || botId;
    if (!targetId) {
      setError('No bot ID provided');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/bots/${targetId}/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to update config: ${response.status}`);
      }

      await fetchBot(targetId);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [botId, token, fetchBot]);

  return {
    // State
    loading,
    error,
    bot,
    stats,
    latestCritique,

    // Actions
    fetchBot,
    fetchStats,
    fetchLatestCritique,
    startBot,
    stopBot,
    createBot,
    updateConfig,

    // Helpers
    clearError: () => setError(null),
  };
}

// Hyperliquid fee rate (0.035% taker fee)
const HL_FEE_RATE = 0.00035;

// Helper to calculate stats from trades
function calculateStatsFromTrades(trades: any[]): BotStats {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      expectancy: 0,
      avgRMultiple: 0,
      totalPnl: 0,
      maxDrawdown: 0,
      avgHoldingTimeMs: 0,
      stopHitRate: 0,
      takeProfitHitRate: 0,
    };
  }

  // Count all trades (open + closed)
  const totalTradesCount = trades.length;
  
  // Calculate fees for all trades (entry fee)
  const totalFees = trades.reduce((sum, t) => {
    const tradeValue = (t.price || 0) * (t.quantity || 0);
    return sum + (tradeValue * HL_FEE_RATE);
  }, 0);

  const closedTrades = trades.filter(t => t.status === 'closed' && t.pnl !== undefined);
  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl <= 0);

  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  
  // Total PnL includes fees (subtract fees from PnL)
  const rawPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalPnl = rawPnl - totalFees;

  const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;
  const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let cumPnl = 0;
  for (const trade of closedTrades) {
    cumPnl += trade.pnl || 0;
    if (cumPnl > peak) peak = cumPnl;
    const drawdown = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Average holding time
  const holdingTimes = closedTrades
    .filter(t => t.exitTime && t.entryTime)
    .map(t => new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime());
  const avgHoldingTimeMs = holdingTimes.length > 0
    ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length
    : 0;

  return {
    totalTrades: totalTradesCount, // All trades (open + closed)
    winRate,
    expectancy,
    avgRMultiple: 0,
    totalPnl, // Includes fees
    maxDrawdown,
    avgHoldingTimeMs,
    stopHitRate: 0,
    takeProfitHitRate: 0,
  };
}

export default useBotActions;
