/**
 * User Bots Routes
 * 
 * CRUD operations for user bots (max 5 per wallet)
 * - GET /user-bots?wallet=0x... - List user's bots
 * - POST /user-bots - Create a new bot
 * - GET /user-bots/:id - Get bot details
 * - PATCH /user-bots/:id - Update bot
 * - DELETE /user-bots/:id - Delete bot
 * - POST /user-bots/:id/start - Start bot
 * - POST /user-bots/:id/stop - Stop bot
 * - POST /user-bots/:id/backtest - Run backtest
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@whalez/database';
import { botRunner } from '../lib/bot-runner.js';

const MAX_BOTS_PER_WALLET = 5;

// Default strategy config
const DEFAULT_STRATEGY_CONFIG = {
  indicators: [
    { name: 'RSI', params: { period: 14 }, enabled: true },
    { name: 'EMA', params: { period: 20 }, enabled: true },
    { name: 'EMA', params: { period: 50 }, enabled: true },
  ],
  entryConditions: [],
  exitConditions: [],
};

// Default risk config
const DEFAULT_RISK_CONFIG = {
  positionSizePct: 2,
  maxLeverage: 5,
  stopLossPct: 2,
  takeProfitPct: 4,
  maxDrawdownPct: 10,
  enableTrailingStop: false,
  trailingStopPct: 1,
};

export const userBotsRoutes: FastifyPluginAsync = async (fastify) => {
  
  /**
   * GET /user-bots
   * List all bots for a wallet (max 5)
   */
  fastify.get('/', async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    
    if (!wallet) {
      return reply.status(400).send({ error: 'Wallet address required' });
    }
    
    const walletAddress = wallet.toLowerCase();
    
    try {
      const bots = await prisma.userBot.findMany({
        where: { walletAddress },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { trades: true }
          }
        }
      });
      
      return {
        success: true,
        bots: bots.map(bot => ({
          ...bot,
          tradesCount: bot._count.trades,
        })),
        count: bots.length,
        maxBots: MAX_BOTS_PER_WALLET,
        canCreate: bots.length < MAX_BOTS_PER_WALLET,
      };
    } catch (error) {
      console.error('[UserBots] Error fetching bots:', error);
      return reply.status(500).send({ error: 'Failed to fetch bots' });
    }
  });
  
  /**
   * POST /user-bots
   * Create a new bot
   */
  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      wallet: string;
      name: string;
      description?: string;
      symbol: string;
      timeframe?: string;
      strategyType?: string;
      templateId?: string;
      strategyConfig?: any;
      riskConfig?: any;
      // Alternative format from frontend bot builder
      config?: {
        indicators?: any[];
        entryConditions?: any[];
        exitConditions?: any[];
        riskManagement?: any;
        leverage?: number;
        marginType?: string;
        orderType?: string;
        slippage?: number;
      };
    };
    
    if (!body.wallet || !body.name || !body.symbol) {
      return reply.status(400).send({ error: 'wallet, name, and symbol are required' });
    }
    
    const walletAddress = body.wallet.toLowerCase();
    
    try {
      // Check bot limit
      const existingCount = await prisma.userBot.count({
        where: { walletAddress }
      });
      
      if (existingCount >= MAX_BOTS_PER_WALLET) {
        return reply.status(400).send({ 
          error: `Maximum ${MAX_BOTS_PER_WALLET} bots allowed per wallet`,
          currentCount: existingCount,
          maxBots: MAX_BOTS_PER_WALLET,
        });
      }
      
      // Ensure wallet profile exists
      await prisma.walletProfile.upsert({
        where: { walletAddress },
        create: { walletAddress },
        update: { lastActiveAt: new Date() },
      });
      
      // Build strategy config from either format
      let strategyConfig = body.strategyConfig || DEFAULT_STRATEGY_CONFIG;
      let riskConfig = body.riskConfig || DEFAULT_RISK_CONFIG;
      
      // If frontend sends config object, transform it
      if (body.config) {
        strategyConfig = {
          indicators: body.config.indicators || DEFAULT_STRATEGY_CONFIG.indicators,
          entryConditions: body.config.entryConditions || [],
          exitConditions: body.config.exitConditions || [],
        };
        
        if (body.config.riskManagement) {
          riskConfig = {
            positionSizePct: body.config.riskManagement.positionSize || DEFAULT_RISK_CONFIG.positionSizePct,
            maxLeverage: body.config.leverage || body.config.riskManagement.maxLeverage || DEFAULT_RISK_CONFIG.maxLeverage,
            stopLossPct: body.config.riskManagement.stopLoss || DEFAULT_RISK_CONFIG.stopLossPct,
            takeProfitPct: body.config.riskManagement.takeProfit || DEFAULT_RISK_CONFIG.takeProfitPct,
            maxDrawdownPct: body.config.riskManagement.maxDrawdown || DEFAULT_RISK_CONFIG.maxDrawdownPct,
            enableTrailingStop: body.config.riskManagement.trailingStop?.enabled || DEFAULT_RISK_CONFIG.enableTrailingStop,
            trailingStopPct: body.config.riskManagement.trailingStop?.percentage || DEFAULT_RISK_CONFIG.trailingStopPct,
          };
        }
      }
      
      // Create bot
      const bot = await prisma.userBot.create({
        data: {
          walletAddress,
          name: body.name,
          description: body.description || null,
          symbol: body.symbol.toUpperCase(),
          timeframe: body.timeframe || '1h',
          strategyType: (body.strategyType as any) || 'TEMPLATE',
          templateId: body.templateId || null,
          strategyConfig,
          riskConfig,
          status: 'DRAFT',
        },
      });
      
      console.log(`[UserBots] Created bot ${bot.id} for wallet ${walletAddress}`);
      
      return {
        success: true,
        bot,
        message: 'Bot created successfully',
      };
    } catch (error) {
      console.error('[UserBots] Error creating bot:', error);
      return reply.status(500).send({ error: 'Failed to create bot' });
    }
  });
  
  /**
   * GET /user-bots/:id
   * Get bot details
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { wallet } = request.query as { wallet?: string };
    
    try {
      const bot = await prisma.userBot.findUnique({
        where: { id },
        include: {
          trades: {
            take: 20,
            orderBy: { entryTime: 'desc' },
          },
          remixedFrom: {
            select: { id: true, name: true, authorWallet: true }
          },
          publishedItem: {
            select: { id: true, likes: true, remixes: true }
          },
        },
      });
      
      if (!bot) {
        return reply.status(404).send({ error: 'Bot not found' });
      }
      
      // Check ownership if wallet provided
      if (wallet && bot.walletAddress !== wallet.toLowerCase()) {
        return reply.status(403).send({ error: 'Not authorized to view this bot' });
      }
      
      return { success: true, bot };
    } catch (error) {
      console.error('[UserBots] Error fetching bot:', error);
      return reply.status(500).send({ error: 'Failed to fetch bot' });
    }
  });
  
  /**
   * PATCH /user-bots/:id
   * Update bot configuration
   */
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      wallet: string;
      name?: string;
      description?: string;
      symbol?: string;
      timeframe?: string;
      strategyConfig?: any;
      riskConfig?: any;
      status?: string;
    };
    
    if (!body.wallet) {
      return reply.status(400).send({ error: 'Wallet address required' });
    }
    
    const walletAddress = body.wallet.toLowerCase();
    
    try {
      // Verify ownership
      const existing = await prisma.userBot.findUnique({ where: { id } });
      
      if (!existing) {
        return reply.status(404).send({ error: 'Bot not found' });
      }
      
      if (existing.walletAddress !== walletAddress) {
        return reply.status(403).send({ error: 'Not authorized to update this bot' });
      }
      
      // Don't allow updates while running
      if (existing.status === 'RUNNING' && body.strategyConfig) {
        return reply.status(400).send({ error: 'Cannot update strategy while bot is running. Stop it first.' });
      }
      
      // Build update data
      const updateData: any = {};
      if (body.name) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.symbol) updateData.symbol = body.symbol.toUpperCase();
      if (body.timeframe) updateData.timeframe = body.timeframe;
      if (body.strategyConfig) updateData.strategyConfig = body.strategyConfig;
      if (body.riskConfig) updateData.riskConfig = body.riskConfig;
      if (body.status) updateData.status = body.status;
      
      const bot = await prisma.userBot.update({
        where: { id },
        data: updateData,
      });
      
      console.log(`[UserBots] Updated bot ${id}`);
      
      return { success: true, bot };
    } catch (error) {
      console.error('[UserBots] Error updating bot:', error);
      return reply.status(500).send({ error: 'Failed to update bot' });
    }
  });
  
  /**
   * DELETE /user-bots/:id
   * Delete a bot
   */
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { wallet } = request.query as { wallet?: string };
    
    if (!wallet) {
      return reply.status(400).send({ error: 'Wallet address required' });
    }
    
    const walletAddress = wallet.toLowerCase();
    
    try {
      // Verify ownership
      const existing = await prisma.userBot.findUnique({ where: { id } });
      
      if (!existing) {
        return reply.status(404).send({ error: 'Bot not found' });
      }
      
      if (existing.walletAddress !== walletAddress) {
        return reply.status(403).send({ error: 'Not authorized to delete this bot' });
      }
      
      // Don't allow deletion while running
      if (existing.status === 'RUNNING') {
        return reply.status(400).send({ error: 'Cannot delete a running bot. Stop it first.' });
      }
      
      await prisma.userBot.delete({ where: { id } });
      
      console.log(`[UserBots] Deleted bot ${id}`);
      
      return { success: true, message: 'Bot deleted successfully' };
    } catch (error) {
      console.error('[UserBots] Error deleting bot:', error);
      return reply.status(500).send({ error: 'Failed to delete bot' });
    }
  });
  
  /**
   * POST /user-bots/:id/start
   * Start a bot - connects to the real bot runner engine
   */
  fastify.post('/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { wallet } = request.body as { wallet?: string };
    
    if (!wallet) {
      return reply.status(400).send({ error: 'Wallet address required' });
    }
    
    const walletAddress = wallet.toLowerCase();
    
    try {
      // Use the bot runner to actually start the bot
      const result = await botRunner.startBot(id, walletAddress);
      
      if (!result.success) {
        // Check specific error types for appropriate HTTP status
        if (result.error?.includes('not found')) {
          return reply.status(404).send({ error: result.error });
        }
        if (result.error?.includes('Not authorized') || result.error?.includes('Agent wallet')) {
          return reply.status(403).send({ error: result.error });
        }
        if (result.error?.includes('already running') || result.error?.includes('Maximum')) {
          return reply.status(400).send({ error: result.error });
        }
        return reply.status(500).send({ error: result.error || 'Failed to start bot' });
      }
      
      // Get updated bot status
      const bot = await prisma.userBot.findUnique({ where: { id } });
      
      console.log(`[UserBots] ✅ Started bot ${id} via BotRunner`);
      
      return { 
        success: true, 
        bot,
        message: 'Bot started successfully - now trading!',
      };
    } catch (error) {
      console.error('[UserBots] Error starting bot:', error);
      return reply.status(500).send({ error: 'Failed to start bot' });
    }
  });
  
  /**
   * POST /user-bots/:id/stop
   * Stop a bot - connects to the real bot runner engine
   * @body closePosition - If true, close any open position for this bot's symbol
   */
  fastify.post('/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { wallet, closePosition } = request.body as { wallet?: string; closePosition?: boolean };
    
    if (!wallet) {
      return reply.status(400).send({ error: 'Wallet address required' });
    }
    
    const walletAddress = wallet.toLowerCase();
    
    try {
      // Use the bot runner to actually stop the bot
      const result = await botRunner.stopBot(id, walletAddress, { closePosition });
      
      if (!result.success) {
        if (result.error?.includes('not running')) {
          return reply.status(400).send({ error: result.error });
        }
        if (result.error?.includes('Not authorized')) {
          return reply.status(403).send({ error: result.error });
        }
        return reply.status(500).send({ error: result.error || 'Failed to stop bot' });
      }
      
      // Get updated bot status
      const bot = await prisma.userBot.findUnique({ where: { id } });
      
      console.log(`[UserBots] 🛑 Stopped bot ${id} via BotRunner${result.positionClosed ? ' (position closed)' : ''}`);
      
      return { 
        success: true, 
        bot,
        positionClosed: result.positionClosed,
        message: result.positionClosed ? 'Bot stopped and position closed' : 'Bot stopped successfully',
      };
    } catch (error) {
      console.error('[UserBots] Error stopping bot:', error);
      return reply.status(500).send({ error: 'Failed to stop bot' });
    }
  });
  
  /**
   * POST /user-bots/:id/backtest
   * Run backtest for a bot
   */
  fastify.post('/:id/backtest', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      wallet: string;
      days?: number;
    };
    
    if (!body.wallet) {
      return reply.status(400).send({ error: 'Wallet address required' });
    }
    
    const walletAddress = body.wallet.toLowerCase();
    
    try {
      const bot = await prisma.userBot.findUnique({ where: { id } });
      
      if (!bot) {
        return reply.status(404).send({ error: 'Bot not found' });
      }
      
      if (bot.walletAddress !== walletAddress) {
        return reply.status(403).send({ error: 'Not authorized' });
      }
      
      // Update status to backtesting
      await prisma.userBot.update({
        where: { id },
        data: { status: 'BACKTESTING' },
      });
      
      // TODO: Run actual backtest using backtesting-engine
      // For now, return placeholder
      
      // Reset status after backtest
      await prisma.userBot.update({
        where: { id },
        data: { status: 'READY' },
      });
      
      return { 
        success: true, 
        message: 'Backtest completed',
        // TODO: Return actual backtest results
      };
    } catch (error) {
      console.error('[UserBots] Error running backtest:', error);
      return reply.status(500).send({ error: 'Failed to run backtest' });
    }
  });
  
  /**
   * GET /user-bots/templates
   * Get available bot templates
   */
  fastify.get('/templates', async (request, reply) => {
    try {
      const templates = await prisma.botTemplate.findMany({
        where: { isActive: true },
        orderBy: [
          { sortOrder: 'asc' },
          { usageCount: 'desc' },
        ],
      });
      
      return { success: true, templates };
    } catch (error) {
      console.error('[UserBots] Error fetching templates:', error);
      return reply.status(500).send({ error: 'Failed to fetch templates' });
    }
  });
  
  // ============================================================================
  // BOT RUNNER MANAGEMENT ENDPOINTS
  // ============================================================================
  
  /**
   * POST /user-bots/register-agent
   * Register agent credentials with the bot runner
   * This syncs the agent from trading routes to the bot runner
   */
  fastify.post('/register-agent', async (request, reply) => {
    const { masterAddress, agentAddress, agentPrivateKey, agentName } = request.body as {
      masterAddress: string;
      agentAddress: string;
      agentPrivateKey: string;
      agentName?: string;
    };
    
    if (!masterAddress || !agentAddress || !agentPrivateKey) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }
    
    try {
      botRunner.registerAgent(masterAddress, {
        agentAddress,
        agentPrivateKey,
        masterAddress,
        agentName: agentName || 'WhalezBot',
      });
      
      console.log(`[UserBots] Registered agent for bot runner: ${masterAddress.slice(0, 8)}...`);
      
      return {
        success: true,
        message: 'Agent registered with bot runner',
      };
    } catch (error) {
      console.error('[UserBots] Error registering agent:', error);
      return reply.status(500).send({ error: 'Failed to register agent' });
    }
  });
  
  /**
   * GET /user-bots/runner-status
   * Get bot runner status for a wallet
   */
  fastify.get('/runner-status', async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    
    if (!wallet) {
      return reply.status(400).send({ error: 'Wallet address required' });
    }
    
    const walletAddress = wallet.toLowerCase();
    
    try {
      const hasAgent = botRunner.hasAgent(walletAddress);
      const runningBots = botRunner.getRunningBots(walletAddress);
      const totalRunning = botRunner.getTotalRunningBots();
      
      return {
        success: true,
        hasAgent,
        runningBots: runningBots.map(b => ({
          id: b.id,
          name: b.name,
          symbol: b.symbol,
          status: b.status,
          lastAnalysis: b.lastAnalysis,
          lastTrade: b.lastTrade,
          errorCount: b.errorCount,
          stats: b.stats,
        })),
        runningCount: runningBots.length,
        totalRunningGlobal: totalRunning,
      };
    } catch (error) {
      console.error('[UserBots] Error getting runner status:', error);
      return reply.status(500).send({ error: 'Failed to get runner status' });
    }
  });
  
  /**
   * GET /user-bots/:id/live-status
   * Get live status of a specific running bot
   */
  fastify.get('/:id/live-status', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const botStatus = botRunner.getBotStatus(id);
      
      if (!botStatus) {
        return {
          success: true,
          isRunning: false,
          message: 'Bot is not currently running',
        };
      }
      
      return {
        success: true,
        isRunning: true,
        status: botStatus.status,
        lastAnalysis: botStatus.lastAnalysis,
        lastTrade: botStatus.lastTrade,
        errorCount: botStatus.errorCount,
        lastError: botStatus.lastError,
        stats: botStatus.stats,
      };
    } catch (error) {
      console.error('[UserBots] Error getting live status:', error);
      return reply.status(500).send({ error: 'Failed to get live status' });
    }
  });
};
