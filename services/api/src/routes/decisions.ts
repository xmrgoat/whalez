/**
 * Decisions API Routes (V3)
 * 
 * Provides endpoints for:
 * - GET /decisions - List decisions with filters
 * - GET /decisions/:id - Get decision with full breakdown and evidence
 * - WS channel "decisions" for real-time updates
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@whalez/database';

// In-memory store for recent decisions (for WS broadcast)
const recentDecisions: Array<{
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: Date;
  action: string;
  confidenceScore: number;
  createdAt: Date;
}> = [];

// Subscribers for real-time decision updates
const decisionSubscribers = new Set<(decision: any) => void>();

export function subscribeToDecisions(callback: (decision: any) => void): () => void {
  decisionSubscribers.add(callback);
  return () => decisionSubscribers.delete(callback);
}

export function broadcastDecision(decision: any): void {
  recentDecisions.unshift(decision);
  if (recentDecisions.length > 100) {
    recentDecisions.pop();
  }
  
  for (const callback of decisionSubscribers) {
    try {
      callback(decision);
    } catch (err) {
      console.error('[Decisions] Broadcast error:', err);
    }
  }
}

export const decisionsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /decisions
   * List decisions with optional filters
   */
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          timeframe: { type: 'string' },
          action: { type: 'string' },
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 },
          from: { type: 'string' }, // ISO date
          to: { type: 'string' },   // ISO date
        },
      },
    },
  }, async (request) => {
    const { symbol, timeframe, action, limit, offset, from, to } = request.query as {
      symbol?: string;
      timeframe?: string;
      action?: string;
      limit: number;
      offset: number;
      from?: string;
      to?: string;
    };

    const where: any = {};
    
    if (symbol) where.symbol = symbol;
    if (timeframe) where.timeframe = timeframe;
    if (action) where.action = action;
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    try {
      const [decisions, total] = await Promise.all([
        prisma.decision.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: Math.min(limit, 100),
          skip: offset,
          include: {
            breakdown: true,
          },
        }),
        prisma.decision.count({ where }),
      ]);

      return {
        decisions,
        total,
        limit,
        offset,
      };
    } catch (error) {
      console.error('[Decisions] List error:', error);
      return { decisions: [], total: 0, limit, offset, error: 'DB error' };
    }
  });

  /**
   * GET /decisions/recent
   * Get recent decisions from memory (faster, for timeline)
   */
  fastify.get('/recent', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 20 },
        },
      },
    },
  }, async (request) => {
    const { limit } = request.query as { limit: number };
    return {
      decisions: recentDecisions.slice(0, Math.min(limit, 50)),
    };
  });

  /**
   * GET /decisions/:id
   * Get full decision with breakdown, evidence, and markers
   */
  fastify.get('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const decision = await prisma.decision.findUnique({
        where: { id },
        include: {
          breakdown: true,
          evidence: true,
          markers: true,
        },
      });

      if (!decision) {
        return reply.status(404).send({ error: 'Decision not found' });
      }

      return decision;
    } catch (error) {
      console.error('[Decisions] Get error:', error);
      return reply.status(500).send({ error: 'DB error' });
    }
  });

  /**
   * GET /decisions/by-timestamp
   * Get decision for a specific candle timestamp
   */
  fastify.get('/by-timestamp', {
    schema: {
      querystring: {
        type: 'object',
        required: ['symbol', 'timeframe', 'timestamp'],
        properties: {
          symbol: { type: 'string' },
          timeframe: { type: 'string' },
          timestamp: { type: 'string' }, // ISO date or unix ms
        },
      },
    },
  }, async (request, reply) => {
    const { symbol, timeframe, timestamp } = request.query as {
      symbol: string;
      timeframe: string;
      timestamp: string;
    };

    // Parse timestamp (support both ISO and unix ms)
    let ts: Date;
    if (/^\d+$/.test(timestamp)) {
      ts = new Date(parseInt(timestamp));
    } else {
      ts = new Date(timestamp);
    }

    try {
      const decision = await prisma.decision.findFirst({
        where: {
          symbol,
          timeframe,
          timestamp: ts,
        },
        include: {
          breakdown: true,
          evidence: true,
          markers: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!decision) {
        return reply.status(404).send({ error: 'No decision for this candle' });
      }

      return decision;
    } catch (error) {
      console.error('[Decisions] Get by timestamp error:', error);
      return reply.status(500).send({ error: 'DB error' });
    }
  });

  /**
   * GET /decisions/markers
   * Get chart markers for a symbol/timeframe range
   */
  fastify.get('/markers', {
    schema: {
      querystring: {
        type: 'object',
        required: ['symbol', 'timeframe'],
        properties: {
          symbol: { type: 'string' },
          timeframe: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          limit: { type: 'integer', default: 100 },
        },
      },
    },
  }, async (request) => {
    const { symbol, timeframe, from, to, limit } = request.query as {
      symbol: string;
      timeframe: string;
      from?: string;
      to?: string;
      limit: number;
    };

    const where: any = { symbol, timeframe };
    
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    try {
      const markers = await prisma.chartMarker.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: Math.min(limit, 500),
      });

      return { markers };
    } catch (error) {
      console.error('[Decisions] Markers error:', error);
      return { markers: [], error: 'DB error' };
    }
  });
};

export default decisionsRoutes;
