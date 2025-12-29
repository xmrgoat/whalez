'use client';

/**
 * TradeHistory Component
 * Professional trade history view like MetaTrader/TradingView
 * Shows all trades with filtering, sorting, and detailed stats
 */

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  DollarSign,
  Percent,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface Trade {
  id: string;
  side: 'buy' | 'sell';
  symbol: string;
  price: number;
  exitPrice?: number;
  quantity: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  entryFee: number;
  exitFee: number;
  pnl?: number;
  confidence?: number;
  reasoning?: string;
  timestamp: number;
  exitTime?: number;
  status: 'open' | 'closed' | 'cancelled';
}

interface PeriodStats {
  pnl: number;
  fees: number;
  trades: number;
}

interface Props {
  walletAddress?: string;
  onTradeSelect?: (trade: Trade) => void;
}

type SortField = 'timestamp' | 'pnl' | 'quantity' | 'price';
type SortDirection = 'asc' | 'desc';
type FilterStatus = 'all' | 'open' | 'closed' | 'winning' | 'losing';
type FilterPeriod = 'all' | 'today' | 'week' | 'month';

export default function TradeHistory({ walletAddress, onTradeSelect }: Props) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [periodStats, setPeriodStats] = useState<{
    today: PeriodStats;
    week: PeriodStats;
    month: PeriodStats;
    allTime: PeriodStats;
  } | null>(null);

  // Fetch trades
  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      const url = walletAddress 
        ? `${API_URL}/trading/trade-history?limit=200&wallet=${walletAddress}`
        : `${API_URL}/trading/trade-history?limit=200`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
      }

      // Fetch stats
      const statsUrl = walletAddress
        ? `${API_URL}/trading/stats?wallet=${walletAddress}`
        : `${API_URL}/trading/stats`;
      
      const statsRes = await fetch(statsUrl);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setPeriodStats(statsData.periods);
      }
    } catch (err) {
      console.error('Failed to fetch trades:', err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 30000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  // Filter and sort trades
  const filteredTrades = trades.filter(trade => {
    // Status filter
    if (filterStatus === 'open' && trade.status !== 'open') return false;
    if (filterStatus === 'closed' && trade.status !== 'closed') return false;
    if (filterStatus === 'winning' && (trade.pnl === undefined || trade.pnl <= 0)) return false;
    if (filterStatus === 'losing' && (trade.pnl === undefined || trade.pnl >= 0)) return false;

    // Period filter
    if (filterPeriod !== 'all') {
      const now = Date.now();
      const tradeTime = trade.timestamp;
      
      if (filterPeriod === 'today') {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (tradeTime < todayStart.getTime()) return false;
      } else if (filterPeriod === 'week') {
        if (now - tradeTime > 7 * 24 * 60 * 60 * 1000) return false;
      } else if (filterPeriod === 'month') {
        if (now - tradeTime > 30 * 24 * 60 * 60 * 1000) return false;
      }
    }

    return true;
  }).sort((a, b) => {
    let aVal: number, bVal: number;
    
    switch (sortField) {
      case 'pnl':
        aVal = a.pnl || 0;
        bVal = b.pnl || 0;
        break;
      case 'quantity':
        aVal = a.quantity;
        bVal = b.quantity;
        break;
      case 'price':
        aVal = a.price;
        bVal = b.price;
        break;
      default:
        aVal = a.timestamp;
        bVal = b.timestamp;
    }

    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Calculate summary stats for filtered trades
  const summaryStats = {
    totalTrades: filteredTrades.length,
    openTrades: filteredTrades.filter(t => t.status === 'open').length,
    closedTrades: filteredTrades.filter(t => t.status === 'closed').length,
    totalPnl: filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0),
    totalFees: filteredTrades.reduce((sum, t) => sum + (t.entryFee || 0) + (t.exitFee || 0), 0),
    winRate: (() => {
      const closed = filteredTrades.filter(t => t.status === 'closed' && t.pnl !== undefined);
      const wins = closed.filter(t => (t.pnl || 0) > 0);
      return closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    })(),
  };

  const formatPnl = (value: number) => {
    const formatted = Math.abs(value).toFixed(2);
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          Trade History
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded hover:bg-muted ${showFilters ? 'bg-muted text-primary' : 'text-muted-foreground'}`}
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={fetchTrades}
            disabled={loading}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Period Stats */}
      {periodStats && (
        <div className="grid grid-cols-4 gap-2 p-3 border-b border-border bg-muted/20">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Today</div>
            <div className={`font-mono text-sm font-bold ${periodStats.today.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatPnl(periodStats.today.pnl)}
            </div>
            <div className="text-xs text-muted-foreground">{periodStats.today.trades} trades</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">This Week</div>
            <div className={`font-mono text-sm font-bold ${periodStats.week.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatPnl(periodStats.week.pnl)}
            </div>
            <div className="text-xs text-muted-foreground">{periodStats.week.trades} trades</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">This Month</div>
            <div className={`font-mono text-sm font-bold ${periodStats.month.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatPnl(periodStats.month.pnl)}
            </div>
            <div className="text-xs text-muted-foreground">{periodStats.month.trades} trades</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">All Time</div>
            <div className={`font-mono text-sm font-bold ${periodStats.allTime.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatPnl(periodStats.allTime.pnl)}
            </div>
            <div className="text-xs text-muted-foreground">{periodStats.allTime.trades} trades</div>
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="p-3 border-b border-border bg-muted/10 flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="text-xs bg-muted border border-border rounded px-2 py-1"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="winning">Winning</option>
              <option value="losing">Losing</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Period:</span>
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
              className="text-xs bg-muted border border-border rounded px-2 py-1"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>
      )}

      {/* Summary Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10 text-xs">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {summaryStats.totalTrades} trades ({summaryStats.openTrades} open)
          </span>
          <span className={`font-mono font-bold ${summaryStats.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            PnL: {formatPnl(summaryStats.totalPnl)}
          </span>
          <span className="text-muted-foreground">
            Fees: ${summaryStats.totalFees.toFixed(2)}
          </span>
          <span className={`font-mono ${summaryStats.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
            Win: {summaryStats.winRate.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
        <button 
          onClick={() => handleSort('timestamp')} 
          className="col-span-2 flex items-center gap-1 hover:text-foreground"
        >
          Date <SortIcon field="timestamp" />
        </button>
        <div className="col-span-1">Side</div>
        <div className="col-span-2">Symbol</div>
        <button 
          onClick={() => handleSort('price')} 
          className="col-span-2 flex items-center gap-1 hover:text-foreground"
        >
          Entry <SortIcon field="price" />
        </button>
        <div className="col-span-1">Exit</div>
        <button 
          onClick={() => handleSort('quantity')} 
          className="col-span-1 flex items-center gap-1 hover:text-foreground"
        >
          Size <SortIcon field="quantity" />
        </button>
        <button 
          onClick={() => handleSort('pnl')} 
          className="col-span-2 flex items-center gap-1 hover:text-foreground"
        >
          PnL <SortIcon field="pnl" />
        </button>
        <div className="col-span-1">Status</div>
      </div>

      {/* Trade List */}
      <div className="flex-1 overflow-y-auto">
        {filteredTrades.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Clock className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No trades found</p>
          </div>
        ) : (
          filteredTrades.map((trade) => (
            <div
              key={trade.id}
              onClick={() => {
                setSelectedTrade(trade);
                onTradeSelect?.(trade);
              }}
              className={`grid grid-cols-12 gap-2 px-4 py-2 border-b border-border/50 text-xs cursor-pointer hover:bg-muted/30 transition-colors ${
                selectedTrade?.id === trade.id ? 'bg-primary/10' : ''
              }`}
            >
              <div className="col-span-2 text-muted-foreground">
                {formatDate(trade.timestamp)}
              </div>
              <div className="col-span-1">
                <span className={`flex items-center gap-1 font-bold ${
                  trade.side === 'buy' ? 'text-green-500' : 'text-red-500'
                }`}>
                  {trade.side === 'buy' ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {trade.side.toUpperCase()}
                </span>
              </div>
              <div className="col-span-2 font-mono">{trade.symbol}</div>
              <div className="col-span-2 font-mono">${trade.price.toLocaleString()}</div>
              <div className="col-span-1 font-mono text-muted-foreground">
                {trade.exitPrice ? `$${trade.exitPrice.toLocaleString()}` : '-'}
              </div>
              <div className="col-span-1 font-mono">{trade.quantity}</div>
              <div className={`col-span-2 font-mono font-bold ${
                (trade.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {trade.pnl !== undefined ? formatPnl(trade.pnl) : '-'}
              </div>
              <div className="col-span-1">
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  trade.status === 'open' 
                    ? 'bg-blue-500/20 text-blue-400'
                    : trade.status === 'closed'
                    ? (trade.pnl || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {trade.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Trade Detail Modal */}
      {selectedTrade && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedTrade(null)}>
          <div className="bg-card border border-border rounded-xl p-4 w-96 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold flex items-center gap-2">
                {selectedTrade.side === 'buy' ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                {selectedTrade.side.toUpperCase()} {selectedTrade.symbol}
              </h4>
              <button onClick={() => setSelectedTrade(null)} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 bg-muted/30 rounded">
                  <div className="text-xs text-muted-foreground">Entry Price</div>
                  <div className="font-mono font-bold">${selectedTrade.price.toLocaleString()}</div>
                </div>
                <div className="p-2 bg-muted/30 rounded">
                  <div className="text-xs text-muted-foreground">Exit Price</div>
                  <div className="font-mono font-bold">
                    {selectedTrade.exitPrice ? `$${selectedTrade.exitPrice.toLocaleString()}` : '-'}
                  </div>
                </div>
                <div className="p-2 bg-muted/30 rounded">
                  <div className="text-xs text-muted-foreground">Size</div>
                  <div className="font-mono font-bold">{selectedTrade.quantity} BTC</div>
                </div>
                <div className="p-2 bg-muted/30 rounded">
                  <div className="text-xs text-muted-foreground">Leverage</div>
                  <div className="font-mono font-bold">{selectedTrade.leverage}x</div>
                </div>
              </div>

              {(selectedTrade.stopLoss || selectedTrade.takeProfit) && (
                <div className="grid grid-cols-2 gap-3">
                  {selectedTrade.stopLoss && (
                    <div className="p-2 bg-red-500/10 border border-red-500/20 rounded">
                      <div className="text-xs text-red-400">Stop Loss</div>
                      <div className="font-mono font-bold text-red-500">${selectedTrade.stopLoss.toLocaleString()}</div>
                    </div>
                  )}
                  {selectedTrade.takeProfit && (
                    <div className="p-2 bg-green-500/10 border border-green-500/20 rounded">
                      <div className="text-xs text-green-400">Take Profit</div>
                      <div className="font-mono font-bold text-green-500">${selectedTrade.takeProfit.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="p-3 bg-muted/30 rounded">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">PnL (after fees)</span>
                  <span className={`font-mono font-bold ${(selectedTrade.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {selectedTrade.pnl !== undefined ? formatPnl(selectedTrade.pnl) : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Entry Fee</span>
                  <span className="font-mono">${selectedTrade.entryFee?.toFixed(4) || '0'}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Exit Fee</span>
                  <span className="font-mono">${selectedTrade.exitFee?.toFixed(4) || '0'}</span>
                </div>
              </div>

              {selectedTrade.confidence && (
                <div className="p-2 bg-muted/30 rounded">
                  <div className="text-xs text-muted-foreground mb-1">AI Confidence</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          selectedTrade.confidence >= 70 ? 'bg-green-500' :
                          selectedTrade.confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${selectedTrade.confidence}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm font-bold">{selectedTrade.confidence}%</span>
                  </div>
                </div>
              )}

              {selectedTrade.reasoning && (
                <div className="p-2 bg-muted/30 rounded">
                  <div className="text-xs text-muted-foreground mb-1">AI Reasoning</div>
                  <p className="text-xs text-foreground/80">{selectedTrade.reasoning}</p>
                </div>
              )}

              <div className="text-xs text-muted-foreground text-center">
                Opened: {formatDate(selectedTrade.timestamp)}
                {selectedTrade.exitTime && (
                  <> • Closed: {formatDate(selectedTrade.exitTime)}</>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
