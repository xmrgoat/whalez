import { FastifyInstance } from 'fastify';
import { runBacktest, AVAILABLE_STRATEGIES, fetchHistoricalCandles, BacktestConfig, BacktestResult } from '../lib/backtesting-engine.js';
import { userBotSettings } from './trading.js';
import fs from 'fs';
import path from 'path';

// File-based storage for backtest history (simpler than SQL for now)
const BACKTEST_HISTORY_FILE = path.join(process.cwd(), 'data', 'backtest-history.json');

interface StoredBacktest {
  id: string;
  walletAddress?: string;
  config: BacktestConfig;
  metrics: BacktestResult['metrics'];
  tradesCount: number;
  createdAt: string;
  notes?: string;
  tags?: string[];
}

let backtestHistory: StoredBacktest[] = [];

// Load history on startup
function loadBacktestHistory() {
  try {
    if (fs.existsSync(BACKTEST_HISTORY_FILE)) {
      const data = fs.readFileSync(BACKTEST_HISTORY_FILE, 'utf-8');
      backtestHistory = JSON.parse(data);
      console.log(`[Backtest] Loaded ${backtestHistory.length} backtest results from history`);
    }
  } catch (e) {
    console.error('[Backtest] Failed to load history:', e);
    backtestHistory = [];
  }
}

function saveBacktestHistory() {
  try {
    const dir = path.dirname(BACKTEST_HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BACKTEST_HISTORY_FILE, JSON.stringify(backtestHistory, null, 2));
  } catch (e) {
    console.error('[Backtest] Failed to save history:', e);
  }
}

loadBacktestHistory();

export async function backtestRoutes(fastify: FastifyInstance) {
  
  // Get available strategies
  fastify.get('/strategies', async () => {
    return { strategies: AVAILABLE_STRATEGIES };
  });

  // Get user settings for backtest (sync with bot)
  fastify.get('/user-settings/:wallet', async (request) => {
    const { wallet } = request.params as { wallet: string };
    const settings = userBotSettings.get(wallet.toLowerCase());
    if (settings) {
      return {
        success: true,
        settings: {
          positionSizePct: settings.positionSizePct || 2,
          stopLossPct: settings.stopLossPct || 3,
          takeProfitPct: settings.takeProfitPct || 6,
          maxLeverage: settings.maxLeverage || 3,
          tradingMode: settings.tradingMode || 'moderate',
          tradingBag: settings.tradingBag || ['BTC'],
        }
      };
    }
    return {
      success: true,
      settings: {
        positionSizePct: 2,
        stopLossPct: 3,
        takeProfitPct: 6,
        maxLeverage: 3,
        tradingMode: 'moderate',
        tradingBag: ['BTC'],
      }
    };
  });

  // Get available symbols
  fastify.get('/symbols', async () => {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      });
      const data = await response.json() as any;
      const symbols = data.universe?.map((u: any) => ({ name: u.name, szDecimals: u.szDecimals })) || [];
      return { symbols };
    } catch (e) {
      return { symbols: ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'AVAX', 'LINK', 'ARB', 'OP', 'SUI'] };
    }
  });

  // Run backtest
  fastify.post('/run', async (request, reply) => {
    const body = request.body as any;
    
    // Apply trading mode presets if provided
    const tradingMode = body.tradingMode || 'moderate';
    const modePresets = {
      conservative: { stopLossPct: 1.5, takeProfitPct: 3, positionSizePct: 2, maxLeverage: 2, minSignals: 5 },
      moderate: { stopLossPct: 0.8, takeProfitPct: 1.5, positionSizePct: 5, maxLeverage: 3, minSignals: 4 },
      aggressive: { stopLossPct: 0.3, takeProfitPct: 0.5, positionSizePct: 10, maxLeverage: 5, minSignals: 3 },
    };
    const preset = modePresets[tradingMode as keyof typeof modePresets] || modePresets.moderate;

    const config: BacktestConfig = {
      symbol: body.symbol || 'BTC',
      startTime: body.startTime || Date.now() - 7 * 24 * 60 * 60 * 1000,
      endTime: body.endTime || Date.now(),
      interval: body.interval || '1h',
      initialCapital: body.initialCapital || 1000,
      positionSizePct: body.positionSizePct ?? preset.positionSizePct,
      maxLeverage: body.maxLeverage ?? preset.maxLeverage,
      stopLossPct: body.stopLossPct ?? preset.stopLossPct,
      takeProfitPct: body.takeProfitPct ?? preset.takeProfitPct,
      tradingFee: body.tradingFee || 0.035,
      slippage: body.slippage || 0.05,
      strategy: body.strategy || 'improved_bot',
      strategyParams: { ...body.strategyParams, minSignals: body.strategyParams?.minSignals ?? preset.minSignals },
      enableTrailingStop: body.enableTrailingStop ?? true,
      trailingStopPct: body.trailingStopPct || 1,
    };

    try {
      const startTime = Date.now();
      console.log('[Backtest API] Running backtest:', config.symbol, config.strategy);
      const result = await runBacktest(config);
      const executionTimeMs = Date.now() - startTime;
      
      // Return full data including sample candles for transparency
      const sampleCandles = result.candles.slice(-100).map(c => ({
        t: c.timestamp,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        v: c.volume,
      }));
      
      // Add data source info
      const dataInfo = {
        source: 'Hyperliquid API (api.hyperliquid.xyz)',
        endpoint: 'candleSnapshot',
        totalCandles: result.candles.length,
        firstCandle: result.candles.length > 0 ? new Date(result.candles[0]!.timestamp).toISOString() : null,
        lastCandle: result.candles.length > 0 ? new Date(result.candles[result.candles.length - 1]!.timestamp).toISOString() : null,
        priceRange: {
          min: Math.min(...result.candles.map(c => c.low)),
          max: Math.max(...result.candles.map(c => c.high)),
        },
        volumeTotal: result.candles.reduce((s, c) => s + c.volume, 0),
      };
      
      // Auto-save to history if autoSave is enabled (default: true)
      let savedId: string | null = null;
      if (body.autoSave !== false) {
        const stored: StoredBacktest = {
          id: `bt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          walletAddress: body.walletAddress,
          config: result.config,
          metrics: result.metrics,
          tradesCount: result.trades.length,
          createdAt: new Date().toISOString(),
          notes: body.notes,
          tags: body.tags || [],
        };
        backtestHistory.push(stored);
        saveBacktestHistory();
        savedId = stored.id;
        console.log(`[Backtest API] Auto-saved backtest ${savedId}`);
      }
      
      return {
        success: true,
        savedId,
        executionTimeMs,
        config: result.config,
        metrics: result.metrics,
        trades: result.trades,
        equityCurve: result.equityCurve,
        returnDistribution: result.returnDistribution,
        monthlyReturns: result.monthlyReturns,
        hourlyPerformance: result.hourlyPerformance,
        candleCount: result.candles.length,
        sampleCandles,
        dataInfo,
      };
    } catch (error: any) {
      console.error('[Backtest API] Error:', error);
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  // Fetch historical candles only
  fastify.post('/candles', async (request, reply) => {
    const body = request.body as any;
    try {
      const candles = await fetchHistoricalCandles(
        body.symbol || 'BTC',
        body.interval || '1h',
        body.startTime || Date.now() - 24 * 60 * 60 * 1000,
        body.endTime || Date.now()
      );
      return { success: true, candles };
    } catch (error: any) {
      reply.status(500);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // BACKTEST HISTORY ENDPOINTS
  // ============================================================================

  // Get all backtest history
  fastify.get('/history', async (request) => {
    const { wallet, limit, strategy, symbol } = request.query as any;
    
    let results = [...backtestHistory];
    
    // Filter by wallet if provided
    if (wallet) {
      results = results.filter(b => b.walletAddress?.toLowerCase() === wallet.toLowerCase());
    }
    
    // Filter by strategy
    if (strategy) {
      results = results.filter(b => b.config.strategy === strategy);
    }
    
    // Filter by symbol
    if (symbol) {
      results = results.filter(b => b.config.symbol === symbol);
    }
    
    // Sort by date (newest first)
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Limit results
    if (limit) {
      results = results.slice(0, parseInt(limit));
    }
    
    return {
      success: true,
      count: results.length,
      total: backtestHistory.length,
      results,
    };
  });

  // Get single backtest by ID
  fastify.get('/history/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const backtest = backtestHistory.find(b => b.id === id);
    
    if (!backtest) {
      reply.status(404);
      return { success: false, error: 'Backtest not found' };
    }
    
    return { success: true, backtest };
  });

  // Save backtest to history
  fastify.post('/history', async (request, reply) => {
    const body = request.body as any;
    
    const stored: StoredBacktest = {
      id: `bt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      walletAddress: body.walletAddress,
      config: body.config,
      metrics: body.metrics,
      tradesCount: body.tradesCount || 0,
      createdAt: new Date().toISOString(),
      notes: body.notes,
      tags: body.tags || [],
    };
    
    backtestHistory.push(stored);
    saveBacktestHistory();
    
    console.log(`[Backtest] Saved backtest ${stored.id} to history`);
    
    return { success: true, id: stored.id, backtest: stored };
  });

  // Delete backtest from history
  fastify.delete('/history/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const index = backtestHistory.findIndex(b => b.id === id);
    
    if (index === -1) {
      reply.status(404);
      return { success: false, error: 'Backtest not found' };
    }
    
    backtestHistory.splice(index, 1);
    saveBacktestHistory();
    
    return { success: true, message: 'Backtest deleted' };
  });

  // Get backtest statistics/summary
  fastify.get('/stats', async (request) => {
    const { wallet } = request.query as any;
    
    let results = wallet 
      ? backtestHistory.filter(b => b.walletAddress?.toLowerCase() === wallet.toLowerCase())
      : backtestHistory;
    
    if (results.length === 0) {
      return {
        success: true,
        stats: {
          totalBacktests: 0,
          avgWinRate: 0,
          avgSharpe: 0,
          avgReturn: 0,
          bestStrategy: null,
          worstStrategy: null,
        }
      };
    }
    
    // Calculate aggregate stats
    const avgWinRate = results.reduce((s, b) => s + b.metrics.winRate, 0) / results.length;
    const avgSharpe = results.reduce((s, b) => s + b.metrics.sharpeRatio, 0) / results.length;
    const avgReturn = results.reduce((s, b) => s + b.metrics.totalReturnPct, 0) / results.length;
    
    // Find best/worst strategies
    const strategyStats = new Map<string, { count: number; avgReturn: number; avgWinRate: number }>();
    for (const b of results) {
      const s = strategyStats.get(b.config.strategy) || { count: 0, avgReturn: 0, avgWinRate: 0 };
      s.count++;
      s.avgReturn = (s.avgReturn * (s.count - 1) + b.metrics.totalReturnPct) / s.count;
      s.avgWinRate = (s.avgWinRate * (s.count - 1) + b.metrics.winRate) / s.count;
      strategyStats.set(b.config.strategy, s);
    }
    
    let bestStrategy = { name: '', avgReturn: -Infinity };
    let worstStrategy = { name: '', avgReturn: Infinity };
    
    for (const [name, stats] of strategyStats) {
      if (stats.avgReturn > bestStrategy.avgReturn) {
        bestStrategy = { name, avgReturn: stats.avgReturn };
      }
      if (stats.avgReturn < worstStrategy.avgReturn) {
        worstStrategy = { name, avgReturn: stats.avgReturn };
      }
    }
    
    return {
      success: true,
      stats: {
        totalBacktests: results.length,
        avgWinRate: Math.round(avgWinRate * 100) / 100,
        avgSharpe: Math.round(avgSharpe * 100) / 100,
        avgReturn: Math.round(avgReturn * 100) / 100,
        bestStrategy: bestStrategy.name ? bestStrategy : null,
        worstStrategy: worstStrategy.name ? worstStrategy : null,
        strategyBreakdown: Object.fromEntries(strategyStats),
      }
    };
  });

  // Compare multiple backtests
  fastify.post('/compare', async (request, reply) => {
    const { ids } = request.body as { ids: string[] };
    
    if (!ids || ids.length < 2) {
      reply.status(400);
      return { success: false, error: 'Need at least 2 backtest IDs to compare' };
    }
    
    const backtests = ids.map(id => backtestHistory.find(b => b.id === id)).filter(Boolean);
    
    if (backtests.length < 2) {
      reply.status(404);
      return { success: false, error: 'Some backtests not found' };
    }
    
    // Create comparison table
    const comparison = backtests.map(b => ({
      id: b!.id,
      strategy: b!.config.strategy,
      symbol: b!.config.symbol,
      timeframe: b!.config.interval,
      totalReturn: b!.metrics.totalReturnPct,
      winRate: b!.metrics.winRate,
      sharpe: b!.metrics.sharpeRatio,
      maxDrawdown: b!.metrics.maxDrawdownPct,
      trades: b!.tradesCount,
      profitFactor: b!.metrics.profitFactor,
      expectancy: b!.metrics.expectancy,
    }));
    
    // Find winner
    const winner = comparison.reduce((best, curr) => 
      curr.totalReturn > best.totalReturn ? curr : best
    );
    
    return {
      success: true,
      comparison,
      winner: winner.id,
      recommendation: `Strategy "${winner.strategy}" performed best with ${winner.totalReturn.toFixed(2)}% return`,
    };
  });
}
