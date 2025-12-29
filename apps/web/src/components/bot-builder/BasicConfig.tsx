'use client';

import { useState } from 'react';
import { 
  Bot, 
  FileText, 
  Coins, 
  Clock, 
  ChevronDown,
  Search,
  Check
} from 'lucide-react';
import { BotConfig, TIMEFRAMES, SYMBOLS } from './types';

interface BasicConfigProps {
  config: BotConfig;
  onChange: (updates: Partial<BotConfig>) => void;
}

export function BasicConfig({ config, onChange }: BasicConfigProps) {
  const [symbolSearch, setSymbolSearch] = useState('');
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);

  const filteredSymbols = SYMBOLS.filter(s => 
    s.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Configure Your Bot</h2>
        <p className="text-white/50">Set up the basic parameters for your trading bot</p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Bot Name */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-white/70">
            <Bot className="w-4 h-4" />
            Bot Name
          </label>
          <input
            type="text"
            value={config.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="My Trading Bot"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-white/70">
            <FileText className="w-4 h-4" />
            Description (optional)
          </label>
          <textarea
            value={config.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Describe your bot's strategy..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
          />
        </div>

        {/* Symbol & Timeframe */}
        <div className="grid grid-cols-2 gap-4">
          {/* Symbol */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-white/70">
              <Coins className="w-4 h-4" />
              Trading Pair
            </label>
            <div className="relative">
              <button
                onClick={() => setShowSymbolDropdown(!showSymbolDropdown)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white flex items-center justify-between hover:border-white/20 transition-all"
              >
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{config.symbol}</span>
                  <span className="text-white/40">/USDT</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${showSymbolDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showSymbolDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 p-2 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-xl max-h-64 overflow-hidden">
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      value={symbolSearch}
                      onChange={(e) => setSymbolSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto max-h-44 space-y-1">
                    {filteredSymbols.map(symbol => (
                      <button
                        key={symbol}
                        onClick={() => {
                          onChange({ symbol });
                          setShowSymbolDropdown(false);
                          setSymbolSearch('');
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left flex items-center justify-between transition-colors ${
                          config.symbol === symbol 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'hover:bg-white/5 text-white'
                        }`}
                      >
                        <span>{symbol}/USDT</span>
                        {config.symbol === symbol && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeframe */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-white/70">
              <Clock className="w-4 h-4" />
              Timeframe
            </label>
            <div className="grid grid-cols-4 gap-2">
              {TIMEFRAMES.slice(0, 4).map(tf => (
                <button
                  key={tf.value}
                  onClick={() => onChange({ timeframe: tf.value })}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    config.timeframe === tf.value
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/20'
                  }`}
                >
                  {tf.value}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIMEFRAMES.slice(4).map(tf => (
                <button
                  key={tf.value}
                  onClick={() => onChange({ timeframe: tf.value })}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    config.timeframe === tf.value
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/20'
                  }`}
                >
                  {tf.value}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
          <h3 className="text-sm font-semibold text-white/70">Advanced Settings</h3>
          
          <div className="grid grid-cols-3 gap-4">
            {/* Leverage */}
            <div className="space-y-2">
              <label className="text-xs text-white/50">Leverage</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={config.leverage}
                  onChange={(e) => onChange({ leverage: parseInt(e.target.value) })}
                  className="flex-1 accent-emerald-500"
                />
                <span className="text-sm font-semibold text-white w-8">{config.leverage}x</span>
              </div>
            </div>

            {/* Margin Type */}
            <div className="space-y-2">
              <label className="text-xs text-white/50">Margin Type</label>
              <div className="flex gap-2">
                {(['cross', 'isolated'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => onChange({ marginType: type })}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                      config.marginType === type
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/20'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Order Type */}
            <div className="space-y-2">
              <label className="text-xs text-white/50">Order Type</label>
              <div className="flex gap-2">
                {(['market', 'limit'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => onChange({ orderType: type })}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                      config.orderType === type
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/20'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
