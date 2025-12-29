import type { 
  RiskConfig, 
  Position, 
  AccountInfo, 
  Signal,
  Trade 
} from '../types/index.js';
import { kellyPositionSize, valueAtRisk, volatilityClustering } from '../lib/quant-indicators.js';

/**
 * Risk Engine v2
 * Manages position sizing with Kelly Criterion, VaR, and advanced risk constraints.
 */

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  adjustedQuantity?: number;
  stopLoss?: number;
  takeProfit?: number;
  kellyFraction?: number;
  riskScore?: number;
}

export interface RiskState {
  equity: number;
  availableBalance: number;
  openPositions: number;
  currentDrawdown: number;
  maxDrawdown: number;
  lastLossTime?: number;
  dailyPnl: number;
  dailyTrades: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  recentReturns: number[];
}

export interface TradeHistory {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
}

export class RiskEngine {
  private config: RiskConfig;
  private state: RiskState;
  private peakEquity: number = 0;

  private tradeHistory: TradeHistory = { winRate: 0.5, avgWin: 0, avgLoss: 0, totalTrades: 0 };

  constructor(config: RiskConfig, initialEquity: number = 10000) {
    this.config = config;
    this.state = {
      equity: initialEquity,
      availableBalance: initialEquity,
      openPositions: 0,
      currentDrawdown: 0,
      maxDrawdown: 0,
      dailyPnl: 0,
      dailyTrades: 0,
      consecutiveLosses: 0,
      consecutiveWins: 0,
      recentReturns: [],
    };
    this.peakEquity = initialEquity;
  }

  /**
   * Update risk configuration
   */
  updateConfig(config: RiskConfig): void {
    this.config = config;
  }

  /**
   * Update risk state from account info
   */
  updateState(account: AccountInfo, positions: Position[]): void {
    this.state.equity = account.equity;
    this.state.availableBalance = account.availableBalance;
    this.state.openPositions = positions.length;

    // Update peak equity and drawdown
    if (account.equity > this.peakEquity) {
      this.peakEquity = account.equity;
    }

    this.state.currentDrawdown = this.peakEquity > 0
      ? ((this.peakEquity - account.equity) / this.peakEquity) * 100
      : 0;

    if (this.state.currentDrawdown > this.state.maxDrawdown) {
      this.state.maxDrawdown = this.state.currentDrawdown;
    }
  }

  /**
   * Record a closed trade for risk tracking and update trade history
   */
  recordTrade(trade: Trade): void {
    if (trade.pnl !== undefined) {
      this.state.dailyPnl += trade.pnl;
      this.state.dailyTrades++;

      // Track consecutive wins/losses
      if (trade.pnl < 0) {
        this.state.lastLossTime = Date.now();
        this.state.consecutiveLosses++;
        this.state.consecutiveWins = 0;
      } else if (trade.pnl > 0) {
        this.state.consecutiveWins++;
        this.state.consecutiveLosses = 0;
      }

      // Track returns for VaR calculation
      if (trade.pnlPercent !== undefined) {
        this.state.recentReturns.push(trade.pnlPercent / 100);
        if (this.state.recentReturns.length > 100) {
          this.state.recentReturns.shift();
        }
      }

      // Update trade history for Kelly Criterion
      this.updateTradeHistory(trade);
    }
  }

  /**
   * Update trade history statistics for Kelly Criterion
   */
  private updateTradeHistory(trade: Trade): void {
    const isWin = (trade.pnl || 0) > 0;
    const pnlAbs = Math.abs(trade.pnl || 0);

    this.tradeHistory.totalTrades++;
    
    if (isWin) {
      const prevWins = this.tradeHistory.winRate * (this.tradeHistory.totalTrades - 1);
      this.tradeHistory.winRate = (prevWins + 1) / this.tradeHistory.totalTrades;
      
      // Update average win (exponential moving average)
      if (this.tradeHistory.avgWin === 0) {
        this.tradeHistory.avgWin = pnlAbs;
      } else {
        this.tradeHistory.avgWin = this.tradeHistory.avgWin * 0.9 + pnlAbs * 0.1;
      }
    } else {
      const prevWins = this.tradeHistory.winRate * (this.tradeHistory.totalTrades - 1);
      this.tradeHistory.winRate = prevWins / this.tradeHistory.totalTrades;
      
      // Update average loss
      if (this.tradeHistory.avgLoss === 0) {
        this.tradeHistory.avgLoss = pnlAbs;
      } else {
        this.tradeHistory.avgLoss = this.tradeHistory.avgLoss * 0.9 + pnlAbs * 0.1;
      }
    }
  }

  /**
   * Reset daily stats (call at start of each day)
   */
  resetDailyStats(): void {
    this.state.dailyPnl = 0;
    this.state.dailyTrades = 0;
  }

  /**
   * Check if a new trade is allowed based on risk rules
   */
  checkTradeAllowed(signal: Signal, currentPrice: number, atr: number): RiskCheckResult {
    // Check max drawdown
    if (this.state.currentDrawdown >= this.config.maxDrawdownPercent) {
      return {
        allowed: false,
        reason: `Max drawdown reached (${this.state.currentDrawdown.toFixed(2)}% >= ${this.config.maxDrawdownPercent}%)`,
      };
    }

    // Check max open positions
    if (this.state.openPositions >= this.config.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Max open positions reached (${this.state.openPositions} >= ${this.config.maxOpenPositions})`,
      };
    }

    // Check cooldown after loss
    if (this.state.lastLossTime) {
      const timeSinceLoss = Date.now() - this.state.lastLossTime;
      if (timeSinceLoss < this.config.cooldownAfterLossMs) {
        const remainingMs = this.config.cooldownAfterLossMs - timeSinceLoss;
        const remainingHours = (remainingMs / (1000 * 60 * 60)).toFixed(1);
        return {
          allowed: false,
          reason: `Cooldown active after loss (${remainingHours}h remaining)`,
        };
      }
    }

    // Calculate position size
    const positionSize = this.calculatePositionSize(currentPrice, atr);
    if (positionSize <= 0) {
      return {
        allowed: false,
        reason: 'Calculated position size is zero or negative',
      };
    }

    // Calculate stop loss and take profit
    const stopLoss = this.calculateStopLoss(signal.action, currentPrice, atr);
    const takeProfit = this.calculateTakeProfit(signal.action, currentPrice, atr);

    return {
      allowed: true,
      adjustedQuantity: positionSize,
      stopLoss,
      takeProfit,
    };
  }

  /**
   * Calculate position size using Kelly Criterion and risk adjustments
   */
  calculatePositionSize(entryPrice: number, atr: number, volatilityRatio?: number): number {
    if (entryPrice <= 0 || atr <= 0) return 0;

    // Base position size from config
    let baseRiskPct = this.config.maxPositionSizePercent / 100;

    // Apply Kelly Criterion if we have enough trade history
    if (this.tradeHistory.totalTrades >= 20 && this.tradeHistory.avgLoss > 0) {
      const kellyFraction = kellyPositionSize(
        this.tradeHistory.winRate,
        this.tradeHistory.avgWin,
        this.tradeHistory.avgLoss,
        0.25 // Use quarter Kelly for safety
      );
      
      // Blend Kelly with base risk (50/50)
      if (kellyFraction > 0) {
        baseRiskPct = (baseRiskPct + kellyFraction) / 2;
      }
    }

    // Reduce position after consecutive losses
    const lossReduction = Math.pow(0.8, Math.min(this.state.consecutiveLosses, 5));
    baseRiskPct *= lossReduction;

    // Reduce position in high volatility
    if (volatilityRatio && volatilityRatio > 1.5) {
      baseRiskPct *= 0.7; // Reduce 30% in high vol
    }

    // Apply VaR constraint if we have return history
    if (this.state.recentReturns.length >= 20) {
      const var95 = valueAtRisk(this.state.recentReturns, 0.95);
      const maxRiskFromVaR = var95 > 0 ? 0.02 / var95 : 1; // Target max 2% VaR
      baseRiskPct = Math.min(baseRiskPct, maxRiskFromVaR);
    }

    const riskAmount = this.state.equity * baseRiskPct;
    const stopDistance = atr * this.config.stopLossAtrMultiplier;
    
    if (stopDistance <= 0) return 0;

    // Position size = Risk Amount / Stop Distance
    const positionSize = riskAmount / stopDistance;

    // Apply leverage limit
    const maxPositionValue = this.state.equity * this.config.maxLeverage;
    const maxQuantity = maxPositionValue / entryPrice;

    return Math.min(positionSize, maxQuantity);
  }

  /**
   * Get Kelly fraction for current trade history
   */
  getKellyFraction(): number {
    if (this.tradeHistory.totalTrades < 10 || this.tradeHistory.avgLoss <= 0) {
      return 0;
    }
    return kellyPositionSize(
      this.tradeHistory.winRate,
      this.tradeHistory.avgWin,
      this.tradeHistory.avgLoss,
      0.25
    );
  }

  /**
   * Get current VaR (95% confidence)
   */
  getVaR95(): number {
    if (this.state.recentReturns.length < 10) return 0;
    return valueAtRisk(this.state.recentReturns, 0.95) * 100;
  }

  /**
   * Get trade history statistics
   */
  getTradeHistory(): TradeHistory {
    return { ...this.tradeHistory };
  }

  /**
   * Calculate stop loss price
   */
  calculateStopLoss(action: string, entryPrice: number, atr: number): number {
    const stopDistance = atr * this.config.stopLossAtrMultiplier;

    if (action === 'long') {
      return entryPrice - stopDistance;
    } else if (action === 'short') {
      return entryPrice + stopDistance;
    }

    return 0;
  }

  /**
   * Calculate take profit price (optional)
   */
  calculateTakeProfit(action: string, entryPrice: number, atr: number): number | undefined {
    if (!this.config.takeProfitAtrMultiplier) {
      return undefined;
    }

    const tpDistance = atr * this.config.takeProfitAtrMultiplier;

    if (action === 'long') {
      return entryPrice + tpDistance;
    } else if (action === 'short') {
      return entryPrice - tpDistance;
    }

    return undefined;
  }

  /**
   * Check if position should be closed due to risk
   */
  checkPositionRisk(position: Position, currentPrice: number): { shouldClose: boolean; reason?: string } {
    // Check if max drawdown exceeded
    if (this.state.currentDrawdown >= this.config.maxDrawdownPercent) {
      return {
        shouldClose: true,
        reason: 'Max drawdown exceeded - closing all positions',
      };
    }

    return { shouldClose: false };
  }

  /**
   * Get current risk state
   */
  getState(): RiskState {
    return { ...this.state };
  }

  /**
   * Get risk configuration
   */
  getConfig(): RiskConfig {
    return { ...this.config };
  }

  /**
   * Check if bot should be stopped due to risk
   */
  shouldStopBot(): { stop: boolean; reason?: string } {
    if (this.state.currentDrawdown >= this.config.maxDrawdownPercent) {
      return {
        stop: true,
        reason: `Max drawdown exceeded: ${this.state.currentDrawdown.toFixed(2)}%`,
      };
    }

    return { stop: false };
  }
}
