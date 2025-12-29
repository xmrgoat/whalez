'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Play, BarChart3, TrendingUp, TrendingDown, 
  Calendar, DollarSign, Target, AlertTriangle, Activity,
  RefreshCw, Clock, BarChart2, LineChart, Database, Zap,
  CheckCircle, Info, CandlestickChart, History, Trash2, Eye
} from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Strategy { name: string; label: string; description: string; params: Record<string, number>; }
interface BacktestTrade { id: number; entryTime: number; exitTime: number; side: 'long' | 'short'; entryPrice: number; exitPrice: number; quantity: number; pnl: number; pnlPct: number; fees: number; netPnl: number; exitReason: string; holdingBars: number; }
interface EquityPoint { timestamp: number; equity: number; drawdown: number; drawdownPct: number; }
interface BacktestMetrics { totalReturn: number; totalReturnPct: number; annualizedReturn: number; maxDrawdown: number; maxDrawdownPct: number; sharpeRatio: number; sortinoRatio: number; calmarRatio: number; totalTrades: number; winningTrades: number; losingTrades: number; winRate: number; profitFactor: number; avgWin: number; avgLoss: number; expectancy: number; maxConsecutiveWins: number; maxConsecutiveLosses: number; kellyFraction?: number; optimalPositionSize?: number; valueAtRisk95?: number; omegaRatio?: number; skewness?: number; kurtosis?: number; avgHoldingPeriod?: number; riskRewardRatio?: number; buyAndHoldReturn?: number; alphaVsBuyHold?: number; }
interface SampleCandle { t: number; o: number; h: number; l: number; c: number; v: number; }
interface DataInfo { source: string; endpoint: string; totalCandles: number; firstCandle: string | null; lastCandle: string | null; priceRange: { min: number; max: number }; volumeTotal: number; }
interface BacktestResult { success: boolean; metrics: BacktestMetrics; trades: BacktestTrade[]; equityCurve: EquityPoint[]; returnDistribution: { bucket: string; count: number }[]; monthlyReturns: { month: string; returnPct: number }[]; hourlyPerformance: { hour: number; winRate: number; trades: number }[]; candleCount: number; sampleCandles: SampleCandle[]; dataInfo: DataInfo; config: any; savedId?: string; }
interface HistoryItem { id: string; walletAddress?: string; config: any; metrics: BacktestMetrics; tradesCount: number; createdAt: string; notes?: string; tags?: string[]; }

export default function BacktestPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [symbols, setSymbols] = useState<string[]>(['BTC', 'ETH', 'SOL']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'trades' | 'analysis' | 'history'>('overview');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  const [config, setConfig] = useState({
    symbol: 'BTC',
    interval: '1h' as '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    days: 14,
    initialCapital: 1000,
    positionSizePct: 5,
    maxLeverage: 3,
    stopLossPct: 2,
    takeProfitPct: 4,
    strategy: 'improved_bot',
    strategyParams: { minSignals: 3 } as Record<string, number>,
    enableTrailingStop: true,
    trailingStopPct: 1,
    tradingMode: 'moderate' as 'conservative' | 'moderate' | 'aggressive',
    // Grok AI simulation
    enableGrokSimulation: false,
    grokFilterStrength: 50,
    grokBoostStrength: 30,
  });

  // Apply trading mode presets
  const applyTradingMode = (mode: 'conservative' | 'moderate' | 'aggressive') => {
    const presets = {
      conservative: {
        stopLossPct: 1.5,
        takeProfitPct: 3,
        positionSizePct: 2,
        maxLeverage: 2,
        strategyParams: { minSignals: 5 },
      },
      moderate: {
        stopLossPct: 0.8,
        takeProfitPct: 1.5,
        positionSizePct: 5,
        maxLeverage: 3,
        strategyParams: { minSignals: 4 },
      },
      aggressive: {
        stopLossPct: 0.3,
        takeProfitPct: 0.5,
        positionSizePct: 10,
        maxLeverage: 5,
        strategyParams: { minSignals: 3 },
      },
    };
    setConfig(prev => ({ ...prev, ...presets[mode], tradingMode: mode }));
  };

  useEffect(() => {
    fetch(API_URL + '/api/backtest/strategies').then(r => r.json()).then(data => setStrategies(data.strategies || [])).catch(() => {});
    fetch(API_URL + '/api/backtest/symbols').then(r => r.json()).then(data => setSymbols(data.symbols?.map((s: any) => s.name || s) || ['BTC', 'ETH', 'SOL'])).catch(() => {});
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(API_URL + '/api/backtest/history?limit=20');
      const data = await res.json();
      if (data.success) setHistory(data.results || []);
    } catch (e) { console.error('Failed to load history:', e); }
    finally { setHistoryLoading(false); }
  };

  const deleteFromHistory = async (id: string) => {
    try {
      await fetch(API_URL + '/api/backtest/history/' + id, { method: 'DELETE' });
      setHistory(h => h.filter(item => item.id !== id));
    } catch (e) { console.error('Failed to delete:', e); }
  };

  const runBacktest = async () => {
    setIsLoading(true); setError(null); setResult(null);
    try {
      const now = Date.now();
      const response = await fetch(API_URL + '/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: config.symbol, interval: config.interval,
          startTime: now - config.days * 24 * 60 * 60 * 1000, endTime: now,
          initialCapital: config.initialCapital, positionSizePct: config.positionSizePct,
          maxLeverage: config.maxLeverage, stopLossPct: config.stopLossPct,
          takeProfitPct: config.takeProfitPct, tradingFee: 0.035, slippage: 0.05,
          strategy: config.strategy, strategyParams: config.strategyParams,
          enableTrailingStop: config.enableTrailingStop, trailingStopPct: config.trailingStopPct,
          tradingMode: config.tradingMode,
          enableGrokSimulation: config.enableGrokSimulation,
          grokFilterStrength: config.grokFilterStrength,
          grokBoostStrength: config.grokBoostStrength,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setResult(data);
        loadHistory(); // Refresh history after new backtest
      }
      else setError(data.error || 'Backtest failed');
    } catch (e: any) { setError(e.message || 'Failed to run backtest'); }
    finally { setIsLoading(false); }
  };

  const selectedStrategy = strategies.find(s => s.name === config.strategy);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-5 h-5 text-white/70" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                Quantitative Backtester
              </h1>
              <p className="text-white/50 text-sm">Real Hyperliquid K-Line data - 12 strategies - Professional metrics</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-cyan-400" />Market Data</h3>
              <div className="space-y-3">
                <select value={config.symbol} onChange={e => setConfig(c => ({ ...c, symbol: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-white text-sm">
                  {symbols.slice(0, 20).map(s => (<option key={s} value={s}>{s}-PERP</option>))}
                </select>
                <div className="grid grid-cols-3 gap-1">
                  {(['1h', '4h', '1d'] as const).map(tf => (
                    <button key={tf} onClick={() => setConfig(c => ({ ...c, interval: tf }))} className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${config.interval === tf ? 'bg-indigo-500 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{tf}</button>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[7, 14, 30, 60, 90].map(d => (
                    <button key={d} onClick={() => setConfig(c => ({ ...c, days: d }))} className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${config.days === d ? 'bg-cyan-500 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{d}d</button>
                  ))}
                </div>
                {config.days < 10 && (config.strategy === 'improved_bot' || config.strategy === 'bot_strategy') && (
                  <p className="text-[10px] text-amber-400 mt-1">⚠️ EMA200 strategies need 10+ days with 1h interval</p>
                )}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" />Strategy</h3>
              <select value={config.strategy} onChange={e => { const strat = strategies.find(s => s.name === e.target.value); setConfig(c => ({ ...c, strategy: e.target.value, strategyParams: strat?.params || {} })); }} className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-white text-sm">
                {strategies.map(s => (<option key={s.name} value={s.name}>{s.label}</option>))}
              </select>
              {selectedStrategy && <p className="mt-2 text-xs text-white/40">{selectedStrategy.description}</p>}
            </div>
            {/* Trading Mode */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
              <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-indigo-400" />Trading Mode</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['conservative', 'moderate', 'aggressive'] as const).map(mode => (
                  <button key={mode} onClick={() => applyTradingMode(mode)} className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${config.tradingMode === mode 
                    ? mode === 'aggressive' ? 'bg-red-500 text-white shadow-lg shadow-red-500/25' 
                    : mode === 'moderate' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/25' 
                    : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/10'}`}>
                    {mode === 'conservative' ? '🛡️' : mode === 'moderate' ? '⚖️' : '🔥'} {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <div className="mt-3 text-[10px] text-white/40 space-y-0.5">
                {config.tradingMode === 'conservative' && (<><p>🎯 5+ signals, swing trading</p><p>💰 3% TP / 1.5% SL (2:1 R:R)</p></>)}
                {config.tradingMode === 'moderate' && (<><p>🎯 4+ signals, intraday</p><p>💰 1.5% TP / 0.8% SL (1.8:1 R:R)</p></>)}
                {config.tradingMode === 'aggressive' && (<><p>🎯 3+ signals, scalping</p><p>💰 0.5% TP / 0.3% SL (1.5:1 R:R)</p></>)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />Risk Management</h3>
              <div className="space-y-3">
                <div><label className="text-xs text-white/40">Initial Capital ($)</label><input type="number" value={config.initialCapital} onChange={e => setConfig(c => ({ ...c, initialCapital: +e.target.value || 1000 }))} className="w-full px-3 py-1.5 rounded bg-black/50 border border-white/10 text-white text-sm" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-white/40">Stop Loss %</label><input type="number" value={config.stopLossPct} onChange={e => setConfig(c => ({ ...c, stopLossPct: +e.target.value || 2 }))} step="0.5" className="w-full px-2 py-1.5 rounded bg-black/50 border border-white/10 text-white text-sm" /></div>
                  <div><label className="text-xs text-white/40">Take Profit %</label><input type="number" value={config.takeProfitPct} onChange={e => setConfig(c => ({ ...c, takeProfitPct: +e.target.value || 4 }))} step="0.5" className="w-full px-2 py-1.5 rounded bg-black/50 border border-white/10 text-white text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-white/40">Position Size %</label><input type="number" value={config.positionSizePct} onChange={e => setConfig(c => ({ ...c, positionSizePct: +e.target.value || 5 }))} className="w-full px-2 py-1.5 rounded bg-black/50 border border-white/10 text-white text-sm" /></div>
                  <div><label className="text-xs text-white/40">Max Leverage</label><input type="number" value={config.maxLeverage} onChange={e => setConfig(c => ({ ...c, maxLeverage: +e.target.value || 3 }))} className="w-full px-2 py-1.5 rounded bg-black/50 border border-white/10 text-white text-sm" /></div>
                </div>
                <label className="flex items-center gap-2 text-xs text-white/50"><input type="checkbox" checked={config.enableTrailingStop} onChange={e => setConfig(c => ({ ...c, enableTrailingStop: e.target.checked }))} className="rounded bg-black/50 border-white/20" />Trailing Stop ({config.trailingStopPct}%)</label>
              </div>
            </div>
            {/* Grok AI Simulation */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20">
              <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
                <span className="text-lg">🧠</span>Grok AI Simulation
              </h3>
              <label className="flex items-center gap-2 text-xs text-white/70 mb-3">
                <input type="checkbox" checked={config.enableGrokSimulation} onChange={e => setConfig(c => ({ ...c, enableGrokSimulation: e.target.checked }))} className="rounded bg-black/50 border-white/20" />
                Enable Grok AI Filter
              </label>
              {config.enableGrokSimulation && (
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <div>
                    <label className="text-xs text-white/40 flex justify-between">
                      <span>Filter Strength</span>
                      <span className="text-purple-400">{config.grokFilterStrength}%</span>
                    </label>
                    <input type="range" min="0" max="100" value={config.grokFilterStrength} onChange={e => setConfig(c => ({ ...c, grokFilterStrength: +e.target.value }))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                    <p className="text-[10px] text-white/30 mt-1">Higher = filters more bad trades</p>
                  </div>
                  <div>
                    <label className="text-xs text-white/40 flex justify-between">
                      <span>Boost Strength</span>
                      <span className="text-blue-400">{config.grokBoostStrength}%</span>
                    </label>
                    <input type="range" min="0" max="100" value={config.grokBoostStrength} onChange={e => setConfig(c => ({ ...c, grokBoostStrength: +e.target.value }))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                    <p className="text-[10px] text-white/30 mt-1">Higher = larger positions on good trades</p>
                  </div>
                  <div className="p-2 rounded bg-purple-500/10 text-[10px] text-purple-300">
                    💡 Simulates Grok's macro analysis by filtering trades based on trend, volatility, and volume conditions.
                  </div>
                </div>
              )}
            </div>
            <button onClick={runBacktest} disabled={isLoading} className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${isLoading ? 'bg-white/10 text-white/50 cursor-wait' : 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white hover:opacity-90'}`}>
              {isLoading ? (<><RefreshCw className="w-5 h-5 animate-spin" />Fetching real data...</>) : (<><Play className="w-5 h-5" />Run Backtest</>)}
            </button>
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}
          </div>
          <div className="lg:col-span-3">
            {!result && !isLoading && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center p-12 rounded-2xl bg-white/5 border border-white/10">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 text-white/20" />
                  <h3 className="text-xl font-semibold text-white mb-2">Configure & Run</h3>
                  <p className="text-white/50 max-w-md">Select a strategy and parameters, then run a backtest on real Hyperliquid historical K-Line data.</p>
                  <div className="mt-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs">
                    <Info className="w-4 h-4 inline mr-2" />Data fetched directly from api.hyperliquid.xyz/info (candleSnapshot endpoint)
                  </div>
                </div>
              </div>
            )}
            {isLoading && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <RefreshCw className="w-12 h-12 mx-auto mb-4 text-indigo-400 animate-spin" />
                  <p className="text-white/70 mb-2">Fetching real K-Line data from Hyperliquid...</p>
                  <p className="text-white/40 text-sm">api.hyperliquid.xyz/info - candleSnapshot</p>
                </div>
              </div>
            )}
            {result && (
              <div className="space-y-4">
                <DataSourceBanner dataInfo={result.dataInfo} />
                <div className="flex gap-2">
                  {(['overview', 'chart', 'trades', 'analysis', 'history'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === tab ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/70'}`}>
                      {tab === 'chart' && <CandlestickChart className="w-4 h-4" />}
                      {tab === 'history' && <History className="w-4 h-4" />}
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      {tab === 'history' && history.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-indigo-500/30 rounded-full">{history.length}</span>}
                    </button>
                  ))}
                </div>
                {activeTab === 'overview' && <OverviewTab result={result} config={config} />}
                {activeTab === 'chart' && <ChartTab result={result} />}
                {activeTab === 'trades' && <TradesTab trades={result.trades} />}
                {activeTab === 'analysis' && <AnalysisTab result={result} />}
                {activeTab === 'history' && <HistoryTab history={history} loading={historyLoading} onDelete={deleteFromHistory} onRefresh={loadHistory} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DataSourceBanner({ dataInfo }: { dataInfo: DataInfo }) {
  return (
    <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/30">
      <div className="flex items-center gap-3 mb-3">
        <CheckCircle className="w-5 h-5 text-emerald-400" />
        <span className="text-emerald-400 font-medium">Real Market Data Verified</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="text-white/40">Source:</span><div className="text-white font-mono text-xs">{dataInfo.source}</div></div>
        <div><span className="text-white/40">Candles:</span><div className="text-white font-mono">{dataInfo.totalCandles.toLocaleString()}</div></div>
        <div><span className="text-white/40">Price Range:</span><div className="text-white font-mono">${dataInfo.priceRange.min.toFixed(0)} - ${dataInfo.priceRange.max.toFixed(0)}</div></div>
        <div><span className="text-white/40">Volume:</span><div className="text-white font-mono">${(dataInfo.volumeTotal / 1e6).toFixed(2)}M</div></div>
      </div>
      <div className="mt-2 text-xs text-white/40">
        Period: {dataInfo.firstCandle ? new Date(dataInfo.firstCandle).toLocaleDateString() : 'N/A'} to {dataInfo.lastCandle ? new Date(dataInfo.lastCandle).toLocaleDateString() : 'N/A'}
      </div>
    </div>
  );
}

function ChartTab({ result }: { result: BacktestResult }) {
  const allCandles = result.sampleCandles;
  const trades = result.trades;
  const [viewStart, setViewStart] = useState(0);
  const [viewSize, setViewSize] = useState(60); // Number of candles to show
  const [selectedTrade, setSelectedTrade] = useState<number | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<number | null>(null);
  
  if (allCandles.length < 2) return <div className="p-8 text-center text-white/50">Not enough candle data</div>;
  
  // Calculate view bounds
  const maxStart = Math.max(0, allCandles.length - viewSize);
  const actualStart = Math.min(viewStart, maxStart);
  const candles = allCandles.slice(actualStart, actualStart + viewSize);
  
  // Jump to trade function
  const jumpToTrade = (tradeIdx: number) => {
    const trade = trades[tradeIdx];
    if (!trade) return;
    const entryIdx = allCandles.findIndex(c => Math.abs(c.t - trade.entryTime) < 3600000 * 24);
    if (entryIdx >= 0) {
      const newStart = Math.max(0, entryIdx - Math.floor(viewSize / 4));
      setViewStart(newStart);
      setSelectedTrade(tradeIdx);
    }
  };
  
  const width = 1000, height = 480;
  const pad = { top: 50, right: 85, bottom: 80, left: 20 };
  
  // Calculate price range from displayed candles
  const candlePrices = candles.flatMap(c => [c.h, c.l]);
  const minPrice = Math.min(...candlePrices);
  const maxPrice = Math.max(...candlePrices);
  const priceRange = maxPrice - minPrice || 1;
  const minP = minPrice - priceRange * 0.08;
  const maxP = maxPrice + priceRange * 0.08;
  
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const candleGap = chartWidth / candles.length;
  const candleWidth = Math.max(3, Math.min(14, candleGap * 0.75));
  
  const xScale = (i: number) => pad.left + (i + 0.5) * candleGap;
  const yScale = (p: number) => pad.top + ((maxP - p) / (maxP - minP)) * chartHeight;
  
  // Find trades in displayed range
  const candleStartTime = candles[0]?.t || 0;
  const candleEndTime = candles[candles.length - 1]?.t || 0;
  const intervalMs = candles.length > 1 ? (candles[1]!.t - candles[0]!.t) : 3600000;
  
  const tradeMarkers = trades.map((t, idx) => {
    let entryIdx = -1, exitIdx = -1;
    candles.forEach((c, i) => {
      if (Math.abs(c.t - t.entryTime) <= intervalMs) entryIdx = i;
      if (Math.abs(c.t - t.exitTime) <= intervalMs) exitIdx = i;
    });
    const isEntryVisible = t.entryTime >= candleStartTime - intervalMs && t.entryTime <= candleEndTime + intervalMs;
    const isExitVisible = t.exitTime >= candleStartTime - intervalMs && t.exitTime <= candleEndTime + intervalMs;
    return { ...t, idx, entryIdx: isEntryVisible ? entryIdx : -1, exitIdx: isExitVisible ? exitIdx : -1 };
  }).filter(t => t.entryIdx >= 0 || t.exitIdx >= 0);
  
  // Navigation handlers
  const handlePan = (direction: 'left' | 'right') => {
    const step = Math.max(1, Math.floor(viewSize / 4));
    if (direction === 'left') setViewStart(Math.max(0, viewStart - step));
    else setViewStart(Math.min(maxStart, viewStart + step));
  };
  
  const handleZoom = (zoomIn: boolean) => {
    if (zoomIn) setViewSize(Math.max(20, viewSize - 10));
    else setViewSize(Math.min(200, viewSize + 20));
  };

  // Format interval for display
  const formatInterval = (ms: number) => {
    if (ms < 60000) return `${ms / 1000}s`;
    if (ms < 3600000) return `${ms / 60000}m`;
    if (ms < 86400000) return `${ms / 3600000}h`;
    return `${ms / 86400000}d`;
  };

  return (
    <div className="rounded-xl border border-white/10" style={{ background: '#080b0f' }}>
      {/* Header with controls */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <CandlestickChart className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Hyperliquid K-Line Chart</h3>
            <p className="text-xs text-white/40">Real market data • {formatInterval(intervalMs)} timeframe</p>
          </div>
        </div>
        
        {/* Navigation controls */}
        <div className="flex items-center gap-2">
          <button onClick={() => handleZoom(false)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors" title="Zoom out">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" /></svg>
          </button>
          <button onClick={() => handleZoom(true)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors" title="Zoom in">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
          </button>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button onClick={() => handlePan('left')} disabled={viewStart === 0} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors disabled:opacity-30" title="Pan left">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => handlePan('right')} disabled={viewStart >= maxStart} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors disabled:opacity-30" title="Pan right">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <span className="text-xs text-white/40 font-mono">{actualStart + 1}-{actualStart + candles.length} / {allCandles.length}</span>
        </div>
      </div>
      
      {/* Trade list for quick navigation */}
      {trades.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-white/[0.02] overflow-x-auto">
          <span className="text-xs text-white/40 shrink-0">Jump to trade:</span>
          {trades.map((t, idx) => (
            <button key={idx} onClick={() => jumpToTrade(idx)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
                selectedTrade === idx 
                  ? 'bg-indigo-500 text-white' 
                  : t.netPnl >= 0 
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
              }`}>
              #{idx + 1} {t.side.toUpperCase()} {t.netPnl >= 0 ? '+' : ''}{t.pnlPct.toFixed(1)}%
            </button>
          ))}
        </div>
      )}
      
      {/* Chart */}
      <div className="p-2" style={{ background: '#0a0e14' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: '400px', minWidth: '800px' }}>
          <defs>
            <linearGradient id="chartBg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0d1117" />
              <stop offset="100%" stopColor="#0a0e14" />
            </linearGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="1.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          
          {/* Chart area */}
          <rect x={pad.left} y={pad.top} width={chartWidth} height={chartHeight} fill="url(#chartBg)" stroke="rgba(255,255,255,0.05)" rx="4" />
          
          {/* Grid lines */}
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map(pct => {
            const y = pad.top + pct * chartHeight;
            const price = maxP - pct * (maxP - minP);
            return (
              <g key={pct}>
                <line x1={pad.left} y1={y} x2={pad.left + chartWidth} y2={y} stroke="rgba(255,255,255,0.04)" />
                <text x={pad.left + chartWidth + 8} y={y + 4} fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="monospace">
                  ${price.toLocaleString(undefined, {maximumFractionDigits: 0})}
                </text>
              </g>
            );
          })}
          
          {/* Candlesticks */}
          {candles.map((c, i) => {
            const x = xScale(i);
            const isGreen = c.c >= c.o;
            const bodyTop = yScale(Math.max(c.o, c.c));
            const bodyBot = yScale(Math.min(c.o, c.c));
            const bodyH = Math.max(2, bodyBot - bodyTop);
            const isHovered = hoveredCandle === i;
            return (
              <g key={i} onMouseEnter={() => setHoveredCandle(i)} onMouseLeave={() => setHoveredCandle(null)} style={{ cursor: 'crosshair' }}>
                {/* Hover highlight */}
                {isHovered && <rect x={x - candleGap/2} y={pad.top} width={candleGap} height={chartHeight} fill="rgba(255,255,255,0.03)" />}
                {/* Wick */}
                <line x1={x} y1={yScale(c.h)} x2={x} y2={yScale(c.l)} stroke={isGreen ? '#22c55e' : '#ef4444'} strokeWidth={isHovered ? 2 : 1} />
                {/* Body */}
                <rect x={x - candleWidth/2} y={bodyTop} width={candleWidth} height={bodyH} 
                  fill={isGreen ? '#22c55e' : '#ef4444'} stroke={isHovered ? 'white' : 'none'} strokeWidth="1" rx="1" />
              </g>
            );
          })}
          
          {/* Trade markers */}
          {tradeMarkers.map((t, i) => {
            const isLong = t.side === 'long';
            const isProfit = t.netPnl >= 0;
            const entryX = t.entryIdx >= 0 ? xScale(t.entryIdx) : 0;
            const entryY = t.entryIdx >= 0 ? yScale(t.entryPrice) : 0;
            const exitX = t.exitIdx >= 0 ? xScale(t.exitIdx) : 0;
            const exitY = t.exitIdx >= 0 ? yScale(t.exitPrice) : 0;
            const isSelected = selectedTrade === t.idx;
            
            return (
              <g key={i} opacity={isSelected ? 1 : 0.85}>
                {/* Trade zone */}
                {t.entryIdx >= 0 && t.exitIdx >= 0 && (
                  <rect x={Math.min(entryX, exitX) - 2} y={pad.top} width={Math.abs(exitX - entryX) + 4} height={chartHeight}
                    fill={isProfit ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'} />
                )}
                {/* Connection line */}
                {t.entryIdx >= 0 && t.exitIdx >= 0 && (
                  <line x1={entryX} y1={entryY} x2={exitX} y2={exitY} 
                    stroke={isProfit ? '#22c55e' : '#ef4444'} strokeWidth={isSelected ? 3 : 2} strokeDasharray="6,3" />
                )}
                {/* Entry */}
                {t.entryIdx >= 0 && (
                  <g filter={isSelected ? 'url(#glow)' : ''}>
                    <circle cx={entryX} cy={entryY} r={isSelected ? 10 : 8} fill={isLong ? '#22c55e' : '#ef4444'} stroke="white" strokeWidth="2" />
                    <text x={entryX} y={entryY + 4} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">{isLong ? '▲' : '▼'}</text>
                    <rect x={entryX - 20} y={entryY + 14} width="40" height="16" fill={isLong ? '#22c55e' : '#ef4444'} rx="3" />
                    <text x={entryX} y={entryY + 26} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">{isLong ? 'LONG' : 'SHORT'}</text>
                  </g>
                )}
                {/* Exit */}
                {t.exitIdx >= 0 && (
                  <g filter={isSelected ? 'url(#glow)' : ''}>
                    <rect x={exitX - 8} y={exitY - 8} width="16" height="16" fill={isProfit ? '#22c55e' : '#ef4444'} stroke="white" strokeWidth="2" rx="3" />
                    <text x={exitX} y={exitY + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">✕</text>
                    <rect x={exitX - 24} y={exitY - 28} width="48" height="16" fill={isProfit ? '#22c55e' : '#ef4444'} rx="3" />
                    <text x={exitX} y={exitY - 16} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">{isProfit ? '+' : ''}{t.pnlPct.toFixed(1)}%</text>
                  </g>
                )}
              </g>
            );
          })}
          
          {/* Hovered candle tooltip */}
          {hoveredCandle !== null && candles[hoveredCandle] && (
            <g>
              <rect x={xScale(hoveredCandle) - 55} y={pad.top - 45} width="110" height="40" fill="rgba(0,0,0,0.9)" stroke="rgba(255,255,255,0.2)" rx="4" />
              <text x={xScale(hoveredCandle)} y={pad.top - 30} textAnchor="middle" fill="white" fontSize="9">
                {new Date(candles[hoveredCandle]!.t).toLocaleString()}
              </text>
              <text x={xScale(hoveredCandle)} y={pad.top - 16} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                O:{candles[hoveredCandle]!.o.toFixed(0)} H:{candles[hoveredCandle]!.h.toFixed(0)} L:{candles[hoveredCandle]!.l.toFixed(0)} C:{candles[hoveredCandle]!.c.toFixed(0)}
              </text>
            </g>
          )}
          
          {/* X-axis */}
          {[0, Math.floor(candles.length/4), Math.floor(candles.length/2), Math.floor(candles.length*3/4), candles.length-1].map(idx => {
            const c = candles[idx];
            if (!c) return null;
            return (
              <text key={idx} x={xScale(idx)} y={height - 30} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">
                {new Date(c.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(c.t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </text>
            );
          })}
          
          {/* Data source */}
          <rect x={pad.left + 5} y={pad.top + 5} width="130" height="20" fill="rgba(0,0,0,0.6)" rx="3" />
          <text x={pad.left + 70} y={pad.top + 18} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9">📊 Hyperliquid Real Data</text>
        </svg>
      </div>
      
      {/* Footer with legend and info */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-white/[0.02]">
        <div className="flex gap-6 text-xs">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-white/50">Long</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-rose-500" /><span className="text-white/50">Short</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-500" /><span className="text-white/50">Profit</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-rose-500" /><span className="text-white/50">Loss</span></div>
        </div>
        <div className="text-xs text-white/30">
          {new Date(candles[0]?.t || 0).toLocaleDateString()} - {new Date(candles[candles.length-1]?.t || 0).toLocaleDateString()} • {candles.length} candles
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ result, config }: { result: BacktestResult; config: any }) {
  const m = result.metrics;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<DollarSign className="w-4 h-4" />} label="Total Return" value={(m.totalReturnPct >= 0 ? '+' : '') + m.totalReturnPct.toFixed(2) + '%'} subValue={'$' + m.totalReturn.toFixed(2)} color={m.totalReturn >= 0 ? 'emerald' : 'red'} />
        <MetricCard icon={<Target className="w-4 h-4" />} label="Win Rate" value={m.winRate.toFixed(1) + '%'} subValue={m.winningTrades + 'W / ' + m.losingTrades + 'L'} color={m.winRate >= 50 ? 'emerald' : 'amber'} />
        <MetricCard icon={<AlertTriangle className="w-4 h-4" />} label="Max Drawdown" value={'-' + m.maxDrawdownPct.toFixed(2) + '%'} subValue={'$' + m.maxDrawdown.toFixed(2)} color={m.maxDrawdownPct < 10 ? 'amber' : 'red'} />
        <MetricCard icon={<Activity className="w-4 h-4" />} label="Sharpe Ratio" value={m.sharpeRatio.toFixed(2)} subValue={m.sharpeRatio >= 2 ? 'Excellent' : m.sharpeRatio >= 1 ? 'Good' : 'Poor'} color={m.sharpeRatio >= 1.5 ? 'emerald' : m.sharpeRatio >= 1 ? 'amber' : 'red'} />
      </div>
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2"><LineChart className="w-4 h-4 text-indigo-400" />Equity Curve</h3>
        <EquityCurveChart data={result.equityCurve} initialCapital={config.initialCapital} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-white/5 border border-white/10"><div className="text-xs text-white/40">Profit Factor</div><div className={`text-lg font-bold ${m.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>{m.profitFactor.toFixed(2)}</div></div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10"><div className="text-xs text-white/40">Sortino Ratio</div><div className="text-lg font-bold text-white">{m.sortinoRatio.toFixed(2)}</div></div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10"><div className="text-xs text-white/40">Calmar Ratio</div><div className="text-lg font-bold text-white">{m.calmarRatio.toFixed(2)}</div></div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10"><div className="text-xs text-white/40">Expectancy</div><div className={`text-lg font-bold ${m.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${m.expectancy.toFixed(2)}</div></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-medium text-white/70 mb-3">Trade Statistics</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/50">Total Trades</span><span className="text-white font-mono">{m.totalTrades}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Avg Win</span><span className="text-emerald-400 font-mono">+${m.avgWin.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Avg Loss</span><span className="text-red-400 font-mono">-${m.avgLoss.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Risk/Reward Ratio</span><span className={`font-mono ${(m.riskRewardRatio || 0) >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>{(m.riskRewardRatio || m.avgWin / (m.avgLoss || 1)).toFixed(2)}</span></div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-medium text-white/70 mb-3">Streaks & Performance</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/50">Max Consecutive Wins</span><span className="text-emerald-400 font-mono">{m.maxConsecutiveWins}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Max Consecutive Losses</span><span className="text-red-400 font-mono">{m.maxConsecutiveLosses}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Annualized Return</span><span className={`font-mono ${m.annualizedReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{m.annualizedReturn >= 0 ? '+' : ''}{m.annualizedReturn.toFixed(1)}%</span></div>
            <div className="flex justify-between"><span className="text-white/50">Candles Analyzed</span><span className="text-white font-mono">{result.candleCount.toLocaleString()}</span></div>
          </div>
        </div>
      </div>
      {/* Advanced Quant Metrics */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-indigo-500/20">
        <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-400" />
          Advanced Quantitative Metrics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-black/20">
            <div className="text-xs text-white/40">Kelly Fraction</div>
            <div className={`text-lg font-bold font-mono ${(m.kellyFraction || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{((m.kellyFraction || 0) * 100).toFixed(1)}%</div>
            <div className="text-[10px] text-white/30">Optimal bet size</div>
          </div>
          <div className="p-3 rounded-lg bg-black/20">
            <div className="text-xs text-white/40">VaR 95%</div>
            <div className="text-lg font-bold font-mono text-amber-400">{(m.valueAtRisk95 || 0).toFixed(2)}%</div>
            <div className="text-[10px] text-white/30">Daily risk</div>
          </div>
          <div className="p-3 rounded-lg bg-black/20">
            <div className="text-xs text-white/40">Omega Ratio</div>
            <div className={`text-lg font-bold font-mono ${(m.omegaRatio || 0) >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>{(m.omegaRatio || 0).toFixed(2)}</div>
            <div className="text-[10px] text-white/30">Gain/Loss ratio</div>
          </div>
          <div className="p-3 rounded-lg bg-black/20">
            <div className="text-xs text-white/40">Buy & Hold</div>
            <div className={`text-lg font-bold font-mono ${(m.buyAndHoldReturn || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(m.buyAndHoldReturn || 0) >= 0 ? '+' : ''}{(m.buyAndHoldReturn || 0).toFixed(1)}%</div>
            <div className="text-[10px] text-white/30">Benchmark</div>
          </div>
          <div className="p-3 rounded-lg bg-black/20">
            <div className="text-xs text-white/40">Alpha</div>
            <div className={`text-lg font-bold font-mono ${(m.alphaVsBuyHold || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(m.alphaVsBuyHold || 0) >= 0 ? '+' : ''}{(m.alphaVsBuyHold || 0).toFixed(1)}%</div>
            <div className="text-[10px] text-white/30">vs Buy & Hold</div>
          </div>
        </div>
      </div>
      {/* Strategy Health Score */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white/70 mb-3">Strategy Health Assessment</h3>
        <div className="grid grid-cols-3 gap-4">
          <HealthIndicator label="Profitability" value={m.profitFactor} threshold={1.5} format={(v) => v.toFixed(2)} />
          <HealthIndicator label="Risk-Adjusted" value={m.sharpeRatio} threshold={1.0} format={(v) => v.toFixed(2)} />
          <HealthIndicator label="Survivability" value={100 - m.maxDrawdownPct} threshold={80} format={(v) => v.toFixed(0) + '%'} />
        </div>
        <div className="mt-4 p-3 rounded-lg bg-black/20">
          <div className="text-xs text-white/50 mb-2">Recommendation</div>
          <div className="text-sm text-white/80">
            {m.profitFactor >= 1.5 && m.sharpeRatio >= 1 && m.maxDrawdownPct < 20 
              ? '✅ Strategy meets institutional standards. Consider live deployment with small position sizes.'
              : m.profitFactor >= 1.0 && m.sharpeRatio >= 0.5
              ? '⚠️ Strategy shows potential but needs optimization. Focus on improving risk/reward ratio.'
              : '❌ Strategy is not profitable. Consider: 1) Adding regime filters 2) Tighter stop losses 3) Different entry conditions'}
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthIndicator({ label, value, threshold, format }: { label: string; value: number; threshold: number; format: (v: number) => string }) {
  const isHealthy = value >= threshold;
  const pct = Math.min(100, Math.max(0, (value / threshold) * 50));
  return (
    <div className="text-center">
      <div className="text-xs text-white/40 mb-2">{label}</div>
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`absolute left-0 top-0 h-full rounded-full transition-all ${isHealthy ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`text-sm font-mono mt-1 ${isHealthy ? 'text-emerald-400' : 'text-red-400'}`}>{format(value)}</div>
    </div>
  );
}

function MetricCard({ icon, label, value, subValue, color }: { icon: React.ReactNode; label: string; value: string; subValue: string; color: 'emerald' | 'red' | 'amber' | 'blue'; }) {
  const colors = { emerald: 'text-emerald-400', red: 'text-red-400', amber: 'text-amber-400', blue: 'text-blue-400' };
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 text-white/50 text-xs mb-2">{icon}{label}</div>
      <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
      <div className="text-xs text-white/40 mt-1">{subValue}</div>
    </div>
  );
}

function EquityCurveChart({ data, initialCapital }: { data: EquityPoint[]; initialCapital: number }) {
  if (data.length < 2) return <div className="h-48 flex items-center justify-center text-white/30">Not enough data</div>;
  const width = 800, height = 200;
  const pad = { top: 20, right: 20, bottom: 30, left: 60 };
  const equities = data.map(d => d.equity);
  const minE = Math.min(...equities) * 0.98, maxE = Math.max(...equities) * 1.02;
  const xScale = (i: number) => pad.left + (i / (data.length - 1)) * (width - pad.left - pad.right);
  const yScale = (v: number) => height - pad.bottom - ((v - minE) / (maxE - minE)) * (height - pad.top - pad.bottom);
  const linePath = data.map((d, i) => (i === 0 ? 'M' : 'L') + ' ' + xScale(i) + ' ' + yScale(d.equity)).join(' ');
  const areaPath = linePath + ' L ' + xScale(data.length - 1) + ' ' + (height - pad.bottom) + ' L ' + pad.left + ' ' + (height - pad.bottom) + ' Z';
  const finalEquity = data[data.length - 1]?.equity || initialCapital;
  const pnlPct = ((finalEquity - initialCapital) / initialCapital * 100);
  const lineColor = pnlPct >= 0 ? '#10b981' : '#ef4444';
  return (
    <div className="relative">
      <svg viewBox={'0 0 ' + width + ' ' + height} className="w-full h-48">
        <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lineColor} stopOpacity="0.3" /><stop offset="100%" stopColor={lineColor} stopOpacity="0" /></linearGradient></defs>
        {[0, 0.25, 0.5, 0.75, 1].map(pct => { const y = pad.top + pct * (height - pad.top - pad.bottom); const val = maxE - pct * (maxE - minE); return (<g key={pct}><line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="rgba(255,255,255,0.1)" /><text x={pad.left - 5} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="10">${val.toFixed(0)}</text></g>); })}
        <line x1={pad.left} y1={yScale(initialCapital)} x2={width - pad.right} y2={yScale(initialCapital)} stroke="rgba(255,255,255,0.3)" strokeDasharray="4,4" />
        <path d={areaPath} fill="url(#eqGrad)" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" />
        <circle cx={xScale(data.length - 1)} cy={yScale(finalEquity)} r="4" fill={lineColor} />
      </svg>
      <div className="absolute top-2 right-2 text-xs"><span className={'font-mono ' + (pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>${finalEquity.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span></div>
    </div>
  );
}

function TradesTab({ trades }: { trades: BacktestTrade[] }) {
  const [sortBy, setSortBy] = useState<'time' | 'pnl'>('time');
  const [filterSide, setFilterSide] = useState<'all' | 'long' | 'short'>('all');
  const filteredTrades = useMemo(() => {
    let t = [...trades];
    if (filterSide !== 'all') t = t.filter(tr => tr.side === filterSide);
    if (sortBy === 'pnl') t.sort((a, b) => b.netPnl - a.netPnl);
    else t.sort((a, b) => b.entryTime - a.entryTime);
    return t;
  }, [trades, sortBy, filterSide]);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(['all', 'long', 'short'] as const).map(f => (<button key={f} onClick={() => setFilterSide(f)} className={'px-3 py-1.5 text-xs font-medium ' + (filterSide === f ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5')}>{f.toUpperCase()}</button>))}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(['time', 'pnl'] as const).map(s => (<button key={s} onClick={() => setSortBy(s)} className={'px-3 py-1.5 text-xs font-medium ' + (sortBy === s ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5')}>{s === 'time' ? 'Recent' : 'P&L'}</button>))}
        </div>
        <div className="ml-auto text-xs text-white/40">{filteredTrades.length} trades</div>
      </div>
      <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-white/5 sticky top-0">
              <tr className="text-left text-white/50"><th className="px-4 py-2">Time</th><th className="px-4 py-2">Side</th><th className="px-4 py-2">Entry</th><th className="px-4 py-2">Exit</th><th className="px-4 py-2">P&L</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">Bars</th></tr>
            </thead>
            <tbody>
              {filteredTrades.slice(0, 100).map(t => (
                <tr key={t.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2 text-white/70 font-mono text-xs">{new Date(t.entryTime).toLocaleString()}</td>
                  <td className="px-4 py-2"><span className={'px-2 py-0.5 rounded text-xs font-medium ' + (t.side === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>{t.side.toUpperCase()}</span></td>
                  <td className="px-4 py-2 text-white font-mono">${t.entryPrice.toFixed(2)}</td>
                  <td className="px-4 py-2 text-white font-mono">${t.exitPrice.toFixed(2)}</td>
                  <td className={'px-4 py-2 font-mono font-medium ' + (t.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>{t.netPnl >= 0 ? '+' : ''}${t.netPnl.toFixed(2)}<span className="text-xs text-white/40 ml-1">({t.pnlPct.toFixed(1)}%)</span></td>
                  <td className="px-4 py-2"><span className={'text-xs ' + (t.exitReason === 'tp' ? 'text-emerald-400' : t.exitReason === 'sl' ? 'text-red-400' : t.exitReason === 'trailing' ? 'text-amber-400' : 'text-white/50')}>{t.exitReason.toUpperCase()}</span></td>
                  <td className="px-4 py-2 text-white/50 font-mono">{t.holdingBars}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AnalysisTab({ result }: { result: BacktestResult }) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-indigo-400" />Return Distribution</h3>
        <ReturnDistributionChart data={result.returnDistribution} />
      </div>
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-cyan-400" />Hourly Win Rate</h3>
        <HourlyHeatmap data={result.hourlyPerformance} />
      </div>
      {result.monthlyReturns.length > 0 && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-purple-400" />Monthly Returns</h3>
          <div className="flex flex-wrap gap-2">
            {result.monthlyReturns.map(m => (<div key={m.month} className={'px-3 py-2 rounded-lg text-center ' + (m.returnPct >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20')}><div className="text-xs text-white/50">{m.month}</div><div className={'text-sm font-mono font-medium ' + (m.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{m.returnPct >= 0 ? '+' : ''}{m.returnPct.toFixed(1)}%</div></div>))}
          </div>
        </div>
      )}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-400" />Underwater (Drawdown) Chart</h3>
        <DrawdownChart data={result.equityCurve} />
      </div>
    </div>
  );
}

function ReturnDistributionChart({ data }: { data: { bucket: string; count: number }[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d, i) => { const h = (d.count / maxCount) * 100; const isNeg = d.bucket.includes('-') || d.bucket.startsWith('<'); return (<div key={i} className="flex-1 flex flex-col items-center"><div className={'w-full rounded-t transition-all ' + (isNeg ? 'bg-red-500/50' : 'bg-emerald-500/50')} style={{ height: h + '%', minHeight: d.count > 0 ? '4px' : '0' }} /><div className="text-[10px] text-white/40 mt-1 text-center leading-tight">{d.bucket}</div><div className="text-xs text-white/60 font-mono">{d.count}</div></div>); })}
    </div>
  );
}

function HourlyHeatmap({ data }: { data: { hour: number; winRate: number; trades: number }[] }) {
  const maxTrades = Math.max(...data.map(x => x.trades), 1);
  return (
    <div className="grid grid-cols-12 gap-1">
      {data.map(d => { const intensity = d.trades > 0 ? d.winRate / 100 : 0.5; const bg = d.trades === 0 ? 'bg-white/5' : intensity >= 0.6 ? 'bg-emerald-500' : intensity >= 0.4 ? 'bg-amber-500' : 'bg-red-500'; const op = d.trades === 0 ? 1 : 0.3 + (d.trades / maxTrades) * 0.7; return (<div key={d.hour} className={bg + ' rounded p-2 text-center'} style={{ opacity: op }} title={d.hour + ':00 - ' + d.winRate.toFixed(0) + '% win rate (' + d.trades + ' trades)'}><div className="text-[10px] text-white/70">{d.hour}h</div><div className="text-xs font-mono text-white">{d.trades > 0 ? d.winRate.toFixed(0) + '%' : '-'}</div></div>); })}
    </div>
  );
}

function DrawdownChart({ data }: { data: EquityPoint[] }) {
  if (data.length < 2) return null;
  const width = 800, height = 100;
  const pad = { top: 10, right: 20, bottom: 20, left: 50 };
  const maxDD = Math.max(...data.map(d => d.drawdownPct), 1);
  const xScale = (i: number) => pad.left + (i / (data.length - 1)) * (width - pad.left - pad.right);
  const yScale = (v: number) => pad.top + (v / maxDD) * (height - pad.top - pad.bottom);
  const areaPath = 'M ' + pad.left + ' ' + pad.top + ' ' + data.map((d, i) => 'L ' + xScale(i) + ' ' + yScale(d.drawdownPct)).join(' ') + ' L ' + xScale(data.length - 1) + ' ' + pad.top + ' Z';
  return (
    <svg viewBox={'0 0 ' + width + ' ' + height} className="w-full h-24">
      <defs><linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity="0.5" /><stop offset="100%" stopColor="#ef4444" stopOpacity="0.1" /></linearGradient></defs>
      <line x1={pad.left} y1={pad.top} x2={width - pad.right} y2={pad.top} stroke="rgba(255,255,255,0.2)" />
      <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="rgba(255,255,255,0.1)" />
      <text x={pad.left - 5} y={height - pad.bottom} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="10">-{maxDD.toFixed(1)}%</text>
      <path d={areaPath} fill="url(#ddGrad)" />
      <path d={'M ' + pad.left + ' ' + pad.top + ' ' + data.map((d, i) => 'L ' + xScale(i) + ' ' + yScale(d.drawdownPct)).join(' ')} fill="none" stroke="#ef4444" strokeWidth="1.5" />
    </svg>
  );
}

function HistoryTab({ history, loading, onDelete, onRefresh }: { history: HistoryItem[]; loading: boolean; onDelete: (id: string) => void; onRefresh: () => void }) {
  if (loading) {
    return (
      <div className="p-8 text-center">
        <RefreshCw className="w-8 h-8 mx-auto mb-3 text-indigo-400 animate-spin" />
        <p className="text-white/50">Loading history...</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-8 text-center">
        <History className="w-12 h-12 mx-auto mb-4 text-white/20" />
        <h3 className="text-lg font-medium text-white/70 mb-2">No Backtest History</h3>
        <p className="text-white/40 text-sm">Run a backtest to start building your history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70 flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-400" />
          Backtest History ({history.length} results)
        </h3>
        <button onClick={onRefresh} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
          <RefreshCw className="w-4 h-4 text-white/50" />
        </button>
      </div>
      
      <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="bg-white/5 sticky top-0">
              <tr className="text-left text-white/50">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Strategy</th>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Return</th>
                <th className="px-4 py-3">Win Rate</th>
                <th className="px-4 py-3">Sharpe</th>
                <th className="px-4 py-3">Trades</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map(item => (
                <tr key={item.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white/70 font-mono text-xs">
                    {new Date(item.createdAt).toLocaleDateString()}
                    <div className="text-white/40">{new Date(item.createdAt).toLocaleTimeString()}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-400 text-xs">{item.config.strategy}</span>
                  </td>
                  <td className="px-4 py-3 text-white font-mono">{item.config.symbol}</td>
                  <td className={`px-4 py-3 font-mono font-medium ${item.metrics.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {item.metrics.totalReturnPct >= 0 ? '+' : ''}{item.metrics.totalReturnPct.toFixed(2)}%
                  </td>
                  <td className={`px-4 py-3 font-mono ${item.metrics.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {item.metrics.winRate.toFixed(1)}%
                  </td>
                  <td className={`px-4 py-3 font-mono ${item.metrics.sharpeRatio >= 1 ? 'text-emerald-400' : item.metrics.sharpeRatio >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                    {item.metrics.sharpeRatio.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-white/70 font-mono">{item.tradesCount}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onDelete(item.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-xs text-white/40">Avg Return</div>
          <div className={`text-lg font-bold font-mono ${history.reduce((s, h) => s + h.metrics.totalReturnPct, 0) / history.length >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {(history.reduce((s, h) => s + h.metrics.totalReturnPct, 0) / history.length).toFixed(2)}%
          </div>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-xs text-white/40">Avg Win Rate</div>
          <div className="text-lg font-bold font-mono text-white">
            {(history.reduce((s, h) => s + h.metrics.winRate, 0) / history.length).toFixed(1)}%
          </div>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-xs text-white/40">Avg Sharpe</div>
          <div className="text-lg font-bold font-mono text-white">
            {(history.reduce((s, h) => s + h.metrics.sharpeRatio, 0) / history.length).toFixed(2)}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-xs text-white/40">Best Strategy</div>
          <div className="text-sm font-medium text-indigo-400 truncate">
            {history.length > 0 ? history.reduce((best, h) => h.metrics.totalReturnPct > best.metrics.totalReturnPct ? h : best).config.strategy : '-'}
          </div>
        </div>
      </div>
    </div>
  );
}
