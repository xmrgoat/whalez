import type { 
  RiskConfig, 
  Position, 
  AccountInfo, 
  Signal,
  Trade 
} from '../types/index.js';

/**
 * Risk Engine
 * Manages position sizing, stop losses, and risk constraints.
 */

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  adjustedQuantity?: number;
  stopLoss?: number;
  takeProfit?: number;
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
}

export class RiskEngine {
  private config: RiskConfig;
  private state: RiskState;
  private peakEquity: number = 0;

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
   * Record a closed trade for risk tracking
   */
  recordTrade(trade: Trade): void {
    if (trade.pnl !== undefined) {
      this.state.dailyPnl += trade.pnl;
      this.state.dailyTrades++;

      if (trade.pnl < 0) {
        this.state.lastLossTime = Date.now();
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
   * Calculate position size based on risk percentage
   */
  calculatePositionSize(entryPrice: number, atr: number): number {
    const riskAmount = this.state.equity * (this.config.maxPositionSizePercent / 100);
    const stopDistance = atr * this.config.stopLossAtrMultiplier;
    
    if (stopDistance <= 0 || entryPrice <= 0) {
      return 0;
    }

    // Position size = Risk Amount / Stop Distance
    const positionSize = riskAmount / stopDistance;

    // Apply leverage limit
    const maxPositionValue = this.state.equity * this.config.maxLeverage;
    const maxQuantity = maxPositionValue / entryPrice;

    return Math.min(positionSize, maxQuantity);
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
