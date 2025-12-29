'use client';

import { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, Plus, Trash2, Briefcase } from 'lucide-react';
import { useSymbols } from '@/hooks/useSymbols';

interface BotConfig {
  botName: string; // Custom bot name
  tradingBag: string[]; // Array of symbols (max 5)
  leverage: number;
  dynamicLeverage: boolean; // Let Grok choose leverage based on market conditions
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxDrawdownPct: number;
  minConfirmations: number;
  tradingMode: 'conservative' | 'moderate' | 'aggressive';
  paperTrading: boolean;
  // Advanced algorithmic settings
  enableTrailingStop: boolean;
  trailingStopActivation: number; // Activate at X% profit
  trailingStopDistance: number;   // Trail by X%
  useSmartSLTP: boolean;          // Use ATR-based dynamic SL/TP
  maxSimultaneousPositions: number;
  enableSessionFilter: boolean;   // Respect trading session hours
  // Advanced analysis settings
  enableFundingAnalysis: boolean;     // Use funding rate for signals
  enableOpenInterestAnalysis: boolean; // Use OI for signals
  enableLiquidationAnalysis: boolean;  // Use liquidation heatmap
  enableMultiTimeframe: boolean;       // Use multi-timeframe confluence
  enableDynamicSizing: boolean;        // Auto-adapt to wallet size
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BotConfig;
  onSave: (config: BotConfig) => void;
}

// Fallback symbols if API is not available
const FALLBACK_SYMBOLS = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'XRP-PERP', 'BNB-PERP', 'DOGE-PERP'];

const MAX_BAG_SIZE = 5;

export default function SettingsModal({ isOpen, onClose, config, onSave }: SettingsModalProps) {
  // Load symbols dynamically from Hyperliquid
  const { symbols: availableSymbols } = useSymbols();
  const [formData, setFormData] = useState<BotConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // Only reset form when modal opens (not on every config change)
  useEffect(() => {
    if (isOpen && !wasOpen) {
      setFormData(config);
      setHasChanges(false);
    }
    setWasOpen(isOpen);
  }, [isOpen]);

  const handleChange = (field: keyof BotConfig, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display text-lg">Bot Settings</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
          {/* Bot Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Bot Name</label>
            <input
              type="text"
              value={formData.botName || 'Whalez Bot'}
              onChange={(e) => handleChange('botName', e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Enter your bot's name"
              maxLength={30}
              className="w-full px-3 py-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">Give your bot a unique name (max 30 characters)</p>
          </div>

          {/* Trading Bag - Multi-pair selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Trading Bag
              </label>
              <span className="text-xs text-muted-foreground">
                {(formData.tradingBag || []).length}/{MAX_BAG_SIZE} pairs
              </span>
            </div>
            
            {/* Selected pairs */}
            <div className="flex flex-wrap gap-2">
              {(formData.tradingBag || []).map((symbol: string) => (
                <div 
                  key={symbol}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary/20 border border-primary/50 rounded-lg text-sm"
                >
                  <span className="font-mono">{symbol}</span>
                  <button
                    onClick={() => {
                      const newBag = (formData.tradingBag || []).filter((s: string) => s !== symbol);
                      handleChange('tradingBag', newBag);
                    }}
                    className="text-muted-foreground hover:text-danger transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              
              {(formData.tradingBag || []).length === 0 && (
                <p className="text-sm text-muted-foreground italic">No pairs selected. Add up to 5 pairs.</p>
              )}
            </div>
            
            {/* Add pair dropdown */}
            {(formData.tradingBag || []).length < MAX_BAG_SIZE && (
              <div className="flex gap-2">
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !(formData.tradingBag || []).includes(e.target.value)) {
                      handleChange('tradingBag', [...(formData.tradingBag || []), e.target.value]);
                    }
                  }}
                >
                  <option value="" disabled>Add a trading pair...</option>
                  {availableSymbols.filter((s: string) => !(formData.tradingBag || []).includes(s)).map((s: string) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground">
              Select up to 5 pairs. Grok will analyze and trade all selected pairs based on your trading mode.
            </p>
          </div>

          {/* Trading Mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Trading Mode</label>
            <div className="flex gap-2">
              {(['conservative', 'moderate', 'aggressive'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => handleChange('tradingMode', mode)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                    formData.tradingMode === mode
                      ? mode === 'aggressive' 
                        ? 'bg-red-500 text-white border-red-500'
                        : mode === 'moderate'
                        ? 'bg-yellow-500 text-black border-yellow-500'
                        : 'bg-green-500 text-white border-green-500'
                      : 'bg-muted border-border hover:border-muted-foreground'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              {formData.tradingMode === 'conservative' && (
                <>
                  <p>🎯 5+ signals aligned, swing trading mode</p>
                  <p>📊 Uses all 12 indicators with strict confluence</p>
                  <p>⏱️ Max 3 trades/day, 2min analysis interval</p>
                  <p>💰 Target: 3% TP, 1.5% SL, 2:1 R:R</p>
                </>
              )}
              {formData.tradingMode === 'moderate' && (
                <>
                  <p>🎯 4+ signals aligned, intraday mode</p>
                  <p>📊 Balanced indicator weighting</p>
                  <p>⏱️ Max 8 trades/day, 30s analysis interval</p>
                  <p>💰 Target: 1.5% TP, 0.8% SL, 1.8:1 R:R</p>
                </>
              )}
              {formData.tradingMode === 'aggressive' && (
                <>
                  <p>🎯 3+ signals aligned, scalping mode</p>
                  <p>📊 Uses RSI, MACD, StochRSI, Bollinger Bands</p>
                  <p>⏱️ Up to 15 trades/day, 10s analysis interval</p>
                  <p>💰 Target: 0.5% TP, 0.3% SL, 1.5:1 R:R</p>
                </>
              )}
            </div>
          </div>

          {/* Algorithmic Engine Info */}
          <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg space-y-2">
            <h3 className="text-sm font-medium text-blue-400 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Algorithmic Engine v3.0
            </h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>🔬 <strong>12 Technical Indicators:</strong> RSI, MACD, StochRSI, Bollinger, CCI, ADX, Williams %R, EMA Stack</p>
              <p>📈 <strong>Confluence System:</strong> Requires {formData.tradingMode === 'aggressive' ? '3+' : formData.tradingMode === 'moderate' ? '4+' : '5+'} aligned signals</p>
              <p>🧠 <strong>Smart SL/TP:</strong> ATR-based dynamic levels adjusted to volatility</p>
              <p>📊 <strong>Order Book:</strong> Real-time buy/sell pressure analysis</p>
              <p>🤖 <strong>Grok AI:</strong> Macro news & sentiment only (saves credits)</p>
            </div>
          </div>

          {/* Risk Parameters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Risk Parameters
            </h3>

            {/* Dynamic Leverage Toggle */}
            <div className="flex items-center justify-between p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <div>
                <div className="font-medium text-purple-400">Dynamic Leverage (AI)</div>
                <div className="text-xs text-muted-foreground">
                  Let Grok choose leverage based on volatility & market conditions
                </div>
              </div>
              <button
                onClick={() => handleChange('dynamicLeverage', !formData.dynamicLeverage)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  formData.dynamicLeverage ? 'bg-purple-500' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    formData.dynamicLeverage ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  {formData.dynamicLeverage ? 'Max Leverage (AI limit)' : 'Fixed Leverage'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.leverage}
                  onChange={(e) => handleChange('leverage', Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-yellow-500">⚠️ Max leverage varies by pair (BTC: 50x, alts: 20-40x)</p>
                {formData.dynamicLeverage && (
                  <p className="text-xs text-purple-400">AI will use 1x-{formData.leverage}x based on conditions</p>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Position Size %</label>
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={formData.positionSizePct}
                  onChange={(e) => handleChange('positionSizePct', Math.max(0.1, parseFloat(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Stop Loss %</label>
                <input
                  type="number"
                  min="0.1"
                  max="50"
                  step="0.1"
                  value={formData.stopLossPct}
                  onChange={(e) => handleChange('stopLossPct', Math.max(0.1, parseFloat(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Take Profit %</label>
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={formData.takeProfitPct}
                  onChange={(e) => handleChange('takeProfitPct', Math.max(0.1, parseFloat(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Max Drawdown %</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.maxDrawdownPct}
                  onChange={(e) => handleChange('maxDrawdownPct', Math.max(1, parseFloat(e.target.value) || 5))}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Max Positions</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={formData.maxSimultaneousPositions || 3}
                  onChange={(e) => handleChange('maxSimultaneousPositions', Math.max(1, Math.min(5, parseInt(e.target.value) || 3)))}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Advanced Algorithmic Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="text-lg">⚙️</span>
              Advanced Settings
            </h3>

            {/* Smart SL/TP Toggle */}
            <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div>
                <div className="font-medium text-green-400">Smart SL/TP (ATR-based)</div>
                <div className="text-xs text-muted-foreground">
                  Dynamically adjust SL/TP based on volatility & support/resistance
                </div>
              </div>
              <button
                onClick={() => handleChange('useSmartSLTP', !(formData.useSmartSLTP ?? true))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  (formData.useSmartSLTP ?? true) ? 'bg-green-500' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    (formData.useSmartSLTP ?? true) ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Trailing Stop Settings */}
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-orange-400">Trailing Stop</div>
                  <div className="text-xs text-muted-foreground">
                    Lock in profits as price moves in your favor
                  </div>
                </div>
                <button
                  onClick={() => handleChange('enableTrailingStop', !(formData.enableTrailingStop ?? true))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    (formData.enableTrailingStop ?? true) ? 'bg-orange-500' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      (formData.enableTrailingStop ?? true) ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>
              
              {(formData.enableTrailingStop ?? true) && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-orange-500/20">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Activate at % profit</label>
                    <input
                      type="number"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={formData.trailingStopActivation || (formData.tradingMode === 'aggressive' ? 0.3 : formData.tradingMode === 'moderate' ? 0.8 : 1.5)}
                      onChange={(e) => handleChange('trailingStopActivation', Math.max(0.1, parseFloat(e.target.value) || 0.5))}
                      className="w-full px-2 py-1.5 rounded text-sm bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Trail distance %</label>
                    <input
                      type="number"
                      min="0.05"
                      max="5"
                      step="0.05"
                      value={formData.trailingStopDistance || (formData.tradingMode === 'aggressive' ? 0.15 : formData.tradingMode === 'moderate' ? 0.4 : 0.8)}
                      onChange={(e) => handleChange('trailingStopDistance', Math.max(0.05, parseFloat(e.target.value) || 0.2))}
                      className="w-full px-2 py-1.5 rounded text-sm bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Session Filter Toggle */}
            <div className="flex items-center justify-between p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <div>
                <div className="font-medium text-cyan-400">Session Filter</div>
                <div className="text-xs text-muted-foreground">
                  Avoid trading during low liquidity hours (Asian session, weekends)
                </div>
              </div>
              <button
                onClick={() => handleChange('enableSessionFilter', !(formData.enableSessionFilter ?? true))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  (formData.enableSessionFilter ?? true) ? 'bg-cyan-500' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    (formData.enableSessionFilter ?? true) ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Advanced Analysis Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="text-lg">🔬</span>
              Advanced Analysis (Quant)
            </h3>

            {/* Dynamic Wallet Sizing */}
            <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <div>
                <div className="font-medium text-emerald-400">Dynamic Wallet Sizing</div>
                <div className="text-xs text-muted-foreground">
                  Auto-adapt position size based on wallet balance ($26 → $1000+)
                </div>
              </div>
              <button
                onClick={() => handleChange('enableDynamicSizing', !(formData.enableDynamicSizing ?? true))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  (formData.enableDynamicSizing ?? true) ? 'bg-emerald-500' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    (formData.enableDynamicSizing ?? true) ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Funding Rate Analysis */}
            <div className="flex items-center justify-between p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg">
              <div>
                <div className="font-medium text-violet-400">Funding Rate Strategy</div>
                <div className="text-xs text-muted-foreground">
                  Exploit extreme funding rates (contrarian signals)
                </div>
              </div>
              <button
                onClick={() => handleChange('enableFundingAnalysis', !(formData.enableFundingAnalysis ?? true))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  (formData.enableFundingAnalysis ?? true) ? 'bg-violet-500' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    (formData.enableFundingAnalysis ?? true) ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Open Interest Analysis */}
            <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div>
                <div className="font-medium text-amber-400">Open Interest Analysis</div>
                <div className="text-xs text-muted-foreground">
                  Detect overleveraged positions & squeeze potential
                </div>
              </div>
              <button
                onClick={() => handleChange('enableOpenInterestAnalysis', !(formData.enableOpenInterestAnalysis ?? true))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  (formData.enableOpenInterestAnalysis ?? true) ? 'bg-amber-500' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    (formData.enableOpenInterestAnalysis ?? true) ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Liquidation Heatmap */}
            <div className="flex items-center justify-between p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg">
              <div>
                <div className="font-medium text-rose-400">Liquidation Heatmap</div>
                <div className="text-xs text-muted-foreground">
                  Identify liquidation zones (magnet effect)
                </div>
              </div>
              <button
                onClick={() => handleChange('enableLiquidationAnalysis', !(formData.enableLiquidationAnalysis ?? true))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  (formData.enableLiquidationAnalysis ?? true) ? 'bg-rose-500' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    (formData.enableLiquidationAnalysis ?? true) ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Multi-Timeframe Confluence */}
            <div className="flex items-center justify-between p-3 bg-sky-500/10 border border-sky-500/30 rounded-lg">
              <div>
                <div className="font-medium text-sky-400">Multi-Timeframe Confluence</div>
                <div className="text-xs text-muted-foreground">
                  Align signals across 1m, 5m, 15m, 1h timeframes
                </div>
              </div>
              <button
                onClick={() => handleChange('enableMultiTimeframe', !(formData.enableMultiTimeframe ?? true))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  (formData.enableMultiTimeframe ?? true) ? 'bg-sky-500' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    (formData.enableMultiTimeframe ?? true) ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Info box */}
            <div className="p-3 bg-gradient-to-r from-violet-500/10 to-emerald-500/10 border border-violet-500/20 rounded-lg">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>💰 <strong>Wallet Tiers:</strong> Micro ($0-50), Small ($50-200), Medium ($200-1K), Standard ($1K-5K), Pro ($5K+)</p>
                <p>📊 <strong>Funding:</strong> High positive = short signal, High negative = long signal</p>
                <p>🎯 <strong>OI + Liquidations:</strong> Detect squeeze setups & cascade risks</p>
                <p>⏱️ <strong>MTF:</strong> 75%+ timeframe alignment = strong signal</p>
              </div>
            </div>
          </div>

          {/* Paper Trading Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <div className="font-medium">Paper Trading</div>
              <div className="text-sm text-muted-foreground">
                Simulate trades without real money
              </div>
            </div>
            <button
              onClick={() => handleChange('paperTrading', !formData.paperTrading)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                formData.paperTrading ? 'bg-success' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  formData.paperTrading ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!hasChanges}
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
