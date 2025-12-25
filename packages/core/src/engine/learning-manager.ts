import type { 
  BotConfig, 
  CritiqueReport, 
  ParameterChange,
  WHITELISTED_PARAMS 
} from '../types/index.js';

/**
 * Learning Manager
 * Applies safe parameter adjustments based on critique recommendations.
 * Only modifies whitelisted parameters within defined bounds.
 * Supports rollback to previous configurations.
 */

// Whitelisted parameters with bounds
const PARAM_BOUNDS: Record<string, { min: number; max: number; step: number } | { type: 'boolean' }> = {
  'indicators.rsi.overbought': { min: 65, max: 80, step: 2 },
  'indicators.rsi.oversold': { min: 20, max: 35, step: 2 },
  'indicators.atr.multiplier': { min: 1.5, max: 3.0, step: 0.2 },
  'risk.cooldownAfterLossMs': { min: 2 * 60 * 60 * 1000, max: 12 * 60 * 60 * 1000, step: 60 * 60 * 1000 },
};

// Parameters that can NEVER be auto-adjusted (safety)
const FORBIDDEN_PARAMS = [
  'risk.maxLeverage',
  'risk.maxDrawdownPercent',
  'risk.stopLossAtrMultiplier', // Can only be widened, not tightened
];

export interface ConfigSnapshot {
  id: string;
  config: BotConfig;
  critiqueId?: string;
  timestamp: number;
  reason: string;
}

export class LearningManager {
  private botId: string;
  private configHistory: ConfigSnapshot[] = [];
  private currentConfig: BotConfig;

  constructor(botId: string, initialConfig: BotConfig) {
    this.botId = botId;
    this.currentConfig = initialConfig;
    
    // Save initial config as first snapshot
    this.saveSnapshot('Initial configuration');
  }

  /**
   * Apply recommendations from critique report
   * Returns list of actually applied changes
   */
  applyRecommendations(report: CritiqueReport): ParameterChange[] {
    const appliedChanges: ParameterChange[] = [];

    for (const recommendation of report.recommendations) {
      if (this.canApplyChange(recommendation)) {
        const applied = this.applyChange(recommendation);
        if (applied) {
          appliedChanges.push({
            ...recommendation,
            applied: true,
          });
        }
      }
    }

    if (appliedChanges.length > 0) {
      this.saveSnapshot(`Applied ${appliedChanges.length} changes from critique ${report.id}`, report.id);
    }

    return appliedChanges;
  }

  /**
   * Check if a parameter change is allowed
   */
  private canApplyChange(change: ParameterChange): boolean {
    const { parameter, newValue } = change;

    // Check if parameter is forbidden
    if (FORBIDDEN_PARAMS.includes(parameter)) {
      console.log(`[LearningManager] Parameter ${parameter} is forbidden from auto-adjustment`);
      return false;
    }

    // Check if parameter is whitelisted
    const bounds = PARAM_BOUNDS[parameter];
    if (!bounds) {
      console.log(`[LearningManager] Parameter ${parameter} is not whitelisted`);
      return false;
    }

    // Check bounds for numeric parameters
    if ('min' in bounds && typeof newValue === 'number') {
      if (newValue < bounds.min || newValue > bounds.max) {
        console.log(`[LearningManager] Value ${newValue} is outside bounds [${bounds.min}, ${bounds.max}]`);
        return false;
      }
    }

    // Special safety checks
    if (parameter.includes('stopLoss') && typeof newValue === 'number') {
      const currentValue = this.getParameterValue(parameter);
      if (typeof currentValue === 'number' && newValue < currentValue) {
        console.log(`[LearningManager] Cannot tighten stop loss (safety rule)`);
        return false;
      }
    }

    return true;
  }

  /**
   * Apply a single parameter change
   */
  private applyChange(change: ParameterChange): boolean {
    const { parameter, newValue } = change;

    try {
      this.setParameterValue(parameter, newValue);
      console.log(`[LearningManager] Applied: ${parameter} = ${newValue} (was ${change.previousValue})`);
      return true;
    } catch (error) {
      console.error(`[LearningManager] Failed to apply ${parameter}:`, error);
      return false;
    }
  }

  /**
   * Get current value of a parameter
   */
  private getParameterValue(path: string): unknown {
    const parts = path.split('.');
    let current: unknown = this.currentConfig;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Set value of a parameter
   */
  private setParameterValue(path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = this.currentConfig as unknown as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1]!;
    current[lastPart] = value;
  }

  /**
   * Save current config as snapshot
   */
  private saveSnapshot(reason: string, critiqueId?: string): void {
    const snapshot: ConfigSnapshot = {
      id: `snapshot-${Date.now()}`,
      config: JSON.parse(JSON.stringify(this.currentConfig)),
      critiqueId,
      timestamp: Date.now(),
      reason,
    };

    this.configHistory.push(snapshot);

    // Keep only last 20 snapshots
    if (this.configHistory.length > 20) {
      this.configHistory = this.configHistory.slice(-20);
    }
  }

  /**
   * Rollback to previous configuration
   */
  rollback(snapshotId?: string): BotConfig | null {
    if (this.configHistory.length < 2) {
      console.log('[LearningManager] No previous configuration to rollback to');
      return null;
    }

    let targetSnapshot: ConfigSnapshot | undefined;

    if (snapshotId) {
      targetSnapshot = this.configHistory.find(s => s.id === snapshotId);
    } else {
      // Rollback to previous snapshot
      targetSnapshot = this.configHistory[this.configHistory.length - 2];
    }

    if (!targetSnapshot) {
      console.log('[LearningManager] Snapshot not found');
      return null;
    }

    this.currentConfig = JSON.parse(JSON.stringify(targetSnapshot.config));
    this.saveSnapshot(`Rolled back to ${targetSnapshot.id}`);

    console.log(`[LearningManager] Rolled back to snapshot ${targetSnapshot.id}`);
    return this.currentConfig;
  }

  /**
   * Get current configuration
   */
  getConfig(): BotConfig {
    return this.currentConfig;
  }

  /**
   * Get configuration history
   */
  getHistory(): ConfigSnapshot[] {
    return [...this.configHistory];
  }

  /**
   * Get last stable configuration (before any auto-adjustments)
   */
  getLastStableConfig(): BotConfig | null {
    // Find last snapshot without a critiqueId (manual config)
    for (let i = this.configHistory.length - 1; i >= 0; i--) {
      const snapshot = this.configHistory[i];
      if (snapshot && !snapshot.critiqueId) {
        return JSON.parse(JSON.stringify(snapshot.config));
      }
    }
    return null;
  }

  /**
   * Reset to initial configuration
   */
  resetToInitial(): BotConfig | null {
    if (this.configHistory.length === 0) {
      return null;
    }

    const initial = this.configHistory[0];
    if (!initial) {
      return null;
    }

    this.currentConfig = JSON.parse(JSON.stringify(initial.config));
    this.saveSnapshot('Reset to initial configuration');

    return this.currentConfig;
  }

  /**
   * Manually update configuration (creates new snapshot)
   */
  updateConfig(config: BotConfig): void {
    this.currentConfig = config;
    this.saveSnapshot('Manual configuration update');
  }
}
