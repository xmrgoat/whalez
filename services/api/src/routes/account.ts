/**
 * Account Routes
 * 
 * Provides endpoints for:
 * - GET /account/balance - Get Hyperliquid account balance
 */

import { FastifyPluginAsync } from 'fastify';

const HL_API_URL = 'https://api.hyperliquid.xyz/info';

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /account/balance
   * Get Hyperliquid account balance for a specific wallet
   */
  fastify.get('/balance', async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    // Use query param wallet if provided, otherwise fall back to API wallet
    const walletAddress = wallet || process.env['HL_WALLET_ADDRESS'] || process.env['HL_ACCOUNT_ADDRESS'];
    
    if (!walletAddress) {
      return reply.status(400).send({ 
        error: 'Wallet address not configured',
        accountValue: 0,
        withdrawable: 0,
      });
    }

    try {
      const response = await fetch(HL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: walletAddress,
        }),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid API error: ${response.status}`);
      }

      const data = await response.json() as {
        marginSummary?: { accountValue?: string; totalMarginUsed?: string };
        withdrawable?: string;
        assetPositions?: any[];
      };
      
      return {
        walletAddress,
        accountValue: parseFloat(data.marginSummary?.accountValue || '0'),
        withdrawable: parseFloat(data.withdrawable || '0'),
        totalMarginUsed: parseFloat(data.marginSummary?.totalMarginUsed || '0'),
        positions: data.assetPositions || [],
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[Account] Failed to fetch balance:', error);
      return reply.status(500).send({ 
        error: 'Failed to fetch balance',
        accountValue: 0,
        withdrawable: 0,
      });
    }
  });
};

export default accountRoutes;
