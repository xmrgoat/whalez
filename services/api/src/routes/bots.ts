import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@whalez/database';
import { BotConfigSchema } from '@whalez/core';

const CreateBotSchema = z.object({
  name: z.string().min(1),
  symbol: z.string(),
  config: BotConfigSchema.omit({ id: true }),
  paperTrading: z.boolean().default(true),
});

const UpdateBotSchema = z.object({
  name: z.string().optional(),
  config: z.any().optional(),
  paperTrading: z.boolean().optional(),
});

export const botRoutes: FastifyPluginAsync = async (fastify) => {
  // Create bot
  fastify.post('/', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { userId } = request.user as { userId: string };
    const body = CreateBotSchema.parse(request.body);

    const bot = await prisma.bot.create({
      data: {
        userId,
        name: body.name,
        symbol: body.symbol,
        config: { ...body.config, id: '', name: body.name, symbol: body.symbol },
        paperTrading: body.paperTrading,
      },
    });

    // Update config with bot ID
    await prisma.bot.update({
      where: { id: bot.id },
      data: {
        config: { ...body.config, id: bot.id, name: body.name, symbol: body.symbol },
      },
    });

    return { bot };
  });

  // List bots
  fastify.get('/', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { userId } = request.user as { userId: string };

    const bots = await prisma.bot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return { bots };
  });

  // Get bot by ID
  fastify.get('/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const bot = await prisma.bot.findFirst({
      where: { id, userId },
      include: {
        trades: { take: 10, orderBy: { entryTime: 'desc' } },
        critiqueReports: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    return { bot };
  });

  // Update bot
  fastify.patch('/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = UpdateBotSchema.parse(request.body);

    const bot = await prisma.bot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    if (bot.status === 'RUNNING') {
      return reply.status(400).send({ error: 'Cannot update running bot. Stop it first.' });
    }

    const updated = await prisma.bot.update({
      where: { id },
      data: {
        name: body.name,
        config: body.config ? { ...(bot.config as object), ...body.config } : undefined,
        paperTrading: body.paperTrading,
      },
    });

    return { bot: updated };
  });

  // Update bot config
  fastify.post('/:id/config', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const config = request.body;

    const bot = await prisma.bot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    const updated = await prisma.bot.update({
      where: { id },
      data: {
        config: { ...(bot.config as object), ...config },
      },
    });

    return { bot: updated };
  });

  // Start bot
  fastify.post('/:id/start', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const bot = await prisma.bot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    if (bot.status === 'RUNNING') {
      return reply.status(400).send({ error: 'Bot is already running' });
    }

    // Create bot run
    const run = await prisma.botRun.create({
      data: { botId: id },
    });

    // Update bot status
    await prisma.bot.update({
      where: { id },
      data: { status: 'RUNNING' },
    });

    // TODO: Signal worker to start bot
    // This would typically be done via Redis pub/sub or similar

    return { success: true, runId: run.id };
  });

  // Stop bot
  fastify.post('/:id/stop', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const bot = await prisma.bot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    if (bot.status !== 'RUNNING') {
      return reply.status(400).send({ error: 'Bot is not running' });
    }

    // Update bot status
    await prisma.bot.update({
      where: { id },
      data: { status: 'STOPPED' },
    });

    // Close active run
    const activeRun = await prisma.botRun.findFirst({
      where: { botId: id, stoppedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    if (activeRun) {
      await prisma.botRun.update({
        where: { id: activeRun.id },
        data: { stoppedAt: new Date(), reason: 'User stopped' },
      });
    }

    // TODO: Signal worker to stop bot

    return { success: true };
  });

  // Delete bot
  fastify.delete('/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const bot = await prisma.bot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    if (bot.status === 'RUNNING') {
      return reply.status(400).send({ error: 'Cannot delete running bot. Stop it first.' });
    }

    await prisma.bot.delete({ where: { id } });

    return { success: true };
  });

  // Get bot trades
  fastify.get('/:id/trades', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

    const bot = await prisma.bot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    const trades = await prisma.trade.findMany({
      where: { botId: id },
      orderBy: { entryTime: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });

    const total = await prisma.trade.count({ where: { botId: id } });

    return { trades, total };
  });

  // Get bot critique reports
  fastify.get('/:id/critique', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const bot = await prisma.bot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    const reports = await prisma.critiqueReport.findMany({
      where: { botId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return { reports };
  });

  // Get bot stats (calculated from trades)
  fastify.get('/:id/stats', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const bot = await prisma.bot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return reply.status(404).send({ error: 'Bot not found' });
    }

    // Get all closed trades
    const trades = await prisma.trade.findMany({
      where: { botId: id, status: 'closed' },
      orderBy: { entryTime: 'asc' },
    });

    if (trades.length === 0) {
      return {
        stats: {
          totalTrades: 0,
          winRate: 0,
          expectancy: 0,
          avgRMultiple: 0,
          totalPnl: 0,
          maxDrawdown: 0,
          avgHoldingTimeMs: 0,
          stopHitRate: 0,
          takeProfitHitRate: 0,
        },
      };
    }

    // Calculate stats
    const wins = trades.filter(t => (t.pnl ?? 0) > 0);
    const losses = trades.filter(t => (t.pnl ?? 0) <= 0);
    const winRate = (wins.length / trades.length) * 100;
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

    const avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + (t.pnl ?? 0), 0) / wins.length 
      : 0;
    const avgLoss = losses.length > 0 
      ? Math.abs(losses.reduce((sum, t) => sum + (t.pnl ?? 0), 0) / losses.length)
      : 0;
    const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

    // Max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumPnl = 0;
    for (const trade of trades) {
      cumPnl += trade.pnl ?? 0;
      if (cumPnl > peak) peak = cumPnl;
      const drawdown = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Average holding time
    const holdingTimes = trades
      .filter(t => t.exitTime && t.entryTime)
      .map(t => new Date(t.exitTime!).getTime() - new Date(t.entryTime).getTime());
    const avgHoldingTimeMs = holdingTimes.length > 0
      ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length
      : 0;

    // Stop/TP hit rates
    const stopHits = trades.filter(t => {
      if (!t.stopLoss || !t.exitPrice) return false;
      return t.side === 'buy' ? t.exitPrice <= t.stopLoss : t.exitPrice >= t.stopLoss;
    });
    const tpHits = trades.filter(t => {
      if (!t.takeProfit || !t.exitPrice) return false;
      return t.side === 'buy' ? t.exitPrice >= t.takeProfit : t.exitPrice <= t.takeProfit;
    });

    return {
      stats: {
        totalTrades: trades.length,
        winRate,
        expectancy,
        avgRMultiple: 0, // Would need risk data
        totalPnl,
        maxDrawdown,
        avgHoldingTimeMs,
        stopHitRate: (stopHits.length / trades.length) * 100,
        takeProfitHitRate: (tpHits.length / trades.length) * 100,
      },
    };
  });
};
