import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@whalez/database';

export const tradeRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all trades for user
  fastify.get('/', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { userId } = request.user as { userId: string };
    const { botId, status, limit = 50, offset = 0 } = request.query as {
      botId?: string;
      status?: 'OPEN' | 'CLOSED';
      limit?: number;
      offset?: number;
    };

    const where: any = {
      bot: { userId },
    };

    if (botId) where.botId = botId;
    if (status) where.status = status;

    const trades = await prisma.trade.findMany({
      where,
      orderBy: { entryTime: 'desc' },
      take: Number(limit),
      skip: Number(offset),
      include: {
        bot: { select: { name: true, symbol: true } },
      },
    });

    const total = await prisma.trade.count({ where });

    return { trades, total };
  });

  // Get trade by ID
  fastify.get('/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const trade = await prisma.trade.findFirst({
      where: {
        id,
        bot: { userId },
      },
      include: {
        bot: { select: { name: true, symbol: true, config: true } },
        signal: true,
      },
    });

    if (!trade) {
      return reply.status(404).send({ error: 'Trade not found' });
    }

    return { trade };
  });

  // Get trade statistics
  fastify.get('/stats', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { userId } = request.user as { userId: string };
    const { botId, from, to } = request.query as {
      botId?: string;
      from?: string;
      to?: string;
    };

    const where: any = {
      bot: { userId },
      status: 'CLOSED',
    };

    if (botId) where.botId = botId;
    if (from) where.entryTime = { gte: new Date(from) };
    if (to) where.entryTime = { ...where.entryTime, lte: new Date(to) };

    const trades = await prisma.trade.findMany({
      where,
      select: {
        pnl: true,
        pnlPercent: true,
        entryTime: true,
        exitTime: true,
        fees: true,
      },
    });

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        totalPnl: 0,
        avgPnl: 0,
        avgPnlPercent: 0,
        totalFees: 0,
        bestTrade: null,
        worstTrade: null,
      };
    }

    const wins = trades.filter(t => (t.pnl ?? 0) > 0);
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const totalFees = trades.reduce((sum, t) => sum + t.fees, 0);
    const pnls = trades.map(t => t.pnl ?? 0).sort((a, b) => b - a);

    return {
      totalTrades: trades.length,
      winRate: (wins.length / trades.length) * 100,
      totalPnl,
      avgPnl: totalPnl / trades.length,
      avgPnlPercent: trades.reduce((sum, t) => sum + (t.pnlPercent ?? 0), 0) / trades.length,
      totalFees,
      bestTrade: pnls[0],
      worstTrade: pnls[pnls.length - 1],
    };
  });
};
