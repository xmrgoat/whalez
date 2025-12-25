/**
 * Market Data REST API Routes
 * 
 * Provides endpoints for:
 * - GET /market/candles - Historical candles
 * - GET /market/ticker - Current ticker
 * - GET /market/symbols - Available symbols
 * - GET /market/status - Connection status
 * - GET /market/funding - Funding rate
 */

import { FastifyPluginAsync } from 'fastify';
import { marketDataService, type OHLC } from '../services/market-data.service.js';
import { broadcastCandleSnapshot, broadcastCandleUpdate } from './websocket.js';

// Active streaming subscriptions
const activeStreams = new Map<string, () => void>();

export const marketRoutes: FastifyPluginAsync = async (fastify) => {
  
  // Initialize market data service on startup
  fastify.addHook('onReady', async () => {
    try {
      await marketDataService.connect();
      console.log('[Market API] MarketDataService connected');
      
      // Setup candle streaming to WebSocket clients
      setupCandleStreaming();
    } catch (error) {
      console.error('[Market API] Failed to connect MarketDataService:', error);
    }
  });

  // Cleanup on shutdown
  fastify.addHook('onClose', async () => {
    for (const unsub of activeStreams.values()) {
      unsub();
    }
    activeStreams.clear();
    await marketDataService.disconnect();
  });

  /**
   * GET /market/candles
   * Fetch historical candles
   */
  fastify.get('/candles', {
    schema: {
      querystring: {
        type: 'object',
        required: ['symbol', 'timeframe'],
        properties: {
          symbol: { type: 'string' },
          timeframe: { type: 'string', enum: ['1m', '5m', '15m', '1h', '4h', '1d'] },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 500 },
        },
      },
    },
  }, async (request) => {
    const { symbol, timeframe, limit } = request.query as {
      symbol: string;
      timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
      limit?: number;
    };

    const candles = await marketDataService.getCandles(symbol, timeframe, limit || 500);
    const status = marketDataService.getStatus();

    return {
      symbol,
      timeframe,
      candles,
      count: candles.length,
      status: {
        connected: status.connected,
        isDelayed: status.isDelayed,
        latencyMs: status.latencyMs,
      },
      timestamp: Date.now(),
    };
  });

  /**
   * GET /market/ticker
   * Get current ticker for a symbol
   */
  fastify.get('/ticker', {
    schema: {
      querystring: {
        type: 'object',
        required: ['symbol'],
        properties: {
          symbol: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { symbol } = request.query as { symbol: string };

    const ticker = await marketDataService.getTicker(symbol);
    
    if (!ticker) {
      return reply.status(404).send({ error: 'Ticker not found', symbol });
    }

    return ticker;
  });

  /**
   * GET /market/symbols
   * Get available trading symbols
   */
  fastify.get('/symbols', async () => {
    const symbols = await marketDataService.getSymbols();
    return { symbols, count: symbols.length };
  });

  /**
   * GET /market/status
   * Get market data connection status
   */
  fastify.get('/status', async () => {
    const status = marketDataService.getStatus();
    return {
      ...status,
      activeStreams: activeStreams.size,
      timestamp: Date.now(),
    };
  });

  /**
   * GET /market/metadata
   * Get symbol metadata (tickSize, pricePrecision, etc.)
   */
  fastify.get('/metadata', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { symbol } = request.query as { symbol?: string };

    // Hyperliquid PERPS metadata (hardcoded fallback, can be fetched from API)
    const SYMBOL_METADATA: Record<string, { tickSize: number; pricePrecision: number; minSize: number; sizePrecision: number }> = {
      'BTC-PERP': { tickSize: 0.1, pricePrecision: 1, minSize: 0.001, sizePrecision: 3 },
      'ETH-PERP': { tickSize: 0.01, pricePrecision: 2, minSize: 0.01, sizePrecision: 2 },
      'SOL-PERP': { tickSize: 0.001, pricePrecision: 3, minSize: 0.1, sizePrecision: 1 },
      'DOGE-PERP': { tickSize: 0.00001, pricePrecision: 5, minSize: 100, sizePrecision: 0 },
      'ARB-PERP': { tickSize: 0.0001, pricePrecision: 4, minSize: 1, sizePrecision: 0 },
      'AVAX-PERP': { tickSize: 0.001, pricePrecision: 3, minSize: 0.1, sizePrecision: 1 },
      'MATIC-PERP': { tickSize: 0.0001, pricePrecision: 4, minSize: 10, sizePrecision: 0 },
      'LINK-PERP': { tickSize: 0.001, pricePrecision: 3, minSize: 0.1, sizePrecision: 1 },
    };

    // Default fallback
    const defaultMeta = { tickSize: 0.01, pricePrecision: 2, minSize: 0.01, sizePrecision: 2 };

    if (symbol) {
      const meta = SYMBOL_METADATA[symbol] || defaultMeta;
      return { symbol, ...meta };
    }

    // Return all metadata
    return { 
      metadata: SYMBOL_METADATA,
      default: defaultMeta,
    };
  });

  /**
   * GET /market/funding
   * Get funding rate for a symbol
   */
  fastify.get('/funding', {
    schema: {
      querystring: {
        type: 'object',
        required: ['symbol'],
        properties: {
          symbol: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { symbol } = request.query as { symbol: string };

    const funding = await marketDataService.getFundingRate(symbol);
    
    if (!funding) {
      return reply.status(404).send({ error: 'Funding rate not found', symbol });
    }

    return {
      symbol,
      ...funding,
      timestamp: Date.now(),
    };
  });

  /**
   * POST /market/stream/start
   * Start streaming candles to WebSocket (internal use)
   */
  fastify.post('/stream/start', {
    schema: {
      body: {
        type: 'object',
        required: ['symbol', 'timeframe'],
        properties: {
          symbol: { type: 'string' },
          timeframe: { type: 'string', enum: ['1m', '5m', '15m', '1h', '4h', '1d'] },
        },
      },
    },
  }, async (request) => {
    const { symbol, timeframe } = request.body as {
      symbol: string;
      timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
    };

    const key = `${symbol}:${timeframe}`;
    
    if (activeStreams.has(key)) {
      return { success: true, message: 'Stream already active', key };
    }

    // Get initial candles and broadcast snapshot
    const candles = await marketDataService.getCandles(symbol, timeframe, 500);
    broadcastCandleSnapshot(symbol, timeframe, candles);

    // Subscribe to updates
    const unsub = marketDataService.subscribeCandles(symbol, timeframe, (candle, isClosed) => {
      broadcastCandleUpdate(symbol, timeframe, candle, isClosed);
    });

    activeStreams.set(key, unsub);

    return { success: true, message: 'Stream started', key, initialCandles: candles.length };
  });

  /**
   * POST /market/stream/stop
   * Stop streaming candles
   */
  fastify.post('/stream/stop', {
    schema: {
      body: {
        type: 'object',
        required: ['symbol', 'timeframe'],
        properties: {
          symbol: { type: 'string' },
          timeframe: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { symbol, timeframe } = request.body as { symbol: string; timeframe: string };
    const key = `${symbol}:${timeframe}`;

    const unsub = activeStreams.get(key);
    if (unsub) {
      unsub();
      activeStreams.delete(key);
      return { success: true, message: 'Stream stopped', key };
    }

    return { success: false, message: 'Stream not found', key };
  });
};

/**
 * Setup default candle streaming for common pairs
 * Only stream BTC-PERP 1h by default to avoid rate limiting
 */
function setupCandleStreaming() {
  const defaultPairs = [
    { symbol: 'BTC-PERP', timeframe: '1h' as const },
  ];

  for (const { symbol, timeframe } of defaultPairs) {
    const key = `${symbol}:${timeframe}`;
    
    if (!activeStreams.has(key)) {
      const unsub = marketDataService.subscribeCandles(symbol, timeframe, (candle, isClosed) => {
        broadcastCandleUpdate(symbol, timeframe, candle, isClosed);
      });
      activeStreams.set(key, unsub);
      console.log(`[Market API] Started streaming ${key}`);
    }
  }
}

export default marketRoutes;
