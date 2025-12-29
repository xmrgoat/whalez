'use client';

/**
 * Leaderboard Page - Modern & Clean Design
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  Trophy,
  TrendingUp,
  ArrowLeft,
  Crown,
  Loader2,
  ChevronUp,
  ChevronDown,
  Flame,
  Target,
  BarChart2,
  Activity,
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  walletAddressFull: string;
  botName: string;
  totalPnl: number;
  totalVolume: number;
  totalFees: number;
  totalTrades: number;
  winRate: number;
  wins: number;
  losses: number;
}

type SortBy = 'pnl' | 'volume' | 'winrate' | 'trades';

export default function LeaderboardPage() {
  const router = useRouter();
  const { wallet } = useWallet();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('pnl');
  const [totalTraders, setTotalTraders] = useState(0);

  useEffect(() => {
    fetchLeaderboard();
  }, [sortBy]);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/trading/leaderboard?sortBy=${sortBy}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
        setTotalTraders(data.totalTraders || 0);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPnl = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${value >= 0 ? '+' : '-'}$${(abs / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${value >= 0 ? '+' : '-'}$${(abs / 1000).toFixed(1)}K`;
    return `${value >= 0 ? '+' : '-'}$${abs.toFixed(0)}`;
  };

  const formatVolume = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const sortTabs = [
    { key: 'pnl' as SortBy, label: 'PnL' },
    { key: 'volume' as SortBy, label: 'Volume' },
    { key: 'winrate' as SortBy, label: 'Win Rate' },
    { key: 'trades' as SortBy, label: 'Trades' },
  ];

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

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
                <Trophy className="w-4 h-4 text-amber-400" />
                <h1 className="text-[15px] font-medium text-white/90">Leaderboard</h1>
              </div>
              <span className="text-xs text-white/30">{totalTraders} traders</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Sort Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] w-fit mb-6">
          {sortTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setSortBy(tab.key)}
              className={`px-4 h-8 rounded-md text-xs font-medium transition-colors ${
                sortBy === tab.key 
                  ? 'bg-white/10 text-white' 
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/40">No traders yet</p>
          </div>
        ) : (
          <>
            {/* Top 3 Podium */}
            {top3.length >= 3 && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                {/* 2nd Place */}
                <div className="flex flex-col items-center pt-6">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-zinc-400/20 to-zinc-500/10 border border-zinc-400/20 flex items-center justify-center">
                      <span className="text-lg font-bold text-zinc-300">
                        {top3[1]?.botName?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-zinc-400/20 border border-zinc-400/30 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-zinc-300">2</span>
                    </div>
                  </div>
                  <div className="mt-3 text-center">
                    <p className="text-xs font-medium text-white/80 truncate max-w-[100px]">
                      {top3[1]?.botName || 'Anonymous'}
                    </p>
                    <p className="text-[10px] text-white/30 font-mono">{top3[1]?.walletAddress}</p>
                    <p className={`text-sm font-semibold mt-1 ${top3[1]?.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatPnl(top3[1]?.totalPnl || 0)}
                    </p>
                  </div>
                </div>

                {/* 1st Place */}
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <Crown className="w-5 h-5 text-amber-400 absolute -top-6 left-1/2 -translate-x-1/2" />
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-400/30 to-amber-500/10 border border-amber-400/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
                      <span className="text-xl font-bold text-amber-400">
                        {top3[0]?.botName?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400/30 border border-amber-400/40 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-amber-400">1</span>
                    </div>
                  </div>
                  <div className="mt-3 text-center">
                    <p className="text-sm font-medium text-white truncate max-w-[120px]">
                      {top3[0]?.botName || 'Anonymous'}
                    </p>
                    <p className="text-[10px] text-white/30 font-mono">{top3[0]?.walletAddress}</p>
                    <p className={`text-base font-bold mt-1 ${top3[0]?.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatPnl(top3[0]?.totalPnl || 0)}
                    </p>
                  </div>
                </div>

                {/* 3rd Place */}
                <div className="flex flex-col items-center pt-8">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600/20 to-amber-700/10 border border-amber-600/20 flex items-center justify-center">
                      <span className="text-base font-bold text-amber-500">
                        {top3[2]?.botName?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-600/20 border border-amber-600/30 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-amber-500">3</span>
                    </div>
                  </div>
                  <div className="mt-3 text-center">
                    <p className="text-xs font-medium text-white/80 truncate max-w-[90px]">
                      {top3[2]?.botName || 'Anonymous'}
                    </p>
                    <p className="text-[10px] text-white/30 font-mono">{top3[2]?.walletAddress}</p>
                    <p className={`text-sm font-semibold mt-1 ${top3[2]?.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatPnl(top3[2]?.totalPnl || 0)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Rest of leaderboard */}
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-white/[0.02] border-b border-white/[0.04] text-[10px] font-medium text-white/30 uppercase tracking-wider">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Trader</div>
                <div className="col-span-2 text-right">PnL</div>
                <div className="col-span-2 text-right">Volume</div>
                <div className="col-span-1 text-right">Trades</div>
                <div className="col-span-2 text-right">Win Rate</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-white/[0.04]">
                {rest.map((entry, index) => {
                  const rank = index + 4;
                  const isCurrentUser = wallet?.address?.toLowerCase() === entry.walletAddressFull?.toLowerCase();
                  
                  return (
                    <div 
                      key={entry.walletAddressFull || index}
                      className={`grid grid-cols-12 gap-4 px-4 py-3 items-center transition-colors ${
                        isCurrentUser ? 'bg-emerald-500/[0.08]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="col-span-1">
                        <span className="text-xs text-white/40 font-mono">{rank}</span>
                      </div>
                      
                      <div className="col-span-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-xs font-medium text-white/50">
                          {entry.botName?.charAt(0) || '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-white/90 truncate">{entry.botName || 'Anonymous'}</p>
                            {isCurrentUser && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/20 text-emerald-400">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-white/30 font-mono">{entry.walletAddress}</p>
                        </div>
                      </div>
                      
                      <div className="col-span-2 text-right">
                        <span className={`text-sm font-medium ${entry.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatPnl(entry.totalPnl)}
                        </span>
                      </div>
                      
                      <div className="col-span-2 text-right">
                        <span className="text-sm text-white/50">{formatVolume(entry.totalVolume)}</span>
                      </div>
                      
                      <div className="col-span-1 text-right">
                        <span className="text-sm text-white/50">{entry.totalTrades}</span>
                      </div>
                      
                      <div className="col-span-2 text-right flex items-center justify-end gap-2">
                        <div className="w-12 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${entry.winRate >= 50 ? 'bg-emerald-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(100, entry.winRate)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${entry.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {entry.winRate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-[11px] text-white/20 mt-6">
              Rankings update in real-time
            </p>
          </>
        )}
      </main>
    </div>
  );
}
