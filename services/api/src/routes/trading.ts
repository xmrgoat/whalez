/**
 * Trading Control Routes
 * 
 * Provides endpoints for:
 * - POST /trading/arm - Arm live trading (requires confirmation)
 * - POST /trading/disarm - Disarm live trading
 * - GET /trading/status - Get trading status
 * - POST /trading/kill - Emergency kill switch
 */

import { FastifyPluginAsync } from 'fastify';

// Trading state (in-memory, persisted to env check)
interface TradingState {
  armed: boolean;
  armedAt: number | null;
  armedBy: string | null;
  mode: 'paper' | 'testnet' | 'mainnet';
  killSwitchActive: boolean;
  killReason: string | null;
  dailyLoss: number;
  dailyLossLimit: number;
  maxDrawdown: number;
  currentDrawdown: number;
  maxPositionSize: number;
}

const state: TradingState = {
  armed: false,
  armedAt: null,
  armedBy: null,
  mode: 'paper',
  killSwitchActive: false,
  killReason: null,
  dailyLoss: 0,
  dailyLossLimit: parseFloat(process.env['MAX_DAILY_LOSS_PCT'] || '5'),
  maxDrawdown: parseFloat(process.env['MAX_DRAWDOWN_PCT'] || '10'),
  currentDrawdown: 0,
  maxPositionSize: parseFloat(process.env['POSITION_SIZE_PCT'] || '2'),
};

// Check if live trading is allowed by environment
function isLiveTradingEnabled(): boolean {
  return process.env['LIVE_TRADING_ENABLED'] === 'true';
}

// Check if we're on testnet
function isTestnet(): boolean {
  return process.env['HL_NETWORK'] === 'testnet';
}

export const tradingRoutes: FastifyPluginAsync = async (fastify) => {
  
  /**
   * GET /trading/status
   * Get current trading status
   */
  fastify.get('/status', async () => {
    return {
      armed: state.armed,
      armedAt: state.armedAt,
      mode: state.mode,
      killSwitchActive: state.killSwitchActive,
      killReason: state.killReason,
      
      // Safety limits
      limits: {
        dailyLossLimit: state.dailyLossLimit,
        maxDrawdown: state.maxDrawdown,
        maxPositionSize: state.maxPositionSize,
      },
      
      // Current state
      current: {
        dailyLoss: state.dailyLoss,
        currentDrawdown: state.currentDrawdown,
      },
      
      // Environment checks
      env: {
        liveTradingEnabled: isLiveTradingEnabled(),
        isTestnet: isTestnet(),
        hlNetwork: process.env['HL_NETWORK'] || 'not_set',
        hlAccountConfigured: !!process.env['HL_ACCOUNT_ADDRESS'],
        hlKeyConfigured: !!process.env['HL_PRIVATE_KEY'],
      },
      
      timestamp: Date.now(),
    };
  });

  /**
   * POST /trading/arm
   * Arm live trading - requires multiple confirmations
   */
  fastify.post('/arm', {
    schema: {
      body: {
        type: 'object',
        required: ['confirmation', 'mode'],
        properties: {
          confirmation: { type: 'string' },
          mode: { type: 'string', enum: ['testnet', 'mainnet'] },
        },
      },
    },
  }, async (request, reply) => {
    const { confirmation, mode } = request.body as {
      confirmation: string;
      mode: 'testnet' | 'mainnet';
    };

    // Check 1: Environment allows live trading
    if (!isLiveTradingEnabled()) {
      return reply.status(403).send({
        error: 'Live trading not enabled',
        message: 'Set LIVE_TRADING_ENABLED=true in environment',
      });
    }

    // Check 2: Confirmation phrase
    const expectedPhrase = 'I UNDERSTAND THE RISKS';
    if (confirmation !== expectedPhrase) {
      return reply.status(400).send({
        error: 'Invalid confirmation',
        message: `Type exactly: "${expectedPhrase}"`,
      });
    }

    // Check 3: Mode matches environment
    if (mode === 'mainnet' && isTestnet()) {
      return reply.status(400).send({
        error: 'Mode mismatch',
        message: 'Cannot arm mainnet when HL_NETWORK=testnet',
      });
    }

    if (mode === 'testnet' && !isTestnet()) {
      return reply.status(400).send({
        error: 'Mode mismatch',
        message: 'Cannot arm testnet when HL_NETWORK=mainnet',
      });
    }

    // Check 4: HL credentials configured
    if (!process.env['HL_ACCOUNT_ADDRESS'] || !process.env['HL_PRIVATE_KEY']) {
      return reply.status(400).send({
        error: 'Credentials not configured',
        message: 'Set HL_ACCOUNT_ADDRESS and HL_PRIVATE_KEY',
      });
    }

    // Check 5: Kill switch not active
    if (state.killSwitchActive) {
      return reply.status(403).send({
        error: 'Kill switch active',
        message: `Trading halted: ${state.killReason}`,
      });
    }

    // All checks passed - arm trading
    state.armed = true;
    state.armedAt = Date.now();
    state.armedBy = (request as any).user?.id || 'api';
    state.mode = mode;

    console.log(`[Trading] ARMED for ${mode} by ${state.armedBy}`);

    return {
      success: true,
      armed: true,
      mode,
      armedAt: state.armedAt,
      message: `Trading armed for ${mode}. Be careful!`,
    };
  });

  /**
   * POST /trading/disarm
   * Disarm live trading
   */
  fastify.post('/disarm', async () => {
    const wasArmed = state.armed;
    
    state.armed = false;
    state.armedAt = null;
    state.armedBy = null;
    state.mode = 'paper';

    console.log('[Trading] DISARMED');

    return {
      success: true,
      armed: false,
      wasArmed,
      message: 'Trading disarmed. Now in paper mode.',
    };
  });

  /**
   * POST /trading/kill
   * Emergency kill switch - stops all trading immediately
   */
  fastify.post('/kill', {
    schema: {
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { reason } = request.body as { reason: string };

    // Activate kill switch
    state.killSwitchActive = true;
    state.killReason = reason;
    state.armed = false;
    state.armedAt = null;
    state.mode = 'paper';

    console.log(`[Trading] KILL SWITCH ACTIVATED: ${reason}`);

    // TODO: Close all open positions
    // TODO: Cancel all pending orders
    // TODO: Notify via webhook/email

    return {
      success: true,
      killSwitchActive: true,
      reason,
      message: 'Kill switch activated. All trading halted.',
      timestamp: Date.now(),
    };
  });

  /**
   * POST /trading/reset-kill
   * Reset kill switch (requires confirmation)
   */
  fastify.post('/reset-kill', {
    schema: {
      body: {
        type: 'object',
        required: ['confirmation'],
        properties: {
          confirmation: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { confirmation } = request.body as { confirmation: string };

    if (confirmation !== 'RESET KILL SWITCH') {
      return reply.status(400).send({
        error: 'Invalid confirmation',
        message: 'Type exactly: "RESET KILL SWITCH"',
      });
    }

    state.killSwitchActive = false;
    state.killReason = null;

    console.log('[Trading] Kill switch reset');

    return {
      success: true,
      killSwitchActive: false,
      message: 'Kill switch reset. Trading can be re-armed.',
    };
  });

  /**
   * POST /trading/update-limits
   * Update safety limits
   */
  fastify.post('/update-limits', {
    schema: {
      body: {
        type: 'object',
        properties: {
          dailyLossLimit: { type: 'number', minimum: 1, maximum: 20 },
          maxDrawdown: { type: 'number', minimum: 5, maximum: 25 },
          maxPositionSize: { type: 'number', minimum: 0.5, maximum: 10 },
        },
      },
    },
  }, async (request) => {
    const { dailyLossLimit, maxDrawdown, maxPositionSize } = request.body as {
      dailyLossLimit?: number;
      maxDrawdown?: number;
      maxPositionSize?: number;
    };

    if (dailyLossLimit !== undefined) {
      state.dailyLossLimit = dailyLossLimit;
    }
    if (maxDrawdown !== undefined) {
      state.maxDrawdown = maxDrawdown;
    }
    if (maxPositionSize !== undefined) {
      state.maxPositionSize = maxPositionSize;
    }

    return {
      success: true,
      limits: {
        dailyLossLimit: state.dailyLossLimit,
        maxDrawdown: state.maxDrawdown,
        maxPositionSize: state.maxPositionSize,
      },
    };
  });

  /**
   * POST /trading/record-loss
   * Record a loss for daily tracking (called by worker)
   */
  fastify.post('/record-loss', {
    schema: {
      body: {
        type: 'object',
        required: ['amount'],
        properties: {
          amount: { type: 'number' },
        },
      },
    },
  }, async (request) => {
    const { amount } = request.body as { amount: number };

    state.dailyLoss += amount;

    // Check if daily loss limit exceeded
    if (state.dailyLoss >= state.dailyLossLimit) {
      state.killSwitchActive = true;
      state.killReason = `Daily loss limit exceeded: ${state.dailyLoss.toFixed(2)}%`;
      state.armed = false;
      
      console.log(`[Trading] KILL SWITCH: ${state.killReason}`);
    }

    return {
      dailyLoss: state.dailyLoss,
      dailyLossLimit: state.dailyLossLimit,
      killSwitchActive: state.killSwitchActive,
    };
  });
};

// Export state checker for worker
export function isTradingArmed(): boolean {
  return state.armed && !state.killSwitchActive && isLiveTradingEnabled();
}

export function getTradingMode(): 'paper' | 'testnet' | 'mainnet' {
  return state.mode;
}

export function isKillSwitchActive(): boolean {
  return state.killSwitchActive;
}

export default tradingRoutes;
