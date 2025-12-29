'use client';

import { useState } from 'react';
import { 
  Rocket, 
  Loader2, 
  CheckCircle, 
  AlertTriangle,
  Shield,
  Zap,
  Clock,
  DollarSign,
  Info,
  ExternalLink
} from 'lucide-react';
import { BotConfig, BacktestResult } from './types';

interface DeployPanelProps {
  config: BotConfig;
  backtestResult: BacktestResult | null;
  walletAddress: string;
  onDeploy: () => Promise<{ success: boolean; botId?: string; error?: string }>;
}

export function DeployPanel({ config, backtestResult, walletAddress, onDeploy }: DeployPanelProps) {
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botId, setBotId] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const handleDeploy = async () => {
    if (!agreed) {
      setError('Please agree to the terms before deploying');
      return;
    }

    setDeploying(true);
    setError(null);

    try {
      const result = await onDeploy();
      if (result.success && result.botId) {
        setDeployed(true);
        setBotId(result.botId);
      } else {
        setError(result.error || 'Failed to deploy bot');
      }
    } catch (err) {
      setError('Deployment failed');
      console.error(err);
    } finally {
      setDeploying(false);
    }
  };

  const isReady = config.name && config.indicators.length > 0;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Deploy Your Bot</h2>
        <p className="text-white/50">Review and launch your trading bot</p>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Deployment Success */}
        {deployed && botId && (
          <div className="p-8 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-emerald-400 mb-2">Bot Deployed Successfully!</h3>
            <p className="text-white/50 mb-6">Your bot is now ready. You can start it from your dashboard.</p>
            <a
              href={`/bots/${botId}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
            >
              View Bot Dashboard
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {!deployed && (
          <>
            {/* Bot Summary */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{config.name || 'Unnamed Bot'}</h3>
                  <p className="text-white/40">{config.description || 'No description'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-white/10">
                <div>
                  <div className="text-xs text-white/40 mb-1">Symbol</div>
                  <div className="text-white font-semibold">{config.symbol}/USDT</div>
                </div>
                <div>
                  <div className="text-xs text-white/40 mb-1">Timeframe</div>
                  <div className="text-white font-semibold">{config.timeframe}</div>
                </div>
                <div>
                  <div className="text-xs text-white/40 mb-1">Leverage</div>
                  <div className="text-white font-semibold">{config.leverage}x</div>
                </div>
                <div>
                  <div className="text-xs text-white/40 mb-1">Indicators</div>
                  <div className="text-white font-semibold">{config.indicators.filter(i => i.enabled).length}</div>
                </div>
              </div>
            </div>

            {/* Risk Summary */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Risk Configuration
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="text-xs text-white/40 mb-1">Position Size</div>
                  <div className="text-white font-semibold">
                    {config.riskManagement.positionSize}
                    {config.riskManagement.positionSizeType === 'fixed' ? '$' : '%'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10">
                  <div className="text-xs text-emerald-400/60 mb-1">Take Profit</div>
                  <div className="text-emerald-400 font-semibold">{config.riskManagement.takeProfitPct}%</div>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10">
                  <div className="text-xs text-red-400/60 mb-1">Stop Loss</div>
                  <div className="text-red-400 font-semibold">{config.riskManagement.stopLossPct}%</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10">
                  <div className="text-xs text-amber-400/60 mb-1">Max Drawdown</div>
                  <div className="text-amber-400 font-semibold">{config.riskManagement.maxDrawdown}%</div>
                </div>
              </div>
            </div>

            {/* Backtest Results */}
            {backtestResult && (
              <div className={`p-6 rounded-2xl border ${
                backtestResult.sharpeRatio >= 1 
                  ? 'bg-emerald-500/10 border-emerald-500/20' 
                  : 'bg-amber-500/10 border-amber-500/20'
              }`}>
                <h4 className="font-semibold text-white flex items-center gap-2 mb-4">
                  <CheckCircle className={`w-4 h-4 ${backtestResult.sharpeRatio >= 1 ? 'text-emerald-400' : 'text-amber-400'}`} />
                  Backtest Results
                </h4>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-white/40 mb-1">Total PnL</div>
                    <div className={`font-semibold ${backtestResult.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {backtestResult.totalPnl >= 0 ? '+' : ''}${backtestResult.totalPnl.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40 mb-1">Win Rate</div>
                    <div className="text-white font-semibold">{backtestResult.winRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40 mb-1">Sharpe Ratio</div>
                    <div className="text-white font-semibold">{backtestResult.sharpeRatio.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40 mb-1">Max DD</div>
                    <div className="text-amber-400 font-semibold">-{backtestResult.maxDrawdown.toFixed(2)}%</div>
                  </div>
                </div>
              </div>
            )}

            {/* Warning */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm text-amber-400 font-medium mb-1">Trading Risk Warning</div>
                <p className="text-xs text-white/50">
                  Trading cryptocurrencies involves significant risk. Past performance does not guarantee future results. 
                  Only trade with funds you can afford to lose. This bot will execute trades automatically based on your configuration.
                </p>
              </div>
            </div>

            {/* Terms Agreement */}
            <label className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/[0.07] transition-colors">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/20"
              />
              <div className="text-sm text-white/60">
                I understand the risks involved in automated trading and agree that I am solely responsible for any losses. 
                I have reviewed my bot configuration and backtest results.
              </div>
            </label>

            {/* Error */}
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-red-400">{error}</span>
              </div>
            )}

            {/* Deploy Button */}
            <button
              onClick={handleDeploy}
              disabled={deploying || !isReady || !agreed}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              {deploying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Deploying Bot...
                </>
              ) : (
                <>
                  <Rocket className="w-5 h-5" />
                  Deploy Bot
                </>
              )}
            </button>

            {!isReady && (
              <p className="text-center text-sm text-white/40">
                Please complete all required fields before deploying
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
