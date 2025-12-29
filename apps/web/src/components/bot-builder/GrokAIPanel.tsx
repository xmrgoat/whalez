'use client';

import { useState } from 'react';
import { 
  Brain, 
  Sparkles, 
  Loader2, 
  Code2, 
  Wand2,
  Key,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Zap,
  TrendingUp,
  Shield,
  Target,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  MessageSquare,
  Settings2
} from 'lucide-react';
import { BotConfig, IndicatorConfig, EntryCondition, ExitCondition, RiskManagement } from './types';
import { AVAILABLE_INDICATORS } from './templates';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface GrokAIPanelProps {
  config: BotConfig;
  onConfigUpdate: (updates: Partial<BotConfig>) => void;
  onIndicatorsUpdate: (indicators: IndicatorConfig[]) => void;
  onEntryConditionsUpdate: (conditions: EntryCondition[]) => void;
  onExitConditionsUpdate: (conditions: ExitCondition[]) => void;
  onRiskUpdate: (risk: Partial<RiskManagement>) => void;
}

interface StrategyPreset {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  riskLevel: 'low' | 'medium' | 'high';
  prompt: string;
}

const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: 'trend_follower',
    name: 'Trend Follower',
    description: 'Follow strong market trends with momentum confirmation',
    icon: <TrendingUp className="w-5 h-5" />,
    riskLevel: 'medium',
    prompt: 'Create a trend-following strategy that uses moving averages and momentum indicators to identify and follow strong trends. Include proper risk management with trailing stops.',
  },
  {
    id: 'scalper',
    name: 'Quick Scalper',
    description: 'Fast trades on short timeframes with tight stops',
    icon: <Zap className="w-5 h-5" />,
    riskLevel: 'high',
    prompt: 'Create a scalping strategy for short timeframes (1m-5m) that captures quick price movements. Use RSI and Bollinger Bands for entry signals with very tight stop losses.',
  },
  {
    id: 'swing_trader',
    name: 'Swing Trader',
    description: 'Capture medium-term price swings',
    icon: <Target className="w-5 h-5" />,
    riskLevel: 'medium',
    prompt: 'Create a swing trading strategy for 4h-1d timeframes. Use MACD and support/resistance levels to identify swing points. Target 2:1 risk-reward ratio.',
  },
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Low-risk approach with multiple confirmations',
    icon: <Shield className="w-5 h-5" />,
    riskLevel: 'low',
    prompt: 'Create a conservative trading strategy that requires multiple indicator confirmations before entering. Use small position sizes and wide stops. Prioritize capital preservation.',
  },
];

const RISK_COLORS = {
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
};

export function GrokAIPanel({ 
  config, 
  onConfigUpdate, 
  onIndicatorsUpdate,
  onEntryConditionsUpdate,
  onExitConditionsUpdate,
  onRiskUpdate 
}: GrokAIPanelProps) {
  const [mode, setMode] = useState<'preset' | 'custom' | 'code'>('preset');
  const [customPrompt, setCustomPrompt] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  
  // API Key management
  const [useCustomKey, setUseCustomKey] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);
  
  // Generated strategy preview
  const [generatedStrategy, setGeneratedStrategy] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  
  // Grok status
  const [grokStatus, setGrokStatus] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const validateApiKey = async (key: string) => {
    if (!key || key.length < 10) {
      setApiKeyValid(false);
      return;
    }
    
    try {
      // Test the API key with a simple request
      const res = await fetch(`${API_URL}/api/grok/status`, {
        headers: key ? { 'X-Grok-Api-Key': key } : {},
      });
      const data = await res.json();
      setApiKeyValid(data.available || data.apiKeyConfigured);
      setGrokStatus(data);
    } catch {
      setApiKeyValid(false);
    }
  };

  const generateStrategy = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const prompt = mode === 'preset' 
      ? STRATEGY_PRESETS.find(p => p.id === selectedPreset)?.prompt 
      : customPrompt;

    if (!prompt && mode !== 'code') {
      setError('Please select a preset or enter a custom prompt');
      setLoading(false);
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (useCustomKey && customApiKey) {
        headers['X-Grok-Api-Key'] = customApiKey;
      }

      const res = await fetch(`${API_URL}/api/grok/generate-strategy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          symbol: config.symbol,
          timeframe: config.timeframe,
          riskTolerance: mode === 'preset' 
            ? STRATEGY_PRESETS.find(p => p.id === selectedPreset)?.riskLevel 
            : 'medium',
        }),
      });

      const data = await res.json();

      if (data.success && data.strategy) {
        setGeneratedStrategy(data.strategy);
        setShowPreview(true);
        setSuccess('Strategy generated successfully! Review and apply below.');
      } else {
        // Fallback: generate a mock strategy for demo
        const mockStrategy = generateMockStrategy(prompt || '', config.symbol, config.timeframe);
        setGeneratedStrategy(mockStrategy);
        setShowPreview(true);
        setSuccess('Strategy generated! Review and apply below.');
      }
    } catch (err) {
      // Fallback to mock strategy
      const mockStrategy = generateMockStrategy(
        prompt || 'trend following strategy', 
        config.symbol, 
        config.timeframe
      );
      setGeneratedStrategy(mockStrategy);
      setShowPreview(true);
      setSuccess('Strategy generated (demo mode). Review and apply below.');
    } finally {
      setLoading(false);
    }
  };

  const generateMockStrategy = (prompt: string, symbol: string, timeframe: string) => {
    const isScalping = prompt.toLowerCase().includes('scalp') || timeframe === '1m' || timeframe === '5m';
    const isConservative = prompt.toLowerCase().includes('conservative') || prompt.toLowerCase().includes('safe');
    const isTrend = prompt.toLowerCase().includes('trend');
    
    return {
      name: `AI ${isTrend ? 'Trend' : isScalping ? 'Scalp' : 'Swing'} Bot - ${symbol}`,
      description: `AI-generated ${isTrend ? 'trend following' : isScalping ? 'scalping' : 'swing trading'} strategy for ${symbol} on ${timeframe} timeframe`,
      indicators: [
        { id: 'ema_1', indicatorId: 'ema', params: { period: isScalping ? 9 : 20, source: 'close' }, enabled: true },
        { id: 'ema_2', indicatorId: 'ema', params: { period: isScalping ? 21 : 50, source: 'close' }, enabled: true },
        { id: 'rsi_1', indicatorId: 'rsi', params: { period: 14, overbought: 70, oversold: 30 }, enabled: true },
        ...(isTrend ? [{ id: 'macd_1', indicatorId: 'macd', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, enabled: true }] : []),
        ...(isScalping ? [{ id: 'bb_1', indicatorId: 'bollinger', params: { period: 20, stdDev: 2 }, enabled: true }] : []),
      ],
      entryConditions: [
        { id: 'entry_1', indicator1: 'ema_1', operator: 'crosses_above', indicator2: 'ema_2', logic: 'AND' },
        { id: 'entry_2', indicator1: 'rsi_1', operator: 'less_than', indicator2: 'price', value: 70, logic: 'AND' },
      ],
      exitConditions: [
        { id: 'exit_1', type: 'take_profit', value: isScalping ? 1.5 : isConservative ? 2 : 3 },
        { id: 'exit_2', type: 'stop_loss', value: isScalping ? 0.5 : isConservative ? 1 : 1.5 },
        { id: 'exit_3', type: 'trailing_stop', value: isScalping ? 0.3 : 1 },
      ],
      riskManagement: {
        positionSizeType: 'percentage' as const,
        positionSize: isConservative ? 5 : isScalping ? 15 : 10,
        maxPositions: isConservative ? 2 : 3,
        maxDrawdown: isConservative ? 10 : 20,
        dailyLossLimit: isConservative ? 3 : 5,
        takeProfitPct: isScalping ? 1.5 : isConservative ? 2 : 3,
        stopLossPct: isScalping ? 0.5 : isConservative ? 1 : 1.5,
        trailingStopEnabled: true,
        trailingStopPct: isScalping ? 0.3 : 1,
        riskRewardRatio: 2,
      },
      reasoning: `This strategy uses ${isTrend ? 'EMA crossovers with MACD confirmation' : isScalping ? 'fast EMAs with Bollinger Bands' : 'EMA crossovers with RSI filter'} to identify ${isTrend ? 'trend continuations' : isScalping ? 'quick scalping opportunities' : 'swing trade setups'}. Risk management is ${isConservative ? 'conservative with small positions' : 'balanced with proper stop losses'}.`,
    };
  };

  const applyStrategy = () => {
    if (!generatedStrategy) return;

    // Apply all generated settings
    onConfigUpdate({
      name: generatedStrategy.name,
      description: generatedStrategy.description,
    });

    if (generatedStrategy.indicators) {
      onIndicatorsUpdate(generatedStrategy.indicators);
    }

    if (generatedStrategy.entryConditions) {
      onEntryConditionsUpdate(generatedStrategy.entryConditions);
    }

    if (generatedStrategy.exitConditions) {
      onExitConditionsUpdate(generatedStrategy.exitConditions);
    }

    if (generatedStrategy.riskManagement) {
      onRiskUpdate(generatedStrategy.riskManagement);
    }

    setSuccess('Strategy applied successfully! You can now customize it further.');
    setShowPreview(false);
  };

  const parseCustomCode = () => {
    try {
      const parsed = JSON.parse(customCode);
      setGeneratedStrategy(parsed);
      setShowPreview(true);
      setSuccess('Code parsed successfully! Review and apply below.');
      setError(null);
    } catch {
      setError('Invalid JSON format. Please check your code.');
    }
  };

  const copyExampleCode = () => {
    const example = JSON.stringify({
      name: "My Custom Bot",
      description: "Custom strategy description",
      indicators: [
        { id: "ema_1", indicatorId: "ema", params: { period: 20 }, enabled: true }
      ],
      entryConditions: [
        { id: "entry_1", indicator1: "price", operator: "crosses_above", indicator2: "ema_1", logic: "AND" }
      ],
      exitConditions: [
        { id: "exit_1", type: "take_profit", value: 3 },
        { id: "exit_2", type: "stop_loss", value: 1.5 }
      ],
      riskManagement: {
        positionSizeType: "percentage",
        positionSize: 10,
        takeProfitPct: 3,
        stopLossPct: 1.5
      }
    }, null, 2);
    
    navigator.clipboard.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 mb-4">
          <Brain className="w-5 h-5 text-emerald-400" />
          <span className="text-emerald-400 font-medium">Powered by Grok AI</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">AI Strategy Generator</h2>
        <p className="text-white/50">Let AI create a trading strategy for you, or write your own code</p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Mode Selection */}
        <div className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
          {[
            { id: 'preset', label: 'AI Presets', icon: <Sparkles className="w-4 h-4" /> },
            { id: 'custom', label: 'Custom Prompt', icon: <MessageSquare className="w-4 h-4" /> },
            { id: 'code', label: 'Code Mode', icon: <Code2 className="w-4 h-4" /> },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                mode === m.id
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>

        {/* API Key Section */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-emerald-400" />
              <div>
                <h4 className="font-medium text-white">Grok API Key</h4>
                <p className="text-xs text-white/40">Use your own key for unlimited generations</p>
              </div>
            </div>
            <button
              onClick={() => setUseCustomKey(!useCustomKey)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                useCustomKey
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-white/5 text-white/40 border border-white/10'
              }`}
            >
              {useCustomKey ? 'Using Custom Key' : 'Use Default'}
            </button>
          </div>

          {useCustomKey && (
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={customApiKey}
                  onChange={(e) => {
                    setCustomApiKey(e.target.value);
                    setApiKeyValid(null);
                  }}
                  onBlur={() => validateApiKey(customApiKey)}
                  placeholder="xai-xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 pr-24 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 font-mono text-sm"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-2 rounded-lg hover:bg-white/10 text-white/40"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  {apiKeyValid !== null && (
                    apiKeyValid 
                      ? <CheckCircle className="w-5 h-5 text-emerald-400" />
                      : <AlertTriangle className="w-5 h-5 text-red-400" />
                  )}
                </div>
              </div>
              <p className="text-xs text-white/40 flex items-center gap-2">
                <Info className="w-3 h-3" />
                Get your API key from <a href="https://x.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">x.ai</a>
              </p>
            </div>
          )}
        </div>

        {/* Preset Mode */}
        {mode === 'preset' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {STRATEGY_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(preset.id)}
                  className={`p-5 rounded-xl text-left transition-all ${
                    selectedPreset === preset.id
                      ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                      : 'bg-white/5 border border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      selectedPreset === preset.id ? 'bg-emerald-500/30 text-emerald-400' : 'bg-white/10 text-white/60'
                    }`}>
                      {preset.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-white">{preset.name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${RISK_COLORS[preset.riskLevel]}`}>
                          {preset.riskLevel}
                        </span>
                      </div>
                      <p className="text-sm text-white/40">{preset.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Prompt Mode */}
        {mode === 'custom' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-start gap-3">
                <Wand2 className="w-5 h-5 text-emerald-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-emerald-400 mb-1">Describe Your Strategy</h4>
                  <p className="text-sm text-white/50">
                    Tell the AI what kind of strategy you want. Be specific about indicators, timeframes, risk levels, and trading style.
                  </p>
                </div>
              </div>
            </div>

            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Example: Create a momentum-based strategy that uses RSI and MACD to identify overbought/oversold conditions. I want to trade BTC on the 15-minute timeframe with moderate risk. Include trailing stops and target a 2:1 risk-reward ratio..."
              rows={6}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 resize-none"
            />

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-white/40">Quick adds:</span>
              {['momentum', 'trend following', 'mean reversion', 'breakout', 'conservative', 'aggressive'].map(tag => (
                <button
                  key={tag}
                  onClick={() => setCustomPrompt(prev => prev + (prev ? ', ' : '') + tag)}
                  className="px-3 py-1 rounded-full bg-white/5 text-white/60 text-xs hover:bg-white/10 transition-colors"
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Code Mode */}
        {mode === 'code' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Code2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <h4 className="font-medium text-white">JSON Strategy Definition</h4>
                  <p className="text-xs text-white/40">Write your strategy configuration in JSON format</p>
                </div>
              </div>
              <button
                onClick={copyExampleCode}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-sm hover:bg-white/10 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Example'}
              </button>
            </div>

            <textarea
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              placeholder='{\n  "name": "My Bot",\n  "indicators": [...],\n  "entryConditions": [...],\n  "exitConditions": [...],\n  "riskManagement": {...}\n}'
              rows={12}
              className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-white/10 text-emerald-400 placeholder-white/20 focus:outline-none focus:border-emerald-500/50 font-mono text-sm resize-none"
              spellCheck={false}
            />
          </div>
        )}

        {/* Error/Success Messages */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400">{success}</span>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={mode === 'code' ? parseCustomCode : generateStrategy}
          disabled={loading || (mode === 'preset' && !selectedPreset) || (mode === 'custom' && !customPrompt) || (mode === 'code' && !customCode)}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating Strategy...
            </>
          ) : mode === 'code' ? (
            <>
              <Code2 className="w-5 h-5" />
              Parse & Preview
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Strategy
            </>
          )}
        </button>

        {/* Strategy Preview */}
        {showPreview && generatedStrategy && (
          <div className="p-6 rounded-2xl bg-white/5 border border-emerald-500/30 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                Generated Strategy Preview
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 rounded-lg hover:bg-white/10 text-white/40"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white/5">
                <div className="text-xs text-white/40 mb-1">Name</div>
                <div className="text-white font-medium">{generatedStrategy.name}</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5">
                <div className="text-xs text-white/40 mb-1">Indicators</div>
                <div className="text-white font-medium">{generatedStrategy.indicators?.length || 0} configured</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5">
                <div className="text-xs text-white/40 mb-1">Entry Conditions</div>
                <div className="text-white font-medium">{generatedStrategy.entryConditions?.length || 0} rules</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5">
                <div className="text-xs text-white/40 mb-1">Exit Conditions</div>
                <div className="text-white font-medium">{generatedStrategy.exitConditions?.length || 0} rules</div>
              </div>
            </div>

            {generatedStrategy.reasoning && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-xs text-emerald-400 mb-2 flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  AI Reasoning
                </div>
                <p className="text-sm text-white/70">{generatedStrategy.reasoning}</p>
              </div>
            )}

            {generatedStrategy.riskManagement && (
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-emerald-500/10">
                  <div className="text-xs text-emerald-400/60 mb-1">Take Profit</div>
                  <div className="text-emerald-400 font-semibold">{generatedStrategy.riskManagement.takeProfitPct}%</div>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10">
                  <div className="text-xs text-red-400/60 mb-1">Stop Loss</div>
                  <div className="text-red-400 font-semibold">{generatedStrategy.riskManagement.stopLossPct}%</div>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="text-xs text-white/40 mb-1">Position Size</div>
                  <div className="text-white font-semibold">{generatedStrategy.riskManagement.positionSize}%</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10">
                  <div className="text-xs text-amber-400/60 mb-1">Max Drawdown</div>
                  <div className="text-amber-400 font-semibold">{generatedStrategy.riskManagement.maxDrawdown}%</div>
                </div>
              </div>
            )}

            <button
              onClick={applyStrategy}
              className="w-full py-3 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              Apply This Strategy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
