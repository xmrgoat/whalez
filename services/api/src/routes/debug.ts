/**
 * Debug Routes - System State Verification
 * 
 * Provides endpoints for E2E testing and monitoring:
 * - GET /debug/state - Full system state
 * - GET /debug/candles - Last candles received
 * - GET /debug/signals - Last signals generated
 * - GET /debug/markers - Last chart markers
 */

import { FastifyPluginAsync } from 'fastify';
import { marketDataService } from '../services/market-data.service.js';
import { prisma } from '@whalez/database';

// In-memory state tracking
interface DebugState {
  wsConnected: boolean;
  lastCandleTs: number;
  lastSignalTs: number;
  lastMarkerTs: number;
  lastDecisionTs: number;
  candleCount: number;
  signalCount: number;
  tradeCount: number;
  startTime: number;
}

const state: DebugState = {
  wsConnected: false,
  lastCandleTs: 0,
  lastSignalTs: 0,
  lastMarkerTs: 0,
  lastDecisionTs: 0,
  candleCount: 0,
  signalCount: 0,
  tradeCount: 0,
  startTime: Date.now(),
};

// Update state from market data service events
marketDataService.on('connected', () => {
  state.wsConnected = true;
});

marketDataService.on('disconnected', () => {
  state.wsConnected = false;
});

marketDataService.on('candle', (data: { candle: { timestamp: number } }) => {
  state.lastCandleTs = Date.now(); // Use receive time, not candle time
  state.candleCount++;
});

// Export functions to update state from other parts of the system
export function recordSignal(timestamp: number) {
  state.lastSignalTs = timestamp;
  state.signalCount++;
}

export function recordMarker(timestamp: number) {
  state.lastMarkerTs = timestamp;
}

export function recordDecision(timestamp: number) {
  state.lastDecisionTs = timestamp;
}

export const debugRoutes: FastifyPluginAsync = async (fastify) => {
  
  /**
   * GET /debug/state
   * Full system state for E2E verification
   */
  fastify.get('/state', async () => {
    const marketStatus = marketDataService.getStatus();
    
    // Get DB counts
    let dbTradesCount = 0;
    let dbSignalsCount = 0;
    let dbDecisionsCount = 0;
    
    try {
      dbTradesCount = await prisma.trade.count();
      dbSignalsCount = await prisma.signal.count();
      // Check if Decision table exists
      try {
        dbDecisionsCount = await (prisma as any).decision?.count() || 0;
      } catch {
        dbDecisionsCount = 0;
      }
    } catch (error) {
      console.error('[Debug] DB query error:', error);
    }

    const now = Date.now();
    const uptimeMs = now - state.startTime;

    return {
      // Connection state
      wsConnected: marketStatus.connected,
      wsDelayed: marketStatus.isDelayed,
      wsLatencyMs: marketStatus.latencyMs,

      // Timestamps (0 = never received)
      lastCandleTs: state.lastCandleTs,
      lastCandleAge: state.lastCandleTs ? now - state.lastCandleTs : null,
      lastSignalTs: state.lastSignalTs,
      lastSignalAge: state.lastSignalTs ? now - state.lastSignalTs : null,
      lastMarkerTs: state.lastMarkerTs,
      lastDecisionTs: state.lastDecisionTs,

      // Counts (in-memory since startup)
      candleCount: state.candleCount,
      signalCount: state.signalCount,

      // DB counts (persistent)
      dbTradesCount,
      dbSignalsCount,
      dbDecisionsCount,

      // System info
      uptimeMs,
      uptimeFormatted: formatUptime(uptimeMs),
      startTime: state.startTime,
      timestamp: now,

      // Health checks
      checks: {
        wsConnected: marketStatus.connected,
        candlesFlowing: state.lastCandleTs > 0 && (now - state.lastCandleTs) < 120000,
        dbAccessible: dbTradesCount >= 0,
      },
    };
  });

  /**
   * GET /debug/candles
   * Last N candles received
   */
  fastify.get('/candles', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          symbol: { type: 'string', default: 'BTC-PERP' },
          timeframe: { type: 'string', default: '1m' },
          limit: { type: 'integer', default: 5 },
        },
      },
    },
  }, async (request) => {
    const { symbol, timeframe, limit } = request.query as {
      symbol: string;
      timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
      limit: number;
    };

    const candles = await marketDataService.getCandles(symbol, timeframe, limit);
    
    return {
      symbol,
      timeframe,
      count: candles.length,
      candles: candles.slice(-limit),
      lastTs: candles.length > 0 ? candles[candles.length - 1]!.timestamp : null,
    };
  });

  /**
   * GET /debug/signals
   * Last N signals from DB
   */
  fastify.get('/signals', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 10 },
        },
      },
    },
  }, async (request) => {
    const { limit } = request.query as { limit: number };

    try {
      const signals = await prisma.signal.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return {
        count: signals.length,
        signals,
      };
    } catch (error) {
      return { count: 0, signals: [], error: 'DB not available' };
    }
  });

  /**
   * GET /debug/trades
   * Last N trades from DB
   */
  fastify.get('/trades', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 10 },
        },
      },
    },
  }, async (request) => {
    const { limit } = request.query as { limit: number };

    try {
      const trades = await prisma.trade.findMany({
        orderBy: { entryTime: 'desc' },
        take: limit,
      });

      return {
        count: trades.length,
        trades,
      };
    } catch (error) {
      return { count: 0, trades: [], error: 'DB not available' };
    }
  });

  /**
   * POST /debug/reset
   * Reset in-memory counters (for testing)
   */
  fastify.post('/reset', async () => {
    state.candleCount = 0;
    state.signalCount = 0;
    state.lastCandleTs = 0;
    state.lastSignalTs = 0;
    state.lastMarkerTs = 0;
    state.lastDecisionTs = 0;
    state.startTime = Date.now();

    return { success: true, message: 'Debug state reset' };
  });
};

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export default debugRoutes;
