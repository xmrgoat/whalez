'use client';

/**
 * Profile Page
 * 
 * Complete user profile with:
 * - Account info and wallet
 * - Trading statistics
 * - Performance history
 * - Settings and preferences
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
  BarChart2,
  Settings,
  Shield,
  Clock,
  Calendar,
  Award,
  Target,
  Activity,
  DollarSign,
  Percent,
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Bell,
  Moon,
  Sun,
  LogOut
} from 'lucide-react';

const PnlChart = dynamic(() => import('@/components/PnlChart'), { ssr: false });

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface UserStats {
  totalPnl: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  bestMonth: { month: string; pnl: number };
  worstMonth: { month: string; pnl: number };
  avgTradesPerDay: number;
  totalVolume: number;
  accountAge: number;
}

interface TradeHistory {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  entryTime: string;
  exitTime: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { wallet, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'settings'>('overview');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // Preferences
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(false);

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
        // Fetch performance data from trading endpoint
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
            bestMonth: summary.bestMonth || { month: 'N/A', pnl: 0 },
            worstMonth: summary.worstMonth || { month: 'N/A', pnl: 0 },
            avgTradesPerDay: summary.avgTradesPerDay || 0,
            totalVolume: summary.totalVolume || 0,
            accountAge: 0,
          });
        }

        // Fetch trade history from trading endpoint
        const tradesRes = await fetch(`${API_URL}/trading/trade-history?wallet=${wallet.address}&limit=20`);
        if (tradesRes.ok) {
          const data = await tradesRes.json();
          setTrades((data.trades || []).map((t: any) => ({
            id: t.id,
            symbol: t.symbol,
            side: t.side === 'buy' ? 'long' : 'short',
            entryPrice: t.price,
            exitPrice: t.exitPrice || t.price,
            pnl: t.pnlWithFees || t.pnl || 0,
            pnlPercent: t.price > 0 ? ((t.pnlWithFees || t.pnl || 0) / (t.price * t.quantity)) * 100 : 0,
            entryTime: new Date(t.timestamp).toISOString(),
            exitTime: t.exitTime ? new Date(t.exitTime).toISOString() : new Date(t.timestamp).toISOString(),
          })));
        }
      }
    } catch (err) {
      console.error('Failed to fetch user data:', err);
      // Set default stats on error
      setStats({
        totalPnl: 0,
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        bestMonth: { month: 'N/A', pnl: 0 },
        worstMonth: { month: 'N/A', pnl: 0 },
        avgTradesPerDay: 0,
        totalVolume: 0,
        accountAge: 0,
      });
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

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatPnl = (value: number) => {
    const formatted = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2 });
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  };

  if (!wallet.isConnected) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[100px]" />
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-display font-bold text-white">Profile</h1>
          </div>
          
          <button
            onClick={() => { disconnect(); router.push('/'); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            Disconnect
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 relative z-10">
        {/* Profile Header */}
        <div className="rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 p-6 mb-6 backdrop-blur-sm">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="font-display font-bold text-xl text-white">Trader</h2>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-mono text-xs text-white/60">
                      {wallet.address ? formatAddress(wallet.address) : 'Not connected'}
                    </span>
                    <button onClick={copyAddress} className="p-0.5 rounded hover:bg-white/10">
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-white/40" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Member since Dec 2024
                  </span>
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    {stats?.totalTrades || 0} trades
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center min-w-[100px]">
                <div className="text-xs text-white/40 mb-1">Total PnL</div>
                <div className={`font-mono font-bold text-xl ${(stats?.totalPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatPnl(stats?.totalPnl || 0)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center min-w-[100px]">
                <div className="text-xs text-white/40 mb-1">Win Rate</div>
                <div className={`font-mono font-bold text-xl ${(stats?.winRate || 0) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats?.winRate?.toFixed(1) || '0.0'}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
          {(['overview', 'history', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === tab
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* PNL Chart - Full Width */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
              <h3 className="font-display font-semibold mb-4 flex items-center gap-2 text-white">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Performance Overview
              </h3>
              <PnlChart walletAddress={wallet.address || undefined} height={180} showStats={true} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Performance Card */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
              <h3 className="font-display font-semibold mb-4 flex items-center gap-2 text-white">
                <BarChart2 className="w-4 h-4 text-cyan-400" />
                Statistics
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Profit Factor</span>
                  <span className="font-mono font-medium text-white">{stats?.profitFactor?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Max Drawdown</span>
                  <span className="font-mono font-medium text-red-400">{stats?.maxDrawdown?.toFixed(1) || '0.0'}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Avg Trades/Day</span>
                  <span className="font-mono font-medium text-white">{stats?.avgTradesPerDay?.toFixed(1) || '0.0'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Total Volume</span>
                  <span className="font-mono font-medium text-white">${(stats?.totalVolume || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Best/Worst Month */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
              <h3 className="font-display font-semibold mb-4 flex items-center gap-2 text-white">
                <Award className="w-4 h-4 text-amber-400" />
                Monthly Records
              </h3>
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-xs text-emerald-400 mb-1">Best Month</div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-white">{stats?.bestMonth?.month || 'N/A'}</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatPnl(stats?.bestMonth?.pnl || 0)}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="text-xs text-red-400 mb-1">Worst Month</div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-white">{stats?.worstMonth?.month || 'N/A'}</span>
                    <span className="font-mono font-bold text-red-400">
                      {formatPnl(stats?.worstMonth?.pnl || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Info */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
              <h3 className="font-display font-semibold mb-4 flex items-center gap-2 text-white">
                <Shield className="w-4 h-4 text-purple-400" />
                Account
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Status</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">Active</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Network</span>
                  <span className="font-mono text-sm text-white">Hyperliquid</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">Mode</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">Live Trading</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/50">API Status</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs text-emerald-400">Connected</span>
                  </span>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden backdrop-blur-sm">
            <div className="p-4 border-b border-white/10">
              <h3 className="font-display font-semibold text-white">Trade History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Symbol</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Side</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Entry</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Exit</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40">PnL</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-white/40">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.length > 0 ? (
                    trades.map(trade => (
                      <tr key={trade.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm text-white">{trade.symbol}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            trade.side === 'long' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {trade.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-white/70">${trade.entryPrice?.toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-sm text-white/70">${trade.exitPrice?.toLocaleString()}</td>
                        <td className={`px-4 py-3 font-mono text-sm font-medium ${
                          trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {formatPnl(trade.pnl)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/40">
                          {new Date(trade.exitTime).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-white/40">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No trades yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            {/* Preferences */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
              <h3 className="font-display font-semibold mb-4 flex items-center gap-2 text-white">
                <Settings className="w-4 h-4 text-emerald-400" />
                Preferences
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    {darkMode ? <Moon className="w-4 h-4 text-purple-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
                    <div>
                      <div className="font-medium text-sm text-white">Dark Mode</div>
                      <div className="text-xs text-white/40">Use dark theme</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className={`w-12 h-6 rounded-full transition-colors ${darkMode ? 'bg-emerald-500' : 'bg-white/20'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="font-medium text-sm text-white">Notifications</div>
                      <div className="text-xs text-white/40">Trade alerts and updates</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setNotifications(!notifications)}
                    className={`w-12 h-6 rounded-full transition-colors ${notifications ? 'bg-emerald-500' : 'bg-white/20'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${notifications ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="font-medium text-sm text-white">Sound Alerts</div>
                      <div className="text-xs text-white/40">Play sounds for trades</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSoundAlerts(!soundAlerts)}
                    className={`w-12 h-6 rounded-full transition-colors ${soundAlerts ? 'bg-emerald-500' : 'bg-white/20'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${soundAlerts ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-6">
              <h3 className="font-display font-semibold mb-4 text-red-400">Danger Zone</h3>
              <div className="space-y-3">
                <button className="w-full px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium">
                  Reset All Settings
                </button>
                <button 
                  onClick={() => { disconnect(); router.push('/'); }}
                  className="w-full px-4 py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm font-medium"
                >
                  Disconnect Wallet
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
