/**
 * Grok API Routes
 * 
 * Provides endpoints for:
 * - GET /grok/status - Get Grok availability and stats
 * - GET /grok/analysis - Get latest macro analysis
 * - POST /grok/analyze - Trigger new macro analysis
 * - GET /grok/costs - Get cost tracking stats
 * - GET /grok/history - Get analysis history
 * - POST /grok/config - Update Grok configuration
 */

import { FastifyPluginAsync } from 'fastify';
import { grokMacroService, type GrokMacroConfig } from '@whalez/core';

// Store for Grok analyses (persisted in memory, could be moved to DB)
interface GrokAnalysisRecord {
  id: string;
  timestamp: number;
  symbols: string[];
  marketRegime: string;
  overallBias: string;
  biasStrength: number;
  warnings: string[];
  symbolAnalysis: Record<string, any>;
  cost: number;
}

const analysisRecords: GrokAnalysisRecord[] = [];

export const grokRoutes: FastifyPluginAsync = async (fastify) => {
  
  /**
   * GET /grok/status
   * Get Grok service status and availability
   */
  fastify.get('/status', async () => {
    const costStats = grokMacroService.getCostStats();
    const config = grokMacroService.getConfig();
    const cached = grokMacroService.getCachedAnalysis();
    
    return {
      available: grokMacroService.isAvailable(),
      apiKeyConfigured: !!process.env['GROK_API_KEY'],
      enabled: config.enabled,
      
      // Usage stats
      usage: {
        callsToday: costStats.callsToday,
        maxCallsPerDay: config.maxCallsPerDay,
        remainingCalls: grokMacroService.getRemainingCalls(),
        costToday: costStats.costToday,
        avgCostPerCall: costStats.avgCostPerCall,
      },
      
      // Cache status
      cache: {
        hasCache: !!cached,
        cacheAge: cached ? Date.now() - cached.timestamp : null,
        cacheValidityMs: config.cacheValidityMs,
        lastAnalysisTime: cached?.timestamp || null,
      },
      
      // Configuration
      config: {
        intervalMinutes: config.intervalMinutes,
        minIntervalMs: config.minIntervalMs,
        analyzeAllPairs: config.analyzeAllPairs,
      },
      
      timestamp: Date.now(),
    };
  });

  /**
   * GET /grok/analysis
   * Get the latest macro analysis (from cache if available)
   */
  fastify.get('/analysis', async () => {
    const cached = grokMacroService.getCachedAnalysis();
    
    if (!cached) {
      return {
        success: false,
        message: 'No analysis available. Trigger a new analysis with POST /grok/analyze',
        available: grokMacroService.isAvailable(),
      };
    }
    
    return {
      success: true,
      analysis: cached,
      cacheAge: Date.now() - cached.timestamp,
      nextRefreshIn: Math.max(0, grokMacroService.getConfig().cacheValidityMs - (Date.now() - cached.timestamp)),
    };
  });

  /**
   * POST /grok/analyze
   * Trigger a new macro analysis for the trading bag
   */
  fastify.post('/analyze', {
    schema: {
      body: {
        type: 'object',
        properties: {
          symbols: { type: 'array', items: { type: 'string' } },
          forceRefresh: { type: 'boolean' },
          marketData: { 
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                price: { type: 'number' },
                change24h: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { symbols, forceRefresh, marketData } = request.body as {
      symbols?: string[];
      forceRefresh?: boolean;
      marketData?: Record<string, { price: number; change24h: number }>;
    };
    
    // Default to BTC if no symbols provided
    const symbolsToAnalyze = symbols && symbols.length > 0 ? symbols : ['BTC-PERP'];
    
    // Check if we can make a call
    if (!grokMacroService.isAvailable() && forceRefresh) {
      return reply.status(429).send({
        success: false,
        error: 'Grok API not available',
        reason: !process.env['GROK_API_KEY'] ? 'API key not configured' : 'Daily limit reached or rate limited',
        remainingCalls: grokMacroService.getRemainingCalls(),
      });
    }
    
    try {
      const analysis = await grokMacroService.analyzeMacro({
        symbols: symbolsToAnalyze,
        marketData,
        forceRefresh,
      });
      
      if (!analysis) {
        return {
          success: false,
          message: 'Analysis failed or not available',
          cached: grokMacroService.getCachedAnalysis(),
        };
      }
      
      // Store in records
      analysisRecords.push({
        id: `grok_${Date.now()}`,
        timestamp: analysis.timestamp,
        symbols: analysis.symbols,
        marketRegime: analysis.marketRegime,
        overallBias: analysis.overallBias,
        biasStrength: analysis.biasStrength,
        warnings: analysis.warnings,
        symbolAnalysis: analysis.symbolAnalysis,
        cost: analysis.estimatedCost,
      });
      
      // Keep only last 100 records
      if (analysisRecords.length > 100) {
        analysisRecords.splice(0, analysisRecords.length - 100);
      }
      
      return {
        success: true,
        analysis,
        costStats: grokMacroService.getCostStats(),
      };
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /grok/sentiment/:symbol
   * Get quick sentiment for a specific symbol
   */
  fastify.get('/sentiment/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    
    try {
      const sentiment = await grokMacroService.getQuickSentiment(symbol);
      
      if (!sentiment) {
        // Graceful degradation - return neutral if Grok unavailable
        return {
          success: true,
          symbol,
          sentiment: 'neutral',
          score: 0,
          reason: 'Grok unavailable - using neutral default',
          fromCache: false,
          grokAvailable: grokMacroService.isAvailable(),
        };
      }
      
      return {
        success: true,
        symbol,
        ...sentiment,
        fromCache: true,
        grokAvailable: true,
      };
    } catch (error: any) {
      return {
        success: true,
        symbol,
        sentiment: 'neutral',
        score: 0,
        reason: 'Error fetching sentiment - using neutral default',
        error: error.message,
      };
    }
  });

  /**
   * GET /grok/costs
   * Get detailed cost tracking statistics
   */
  fastify.get('/costs', async () => {
    const stats = grokMacroService.getCostStats();
    const config = grokMacroService.getConfig();
    
    // Calculate projections
    const avgCostPerCall = stats.avgCostPerCall || 0.01;
    const projectedDailyCost = config.maxCallsPerDay * avgCostPerCall;
    const projectedMonthlyCost = projectedDailyCost * 30;
    
    return {
      current: {
        totalCalls: stats.totalCalls,
        callsToday: stats.callsToday,
        costToday: stats.costToday,
        totalCost: stats.estimatedTotalCost,
        avgCostPerCall: stats.avgCostPerCall,
      },
      tokens: {
        totalInput: stats.totalInputTokens,
        totalOutput: stats.totalOutputTokens,
      },
      projections: {
        maxCallsPerDay: config.maxCallsPerDay,
        projectedDailyCost,
        projectedMonthlyCost,
        remainingBudgetToday: Math.max(0, projectedDailyCost - stats.costToday),
      },
      pricing: {
        inputTokensPer1M: 5.00,
        outputTokensPer1M: 15.00,
        note: 'Prices are estimates for Grok API',
      },
      lastResetDate: stats.lastResetDate,
      timestamp: Date.now(),
    };
  });

  /**
   * GET /grok/history
   * Get analysis history
   */
  fastify.get('/history', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
          symbol: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { limit, symbol } = request.query as { limit?: number; symbol?: string };
    
    let history = grokMacroService.getAnalysisHistory(limit || 20);
    
    // Filter by symbol if provided
    if (symbol) {
      history = history.filter((h: any) => h.symbols.includes(symbol));
    }
    
    return {
      success: true,
      count: history.length,
      history: history.map((h: any) => ({
        timestamp: h.timestamp,
        symbols: h.symbols,
        marketRegime: h.marketRegime,
        overallBias: h.overallBias,
        biasStrength: h.biasStrength,
        warnings: h.warnings.length,
        cost: h.estimatedCost,
      })),
      records: analysisRecords.slice(-20),
    };
  });

  /**
   * POST /grok/config
   * Update Grok configuration
   */
  fastify.post('/config', {
    schema: {
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          intervalMinutes: { type: 'number', minimum: 5, maximum: 120 },
          maxCallsPerDay: { type: 'number', minimum: 1, maximum: 100 },
          analyzeAllPairs: { type: 'boolean' },
        },
      },
    },
  }, async (request) => {
    const updates = request.body as Partial<GrokMacroConfig>;
    
    grokMacroService.updateConfig(updates);
    
    return {
      success: true,
      config: grokMacroService.getConfig(),
      message: 'Configuration updated',
    };
  });

  /**
   * GET /grok/dashboard
   * Get all data needed for the Grok dashboard
   */
  fastify.get('/dashboard', async () => {
    const costStats = grokMacroService.getCostStats();
    const config = grokMacroService.getConfig();
    const cached = grokMacroService.getCachedAnalysis();
    const history = grokMacroService.getAnalysisHistory(10);
    
    return {
      status: {
        available: grokMacroService.isAvailable(),
        enabled: config.enabled,
        apiKeyConfigured: !!process.env['GROK_API_KEY'],
      },
      usage: {
        callsToday: costStats.callsToday,
        maxCalls: config.maxCallsPerDay,
        remaining: grokMacroService.getRemainingCalls(),
        percentUsed: (costStats.callsToday / config.maxCallsPerDay) * 100,
      },
      costs: {
        today: costStats.costToday,
        total: costStats.estimatedTotalCost,
        avgPerCall: costStats.avgCostPerCall,
        projectedDaily: config.maxCallsPerDay * (costStats.avgCostPerCall || 0.01),
      },
      latestAnalysis: cached ? {
        timestamp: cached.timestamp,
        age: Date.now() - cached.timestamp,
        marketRegime: cached.marketRegime,
        regimeConfidence: cached.regimeConfidence,
        overallBias: cached.overallBias,
        biasStrength: cached.biasStrength,
        symbols: cached.symbols,
        upcomingEvents: cached.upcomingEvents.slice(0, 3),
        recentNews: cached.recentNews.slice(0, 3),
        warnings: cached.warnings,
        symbolAnalysis: cached.symbolAnalysis,
      } : null,
      history: history.map((h: any) => ({
        timestamp: h.timestamp,
        regime: h.marketRegime,
        bias: h.overallBias,
        strength: h.biasStrength,
      })) as any[],
      config: {
        intervalMinutes: config.intervalMinutes,
        maxCallsPerDay: config.maxCallsPerDay,
        cacheValidityMinutes: Math.round(config.cacheValidityMs / 60000),
      },
      timestamp: Date.now(),
    };
  });
};

export default grokRoutes;
