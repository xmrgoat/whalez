/**
 * BOT CONTROL API ROUTES
 * Endpoints for starting, stopping, and monitoring user bots
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@whalez/database';

// Note: UserBotManager will be imported from worker service
// For now, we'll use HTTP calls or a message queue to communicate

interface StartBotParams {
  botId: string;
}

interface WalletQuery {
  wallet: string;
}

// In-memory state for API (would be replaced by proper IPC in production)
const botStates: Map<string, {
  status: string;
  startedAt?: number;
  stats?: any;
}> = new Map();

export async function botControlRoutes(fastify: FastifyInstance): Promise<void> {
  
  // ============================================================================
  // START BOT
  // ============================================================================
  
  fastify.post<{ Params: StartBotParams }>(
    '/bots/:botId/start',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            botId: { type: 'string' },
          },
          required: ['botId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              botId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: StartBotParams }>, reply: FastifyReply) => {
      const { botId } = request.params;

      try {
        // Verify bot exists
        const bot = await (prisma as any).userBot.findUnique({
          where: { id: botId },
        });

        if (!bot) {
          return reply.status(404).send({
            success: false,
            message: 'Bot not found',
          });
        }

        // Check if already running
        if (bot.status === 'RUNNING') {
          return reply.status(400).send({
            success: false,
            message: 'Bot is already running',
          });
        }

        // Update status to STARTING
        await (prisma as any).userBot.update({
          where: { id: botId },
          data: { status: 'STARTING' },
        });

        // In production, this would send a message to the worker service
        // For now, we update the state and let the worker pick it up
        botStates.set(botId, {
          status: 'STARTING',
          startedAt: Date.now(),
        });

        // Simulate starting (worker would handle this)
        setTimeout(async () => {
          try {
            await (prisma as any).userBot.update({
              where: { id: botId },
              data: { status: 'RUNNING' },
            });
            botStates.set(botId, {
              status: 'RUNNING',
              startedAt: Date.now(),
            });
          } catch (e) {
            console.error('Failed to update bot status:', e);
          }
        }, 1000);

        return reply.send({
          success: true,
          message: 'Bot starting...',
          botId,
        });

      } catch (error: any) {
        console.error('Error starting bot:', error);
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // ============================================================================
  // STOP BOT
  // ============================================================================

  fastify.post<{ Params: StartBotParams }>(
    '/bots/:botId/stop',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            botId: { type: 'string' },
          },
          required: ['botId'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: StartBotParams }>, reply: FastifyReply) => {
      const { botId } = request.params;

      try {
        const bot = await (prisma as any).userBot.findUnique({
          where: { id: botId },
        });

        if (!bot) {
          return reply.status(404).send({
            success: false,
            message: 'Bot not found',
          });
        }

        // Update status
        await (prisma as any).userBot.update({
          where: { id: botId },
          data: { status: 'STOPPED' },
        });

        botStates.set(botId, {
          status: 'STOPPED',
        });

        return reply.send({
          success: true,
          message: 'Bot stopped',
          botId,
        });

      } catch (error: any) {
        console.error('Error stopping bot:', error);
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // ============================================================================
  // PAUSE BOT
  // ============================================================================

  fastify.post<{ Params: StartBotParams }>(
    '/bots/:botId/pause',
    async (request: FastifyRequest<{ Params: StartBotParams }>, reply: FastifyReply) => {
      const { botId } = request.params;

      try {
        const bot = await (prisma as any).userBot.findUnique({
          where: { id: botId },
        });

        if (!bot) {
          return reply.status(404).send({
            success: false,
            message: 'Bot not found',
          });
        }

        if (bot.status !== 'RUNNING') {
          return reply.status(400).send({
            success: false,
            message: 'Bot is not running',
          });
        }

        await (prisma as any).userBot.update({
          where: { id: botId },
          data: { status: 'PAUSED' },
        });

        botStates.set(botId, {
          status: 'PAUSED',
          startedAt: botStates.get(botId)?.startedAt,
        });

        return reply.send({
          success: true,
          message: 'Bot paused',
          botId,
        });

      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // ============================================================================
  // RESUME BOT
  // ============================================================================

  fastify.post<{ Params: StartBotParams }>(
    '/bots/:botId/resume',
    async (request: FastifyRequest<{ Params: StartBotParams }>, reply: FastifyReply) => {
      const { botId } = request.params;

      try {
        const bot = await (prisma as any).userBot.findUnique({
          where: { id: botId },
        });

        if (!bot) {
          return reply.status(404).send({
            success: false,
            message: 'Bot not found',
          });
        }

        if (bot.status !== 'PAUSED') {
          return reply.status(400).send({
            success: false,
            message: 'Bot is not paused',
          });
        }

        await (prisma as any).userBot.update({
          where: { id: botId },
          data: { status: 'RUNNING' },
        });

        botStates.set(botId, {
          status: 'RUNNING',
          startedAt: botStates.get(botId)?.startedAt,
        });

        return reply.send({
          success: true,
          message: 'Bot resumed',
          botId,
        });

      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // ============================================================================
  // GET BOT STATUS
  // ============================================================================

  fastify.get<{ Params: StartBotParams }>(
    '/bots/:botId/status',
    async (request: FastifyRequest<{ Params: StartBotParams }>, reply: FastifyReply) => {
      const { botId } = request.params;

      try {
        const bot = await (prisma as any).userBot.findUnique({
          where: { id: botId },
          include: {
            trades: {
              orderBy: { entryTime: 'desc' },
              take: 10,
            },
          },
        });

        if (!bot) {
          return reply.status(404).send({
            success: false,
            message: 'Bot not found',
          });
        }

        const localState = botStates.get(botId);

        return reply.send({
          success: true,
          bot: {
            id: bot.id,
            name: bot.name,
            symbol: bot.symbol,
            status: bot.status,
            paperTrading: bot.paperTrading,
            totalTrades: bot.totalTrades,
            winningTrades: bot.winningTrades,
            totalPnl: bot.totalPnl,
            winRate: bot.totalTrades > 0 
              ? ((bot.winningTrades / bot.totalTrades) * 100).toFixed(2) 
              : 0,
            recentTrades: bot.trades,
            runtime: localState?.startedAt 
              ? Date.now() - localState.startedAt 
              : null,
          },
        });

      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // ============================================================================
  // GET ALL RUNNING BOTS FOR WALLET
  // ============================================================================

  fastify.get<{ Querystring: WalletQuery }>(
    '/bots/running',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            wallet: { type: 'string' },
          },
          required: ['wallet'],
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: WalletQuery }>, reply: FastifyReply) => {
      const { wallet } = request.query;

      try {
        const bots = await (prisma as any).userBot.findMany({
          where: {
            walletAddress: wallet.toLowerCase(),
            status: { in: ['RUNNING', 'PAUSED', 'STARTING'] },
          },
          select: {
            id: true,
            name: true,
            symbol: true,
            status: true,
            paperTrading: true,
            totalTrades: true,
            totalPnl: true,
          },
        });

        // Enrich with local state
        const enrichedBots = bots.map((bot: any) => ({
          ...bot,
          runtime: botStates.get(bot.id)?.startedAt 
            ? Date.now() - botStates.get(bot.id)!.startedAt! 
            : null,
        }));

        return reply.send({
          success: true,
          bots: enrichedBots,
          count: enrichedBots.length,
        });

      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // ============================================================================
  // GET BOT TRADES
  // ============================================================================

  fastify.get<{ Params: StartBotParams; Querystring: { limit?: number; offset?: number } }>(
    '/bots/:botId/trades',
    async (request, reply) => {
      const { botId } = request.params;
      const limit = request.query.limit || 50;
      const offset = request.query.offset || 0;

      try {
        const trades = await (prisma as any).userBotTrade.findMany({
          where: { userBotId: botId },
          orderBy: { entryTime: 'desc' },
          take: limit,
          skip: offset,
        });

        const total = await (prisma as any).userBotTrade.count({
          where: { userBotId: botId },
        });

        return reply.send({
          success: true,
          trades,
          total,
          limit,
          offset,
        });

      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // ============================================================================
  // GET BOT PERFORMANCE METRICS
  // ============================================================================

  fastify.get<{ Params: StartBotParams }>(
    '/bots/:botId/performance',
    async (request: FastifyRequest<{ Params: StartBotParams }>, reply: FastifyReply) => {
      const { botId } = request.params;

      try {
        const bot = await (prisma as any).userBot.findUnique({
          where: { id: botId },
        });

        if (!bot) {
          return reply.status(404).send({
            success: false,
            message: 'Bot not found',
          });
        }

        // Get all closed trades
        const trades = await (prisma as any).userBotTrade.findMany({
          where: { 
            userBotId: botId,
            status: 'CLOSED',
          },
          orderBy: { exitTime: 'asc' },
        });

        // Calculate metrics
        const wins = trades.filter((t: any) => t.pnl > 0);
        const losses = trades.filter((t: any) => t.pnl <= 0);
        
        const totalPnl = trades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
        const avgWin = wins.length > 0 
          ? wins.reduce((sum: number, t: any) => sum + t.pnl, 0) / wins.length 
          : 0;
        const avgLoss = losses.length > 0 
          ? losses.reduce((sum: number, t: any) => sum + t.pnl, 0) / losses.length 
          : 0;

        // Calculate drawdown
        let peak = 0;
        let maxDrawdown = 0;
        let runningPnl = 0;
        
        for (const trade of trades) {
          runningPnl += trade.pnl || 0;
          if (runningPnl > peak) peak = runningPnl;
          const drawdown = peak - runningPnl;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        // Calculate profit factor
        const grossProfit = wins.reduce((sum: number, t: any) => sum + t.pnl, 0);
        const grossLoss = Math.abs(losses.reduce((sum: number, t: any) => sum + t.pnl, 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

        // Calculate expectancy
        const winRate = trades.length > 0 ? wins.length / trades.length : 0;
        const expectancy = (winRate * avgWin) + ((1 - winRate) * avgLoss);

        return reply.send({
          success: true,
          performance: {
            totalTrades: trades.length,
            winningTrades: wins.length,
            losingTrades: losses.length,
            winRate: (winRate * 100).toFixed(2),
            totalPnl: totalPnl.toFixed(2),
            avgWin: avgWin.toFixed(2),
            avgLoss: avgLoss.toFixed(2),
            profitFactor: profitFactor.toFixed(2),
            maxDrawdown: maxDrawdown.toFixed(2),
            expectancy: expectancy.toFixed(2),
            // Time-based
            firstTrade: trades[0]?.entryTime || null,
            lastTrade: trades[trades.length - 1]?.exitTime || null,
          },
        });

      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // ============================================================================
  // UPDATE BOT CONFIGURATION (HOT RELOAD)
  // ============================================================================

  fastify.patch<{ Params: StartBotParams; Body: { strategyConfig?: any; riskConfig?: any } }>(
    '/bots/:botId/config',
    async (request, reply) => {
      const { botId } = request.params;
      const { strategyConfig, riskConfig } = request.body;

      try {
        const bot = await (prisma as any).userBot.findUnique({
          where: { id: botId },
        });

        if (!bot) {
          return reply.status(404).send({
            success: false,
            message: 'Bot not found',
          });
        }

        // Update configuration
        const updateData: any = {};
        if (strategyConfig) {
          updateData.strategyConfig = {
            ...bot.strategyConfig,
            ...strategyConfig,
            updatedAt: Date.now(),
          };
        }
        if (riskConfig) {
          updateData.riskConfig = {
            ...bot.riskConfig,
            ...riskConfig,
          };
        }

        const updated = await (prisma as any).userBot.update({
          where: { id: botId },
          data: updateData,
        });

        // If bot is running, it will need to be restarted to apply changes
        const needsRestart = bot.status === 'RUNNING' || bot.status === 'PAUSED';

        return reply.send({
          success: true,
          message: needsRestart 
            ? 'Configuration updated. Restart bot to apply changes.' 
            : 'Configuration updated.',
          needsRestart,
          bot: updated,
        });

      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    }
  );
}

export default botControlRoutes;
