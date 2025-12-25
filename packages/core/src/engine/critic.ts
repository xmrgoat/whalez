import type { 
  Trade, 
  CritiqueReport, 
  CritiqueMetrics, 
  ParameterChange,
  WHITELISTED_PARAMS 
} from '../types/index.js';
import { v4 as uuid } from 'uuid';

/**
 * Critic
 * Analyzes trades and generates critique reports with recommendations.
 * Runs after every 5 completed trades.
 */

export class Critic {
  private botId: string;

  constructor(botId: string) {
    this.botId = botId;
  }

  /**
   * Generate critique report from trades
   */
  generateReport(trades: Trade[]): CritiqueReport {
    if (trades.length === 0) {
      return this.createEmptyReport([]);
    }

    const metrics = this.calculateMetrics(trades);
    const analysis = this.analyzeTrades(trades, metrics);
    const recommendations = this.generateRecommendations(metrics, analysis);

    return {
      id: uuid(),
      botId: this.botId,
      tradeIds: trades.map(t => t.id),
      metrics,
      whatWorked: analysis.whatWorked,
      whatDidntWork: analysis.whatDidntWork,
      failurePatterns: analysis.failurePatterns,
      recommendations,
      appliedChanges: [],
      createdAt: Date.now(),
    };
  }

  /**
   * Calculate performance metrics
   */
  private calculateMetrics(trades: Trade[]): CritiqueMetrics {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.pnl !== undefined);
    
    if (closedTrades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        expectancy: 0,
        avgRMultiple: 0,
        avgHoldingTimeMs: 0,
        stopHitRate: 0,
        takeProfitHitRate: 0,
        avgSlippage: 0,
        maxDrawdown: 0,
      };
    }

    const wins = closedTrades.filter(t => (t.pnl ?? 0) > 0);
    const losses = closedTrades.filter(t => (t.pnl ?? 0) <= 0);

    const winRate = (wins.length / closedTrades.length) * 100;

    // Calculate average win and loss
    const avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + (t.pnl ?? 0), 0) / wins.length 
      : 0;
    const avgLoss = losses.length > 0 
      ? Math.abs(losses.reduce((sum, t) => sum + (t.pnl ?? 0), 0) / losses.length)
      : 0;

    // Expectancy = (Win% * Avg Win) - (Loss% * Avg Loss)
    const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

    // Average R-multiple (profit / risk)
    const rMultiples = closedTrades.map(t => {
      if (!t.stopLoss || !t.entryPrice || !t.pnl) return 0;
      const risk = Math.abs(t.entryPrice - t.stopLoss) * t.quantity;
      return risk > 0 ? t.pnl / risk : 0;
    });
    const avgRMultiple = rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length;

    // Average holding time
    const holdingTimes = closedTrades
      .filter(t => t.exitTime && t.entryTime)
      .map(t => (t.exitTime ?? 0) - t.entryTime);
    const avgHoldingTimeMs = holdingTimes.length > 0
      ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length
      : 0;

    // Stop hit rate (trades that hit stop loss)
    const stopHits = closedTrades.filter(t => {
      if (!t.stopLoss || !t.exitPrice) return false;
      if (t.side === 'buy') {
        return t.exitPrice <= t.stopLoss;
      } else {
        return t.exitPrice >= t.stopLoss;
      }
    });
    const stopHitRate = (stopHits.length / closedTrades.length) * 100;

    // Take profit hit rate
    const tpHits = closedTrades.filter(t => {
      if (!t.takeProfit || !t.exitPrice) return false;
      if (t.side === 'buy') {
        return t.exitPrice >= t.takeProfit;
      } else {
        return t.exitPrice <= t.takeProfit;
      }
    });
    const takeProfitHitRate = (tpHits.length / closedTrades.length) * 100;

    // Calculate max drawdown from equity curve
    let peak = 0;
    let maxDrawdown = 0;
    let cumPnl = 0;
    for (const trade of closedTrades) {
      cumPnl += trade.pnl ?? 0;
      if (cumPnl > peak) peak = cumPnl;
      const drawdown = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      totalTrades: closedTrades.length,
      winRate,
      expectancy,
      avgRMultiple,
      avgHoldingTimeMs,
      stopHitRate,
      takeProfitHitRate,
      avgSlippage: 0, // Would need order data to calculate
      maxDrawdown,
    };
  }

  /**
   * Analyze trades for patterns
   */
  private analyzeTrades(
    trades: Trade[], 
    metrics: CritiqueMetrics
  ): { whatWorked: string[]; whatDidntWork: string[]; failurePatterns: string[] } {
    const whatWorked: string[] = [];
    const whatDidntWork: string[] = [];
    const failurePatterns: string[] = [];

    // Win rate analysis
    if (metrics.winRate >= 50) {
      whatWorked.push(`Win rate of ${metrics.winRate.toFixed(1)}% is above breakeven`);
    } else {
      whatDidntWork.push(`Win rate of ${metrics.winRate.toFixed(1)}% is below 50%`);
    }

    // R-multiple analysis
    if (metrics.avgRMultiple >= 1) {
      whatWorked.push(`Average R-multiple of ${metrics.avgRMultiple.toFixed(2)} shows good risk/reward`);
    } else if (metrics.avgRMultiple < 0.5) {
      whatDidntWork.push(`Average R-multiple of ${metrics.avgRMultiple.toFixed(2)} is poor`);
    }

    // Stop loss analysis
    if (metrics.stopHitRate > 60) {
      failurePatterns.push(`High stop hit rate (${metrics.stopHitRate.toFixed(1)}%) - stops may be too tight`);
    }

    // Take profit analysis
    if (metrics.takeProfitHitRate < 20 && metrics.winRate > 40) {
      failurePatterns.push(`Low TP hit rate (${metrics.takeProfitHitRate.toFixed(1)}%) - may be exiting too early`);
    }

    // Holding time analysis
    const avgHoldingHours = metrics.avgHoldingTimeMs / (1000 * 60 * 60);
    if (avgHoldingHours < 1) {
      failurePatterns.push(`Very short holding time (${avgHoldingHours.toFixed(1)}h) - may be overtrading`);
    }

    // Expectancy analysis
    if (metrics.expectancy > 0) {
      whatWorked.push(`Positive expectancy of $${metrics.expectancy.toFixed(2)} per trade`);
    } else {
      whatDidntWork.push(`Negative expectancy of $${metrics.expectancy.toFixed(2)} per trade`);
    }

    // Consecutive losses pattern
    const closedTrades = trades.filter(t => t.status === 'closed');
    let maxConsecutiveLosses = 0;
    let currentLosses = 0;
    for (const trade of closedTrades) {
      if ((trade.pnl ?? 0) < 0) {
        currentLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
      } else {
        currentLosses = 0;
      }
    }
    if (maxConsecutiveLosses >= 3) {
      failurePatterns.push(`${maxConsecutiveLosses} consecutive losses detected`);
    }

    return { whatWorked, whatDidntWork, failurePatterns };
  }

  /**
   * Generate parameter change recommendations
   * Only recommends changes within whitelisted bounds
   */
  private generateRecommendations(
    metrics: CritiqueMetrics,
    analysis: { whatWorked: string[]; whatDidntWork: string[]; failurePatterns: string[] }
  ): ParameterChange[] {
    const recommendations: ParameterChange[] = [];

    // High stop hit rate -> widen stops slightly
    if (metrics.stopHitRate > 60) {
      recommendations.push({
        parameter: 'indicators.atr.multiplier',
        previousValue: 2.0,
        newValue: 2.2,
        reason: `High stop hit rate (${metrics.stopHitRate.toFixed(1)}%) suggests stops are too tight`,
        applied: false,
      });
    }

    // Low win rate with good R -> tighten RSI threshold
    if (metrics.winRate < 40 && metrics.avgRMultiple > 0.8) {
      recommendations.push({
        parameter: 'indicators.rsi.overbought',
        previousValue: 70,
        newValue: 72,
        reason: 'Low win rate but decent R suggests being more selective on entries',
        applied: false,
      });
    }

    // Consecutive losses -> increase cooldown
    if (analysis.failurePatterns.some(p => p.includes('consecutive losses'))) {
      recommendations.push({
        parameter: 'risk.cooldownAfterLossMs',
        previousValue: 6 * 60 * 60 * 1000,
        newValue: 7 * 60 * 60 * 1000,
        reason: 'Consecutive losses suggest increasing cooldown period',
        applied: false,
      });
    }

    return recommendations;
  }

  /**
   * Create empty report
   */
  private createEmptyReport(tradeIds: string[]): CritiqueReport {
    return {
      id: uuid(),
      botId: this.botId,
      tradeIds,
      metrics: {
        totalTrades: 0,
        winRate: 0,
        expectancy: 0,
        avgRMultiple: 0,
        avgHoldingTimeMs: 0,
        stopHitRate: 0,
        takeProfitHitRate: 0,
        avgSlippage: 0,
        maxDrawdown: 0,
      },
      whatWorked: [],
      whatDidntWork: ['Not enough trades to analyze'],
      failurePatterns: [],
      recommendations: [],
      appliedChanges: [],
      createdAt: Date.now(),
    };
  }
}
