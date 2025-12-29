'use client';

/**
 * Setup Page - Bot Creation with Templates
 * 
 * Flow: User selects a strategy template, customizes parameters, and creates their bot.
 * Protected: Requires wallet connection.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BionicText from '@/components/BionicText';
import { useWallet } from '@/context/WalletContext';

// Strategy Templates
const TEMPLATES = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Low risk, steady gains. Best for beginners.',
    icon: '🛡️',
    config: {
      symbol: 'BTC-PERP',
      timeframe: '4h',
      leverage: 2,
      positionSizePct: 1,
      stopLossPct: 2,
      takeProfitPct: 4,
      maxDrawdownPct: 5,
      minConfirmations: 4,
    },
    stats: { expectedWinRate: '55-60%', avgTrade: '2-4 days', riskLevel: 'Low' },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Moderate risk with good returns. Recommended.',
    icon: '⚖️',
    config: {
      symbol: 'BTC-PERP',
      timeframe: '1h',
      leverage: 3,
      positionSizePct: 2,
      stopLossPct: 3,
      takeProfitPct: 6,
      maxDrawdownPct: 10,
      minConfirmations: 3,
    },
    stats: { expectedWinRate: '50-55%', avgTrade: '12-24 hours', riskLevel: 'Medium' },
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Higher risk, higher potential. For experienced traders.',
    icon: '🔥',
    config: {
      symbol: 'ETH-PERP',
      timeframe: '15m',
      leverage: 5,
      positionSizePct: 3,
      stopLossPct: 4,
      takeProfitPct: 8,
      maxDrawdownPct: 15,
      minConfirmations: 2,
    },
    stats: { expectedWinRate: '45-50%', avgTrade: '2-6 hours', riskLevel: 'High' },
  },
];

const SYMBOLS = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'ARB-PERP', 'DOGE-PERP'];
const TIMEFRAMES = ['15m', '1h', '4h', '1d'];

export default function SetupPage() {
  const router = useRouter();
  const { wallet, bot, selectBot } = useWallet();
  
  const [step, setStep] = useState<'template' | 'customize' | 'confirm'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null);
  const [config, setConfig] = useState({
    name: '',
    symbol: 'BTC-PERP',
    timeframe: '1h',
    leverage: 3,
    positionSizePct: 2,
    stopLossPct: 3,
    takeProfitPct: 6,
    maxDrawdownPct: 10,
    minConfirmations: 3,
    paperTrading: true,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not connected
  useEffect(() => {
    if (!wallet.isConnected) {
      router.push('/');
    }
  }, [wallet.isConnected, router]);

  // Redirect if bot already selected
  useEffect(() => {
    if (bot.id) {
      router.push('/dashboard');
    }
  }, [bot.id, router]);

  const handleSelectTemplate = (template: typeof TEMPLATES[0]) => {
    setSelectedTemplate(template);
    setConfig(prev => ({
      ...prev,
      ...template.config,
      name: `${template.name} Bot`,
    }));
    setStep('customize');
  };

  const handleCreateBot = async () => {
    setIsCreating(true);
    setError(null);

    try {
      // For now, create a local bot (API integration later)
      const newBot = {
        id: `bot_${Date.now()}`,
        name: config.name || 'My Bot',
        symbol: config.symbol,
        status: 'STOPPED' as const,
      };

      selectBot(newBot);
      router.push('/dashboard');
    } catch (err) {
      setError('Failed to create bot. Please try again.');
      setIsCreating(false);
    }
  };

  if (!wallet.isConnected) {
    return null; // Will redirect
  }

  return (
    <main className="min-h-screen bg-[#F3F3F3] px-6 py-12">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-pixel text-2xl tracking-tight mb-2">
            WHAL<span className="text-neutral-400">EZ</span>
          </h1>
          <p className="text-sm text-neutral-500">
            <BionicText>Configure your trading bot</BionicText>
          </p>
          
          {/* Connected wallet indicator */}
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-neutral-200 rounded-full text-xs">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="font-mono text-neutral-600">
              {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
            </span>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-12">
          {['template', 'customize', 'confirm'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm
                ${step === s ? 'bg-black text-white' : 
                  ['template', 'customize', 'confirm'].indexOf(step) > i ? 'bg-green-500 text-white' : 
                  'bg-neutral-200 text-neutral-500'}
              `}>
                {['template', 'customize', 'confirm'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${step === s ? 'text-black font-medium' : 'text-neutral-400'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {i < 2 && <div className="w-12 h-px bg-neutral-300 mx-2" />}
            </div>
          ))}
        </div>

        {/* Step 1: Template Selection */}
        {step === 'template' && (
          <div className="space-y-6">
            <h2 className="font-pixel text-sm text-center mb-8">
              <BionicText>Choose a Strategy Template</BionicText>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className="group p-6 bg-white border-2 border-neutral-200 hover:border-black transition-all duration-200 rounded-lg text-left"
                >
                  <div className="text-3xl mb-4">{template.icon}</div>
                  <h3 className="font-pixel text-sm mb-2">{template.name.toUpperCase()}</h3>
                  <p className="text-sm text-neutral-600 mb-4">
                    <BionicText>{template.description}</BionicText>
                  </p>
                  
                  <div className="space-y-1 text-xs text-neutral-500">
                    <div className="flex justify-between">
                      <span>Win Rate</span>
                      <span className="font-mono">{template.stats.expectedWinRate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg Trade</span>
                      <span className="font-mono">{template.stats.avgTrade}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Risk</span>
                      <span className={`font-mono ${
                        template.stats.riskLevel === 'Low' ? 'text-green-600' :
                        template.stats.riskLevel === 'Medium' ? 'text-yellow-600' : 'text-red-600'
                      }`}>{template.stats.riskLevel}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-neutral-100 text-center">
                    <span className="text-xs text-neutral-400 group-hover:text-black transition-colors">
                      Click to select →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Customize */}
        {step === 'customize' && selectedTemplate && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setStep('template')}
                className="text-sm text-neutral-500 hover:text-black flex items-center gap-1"
              >
                ← Back
              </button>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{selectedTemplate.icon}</span>
                <span className="font-pixel text-sm">{selectedTemplate.name.toUpperCase()}</span>
              </div>
              <div className="w-16" />
            </div>

            <div className="bg-white border border-neutral-200 rounded-lg p-8">
              <h2 className="font-pixel text-sm mb-6">
                <BionicText>Customize Parameters</BionicText>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Bot Name */}
                <div className="md:col-span-2">
                  <label className="block text-xs text-neutral-500 mb-2">Bot Name</label>
                  <input
                    type="text"
                    value={config.name}
                    onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-lg font-mono text-sm focus:outline-none focus:border-black"
                    placeholder="My Trading Bot"
                  />
                </div>

                {/* Symbol */}
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">Trading Pair</label>
                  <select
                    value={config.symbol}
                    onChange={(e) => setConfig(prev => ({ ...prev, symbol: e.target.value }))}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-lg font-mono text-sm focus:outline-none focus:border-black bg-white"
                  >
                    {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Timeframe */}
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">Timeframe</label>
                  <select
                    value={config.timeframe}
                    onChange={(e) => setConfig(prev => ({ ...prev, timeframe: e.target.value }))}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-lg font-mono text-sm focus:outline-none focus:border-black bg-white"
                  >
                    {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Leverage */}
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">
                    Leverage: <span className="font-mono text-black">{config.leverage}x</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={config.leverage}
                    onChange={(e) => setConfig(prev => ({ ...prev, leverage: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-neutral-400 mt-1">
                    <span>1x</span>
                    <span>10x</span>
                  </div>
                </div>

                {/* Position Size */}
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">
                    Position Size: <span className="font-mono text-black">{config.positionSizePct}%</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={config.positionSizePct}
                    onChange={(e) => setConfig(prev => ({ ...prev, positionSizePct: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-neutral-400 mt-1">
                    <span>1%</span>
                    <span>10%</span>
                  </div>
                </div>

                {/* Stop Loss */}
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">
                    Stop Loss: <span className="font-mono text-red-600">{config.stopLossPct}%</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={config.stopLossPct}
                    onChange={(e) => setConfig(prev => ({ ...prev, stopLossPct: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>

                {/* Take Profit */}
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">
                    Take Profit: <span className="font-mono text-green-600">{config.takeProfitPct}%</span>
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="20"
                    value={config.takeProfitPct}
                    onChange={(e) => setConfig(prev => ({ ...prev, takeProfitPct: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>

                {/* Paper Trading Toggle */}
                <div className="md:col-span-2 flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                  <div>
                    <div className="font-medium text-sm">Paper Trading Mode</div>
                    <div className="text-xs text-neutral-500">
                      <BionicText>Simulate trades without real money. Recommended for testing.</BionicText>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, paperTrading: !prev.paperTrading }))}
                    className={`
                      w-14 h-8 rounded-full transition-colors duration-200 relative
                      ${config.paperTrading ? 'bg-green-500' : 'bg-red-500'}
                    `}
                  >
                    <div className={`
                      absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200
                      ${config.paperTrading ? 'left-7' : 'left-1'}
                    `} />
                  </button>
                </div>
              </div>

              {/* Continue Button */}
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setStep('confirm')}
                  className="px-8 py-3 bg-black text-white font-mono text-sm hover:bg-neutral-800 transition-colors rounded-lg"
                >
                  <BionicText>Continue →</BionicText>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && selectedTemplate && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setStep('customize')}
                className="text-sm text-neutral-500 hover:text-black flex items-center gap-1"
              >
                ← Back
              </button>
              <h2 className="font-pixel text-sm">CONFIRM SETUP</h2>
              <div className="w-16" />
            </div>

            <div className="bg-white border border-neutral-200 rounded-lg p-8">
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-neutral-100">
                <span className="text-4xl">{selectedTemplate.icon}</span>
                <div>
                  <h3 className="font-pixel text-lg">{config.name || 'My Bot'}</h3>
                  <p className="text-sm text-neutral-500">{selectedTemplate.name} Strategy</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="p-4 bg-neutral-50 rounded-lg">
                  <div className="text-xs text-neutral-500 mb-1">Symbol</div>
                  <div className="font-mono font-medium">{config.symbol}</div>
                </div>
                <div className="p-4 bg-neutral-50 rounded-lg">
                  <div className="text-xs text-neutral-500 mb-1">Timeframe</div>
                  <div className="font-mono font-medium">{config.timeframe}</div>
                </div>
                <div className="p-4 bg-neutral-50 rounded-lg">
                  <div className="text-xs text-neutral-500 mb-1">Leverage</div>
                  <div className="font-mono font-medium">{config.leverage}x</div>
                </div>
                <div className="p-4 bg-neutral-50 rounded-lg">
                  <div className="text-xs text-neutral-500 mb-1">Mode</div>
                  <div className={`font-mono font-medium ${config.paperTrading ? 'text-green-600' : 'text-red-600'}`}>
                    {config.paperTrading ? 'Paper' : 'Live'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="text-center p-4 border border-neutral-200 rounded-lg">
                  <div className="text-xs text-neutral-500 mb-1">Position Size</div>
                  <div className="font-mono text-lg">{config.positionSizePct}%</div>
                </div>
                <div className="text-center p-4 border border-red-200 rounded-lg bg-red-50">
                  <div className="text-xs text-red-600 mb-1">Stop Loss</div>
                  <div className="font-mono text-lg text-red-600">-{config.stopLossPct}%</div>
                </div>
                <div className="text-center p-4 border border-green-200 rounded-lg bg-green-50">
                  <div className="text-xs text-green-600 mb-1">Take Profit</div>
                  <div className="font-mono text-lg text-green-600">+{config.takeProfitPct}%</div>
                </div>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleCreateBot}
                disabled={isCreating}
                className="w-full py-4 bg-black text-white font-mono text-sm hover:bg-neutral-800 transition-colors rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <BionicText>Creating Bot...</BionicText>
                  </>
                ) : (
                  <BionicText>🚀 Launch Bot & Go to Dashboard</BionicText>
                )}
              </button>

              <p className="text-center text-xs text-neutral-400 mt-4">
                <BionicText>You can change these settings later from the dashboard.</BionicText>
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
