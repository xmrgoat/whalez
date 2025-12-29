/**
 * USER BOT MANAGER
 * Orchestrates multiple UserBotRunner instances
 * Handles lifecycle, monitoring, and coordination
 */

import { prisma } from '@whalez/database';
import { EventEmitter } from 'events';
import { UserBotRunner } from './user-bot-runner.js';

// ============================================================================
// TYPES
// ============================================================================

interface ManagedBot {
  id: string;
  walletAddress: string;
  name: string;
  runner: UserBotRunner;
  startedAt: number;
  lastHeartbeat: number;
}

interface ManagerStats {
  totalBots: number;
  runningBots: number;
  pausedBots: number;
  stoppedBots: number;
  totalTrades: number;
  totalPnl: number;
}

interface BotHealthCheck {
  botId: string;
  healthy: boolean;
  lastActivity: number;
  errors: number;
  status: string;
}

// ============================================================================
// USER BOT MANAGER CLASS
// ============================================================================

export class UserBotManager extends EventEmitter {
  private static instance: UserBotManager | null = null;
  
  private bots: Map<string, ManagedBot> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  
  private readonly MAX_BOTS_PER_WALLET = 5;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
  private readonly SYNC_INTERVAL_MS = 60000; // 1 minute
  private readonly HEARTBEAT_TIMEOUT_MS = 120000; // 2 minutes

  private constructor() {
    super();
  }

  // ============================================================================
  // SINGLETON
  // ============================================================================

  static getInstance(): UserBotManager {
    if (!UserBotManager.instance) {
      UserBotManager.instance = new UserBotManager();
    }
    return UserBotManager.instance;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  async initialize(): Promise<void> {
    console.log('[UserBotManager] Initializing...');

    // Start health check loop
    this.healthCheckInterval = setInterval(
      () => this.runHealthChecks(),
      this.HEALTH_CHECK_INTERVAL_MS
    );

    // Start sync loop (sync with database)
    this.syncInterval = setInterval(
      () => this.syncWithDatabase(),
      this.SYNC_INTERVAL_MS
    );

    // Load and start bots that should be running
    await this.loadRunningBots();

    console.log('[UserBotManager] Initialized successfully');
  }

  async shutdown(): Promise<void> {
    console.log('[UserBotManager] Shutting down...');

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Stop all bots
    const stopPromises = Array.from(this.bots.values()).map(async (managed) => {
      try {
        await managed.runner.stop();
      } catch (e) {
        console.error(`[UserBotManager] Error stopping bot ${managed.id}:`, e);
      }
    });

    await Promise.all(stopPromises);
    this.bots.clear();

    console.log('[UserBotManager] Shutdown complete');
  }

  // ============================================================================
  // BOT MANAGEMENT
  // ============================================================================

  async startBot(botId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[UserBotManager] Starting bot ${botId}`);

    // Check if already running
    if (this.bots.has(botId)) {
      return { success: false, error: 'Bot is already running' };
    }

    try {
      // Fetch bot from database
      const userBot = await (prisma as any).userBot.findUnique({
        where: { id: botId },
        include: { wallet: true },
      });

      if (!userBot) {
        return { success: false, error: 'Bot not found' };
      }

      // Check wallet bot limit
      const walletBots = Array.from(this.bots.values()).filter(
        (b) => b.walletAddress === userBot.walletAddress
      );
      if (walletBots.length >= this.MAX_BOTS_PER_WALLET) {
        return { 
          success: false, 
          error: `Maximum ${this.MAX_BOTS_PER_WALLET} bots per wallet reached` 
        };
      }

      // Create runner
      const runner = new UserBotRunner(userBot);

      // Setup event listeners
      this.setupBotEventListeners(botId, runner);

      // Start the bot
      await runner.start();

      // Track the bot
      this.bots.set(botId, {
        id: botId,
        walletAddress: userBot.walletAddress,
        name: userBot.name,
        runner,
        startedAt: Date.now(),
        lastHeartbeat: Date.now(),
      });

      this.emit('bot:started', { botId, name: userBot.name });
      console.log(`[UserBotManager] Bot ${botId} started successfully`);

      return { success: true };

    } catch (error: any) {
      console.error(`[UserBotManager] Failed to start bot ${botId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async stopBot(botId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[UserBotManager] Stopping bot ${botId}`);

    const managed = this.bots.get(botId);
    if (!managed) {
      return { success: false, error: 'Bot is not running' };
    }

    try {
      await managed.runner.stop();
      this.bots.delete(botId);

      this.emit('bot:stopped', { botId, name: managed.name });
      console.log(`[UserBotManager] Bot ${botId} stopped successfully`);

      return { success: true };

    } catch (error: any) {
      console.error(`[UserBotManager] Failed to stop bot ${botId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async pauseBot(botId: string): Promise<{ success: boolean; error?: string }> {
    const managed = this.bots.get(botId);
    if (!managed) {
      return { success: false, error: 'Bot is not running' };
    }

    try {
      await managed.runner.pause();
      this.emit('bot:paused', { botId, name: managed.name });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async resumeBot(botId: string): Promise<{ success: boolean; error?: string }> {
    const managed = this.bots.get(botId);
    if (!managed) {
      return { success: false, error: 'Bot is not running' };
    }

    try {
      await managed.runner.resume();
      this.emit('bot:resumed', { botId, name: managed.name });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async restartBot(botId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[UserBotManager] Restarting bot ${botId}`);

    const stopResult = await this.stopBot(botId);
    if (!stopResult.success && stopResult.error !== 'Bot is not running') {
      return stopResult;
    }

    // Wait a bit before restarting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return this.startBot(botId);
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  getBotState(botId: string): any | null {
    const managed = this.bots.get(botId);
    if (!managed) return null;

    return {
      ...managed.runner.getState(),
      startedAt: managed.startedAt,
      lastHeartbeat: managed.lastHeartbeat,
    };
  }

  getBotConfig(botId: string): any | null {
    const managed = this.bots.get(botId);
    if (!managed) return null;

    return managed.runner.getConfig();
  }

  getRunningBots(): string[] {
    return Array.from(this.bots.keys());
  }

  getRunningBotsForWallet(walletAddress: string): string[] {
    return Array.from(this.bots.values())
      .filter((b) => b.walletAddress.toLowerCase() === walletAddress.toLowerCase())
      .map((b) => b.id);
  }

  isBotRunning(botId: string): boolean {
    return this.bots.has(botId);
  }

  getStats(): ManagerStats {
    let totalTrades = 0;
    let totalPnl = 0;
    let runningBots = 0;
    let pausedBots = 0;

    for (const managed of this.bots.values()) {
      const state = managed.runner.getState();
      totalTrades += state.sessionStats.trades;
      totalPnl += state.sessionStats.pnl;

      if (state.status === 'RUNNING') runningBots++;
      else if (state.status === 'PAUSED') pausedBots++;
    }

    return {
      totalBots: this.bots.size,
      runningBots,
      pausedBots,
      stoppedBots: 0,
      totalTrades,
      totalPnl,
    };
  }

  // ============================================================================
  // HEALTH CHECKS
  // ============================================================================

  private async runHealthChecks(): Promise<void> {
    const now = Date.now();
    const unhealthyBots: string[] = [];

    for (const [botId, managed] of this.bots) {
      try {
        const state = managed.runner.getState();

        // Update heartbeat if bot is active
        if (state.lastActivityAt && state.lastActivityAt > managed.lastHeartbeat) {
          managed.lastHeartbeat = state.lastActivityAt;
        }

        // Check for stale bots
        if (now - managed.lastHeartbeat > this.HEARTBEAT_TIMEOUT_MS) {
          console.warn(`[UserBotManager] Bot ${botId} appears stale (no activity for ${Math.round((now - managed.lastHeartbeat) / 1000)}s)`);
          unhealthyBots.push(botId);
        }

        // Check for error state
        if (state.status === 'ERROR') {
          console.warn(`[UserBotManager] Bot ${botId} is in ERROR state`);
          unhealthyBots.push(botId);
        }

        // Check for too many errors
        if (state.recentErrors.length >= 5) {
          console.warn(`[UserBotManager] Bot ${botId} has ${state.recentErrors.length} recent errors`);
          unhealthyBots.push(botId);
        }

      } catch (e) {
        console.error(`[UserBotManager] Health check failed for bot ${botId}:`, e);
        unhealthyBots.push(botId);
      }
    }

    // Handle unhealthy bots
    for (const botId of unhealthyBots) {
      this.emit('bot:unhealthy', { botId });
      
      // Optionally restart unhealthy bots
      // await this.restartBot(botId);
    }
  }

  getHealthChecks(): BotHealthCheck[] {
    const checks: BotHealthCheck[] = [];

    for (const [botId, managed] of this.bots) {
      const state = managed.runner.getState();
      const now = Date.now();

      checks.push({
        botId,
        healthy: state.status === 'RUNNING' && 
                 (now - managed.lastHeartbeat) < this.HEARTBEAT_TIMEOUT_MS &&
                 state.recentErrors.length < 5,
        lastActivity: state.lastActivityAt || managed.startedAt,
        errors: state.recentErrors.length,
        status: state.status,
      });
    }

    return checks;
  }

  // ============================================================================
  // DATABASE SYNC
  // ============================================================================

  private async loadRunningBots(): Promise<void> {
    try {
      // Find bots that should be running
      const botsToRun = await (prisma as any).userBot.findMany({
        where: { status: 'RUNNING' },
      });

      console.log(`[UserBotManager] Found ${botsToRun.length} bots to resume`);

      for (const bot of botsToRun) {
        try {
          await this.startBot(bot.id);
        } catch (e) {
          console.error(`[UserBotManager] Failed to resume bot ${bot.id}:`, e);
        }
      }

    } catch (e) {
      console.error('[UserBotManager] Failed to load running bots:', e);
    }
  }

  private async syncWithDatabase(): Promise<void> {
    try {
      // Update database with current bot states
      for (const [botId, managed] of this.bots) {
        const state = managed.runner.getState();

        await (prisma as any).userBot.update({
          where: { id: botId },
          data: {
            status: state.status,
            lastActivityAt: state.lastActivityAt ? new Date(state.lastActivityAt) : undefined,
          },
        });
      }

      // Check for bots that should be stopped
      const dbBots = await (prisma as any).userBot.findMany({
        where: { 
          id: { in: Array.from(this.bots.keys()) },
          status: 'STOPPED',
        },
      });

      for (const bot of dbBots) {
        console.log(`[UserBotManager] Bot ${bot.id} marked as STOPPED in DB, stopping...`);
        await this.stopBot(bot.id);
      }

    } catch (e) {
      console.error('[UserBotManager] Database sync failed:', e);
    }
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  private setupBotEventListeners(botId: string, runner: UserBotRunner): void {
    runner.on('event', (event: any) => {
      // Update heartbeat on any event
      const managed = this.bots.get(botId);
      if (managed) {
        managed.lastHeartbeat = Date.now();
      }

      // Forward events
      this.emit('bot:event', { botId, event });
    });

    runner.on('trade_opened', (event: any) => {
      this.emit('bot:trade:opened', { botId, ...event });
    });

    runner.on('trade_closed', (event: any) => {
      this.emit('bot:trade:closed', { botId, ...event });
    });

    runner.on('error', (event: any) => {
      this.emit('bot:error', { botId, ...event });
    });

    runner.on('signal_generated', (event: any) => {
      this.emit('bot:signal', { botId, ...event });
    });
  }

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  async stopAllBots(): Promise<void> {
    console.log('[UserBotManager] Stopping all bots...');
    
    const stopPromises = Array.from(this.bots.keys()).map((botId) => 
      this.stopBot(botId)
    );

    await Promise.all(stopPromises);
    console.log('[UserBotManager] All bots stopped');
  }

  async stopBotsForWallet(walletAddress: string): Promise<void> {
    const botIds = this.getRunningBotsForWallet(walletAddress);
    
    const stopPromises = botIds.map((botId) => this.stopBot(botId));
    await Promise.all(stopPromises);
  }

  // ============================================================================
  // CONFIGURATION UPDATES
  // ============================================================================

  async updateBotConfig(botId: string, newConfig: any): Promise<{ success: boolean; error?: string }> {
    const managed = this.bots.get(botId);
    
    if (!managed) {
      // Bot not running, just update database
      try {
        await (prisma as any).userBot.update({
          where: { id: botId },
          data: { strategyConfig: newConfig },
        });
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    // Bot is running, need to restart with new config
    try {
      await (prisma as any).userBot.update({
        where: { id: botId },
        data: { strategyConfig: newConfig },
      });

      // Restart to apply new config
      return this.restartBot(botId);

    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}

// Export singleton getter
export const getUserBotManager = (): UserBotManager => UserBotManager.getInstance();

export default UserBotManager;
