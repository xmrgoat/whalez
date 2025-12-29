'use client';

import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  DollarSign,
  BarChart3,
  Layers,
  RefreshCw,
  Info
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface MarketData {
  symbol: string;
  coin: string;
  price: {
    mid: number;
    bid: number;
    ask: number;
    mark: number;
    index: number;
  };
  funding: {
    rate: number;
    ratePercent: number;
    apy: number;
    premium: number;
    nextFunding: string;
  };
  openInterest: {
    value: number;
    valueUsd: number;
  };
  volume24h: number;
  orderbook: {
    bids: Array<{ price: number; size: number; total: number }>;
    asks: Array<{ price: number; size: number; total: number }>;
    spread: number;
    spreadPct: number;
    imbalance: number;
    imbalanceLabel: string;
  };
  marketInfo: {
    maxLeverage: number;
    tickSize: number;
    stepSize: number;
    minOrderSize: number;
    marginType: string;
  };
}

interface MarketDataPanelProps {
  symbol: string;
  compact?: boolean;
}

export default function MarketDataPanel({ symbol, compact = false }: MarketDataPanelProps) {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/market/full-context?symbol=${symbol}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        setLastUpdate(Date.now());
        setError(null);
      } else {
        setError(json.error || 'Failed to fetch');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, [symbol]);

  if (loading && !data) {
    return (
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-1/3 mb-3"></div>
        <div className="h-8 bg-white/10 rounded w-2/3"></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const fundingColor = data.funding.apy > 0 ? 'text-red-400' : 'text-green-400';
  const fundingBg = data.funding.apy > 0 ? 'bg-red-500/10' : 'bg-green-500/10';
  const imbalanceColor = data.orderbook.imbalance > 0.55 ? 'text-green-400' : data.orderbook.imbalance < 0.45 ? 'text-red-400' : 'text-white/60';

  if (compact) {
    return (
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-white/40">Funding:</span>
          <span className={fundingColor}>{data.funding.ratePercent.toFixed(4)}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-white/40">OI:</span>
          <span className="text-white/70">${(data.openInterest.valueUsd / 1e6).toFixed(1)}M</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-white/40">Spread:</span>
          <span className="text-white/70">{data.orderbook.spreadPct.toFixed(4)}%</span>
        </div>
        <div className={`flex items-center gap-1.5 ${imbalanceColor}`}>
          {data.orderbook.imbalance > 0.55 ? <TrendingUp className="w-3 h-3" /> : data.orderbook.imbalance < 0.45 ? <TrendingDown className="w-3 h-3" /> : null}
          <span>{data.orderbook.imbalanceLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          Market Data
        </h3>
        <button onClick={fetchData} className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg bg-white/5">
          <div className="text-[10px] text-white/40 mb-0.5">Mark Price</div>
          <div className="text-sm font-mono text-white">${data.price.mark.toLocaleString()}</div>
        </div>
        <div className="p-2 rounded-lg bg-white/5">
          <div className="text-[10px] text-white/40 mb-0.5">Index Price</div>
          <div className="text-sm font-mono text-white">${data.price.index.toLocaleString()}</div>
        </div>
        <div className="p-2 rounded-lg bg-white/5">
          <div className="text-[10px] text-white/40 mb-0.5">24h Volume</div>
          <div className="text-sm font-mono text-white">${(data.volume24h / 1e6).toFixed(1)}M</div>
        </div>
      </div>

      {/* Funding Rate */}
      <div className={`p-3 rounded-lg ${fundingBg} border border-white/5`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-white/70">Funding Rate</span>
          </div>
          <span className="text-[10px] text-white/40">Next: {data.funding.nextFunding}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className={`text-lg font-bold font-mono ${fundingColor}`}>
            {data.funding.ratePercent >= 0 ? '+' : ''}{data.funding.ratePercent.toFixed(4)}%
          </span>
          <span className={`text-xs ${fundingColor}`}>
            APY: {data.funding.apy >= 0 ? '+' : ''}{data.funding.apy.toFixed(2)}%
          </span>
        </div>
        <div className="text-[10px] text-white/40 mt-1">
          {data.funding.apy > 0 ? '📈 Longs pay shorts' : '📉 Shorts pay longs'}
        </div>
      </div>

      {/* Open Interest */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-purple-400" />
          <span className="text-xs text-white/70">Open Interest</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold font-mono text-white">
            {data.openInterest.value.toFixed(2)} {data.coin}
          </span>
        </div>
        <div className="text-xs text-white/40">
          ≈ ${(data.openInterest.valueUsd / 1e6).toFixed(2)}M USD
        </div>
      </div>

      {/* Orderbook Summary */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-white/70">Orderbook</span>
        </div>
        
        {/* Spread */}
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-white/40">Spread</span>
          <span className="font-mono text-white/70">${data.orderbook.spread.toFixed(2)} ({data.orderbook.spreadPct.toFixed(4)}%)</span>
        </div>

        {/* Imbalance Bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-green-400">Bids</span>
            <span className={`font-medium ${imbalanceColor}`}>{data.orderbook.imbalanceLabel}</span>
            <span className="text-red-400">Asks</span>
          </div>
          <div className="h-2 rounded-full bg-red-500/30 overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${data.orderbook.imbalance * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
            <span>{(data.orderbook.imbalance * 100).toFixed(1)}%</span>
            <span>{((1 - data.orderbook.imbalance) * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* Top Levels */}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <div className="text-green-400/70 mb-1">Top Bids</div>
            {data.orderbook.bids.slice(0, 3).map((bid, i) => (
              <div key={i} className="flex justify-between text-white/50">
                <span>${bid.price.toLocaleString()}</span>
                <span>{bid.size.toFixed(4)}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-red-400/70 mb-1">Top Asks</div>
            {data.orderbook.asks.slice(0, 3).map((ask, i) => (
              <div key={i} className="flex justify-between text-white/50">
                <span>${ask.price.toLocaleString()}</span>
                <span>{ask.size.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Market Info */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-white/40" />
          <span className="text-xs text-white/70">Market Info</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-white/40">Max Leverage</span>
            <span className="text-white/70">{data.marketInfo.maxLeverage}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Tick Size</span>
            <span className="text-white/70">${data.marketInfo.tickSize}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Step Size</span>
            <span className="text-white/70">{data.marketInfo.stepSize}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Margin</span>
            <span className="text-white/70">{data.marketInfo.marginType}</span>
          </div>
        </div>
      </div>

      {/* Last Update */}
      <div className="text-[10px] text-white/30 text-center">
        Updated {new Date(lastUpdate).toLocaleTimeString()}
      </div>
    </div>
  );
}
