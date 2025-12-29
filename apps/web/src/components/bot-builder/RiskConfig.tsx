'use client';

import { 
  Shield, 
  Target, 
  TrendingDown, 
  Percent,
  DollarSign,
  AlertTriangle,
  Info
} from 'lucide-react';
import { RiskManagement } from './types';

interface RiskConfigProps {
  config: RiskManagement;
  onChange: (updates: Partial<RiskManagement>) => void;
}

export function RiskConfig({ config, onChange }: RiskConfigProps) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Risk Management</h2>
        <p className="text-white/50">Configure position sizing and risk parameters</p>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Position Sizing */}
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Target className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Position Sizing</h3>
              <p className="text-sm text-white/40">How much to allocate per trade</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(['fixed', 'percentage', 'risk_based'] as const).map(type => (
              <button
                key={type}
                onClick={() => onChange({ positionSizeType: type })}
                className={`p-4 rounded-xl text-center transition-all ${
                  config.positionSizeType === type
                    ? 'bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-400'
                    : 'bg-white/5 border border-white/10 text-white/60 hover:border-white/20'
                }`}
              >
                <div className="font-medium capitalize mb-1">
                  {type.replace('_', ' ')}
                </div>
                <div className="text-xs text-white/40">
                  {type === 'fixed' && 'Fixed USD amount'}
                  {type === 'percentage' && '% of portfolio'}
                  {type === 'risk_based' && 'Based on risk %'}
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-sm text-white/50">
                {config.positionSizeType === 'fixed' ? 'Amount (USD)' : 'Percentage'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={config.positionSize}
                  onChange={(e) => onChange({ positionSize: parseFloat(e.target.value) })}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white pr-12 focus:outline-none focus:border-emerald-500/50"
                  min={0}
                  step={config.positionSizeType === 'fixed' ? 100 : 1}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">
                  {config.positionSizeType === 'fixed' ? '$' : '%'}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-2">
              <label className="text-sm text-white/50">Max Positions</label>
              <input
                type="number"
                value={config.maxPositions}
                onChange={(e) => onChange({ maxPositions: parseInt(e.target.value) })}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
                min={1}
                max={10}
              />
            </div>
          </div>
        </div>

        {/* Take Profit & Stop Loss */}
        <div className="grid grid-cols-2 gap-4">
          {/* Take Profit */}
          <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-emerald-400 rotate-180" />
              </div>
              <div>
                <h3 className="font-semibold text-emerald-400">Take Profit</h3>
                <p className="text-xs text-white/40">Close at profit target</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Target</span>
                <span className="text-emerald-400 font-semibold">{config.takeProfitPct}%</span>
              </div>
              <input
                type="range"
                value={config.takeProfitPct}
                onChange={(e) => onChange({ takeProfitPct: parseFloat(e.target.value) })}
                min={0.5}
                max={20}
                step={0.5}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-white/30">
                <span>0.5%</span>
                <span>20%</span>
              </div>
            </div>
          </div>

          {/* Stop Loss */}
          <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-red-400">Stop Loss</h3>
                <p className="text-xs text-white/40">Close at loss limit</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Limit</span>
                <span className="text-red-400 font-semibold">{config.stopLossPct}%</span>
              </div>
              <input
                type="range"
                value={config.stopLossPct}
                onChange={(e) => onChange({ stopLossPct: parseFloat(e.target.value) })}
                min={0.5}
                max={10}
                step={0.5}
                className="w-full accent-red-500"
              />
              <div className="flex justify-between text-xs text-white/30">
                <span>0.5%</span>
                <span>10%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trailing Stop */}
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Percent className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Trailing Stop</h3>
                <p className="text-sm text-white/40">Lock in profits as price moves</p>
              </div>
            </div>

            <button
              onClick={() => onChange({ trailingStopEnabled: !config.trailingStopEnabled })}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                config.trailingStopEnabled
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-white/5 text-white/40 border border-white/10'
              }`}
            >
              {config.trailingStopEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {config.trailingStopEnabled && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Trail Distance</span>
                <span className="text-amber-400 font-semibold">{config.trailingStopPct}%</span>
              </div>
              <input
                type="range"
                value={config.trailingStopPct}
                onChange={(e) => onChange({ trailingStopPct: parseFloat(e.target.value) })}
                min={0.5}
                max={5}
                step={0.1}
                className="w-full accent-amber-500"
              />
            </div>
          )}
        </div>

        {/* Risk Limits */}
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Risk Limits</h3>
              <p className="text-sm text-white/40">Maximum loss thresholds</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm text-white/50">Max Drawdown</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={config.maxDrawdown}
                  onChange={(e) => onChange({ maxDrawdown: parseFloat(e.target.value) })}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
                  min={5}
                  max={50}
                />
                <span className="text-white/40">%</span>
              </div>
              <p className="text-xs text-white/30">Stop trading if portfolio drops by this %</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-white/50">Daily Loss Limit</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={config.dailyLossLimit}
                  onChange={(e) => onChange({ dailyLossLimit: parseFloat(e.target.value) })}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
                  min={1}
                  max={20}
                />
                <span className="text-white/40">%</span>
              </div>
              <p className="text-xs text-white/30">Stop trading for the day after this loss</p>
            </div>
          </div>
        </div>

        {/* Risk/Reward Info */}
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
          <Info className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm text-emerald-400 font-medium mb-1">
              Risk/Reward Ratio: {(config.takeProfitPct / config.stopLossPct).toFixed(2)}:1
            </div>
            <p className="text-xs text-white/50">
              With a {config.stopLossPct}% stop loss and {config.takeProfitPct}% take profit, 
              you need a win rate of at least {((1 / (1 + config.takeProfitPct / config.stopLossPct)) * 100).toFixed(0)}% to be profitable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
