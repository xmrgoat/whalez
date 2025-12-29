'use client';

/**
 * StatsPanel Component
 * 
 * Displays comprehensive trading statistics:
 * - PnL (daily, weekly, monthly, all-time)
 * - Win rate and trade metrics
 * - Bot performance and critique insights
 * - Real-time position info
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Percent, 
  BarChart2,
  Target,
  AlertTriangle,
  Clock,
  Zap,
  Award,
  Activity,
  RefreshCw,
  ChevronRight,
  Brain,
  LineChart
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface Stats {
  totalPnl: number;
  todayPnl: number;
  weekPnl: number;
  monthPnl: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  currentDrawdown: number;
  profitFactor: number;
  sharpeRatio: number;
  expectancy: number;
  avgHoldTime: string;
  streak: { type: 'win' | 'loss'; count: number };
}

interface CritiqueInsight {
  id: string;
  type: 'success' | 'warning' | 'info';
  message: string;
  timestamp: number;
}

interface StatsPanelProps {
  botId?: string;
  position?: {
    symbol: string;
    side: 'long' | 'short' | 'none';
    size: number;
    entryPrice: number;
    markPrice: number;
    pnl: number;
    pnlPercent: number;
    leverage: number;
  } | null;
}

interface Trade {
  id: string;
  side: 'buy' | 'sell';
  symbol: string;
  price: number;
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
  confidence: number;
  reasoning: string;
  timestamp: number;
  status: 'open' | 'closed' | 'cancelled';
  pnl?: number;
}

export default function StatsPanel({ botId = 'default', position }: StatsPanelProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [insights, setInsights] = useState<CritiqueInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'insights'>('overview');

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch stats from new API endpoint
      const statsRes = await fetch(`${API_URL}/trading/stats`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const s = statsData.stats;
        const p = statsData.periods;
        
        setStats({
          totalPnl: s.totalPnl || 0,
          todayPnl: p?.today?.pnl || 0,
          weekPnl: p?.week?.pnl || 0,
          monthPnl: p?.month?.pnl || 0,
          winRate: s.winRate || 0,
          totalTrades: s.totalTrades || 0,
          winningTrades: s.winningTrades || 0,
          losingTrades: s.losingTrades || 0,
          avgWin: s.avgWin || 0,
          avgLoss: s.avgLoss || 0,
          largestWin: s.bestTrade || 0,
          largestLoss: Math.abs(s.worstTrade || 0),
          maxDrawdown: s.maxDrawdown || 0,
          currentDrawdown: 0,
          profitFactor: s.avgLoss > 0 ? s.avgWin / s.avgLoss : 0,
          sharpeRatio: 0,
          expectancy: s.expectancy || 0,
          avgHoldTime: '0h',
          streak: { type: 'win', count: 0 },
        });
      }
      
      // Fetch trade history
      const tradeRes = await fetch(`${API_URL}/trading/trade-history?limit=50`);
      if (tradeRes.ok) {
        const data = await tradeRes.json();
        setTrades(data.trades || []);
      }
      
      if (!statsRes.ok) {
        // Use placeholder stats
        setStats({
          totalPnl: 0,
          todayPnl: 0,
          weekPnl: 0,
          monthPnl: 0,
          winRate: 0,
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          avgWin: 0,
          avgLoss: 0,
          largestWin: 0,
          largestLoss: 0,
          maxDrawdown: 0,
          currentDrawdown: 0,
          profitFactor: 0,
          sharpeRatio: 0,
          expectancy: 0,
          avgHoldTime: '0h',
          streak: { type: 'win', count: 0 },
        });
      }

      // Fetch analysis history as insights
      const analysisRes = await fetch(`${API_URL}/trading/analysis-history?limit=5`);
      if (analysisRes.ok) {
        const data = await analysisRes.json();
        const formattedInsights: CritiqueInsight[] = (data.analyses || []).slice(0, 3).map((a: any) => ({
          id: a.id,
          type: a.action === 'LONG' || a.action === 'SHORT' ? 'success' : 'info',
          message: `${a.action} @ $${a.price?.toLocaleString()} (${a.confidence}%)`,
          timestamp: a.timestamp,
        }));
        setInsights(formattedInsights);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchStats]);

  const formatPnl = (value: number) => {
    const formatted = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          Performance
        </h3>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['overview', 'trades', 'insights'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab 
                ? 'text-primary border-b-2 border-primary bg-primary/5' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Current Position */}
            {position && position.side !== 'none' && (
              <div className={`p-3 rounded-lg border ${
                position.side === 'long' 
                  ? 'bg-green-500/10 border-green-500/30' 
                  : 'bg-red-500/10 border-red-500/30'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {position.side === 'long' ? (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                    <span className="font-medium text-sm">{position.side.toUpperCase()}</span>
                    <span className="text-xs text-muted-foreground">{position.leverage}x</span>
                  </div>
                  <span className="font-mono text-sm">{position.size} {position.symbol.split('-')[0]}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Entry</div>
                    <div className="font-mono text-sm">${position.entryPrice.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Mark</div>
                    <div className="font-mono text-sm">${position.markPrice.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">PnL</div>
                    <div className={`font-mono text-sm font-bold ${position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatPnl(position.pnl)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">ROE</div>
                    <div className={`font-mono text-sm font-bold ${position.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatPercent(position.pnlPercent)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PnL Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <DollarSign className="w-3 h-3" />
                  Today
                </div>
                <div className={`font-mono font-bold ${(stats?.todayPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatPnl(stats?.todayPnl || 0)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <DollarSign className="w-3 h-3" />
                  This Week
                </div>
                <div className={`font-mono font-bold ${(stats?.weekPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatPnl(stats?.weekPnl || 0)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <DollarSign className="w-3 h-3" />
                  This Month
                </div>
                <div className={`font-mono font-bold ${(stats?.monthPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatPnl(stats?.monthPnl || 0)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <DollarSign className="w-3 h-3" />
                  All Time
                </div>
                <div className={`font-mono font-bold ${(stats?.totalPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatPnl(stats?.totalPnl || 0)}
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Target className="w-3 h-3" />
                  Win Rate
                </span>
                <span className={`font-mono font-medium ${(stats?.winRate || 0) >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                  {stats?.winRate?.toFixed(1) || '0.0'}%
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Activity className="w-3 h-3" />
                  Total Trades
                </span>
                <span className="font-mono font-medium">{stats?.totalTrades || 0}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Zap className="w-3 h-3" />
                  Profit Factor
                </span>
                <span className="font-mono font-medium">{stats?.profitFactor?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" />
                  Max Drawdown
                </span>
                <span className="font-mono font-medium text-red-500">
                  {stats?.maxDrawdown?.toFixed(1) || '0.0'}%
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Award className="w-3 h-3" />
                  Current Streak
                </span>
                <span className={`font-mono font-medium ${stats?.streak?.type === 'win' ? 'text-green-500' : 'text-red-500'}`}>
                  {stats?.streak?.count || 0} {stats?.streak?.type === 'win' ? 'wins' : 'losses'}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trades' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="text-xs text-green-400 mb-1">Winning Trades</div>
                <div className="font-mono text-xl font-bold text-green-500">{stats?.winningTrades || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Avg: {formatPnl(stats?.avgWin || 0)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="text-xs text-red-400 mb-1">Losing Trades</div>
                <div className="font-mono text-xl font-bold text-red-500">{stats?.losingTrades || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Avg: {formatPnl(-(stats?.avgLoss || 0))}
                </div>
              </div>
            </div>

            {/* Recent Trades List */}
            <div className="mt-4">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                <Activity className="w-3 h-3" />
                Recent Trades
              </div>
              {trades.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {trades.slice(0, 10).map((trade) => (
                    <div
                      key={trade.id}
                      className={`p-2 rounded-lg border ${
                        trade.side === 'buy'
                          ? 'bg-green-500/5 border-green-500/20'
                          : 'bg-red-500/5 border-red-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {trade.side === 'buy' ? (
                            <TrendingUp className="w-3 h-3 text-green-500" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-red-500" />
                          )}
                          <span className={`text-xs font-bold ${
                            trade.side === 'buy' ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {trade.side.toUpperCase()}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {trade.quantity} BTC
                          </span>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          trade.status === 'open' 
                            ? 'bg-blue-500/20 text-blue-400' 
                            : trade.status === 'closed'
                            ? 'bg-gray-500/20 text-gray-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {trade.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          @ ${trade.price.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">
                          {trade.confidence}% conf
                        </span>
                      </div>
                      {(trade.stopLoss || trade.takeProfit) && (
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          {trade.stopLoss && (
                            <span className="text-red-400">
                              SL: ${trade.stopLoss.toLocaleString()}
                            </span>
                          )}
                          {trade.takeProfit && (
                            <span className="text-green-400">
                              TP: ${trade.takeProfit.toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground/70">
                        {new Date(trade.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Activity className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p>No trades yet</p>
                </div>
              )}
            </div>

            <div className="space-y-2 mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Largest Win</span>
                <span className="font-mono font-medium text-green-500">
                  {formatPnl(stats?.largestWin || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Largest Loss</span>
                <span className="font-mono font-medium text-red-500">
                  {formatPnl(-(stats?.largestLoss || 0))}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Expectancy</span>
                <span className={`font-mono font-medium ${(stats?.expectancy || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatPnl(stats?.expectancy || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Avg Hold Time</span>
                <span className="font-mono font-medium">{stats?.avgHoldTime || '0h'}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Brain className="w-4 h-4 text-purple-500" />
              AI Critique Insights (every 5 trades)
            </div>
            
            {insights.length > 0 ? (
              insights.map(insight => (
                <div
                  key={insight.id}
                  className={`p-3 rounded-lg border ${
                    insight.type === 'success' 
                      ? 'bg-green-500/10 border-green-500/20' 
                      : insight.type === 'warning'
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : 'bg-blue-500/10 border-blue-500/20'
                  }`}
                >
                  <p className="text-sm">{insight.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(insight.timestamp).toLocaleDateString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No insights yet</p>
                <p className="text-xs mt-1">AI will analyze after 5 trades</p>
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted/50 mt-4">
              <div className="text-xs text-muted-foreground mb-2">How it works</div>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>• Bot analyzes every 5 completed trades</li>
                <li>• Identifies patterns and mistakes</li>
                <li>• Suggests parameter adjustments</li>
                <li>• Learns from wins and losses</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
