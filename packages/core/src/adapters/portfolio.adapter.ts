import type { AccountInfo, Position } from '../types/index.js';

/**
 * Portfolio metrics for tracking performance
 */
export interface PortfolioMetrics {
  equity: number;
  availableMargin: number;
  usedMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  drawdown: number;
  maxDrawdown: number;
  sharpeRatio?: number;
  winRate?: number;
  profitFactor?: number;
  timestamp: number;
}

/**
 * PortfolioAdapter Interface (Optional)
 * Provides aggregated portfolio metrics and performance tracking.
 */
export interface PortfolioAdapter {
  readonly name: string;

  /**
   * Get current portfolio metrics
   */
  getMetrics(): Promise<PortfolioMetrics>;

  /**
   * Get historical equity curve
   */
  getEquityCurve(from: number, to: number): Promise<Array<{ timestamp: number; equity: number }>>;

  /**
   * Calculate drawdown from peak
   */
  calculateDrawdown(): Promise<{ current: number; max: number; peak: number }>;

  /**
   * Get portfolio summary
   */
  getSummary(): Promise<{
    account: AccountInfo;
    positions: Position[];
    metrics: PortfolioMetrics;
  }>;
}

/**
 * Base implementation that wraps ExecutionAdapter
 */
export abstract class BasePortfolioAdapter implements PortfolioAdapter {
  abstract readonly name: string;

  protected equityHistory: Array<{ timestamp: number; equity: number }> = [];
  protected peakEquity = 0;
  protected maxDrawdown = 0;

  abstract getMetrics(): Promise<PortfolioMetrics>;
  abstract getEquityCurve(from: number, to: number): Promise<Array<{ timestamp: number; equity: number }>>;
  abstract getSummary(): Promise<{
    account: AccountInfo;
    positions: Position[];
    metrics: PortfolioMetrics;
  }>;

  async calculateDrawdown(): Promise<{ current: number; max: number; peak: number }> {
    const metrics = await this.getMetrics();
    const currentEquity = metrics.equity;

    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
    }

    const currentDrawdown = this.peakEquity > 0 
      ? ((this.peakEquity - currentEquity) / this.peakEquity) * 100 
      : 0;

    if (currentDrawdown > this.maxDrawdown) {
      this.maxDrawdown = currentDrawdown;
    }

    return {
      current: currentDrawdown,
      max: this.maxDrawdown,
      peak: this.peakEquity,
    };
  }

  protected recordEquity(equity: number): void {
    this.equityHistory.push({
      timestamp: Date.now(),
      equity,
    });

    // Keep only last 30 days of data
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.equityHistory = this.equityHistory.filter(e => e.timestamp > thirtyDaysAgo);
  }
}
