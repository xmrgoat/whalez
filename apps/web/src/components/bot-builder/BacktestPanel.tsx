'use client';

import { useState } from 'react';
import { 
  Play, 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  BarChart3,
  Target,
  Clock,
  Percent,
  DollarSign,
  Activity,
  AlertTriangle,
  CheckCircle,
  Calendar
} from 'lucide-react';
import { BotConfig, BacktestResult } from './types';

interface BacktestPanelProps {
  config: BotConfig;
  onBacktestComplete: (result: BacktestResult) => void;
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

export function BacktestPanel({ config, onBacktestComplete }: BacktestPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');

  const runBacktest = async () => {
    setLoading(true);
    setError(null);

    try {
      // Convert period to timestamps
      const periodMs: Record<string, number> = {
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000,
        '180d': 180 * 24 * 60 * 60 * 1000,
        '1y': 365 * 24 * 60 * 60 * 1000,
      };
      const endTime = Date.now();
      const startTime = endTime - (periodMs[period] || periodMs['30d']);

      const res = await fetch(`${API_URL}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: config.symbol,
          interval: config.timeframe,
          startTime,
          endTime,
          strategy: config.strategyType || 'improved_bot',
          initialCapital: 1000,
          positionSizePct: config.riskManagement.positionSize,
          maxLeverage: config.leverage,
          stopLossPct: config.riskManagement.stopLossPct,
          takeProfitPct: config.riskManagement.takeProfitPct,
          enableTrailingStop: config.riskManagement.trailingStopEnabled,
          trailingStopPct: config.riskManagement.trailingStopPct,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Map API response to our BacktestResult format
        const mappedResult: BacktestResult = {
          totalPnl: data.metrics.totalReturn,
          totalPnlPct: data.metrics.totalReturnPct,
          winRate: data.metrics.winRate,
          totalTrades: data.metrics.totalTrades,
          winningTrades: data.metrics.winningTrades,
          losingTrades: data.metrics.losingTrades,
          maxDrawdown: data.metrics.maxDrawdownPct,
          sharpeRatio: data.metrics.sharpeRatio,
          sortinoRatio: data.metrics.sortinoRatio || 0,
          profitFactor: data.metrics.profitFactor,
          avgWin: data.metrics.avgWin,
          avgLoss: data.metrics.avgLoss,
          largestWin: data.metrics.largestWin || data.metrics.avgWin * 2,
          largestLoss: data.metrics.largestLoss || data.metrics.avgLoss * 2,
          avgHoldingTime: data.metrics.avgHoldingTime || '0h',
          trades: data.trades || [],
          equityCurve: data.equityCurve || [],
        };
        setResult(mappedResult);
        onBacktestComplete(mappedResult);
      } else {
        setError(data.error || 'Backtest failed');
      }
    } catch (err) {
      setError('Failed to run backtest');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Backtest Your Strategy</h2>
        <p className="text-white/50">Test your bot against historical data before going live</p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Config Summary */}
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-semibold text-white/70 mb-4">Strategy Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-white/40 mb-1">Symbol</div>
              <div className="text-white font-semibold">{config.symbol}/USDT</div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-1">Timeframe</div>
              <div className="text-white font-semibold">{config.timeframe}</div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-1">Indicators</div>
              <div className="text-white font-semibold">{config.indicators.filter(i => i.enabled).length}</div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-1">Leverage</div>
              <div className="text-white font-semibold">{config.leverage}x</div>
            </div>
          </div>
        </div>

        {/* Backtest Period */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-white/50">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">Period:</span>
          </div>
          <div className="flex gap-2">
            {['7d', '30d', '90d', '180d', '1y'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  period === p
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/20'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Run Button */}
        {!result && (
          <button
            onClick={runBacktest}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Running Backtest...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Run Backtest
              </>
            )}
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Main Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 text-white/40 text-sm mb-2">
                  <DollarSign className="w-4 h-4" />
                  Total PnL
                </div>
                <div className={`text-2xl font-bold ${result.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.totalPnl >= 0 ? '+' : ''}${result.totalPnl.toFixed(2)}
                </div>
                <div className={`text-sm ${result.totalPnlPct >= 0 ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                  {result.totalPnlPct >= 0 ? '+' : ''}{result.totalPnlPct.toFixed(2)}%
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 text-white/40 text-sm mb-2">
                  <Target className="w-4 h-4" />
                  Win Rate
                </div>
                <div className="text-2xl font-bold text-white">{result.winRate.toFixed(1)}%</div>
                <div className="text-sm text-white/40">
                  {result.winningTrades}W / {result.losingTrades}L
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 text-white/40 text-sm mb-2">
                  <TrendingDown className="w-4 h-4" />
                  Max Drawdown
                </div>
                <div className="text-2xl font-bold text-amber-400">-{result.maxDrawdown.toFixed(2)}%</div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 text-white/40 text-sm mb-2">
                  <Activity className="w-4 h-4" />
                  Sharpe Ratio
                </div>
                <div className={`text-2xl font-bold ${result.sharpeRatio >= 1 ? 'text-emerald-400' : result.sharpeRatio >= 0 ? 'text-white' : 'text-red-400'}`}>
                  {result.sharpeRatio.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <div className="text-xs text-white/40 mb-1">Total Trades</div>
                <div className="text-lg font-semibold text-white">{result.totalTrades}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <div className="text-xs text-white/40 mb-1">Profit Factor</div>
                <div className="text-lg font-semibold text-white">{result.profitFactor.toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <div className="text-xs text-white/40 mb-1">Avg Win</div>
                <div className="text-lg font-semibold text-emerald-400">+${result.avgWin.toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <div className="text-xs text-white/40 mb-1">Avg Loss</div>
                <div className="text-lg font-semibold text-red-400">-${result.avgLoss.toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <div className="text-xs text-white/40 mb-1">Largest Win</div>
                <div className="text-lg font-semibold text-emerald-400">+${result.largestWin.toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <div className="text-xs text-white/40 mb-1">Largest Loss</div>
                <div className="text-lg font-semibold text-red-400">-${result.largestLoss.toFixed(2)}</div>
              </div>
            </div>

            {/* Performance Grade */}
            <div className={`p-6 rounded-2xl border ${
              result.sharpeRatio >= 1.5 && result.winRate >= 50
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : result.sharpeRatio >= 0.5
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-red-500/10 border-red-500/20'
            }`}>
              <div className="flex items-center gap-4">
                {result.sharpeRatio >= 1.5 && result.winRate >= 50 ? (
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-amber-400" />
                )}
                <div>
                  <h4 className="font-semibold text-white mb-1">
                    {result.sharpeRatio >= 1.5 && result.winRate >= 50
                      ? 'Strategy looks promising!'
                      : result.sharpeRatio >= 0.5
                        ? 'Strategy needs optimization'
                        : 'Strategy may be risky'
                    }
                  </h4>
                  <p className="text-sm text-white/50">
                    {result.sharpeRatio >= 1.5 && result.winRate >= 50
                      ? 'Your strategy shows good risk-adjusted returns. Consider deploying with small position sizes first.'
                      : result.sharpeRatio >= 0.5
                        ? 'Try adjusting your entry/exit conditions or risk parameters to improve performance.'
                        : 'This strategy may result in significant losses. Review your conditions carefully.'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Re-run Button */}
            <button
              onClick={() => setResult(null)}
              className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all"
            >
              Run Another Backtest
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
