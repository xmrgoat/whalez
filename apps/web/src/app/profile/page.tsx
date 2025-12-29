'use client';

/**
 * Profile Page - Modern & Clean Design
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useWallet } from '@/context/WalletContext';
import {
  User,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  LogOut,
  Loader2,
  Clock,
  Settings,
} from 'lucide-react';

const PnlChart = dynamic(() => import('@/components/PnlChart'), { ssr: false });

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface UserStats {
  totalPnl: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalVolume: number;
}

interface TradeHistory {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  pnl: number;
  pnlPercent: number;
  exitTime: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { wallet, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet.isConnected) {
      router.push('/');
      return;
    }
    fetchUserData();
  }, [wallet.isConnected, router]);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      if (wallet.address) {
        const perfRes = await fetch(`${API_URL}/trading/performance?wallet=${wallet.address}`);
        if (perfRes.ok) {
          const perf = await perfRes.json();
          const summary = perf.summary;
          setStats({
            totalPnl: summary.totalPnl || 0,
            totalTrades: summary.totalTrades || 0,
            winRate: summary.winRate || 0,
            profitFactor: summary.profitFactor || 0,
            maxDrawdown: summary.maxDrawdownPct || 0,
            totalVolume: summary.totalVolume || 0,
          });
        }

        const tradesRes = await fetch(`${API_URL}/trading/trade-history?wallet=${wallet.address}&limit=20`);
        if (tradesRes.ok) {
          const data = await tradesRes.json();
          setTrades((data.trades || []).map((t: any) => ({
            id: t.id,
            symbol: t.symbol,
            side: t.side === 'buy' ? 'long' : 'short',
            pnl: t.pnlWithFees || t.pnl || 0,
            pnlPercent: t.price > 0 ? ((t.pnlWithFees || t.pnl || 0) / (t.price * t.quantity)) * 100 : 0,
            exitTime: t.exitTime ? new Date(t.exitTime).toISOString() : new Date(t.timestamp).toISOString(),
          })));
        }
      }
    } catch (err) {
      console.error('Failed to fetch user data:', err);
      setStats({ totalPnl: 0, totalTrades: 0, winRate: 0, profitFactor: 0, maxDrawdown: 0, totalVolume: 0 });
    } finally {
      setLoading(false);
    }
  };

  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  
  const formatPnl = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1000) return `${value >= 0 ? '+' : '-'}$${(abs / 1000).toFixed(1)}K`;
    return `${value >= 0 ? '+' : '-'}$${abs.toFixed(2)}`;
  };

  if (!wallet.isConnected) return null;

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#09090b]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => router.push('/')} 
                className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/80 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                <h1 className="text-[15px] font-medium text-white/90">Profile</h1>
              </div>
            </div>
            
            <button
              onClick={() => { disconnect(); router.push('/'); }}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs font-medium text-red-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Profile Card */}
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center">
              <User className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-white/90">Trader</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04]">
                  <Wallet className="w-3 h-3 text-white/40" />
                  <span className="font-mono text-xs text-white/50">
                    {wallet.address ? formatAddress(wallet.address) : '...'}
                  </span>
                  <button onClick={copyAddress} className="p-0.5 rounded hover:bg-white/10">
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-white/30" />}
                  </button>
                </div>
                <a 
                  href={`https://app.hyperliquid.xyz/explorer/address/${wallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/60"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">PnL</p>
              <p className={`text-lg font-semibold ${(stats?.totalPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatPnl(stats?.totalPnl || 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Win Rate</p>
              <p className={`text-lg font-semibold ${(stats?.winRate || 0) >= 50 ? 'text-emerald-400' : 'text-white/70'}`}>
                {stats?.winRate?.toFixed(0) || '0'}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Trades</p>
              <p className="text-lg font-semibold text-white/80">{stats?.totalTrades || 0}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Volume</p>
              <p className="text-lg font-semibold text-white/80">
                ${((stats?.totalVolume || 0) / 1000).toFixed(0)}K
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] w-fit mb-6">
          {[
            { id: 'overview' as const, label: 'Overview' },
            { id: 'history' as const, label: 'History' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 h-8 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'bg-white/10 text-white' 
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
          </div>
        ) : activeTab === 'overview' ? (
          <div className="space-y-6">
            {/* PNL Chart */}
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
              <h3 className="text-sm font-medium text-white/80 mb-4">Performance</h3>
              <PnlChart walletAddress={wallet.address || undefined} height={180} showStats={true} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Profit Factor</p>
                <p className="text-xl font-semibold text-emerald-400">
                  {stats?.profitFactor?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Max Drawdown</p>
                <p className="text-xl font-semibold text-red-400">
                  -{stats?.maxDrawdown?.toFixed(1) || '0.0'}%
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Trade History */}
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-white/[0.04] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-white/40" />
                  <span className="text-sm font-medium text-white/80">Trade History</span>
                </div>
                <span className="text-xs text-white/30">{trades.length} trades</span>
              </div>
              
              {trades.length > 0 ? (
                <div className="divide-y divide-white/[0.04]">
                  {trades.map(trade => (
                    <div key={trade.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          trade.side === 'long' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                        }`}>
                          {trade.side === 'long' 
                            ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                            : <TrendingDown className="w-4 h-4 text-red-400" />
                          }
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white/80">{trade.symbol}</p>
                          <p className="text-[10px] text-white/30">
                            {new Date(trade.exitTime).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatPnl(trade.pnl)}
                        </p>
                        <p className="text-[10px] text-white/30">
                          {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Clock className="w-8 h-8 text-white/10 mx-auto mb-2" />
                  <p className="text-sm text-white/30">No trades yet</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
