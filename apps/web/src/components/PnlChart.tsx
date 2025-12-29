'use client';

/**
 * PNL Chart Component
 * 
 * Displays a line chart of cumulative PNL over time.
 * Uses lightweight-charts for performance.
 */

import { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';

interface PnlDataPoint {
  timestamp: number;
  pnl: number;
  cumulativePnl: number;
  tradeId: string;
}

interface DailyPnl {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

interface PerformanceSummary {
  totalTrades: number;
  closedTrades: number;
  winRate: number;
  totalPnl: number;
  totalFees: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  avgTradesPerDay: number;
  totalVolume: number;
  avgWin: number;
  avgLoss: number;
  bestMonth: { month: string; pnl: number };
  worstMonth: { month: string; pnl: number };
}

interface PnlChartProps {
  walletAddress?: string;
  height?: number;
  showStats?: boolean;
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

export default function PnlChart({ walletAddress, height = 200, showStats = true }: PnlChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [pnlHistory, setPnlHistory] = useState<PnlDataPoint[]>([]);
  const [dailyPnl, setDailyPnl] = useState<DailyPnl[]>([]);

  useEffect(() => {
    fetchPerformance();
    const interval = setInterval(fetchPerformance, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [walletAddress]);

  const fetchPerformance = async () => {
    try {
      const url = walletAddress 
        ? `${API_URL}/trading/performance?wallet=${walletAddress}`
        : `${API_URL}/trading/performance`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setPnlHistory(data.pnlHistory || []);
        setDailyPnl(data.dailyPnl || []);
      }
    } catch (err) {
      console.error('Failed to fetch performance:', err);
    } finally {
      setLoading(false);
    }
  };

  // Simple SVG line chart
  const renderChart = () => {
    if (pnlHistory.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No trading data yet</p>
            <p className="text-xs opacity-70">Start trading to see your PNL chart</p>
          </div>
        </div>
      );
    }

    const values = pnlHistory.map(p => p.cumulativePnl);
    const minVal = Math.min(...values, 0);
    const maxVal = Math.max(...values, 0);
    const range = maxVal - minVal || 1;
    const padding = 10;
    const chartHeight = height - padding * 2;
    const chartWidth = 100; // percentage

    // Create path
    const points = pnlHistory.map((p, i) => {
      const x = (i / (pnlHistory.length - 1 || 1)) * 100;
      const y = padding + ((maxVal - p.cumulativePnl) / range) * chartHeight;
      return `${x},${y}`;
    });

    const pathD = `M ${points.join(' L ')}`;
    const isPositive = (summary?.totalPnl || 0) >= 0;
    const strokeColor = isPositive ? '#22c55e' : '#ef4444';
    const fillColor = isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';

    // Create fill path
    const fillPathD = `${pathD} L 100,${height - padding} L 0,${height - padding} Z`;

    return (
      <svg 
        viewBox={`0 0 100 ${height}`} 
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        {/* Zero line */}
        <line 
          x1="0" 
          y1={padding + ((maxVal - 0) / range) * chartHeight}
          x2="100" 
          y2={padding + ((maxVal - 0) / range) * chartHeight}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.5"
          strokeDasharray="2,2"
        />
        
        {/* Fill */}
        <path 
          d={fillPathD}
          fill={fillColor}
        />
        
        {/* Line */}
        <path 
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* End point */}
        {pnlHistory.length > 0 && (
          <circle
            cx="100"
            cy={padding + ((maxVal - pnlHistory[pnlHistory.length - 1].cumulativePnl) / range) * chartHeight}
            r="3"
            fill={strokeColor}
          />
        )}
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="animate-pulse bg-muted/50 rounded-lg" style={{ height: height + (showStats ? 120 : 0) }} />
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="bg-card/50 rounded-lg p-4 border border-border/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Cumulative PNL</h3>
          <div className={`flex items-center gap-1 text-sm font-mono ${(summary?.totalPnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {(summary?.totalPnl || 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            ${(summary?.totalPnl || 0).toFixed(2)}
          </div>
        </div>
        <div ref={chartRef}>
          {renderChart()}
        </div>
      </div>

      {/* Stats Grid */}
      {showStats && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard 
            label="Total Trades" 
            value={summary.totalTrades.toString()} 
            icon={<Activity className="w-4 h-4" />}
          />
          <StatCard 
            label="Win Rate" 
            value={`${summary.winRate.toFixed(1)}%`}
            valueColor={summary.winRate >= 50 ? 'text-green-400' : 'text-red-400'}
          />
          <StatCard 
            label="Total PNL" 
            value={`$${summary.totalPnl.toFixed(2)}`}
            valueColor={summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}
            icon={<DollarSign className="w-4 h-4" />}
          />
          <StatCard 
            label="Max Drawdown" 
            value={`${summary.maxDrawdownPct.toFixed(1)}%`}
            valueColor="text-orange-400"
          />
          <StatCard 
            label="Avg Win" 
            value={`+$${summary.avgWin.toFixed(2)}`}
            valueColor="text-green-400"
          />
          <StatCard 
            label="Avg Loss" 
            value={`-$${summary.avgLoss.toFixed(2)}`}
            valueColor="text-red-400"
          />
          <StatCard 
            label="Profit Factor" 
            value={summary.profitFactor >= 999 ? '∞' : summary.profitFactor.toFixed(2)}
            valueColor={summary.profitFactor >= 1 ? 'text-green-400' : 'text-red-400'}
          />
          <StatCard 
            label="Total Fees" 
            value={`$${summary.totalFees.toFixed(4)}`}
            valueColor="text-muted-foreground"
          />
        </div>
      )}

      {/* Daily PNL bars */}
      {dailyPnl.length > 0 && (
        <div className="bg-card/50 rounded-lg p-4 border border-border/50">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Daily PNL</h3>
          <div className="flex items-end gap-1 h-16">
            {dailyPnl.slice(-14).map((day, i) => {
              const maxPnl = Math.max(...dailyPnl.map(d => Math.abs(d.pnl)), 1);
              const height = (Math.abs(day.pnl) / maxPnl) * 100;
              const isPositive = day.pnl >= 0;
              
              return (
                <div 
                  key={day.date}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${day.date}: $${day.pnl.toFixed(2)} (${day.trades} trades)`}
                >
                  <div 
                    className={`w-full rounded-sm transition-all ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ height: `${Math.max(height, 5)}%` }}
                  />
                  <span className="text-[8px] text-muted-foreground">
                    {new Date(day.date).getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  valueColor = 'text-foreground',
  icon 
}: { 
  label: string; 
  value: string; 
  valueColor?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-card/30 rounded-lg p-3 border border-border/30">
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-mono font-medium ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}
