import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@whalez/database';

export const critiqueRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all critique reports for user
  fastify.get('/', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { userId } = request.user as { userId: string };
    const { botId, limit = 20, offset = 0 } = request.query as {
      botId?: string;
      limit?: number;
      offset?: number;
    };

    const where: any = {
      bot: { userId },
    };

    if (botId) where.botId = botId;

    const reports = await prisma.critiqueReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
      include: {
        bot: { select: { name: true, symbol: true } },
      },
    });

    const total = await prisma.critiqueReport.count({ where });

    return { reports, total };
  });

  // Get critique report by ID
  fastify.get('/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const report = await prisma.critiqueReport.findFirst({
      where: {
        id,
        bot: { userId },
      },
      include: {
        bot: { select: { name: true, symbol: true, config: true } },
        paramChanges: true,
      },
    });

    if (!report) {
      return reply.status(404).send({ error: 'Report not found' });
    }

    return { report };
  });

  // Get parameter changes history
  fastify.get('/params', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { userId } = request.user as { userId: string };
    const { botId, limit = 50 } = request.query as {
      botId?: string;
      limit?: number;
    };

    const where: any = {
      bot: { userId },
    };

    if (botId) where.botId = botId;

    const changes = await prisma.paramChange.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      include: {
        bot: { select: { name: true } },
        critiqueReport: { select: { id: true, createdAt: true } },
      },
    });

    return { changes };
  });

  // Rollback parameter change
  fastify.post('/params/:id/rollback', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const change = await prisma.paramChange.findFirst({
      where: {
        id,
        bot: { userId },
      },
      include: { bot: true },
    });

    if (!change) {
      return reply.status(404).send({ error: 'Parameter change not found' });
    }

    if (change.rolledBack) {
      return reply.status(400).send({ error: 'Already rolled back' });
    }

    // Update bot config with previous value
    const botConfig = change.bot.config as Record<string, any>;
    const paramPath = change.parameter.split('.');
    let current = botConfig;
    
    for (let i = 0; i < paramPath.length - 1; i++) {
      current = current[paramPath[i]!];
    }
    current[paramPath[paramPath.length - 1]!] = change.previousValue;

    await prisma.bot.update({
      where: { id: change.botId },
      data: { config: botConfig },
    });

    // Mark as rolled back
    await prisma.paramChange.update({
      where: { id },
      data: { rolledBack: true },
    });

    return { success: true };
  });
};
