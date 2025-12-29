/**
 * User Statistics API Routes
 * 
 * Provides endpoints for:
 * - GET /stats/profile/:address - Get user profile and stats
 * - GET /stats/daily/:address - Get daily stats history
 * - GET /stats/trades/:address - Get trade history
 * - POST /stats/profile - Create/update profile
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@whalez/database';

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /stats/profile/:address
   * Get user profile with portfolio stats
   */
  fastify.get('/profile/:address', {
    schema: {
      params: {
        type: 'object',
        required: ['address'],
        properties: {
          address: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { address } = request.params as { address: string };
    const normalizedAddress = address.toLowerCase();

    try {
      let profile = await prisma.walletProfile.findUnique({
        where: { walletAddress: normalizedAddress },
        include: {
          portfolioStats: true,
        },
      });

      // Create profile if doesn't exist
      if (!profile) {
        profile = await prisma.walletProfile.create({
          data: {
            walletAddress: normalizedAddress,
            portfolioStats: {
              create: {
                walletAddress: normalizedAddress,
              },
            },
          },
          include: {
            portfolioStats: true,
          },
        });
      }

      // Update last active
      await prisma.walletProfile.update({
        where: { walletAddress: normalizedAddress },
        data: { lastActiveAt: new Date() },
      });

      return profile;
    } catch (error) {
      console.error('[Stats] Profile error:', error);
      return reply.status(500).send({ error: 'Failed to get profile' });
    }
  });

  /**
   * GET /stats/daily/:address
   * Get daily stats history
   */
  fastify.get('/daily/:address', {
    schema: {
      params: {
        type: 'object',
        required: ['address'],
        properties: {
          address: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', default: 30 },
        },
      },
    },
  }, async (request, reply) => {
    const { address } = request.params as { address: string };
    const { days } = request.query as { days: number };
    const normalizedAddress = address.toLowerCase();

    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const dailyStats = await prisma.dailyStats.findMany({
        where: {
          walletAddress: normalizedAddress,
          date: { gte: fromDate },
        },
        orderBy: { date: 'desc' },
      });

      // Calculate summary
      const summary = {
        totalPnl: dailyStats.reduce((sum, d) => sum + d.pnl, 0),
        totalTrades: dailyStats.reduce((sum, d) => sum + d.trades, 0),
        totalWins: dailyStats.reduce((sum, d) => sum + d.wins, 0),
        totalLosses: dailyStats.reduce((sum, d) => sum + d.losses, 0),
        avgDailyPnl: dailyStats.length > 0 
          ? dailyStats.reduce((sum, d) => sum + d.pnl, 0) / dailyStats.length 
          : 0,
        bestDay: dailyStats.length > 0 
          ? Math.max(...dailyStats.map(d => d.pnl)) 
          : 0,
        worstDay: dailyStats.length > 0 
          ? Math.min(...dailyStats.map(d => d.pnl)) 
          : 0,
        profitableDays: dailyStats.filter(d => d.pnl > 0).length,
        losingDays: dailyStats.filter(d => d.pnl < 0).length,
      };

      return {
        dailyStats,
        summary,
        period: { days, from: fromDate, to: new Date() },
      };
    } catch (error) {
      console.error('[Stats] Daily stats error:', error);
      return reply.status(500).send({ error: 'Failed to get daily stats' });
    }
  });

  /**
   * GET /stats/trades/:address
   * Get trade history
   */
  fastify.get('/trades/:address', {
    schema: {
      params: {
        type: 'object',
        required: ['address'],
        properties: {
          address: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 },
          symbol: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { address } = request.params as { address: string };
    const { limit, offset, symbol, status } = request.query as {
      limit: number;
      offset: number;
      symbol?: string;
      status?: string;
    };
    const normalizedAddress = address.toLowerCase();

    try {
      const where: any = { walletAddress: normalizedAddress };
      if (symbol) where.symbol = symbol;
      if (status) where.status = status;

      const [trades, total] = await Promise.all([
        prisma.tradeHistory.findMany({
          where,
          orderBy: { entryTime: 'desc' },
          take: Math.min(limit, 100),
          skip: offset,
        }),
        prisma.tradeHistory.count({ where }),
      ]);

      return { trades, total, limit, offset };
    } catch (error) {
      console.error('[Stats] Trades error:', error);
      return reply.status(500).send({ error: 'Failed to get trades' });
    }
  });

  /**
   * POST /stats/profile
   * Create or update profile
   */
  fastify.post('/profile', {
    schema: {
      body: {
        type: 'object',
        required: ['address'],
        properties: {
          address: { type: 'string' },
          nickname: { type: 'string' },
          settings: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { address, nickname, settings } = request.body as {
      address: string;
      nickname?: string;
      settings?: any;
    };
    const normalizedAddress = address.toLowerCase();

    try {
      const profile = await prisma.walletProfile.upsert({
        where: { walletAddress: normalizedAddress },
        update: {
          nickname,
          settings,
          updatedAt: new Date(),
        },
        create: {
          walletAddress: normalizedAddress,
          nickname,
          settings,
          portfolioStats: {
            create: {
              walletAddress: normalizedAddress,
            },
          },
        },
        include: {
          portfolioStats: true,
        },
      });

      return profile;
    } catch (error) {
      console.error('[Stats] Update profile error:', error);
      return reply.status(500).send({ error: 'Failed to update profile' });
    }
  });

  /**
   * POST /stats/record-trade
   * Record a completed trade and update stats
   */
  fastify.post('/record-trade', {
    schema: {
      body: {
        type: 'object',
        required: ['address', 'symbol', 'side', 'entryPrice', 'exitPrice', 'quantity', 'pnl'],
        properties: {
          address: { type: 'string' },
          symbol: { type: 'string' },
          side: { type: 'string' },
          entryPrice: { type: 'number' },
          exitPrice: { type: 'number' },
          quantity: { type: 'number' },
          leverage: { type: 'integer', default: 1 },
          pnl: { type: 'number' },
          pnlPercent: { type: 'number' },
          fees: { type: 'number', default: 0 },
          entryTime: { type: 'string' },
          exitTime: { type: 'string' },
          decisionId: { type: 'string' },
          aiConfidence: { type: 'number' },
          aiReasoning: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as any;
    const normalizedAddress = body.address.toLowerCase();

    try {
      // Create trade history entry
      const trade = await prisma.tradeHistory.create({
        data: {
          walletAddress: normalizedAddress,
          symbol: body.symbol,
          side: body.side,
          entryPrice: body.entryPrice,
          exitPrice: body.exitPrice,
          quantity: body.quantity,
          leverage: body.leverage || 1,
          pnl: body.pnl,
          pnlPercent: body.pnlPercent,
          fees: body.fees || 0,
          entryTime: new Date(body.entryTime),
          exitTime: new Date(body.exitTime),
          holdDuration: Math.floor((new Date(body.exitTime).getTime() - new Date(body.entryTime).getTime()) / 1000),
          decisionId: body.decisionId,
          aiConfidence: body.aiConfidence,
          aiReasoning: body.aiReasoning,
          status: 'CLOSED',
        },
      });

      // Update portfolio stats
      const isWin = body.pnl > 0;
      
      await prisma.portfolioStats.upsert({
        where: { walletAddress: normalizedAddress },
        update: {
          totalPnl: { increment: body.pnl },
          realizedPnl: { increment: body.pnl },
          totalTrades: { increment: 1 },
          winningTrades: isWin ? { increment: 1 } : undefined,
          losingTrades: !isWin ? { increment: 1 } : undefined,
          largestWin: isWin && body.pnl > 0 ? { set: Math.max(body.pnl, 0) } : undefined,
          largestLoss: !isWin && body.pnl < 0 ? { set: Math.min(body.pnl, 0) } : undefined,
        },
        create: {
          walletAddress: normalizedAddress,
          totalPnl: body.pnl,
          realizedPnl: body.pnl,
          totalTrades: 1,
          winningTrades: isWin ? 1 : 0,
          losingTrades: isWin ? 0 : 1,
          largestWin: isWin ? body.pnl : 0,
          largestLoss: isWin ? 0 : body.pnl,
        },
      });

      // Update daily stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.dailyStats.upsert({
        where: {
          walletAddress_date: {
            walletAddress: normalizedAddress,
            date: today,
          },
        },
        update: {
          pnl: { increment: body.pnl },
          trades: { increment: 1 },
          wins: isWin ? { increment: 1 } : undefined,
          losses: !isWin ? { increment: 1 } : undefined,
          volume: { increment: body.quantity * body.entryPrice },
          fees: { increment: body.fees || 0 },
        },
        create: {
          walletAddress: normalizedAddress,
          date: today,
          pnl: body.pnl,
          trades: 1,
          wins: isWin ? 1 : 0,
          losses: isWin ? 0 : 1,
          volume: body.quantity * body.entryPrice,
          fees: body.fees || 0,
        },
      });

      // Recalculate win rate
      const stats = await prisma.portfolioStats.findUnique({
        where: { walletAddress: normalizedAddress },
      });

      if (stats && stats.totalTrades > 0) {
        await prisma.portfolioStats.update({
          where: { walletAddress: normalizedAddress },
          data: {
            winRate: (stats.winningTrades / stats.totalTrades) * 100,
          },
        });
      }

      return { success: true, trade };
    } catch (error) {
      console.error('[Stats] Record trade error:', error);
      return reply.status(500).send({ error: 'Failed to record trade' });
    }
  });

  /**
   * GET /stats/leaderboard
   * Get top traders leaderboard
   */
  fastify.get('/leaderboard', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 20 },
          sortBy: { type: 'string', default: 'totalPnl' },
        },
      },
    },
  }, async (request) => {
    const { limit, sortBy } = request.query as { limit: number; sortBy: string };

    try {
      const validSortFields = ['totalPnl', 'winRate', 'totalTrades', 'profitFactor'];
      const orderField = validSortFields.includes(sortBy) ? sortBy : 'totalPnl';

      const leaderboard = await prisma.portfolioStats.findMany({
        where: {
          totalTrades: { gte: 5 }, // Minimum 5 trades to appear
        },
        orderBy: { [orderField]: 'desc' },
        take: Math.min(limit, 100),
        include: {
          profile: {
            select: {
              nickname: true,
              walletAddress: true,
            },
          },
        },
      });

      return {
        leaderboard: leaderboard.map((stats, index) => ({
          rank: index + 1,
          address: stats.walletAddress,
          nickname: stats.profile?.nickname || `Trader ${stats.walletAddress.slice(0, 6)}`,
          totalPnl: stats.totalPnl,
          winRate: stats.winRate,
          totalTrades: stats.totalTrades,
          profitFactor: stats.profitFactor,
        })),
      };
    } catch (error) {
      console.error('[Stats] Leaderboard error:', error);
      return { leaderboard: [] };
    }
  });
};

export default statsRoutes;
