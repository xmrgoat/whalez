'use client';

/**
 * Leaderboard Page
 * 
 * Global ranking of all traders by:
 * - Total PnL
 * - Volume
 * - Fees paid
 * - Win Rate
 * - Number of trades
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart2,
  Activity,
  ArrowLeft,
  Medal,
  Crown,
  Flame,
  RefreshCw,
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

type SortBy = 'pnl' | 'volume' | 'fees' | 'trades' | 'winrate';

export default function LeaderboardPage() {
  const router = useRouter();
  const wallet = useWallet();
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

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-400" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-300" />;
      case 3:
        return <Medal className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="text-muted-foreground font-mono">#{rank}</span>;
    }
  };

  const formatPnl = (value: number) => {
    const formatted = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  };

  const formatVolume = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const sortOptions: { key: SortBy; label: string; icon: React.ReactNode }[] = [
    { key: 'pnl', label: 'PnL', icon: <DollarSign className="w-4 h-4" /> },
    { key: 'volume', label: 'Volume', icon: <BarChart2 className="w-4 h-4" /> },
    { key: 'fees', label: 'Fees', icon: <Flame className="w-4 h-4" /> },
    { key: 'trades', label: 'Trades', icon: <Activity className="w-4 h-4" /> },
    { key: 'winrate', label: 'Win Rate', icon: <Trophy className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => router.push('/trade')}
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Trading</span>
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-display font-bold text-white">Leaderboard</h1>
          </div>
          
          <button
            onClick={fetchLeaderboard}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 relative z-10">
        {/* Stats Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-purple-500/10 border border-amber-500/20 p-6 mb-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-display font-bold mb-1 text-white">Global Rankings</h2>
              <p className="text-white/50">
                {totalTraders} traders competing on Whalez
              </p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-amber-400" />
            </div>
          </div>
        </div>

        {/* Sort Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/5 border border-white/10 w-fit overflow-x-auto">
          {sortOptions.map(option => (
            <button
              key={option.key}
              onClick={() => setSortBy(option.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                sortBy === option.key
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>

        {/* Leaderboard Table */}
        <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden backdrop-blur-sm">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-amber-400" />
              <p className="text-white/50">Loading leaderboard...</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="p-8 text-center">
              <Trophy className="w-12 h-12 mx-auto mb-4 text-white/20" />
              <p className="text-white/50">No traders yet. Be the first!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Rank</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Trader</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-white/40">PnL</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-white/40">Volume</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-white/40">Fees</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-white/40">Trades</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-white/40">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, index) => {
                    const isCurrentUser = (wallet as any).address?.toLowerCase() === entry.walletAddressFull?.toLowerCase();
                    
                    return (
                      <tr 
                        key={entry.walletAddressFull || index}
                        className={`border-t border-white/5 transition-colors ${
                          isCurrentUser ? 'bg-emerald-500/10' : 'hover:bg-white/5'
                        } ${entry.rank <= 3 ? 'bg-gradient-to-r from-amber-500/5 to-transparent' : ''}`}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {getRankIcon(entry.rank)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                              entry.rank === 1 ? 'bg-gradient-to-br from-amber-500/30 to-yellow-500/30 text-amber-400' :
                              entry.rank === 2 ? 'bg-gradient-to-br from-gray-400/30 to-gray-500/30 text-gray-300' :
                              entry.rank === 3 ? 'bg-gradient-to-br from-amber-600/30 to-orange-600/30 text-amber-500' :
                              'bg-white/10 text-white/50'
                            }`}>
                              {entry.botName?.charAt(0) || '?'}
                            </div>
                            <div>
                              <div className="font-medium flex items-center gap-2 text-white">
                                {entry.botName || 'Anonymous Bot'}
                                {isCurrentUser && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">You</span>
                                )}
                              </div>
                              <div className="text-xs text-white/40 font-mono">
                                {entry.walletAddress}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className={`font-mono font-bold ${entry.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatPnl(entry.totalPnl)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono text-white/60">
                            {formatVolume(entry.totalVolume)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono text-white/60">
                            ${entry.totalFees.toFixed(4)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono text-white">
                            {entry.totalTrades}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className={`font-mono font-medium ${entry.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {entry.winRate.toFixed(1)}%
                            </span>
                            <span className="text-xs text-white/30">
                              ({entry.wins}W/{entry.losses}L)
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-white/30">
          <p>Rankings update in real-time based on trading activity</p>
        </div>
      </main>
    </div>
  );
}
