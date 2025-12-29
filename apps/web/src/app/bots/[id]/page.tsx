'use client';

/**
 * Bot Detail/Edit Page
 * 
 * View and edit bot configuration:
 * - Strategy settings
 * - Risk management
 * - Performance stats
 * - Start/Stop controls
 * - Backtest
 * - Publish to library
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  ArrowLeft,
  Bot,
  Play,
  Square,
  Settings,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Clock,
  Zap,
  Save,
  Trash2,
  Share2,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Activity,
  Calendar,
  ExternalLink,
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface UserBot {
  id: string;
  walletAddress: string;
  name: string;
  description: string | null;
  symbol: string;
  timeframe: string;
  status: string;
  strategyType: string;
  templateId: string | null;
  strategyConfig: any;
  riskConfig: any;
  totalTrades: number;
  winningTrades: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdown: number;
  lastTradeAt: string | null;
  remixedFromId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
  trades: Array<{
    id: string;
    symbol: string;
    side: string;
    entryPrice: number;
    exitPrice: number | null;
    pnl: number | null;
    pnlPct: number | null;
    status: string;
    entryTime: string;
  }>;
  remixedFrom: {
    id: string;
    name: string;
    authorWallet: string;
  } | null;
  publishedItem: {
    id: string;
    likes: number;
    remixes: number;
  } | null;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  DRAFT: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Draft' },
  READY: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Ready' },
  BACKTESTING: { color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Backtesting' },
  RUNNING: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Running' },
  PAUSED: { color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Paused' },
  STOPPED: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Stopped' },
  ERROR: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Error' },
};

export default function BotDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { wallet } = useWallet();
  const [bot, setBot] = useState<UserBot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [positionSizePct, setPositionSizePct] = useState(2);
  const [maxLeverage, setMaxLeverage] = useState(5);
  const [stopLossPct, setStopLossPct] = useState(2);
  const [takeProfitPct, setTakeProfitPct] = useState(4);
  
  // Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'strategy' | 'trades'>('overview');

  useEffect(() => {
    if (!wallet.isConnected) {
      router.push('/');
      return;
    }
    if (params.id) {
      fetchBot();
    }
  }, [params.id, wallet.isConnected]);

  const fetchBot = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/user-bots/${params.id}?wallet=${wallet.address}`);
      const data = await res.json();
      
      if (data.success && data.bot) {
        setBot(data.bot);
        setName(data.bot.name);
        setDescription(data.bot.description || '');
        setSymbol(data.bot.symbol);
        setTimeframe(data.bot.timeframe);
        if (data.bot.riskConfig) {
          setPositionSizePct(data.bot.riskConfig.positionSizePct || 2);
          setMaxLeverage(data.bot.riskConfig.maxLeverage || 5);
          setStopLossPct(data.bot.riskConfig.stopLossPct || 2);
          setTakeProfitPct(data.bot.riskConfig.takeProfitPct || 4);
        }
      } else {
        router.push('/bots');
      }
    } catch (error) {
      console.error('Failed to fetch bot:', error);
      router.push('/bots');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!bot) return;
    
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/user-bots/${bot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: wallet.address,
          name,
          description,
          symbol,
          timeframe,
          riskConfig: {
            ...bot.riskConfig,
            positionSizePct,
            maxLeverage,
            stopLossPct,
            takeProfitPct,
          },
          status: bot.status === 'DRAFT' ? 'READY' : undefined,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setBot(data.bot);
      } else {
        alert(data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    if (!bot) return;
    
    setActionLoading('start');
    try {
      const res = await fetch(`${API_URL}/api/user-bots/${bot.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      const data = await res.json();
      if (data.success) {
        fetchBot();
      } else {
        alert(data.error || 'Failed to start');
      }
    } catch (error) {
      console.error('Failed to start:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async () => {
    if (!bot) return;
    
    setActionLoading('stop');
    try {
      const res = await fetch(`${API_URL}/api/user-bots/${bot.id}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      const data = await res.json();
      if (data.success) {
        fetchBot();
      } else {
        alert(data.error || 'Failed to stop');
      }
    } catch (error) {
      console.error('Failed to stop:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBacktest = async () => {
    if (!bot) return;
    
    setActionLoading('backtest');
    try {
      const res = await fetch(`${API_URL}/api/user-bots/${bot.id}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address, days: 30 }),
      });
      const data = await res.json();
      if (data.success) {
        fetchBot();
        alert('Backtest completed!');
      } else {
        alert(data.error || 'Backtest failed');
      }
    } catch (error) {
      console.error('Backtest failed:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!bot) return;
    if (!confirm('Are you sure you want to delete this bot? This cannot be undone.')) return;
    
    setActionLoading('delete');
    try {
      const res = await fetch(`${API_URL}/api/user-bots/${bot.id}?wallet=${wallet.address}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        router.push('/bots');
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublish = async () => {
    if (!bot) return;
    
    const confirmPublish = confirm('Publish this bot to the community library? Others will be able to see and remix it.');
    if (!confirmPublish) return;
    
    setActionLoading('publish');
    try {
      const res = await fetch(`${API_URL}/api/library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: wallet.address,
          type: 'BOT',
          name: bot.name,
          description: bot.description || `${bot.name} - ${bot.symbol} ${bot.timeframe}`,
          config: {
            strategyConfig: bot.strategyConfig,
            riskConfig: bot.riskConfig,
            timeframe: bot.timeframe,
          },
          symbol: bot.symbol,
          performance: {
            totalReturn: bot.totalPnlPct,
            winRate: bot.totalTrades > 0 ? (bot.winningTrades / bot.totalTrades) * 100 : 0,
            trades: bot.totalTrades,
            maxDrawdown: bot.maxDrawdown,
          },
          sourceBotId: bot.id,
          tags: [bot.symbol.replace('-PERP', '').toLowerCase(), bot.timeframe],
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        alert('Bot published to library!');
        fetchBot();
      } else {
        alert(data.error || 'Failed to publish');
      }
    } catch (error) {
      console.error('Failed to publish:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!bot) return null;

  const statusConfig = STATUS_CONFIG[bot.status] || STATUS_CONFIG.DRAFT;
  const winRate = bot.totalTrades > 0 ? (bot.winningTrades / bot.totalTrades) * 100 : 0;
  const isRunning = bot.status === 'RUNNING';
  const canEdit = !isRunning && bot.status !== 'BACKTESTING';

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/bots')} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white">{bot.name}</h1>
                <span className={`px-2 py-0.5 rounded-full text-xs ${statusConfig.bg} ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-xs text-white/40">{bot.symbol} • {bot.timeframe}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={handleStop}
                disabled={actionLoading === 'stop'}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                Stop
              </button>
            ) : bot.status !== 'DRAFT' && bot.status !== 'BACKTESTING' ? (
              <button
                onClick={handleStart}
                disabled={actionLoading === 'start'}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start
              </button>
            ) : null}
            
            <button
              onClick={handleSave}
              disabled={saving || !canEdit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-white/40 mb-1">Total PnL</div>
            <div className={`text-xl font-bold ${bot.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {bot.totalPnl >= 0 ? '+' : ''}${bot.totalPnl.toFixed(2)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-white/40 mb-1">Return</div>
            <div className={`text-xl font-bold ${bot.totalPnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {bot.totalPnlPct >= 0 ? '+' : ''}{bot.totalPnlPct.toFixed(2)}%
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-white/40 mb-1">Win Rate</div>
            <div className="text-xl font-bold text-white">{winRate.toFixed(1)}%</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-white/40 mb-1">Trades</div>
            <div className="text-xl font-bold text-white">{bot.totalTrades}</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-white/40 mb-1">Max DD</div>
            <div className="text-xl font-bold text-amber-400">-{bot.maxDrawdown.toFixed(2)}%</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['overview', 'strategy', 'trades'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Info */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-400" />
                Basic Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-2">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white disabled:opacity-50 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!canEdit}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white disabled:opacity-50 focus:outline-none focus:border-indigo-500/50 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Symbol</label>
                    <input
                      type="text"
                      value={symbol}
                      disabled
                      className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white/60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Timeframe</label>
                    <input
                      type="text"
                      value={timeframe}
                      disabled
                      className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white/60"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Management */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                Risk Management
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-2">Position Size %</label>
                  <input
                    type="number"
                    value={positionSizePct}
                    onChange={(e) => setPositionSizePct(Number(e.target.value))}
                    disabled={!canEdit}
                    min={0.5}
                    max={10}
                    step={0.5}
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white disabled:opacity-50 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">Max Leverage</label>
                  <input
                    type="number"
                    value={maxLeverage}
                    onChange={(e) => setMaxLeverage(Number(e.target.value))}
                    disabled={!canEdit}
                    min={1}
                    max={20}
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white disabled:opacity-50 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">Stop Loss %</label>
                  <input
                    type="number"
                    value={stopLossPct}
                    onChange={(e) => setStopLossPct(Number(e.target.value))}
                    disabled={!canEdit}
                    min={0.5}
                    max={10}
                    step={0.5}
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white disabled:opacity-50 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">Take Profit %</label>
                  <input
                    type="number"
                    value={takeProfitPct}
                    onChange={(e) => setTakeProfitPct(Number(e.target.value))}
                    disabled={!canEdit}
                    min={0.5}
                    max={20}
                    step={0.5}
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white disabled:opacity-50 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-4">Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={handleBacktest}
                  disabled={actionLoading === 'backtest' || isRunning}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 font-medium transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'backtest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                  Run Backtest
                </button>
                
                {!bot.publishedItem && (
                  <button
                    onClick={handlePublish}
                    disabled={actionLoading === 'publish' || bot.totalTrades < 5}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-medium transition-colors disabled:opacity-50"
                  >
                    {actionLoading === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                    Publish to Library
                  </button>
                )}
                
                {bot.publishedItem && (
                  <button
                    onClick={() => router.push(`/library/${bot.publishedItem!.id}`)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 font-medium transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View in Library ({bot.publishedItem.likes} likes, {bot.publishedItem.remixes} remixes)
                  </button>
                )}
                
                <button
                  onClick={handleDelete}
                  disabled={actionLoading === 'delete' || isRunning}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Bot
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-4">Information</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">Created</span>
                  <span className="text-white">{formatDate(bot.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Last Updated</span>
                  <span className="text-white">{formatDate(bot.updatedAt)}</span>
                </div>
                {bot.startedAt && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Started</span>
                    <span className="text-white">{formatDate(bot.startedAt)}</span>
                  </div>
                )}
                {bot.lastTradeAt && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Last Trade</span>
                    <span className="text-white">{formatDate(bot.lastTradeAt)}</span>
                  </div>
                )}
                {bot.remixedFrom && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Remixed From</span>
                    <button
                      onClick={() => router.push(`/library/${bot.remixedFrom!.id}`)}
                      className="text-indigo-400 hover:underline"
                    >
                      {bot.remixedFrom.name}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'strategy' && (
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h2 className="text-lg font-semibold text-white mb-4">Strategy Configuration</h2>
            
            {bot.strategyConfig?.indicators && (
              <div className="mb-6">
                <h3 className="text-sm text-white/60 mb-2">Indicators</h3>
                <div className="flex flex-wrap gap-2">
                  {bot.strategyConfig.indicators.map((ind: any, i: number) => (
                    <span key={i} className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-sm">
                      {ind.name}({Object.values(ind.params || {}).join(',')})
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {bot.strategyConfig?.entryConditions && (
              <div className="mb-6">
                <h3 className="text-sm text-white/60 mb-2">Entry Conditions</h3>
                <div className="space-y-2">
                  {bot.strategyConfig.entryConditions.map((cond: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-black/20 text-sm">
                      <span className="text-emerald-400">IF</span>{' '}
                      <span className="text-white">{cond.indicator}</span>{' '}
                      <span className="text-white/60">{cond.operator}</span>{' '}
                      <span className="text-white">{cond.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {bot.strategyConfig?.exitConditions && (
              <div>
                <h3 className="text-sm text-white/60 mb-2">Exit Conditions</h3>
                <div className="space-y-2">
                  {bot.strategyConfig.exitConditions.map((cond: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-black/20 text-sm">
                      <span className="text-red-400">EXIT IF</span>{' '}
                      <span className="text-white">{cond.indicator}</span>{' '}
                      <span className="text-white/60">{cond.operator}</span>{' '}
                      <span className="text-white">{cond.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'trades' && (
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <h2 className="text-lg font-semibold text-white mb-4">Recent Trades</h2>
            
            {bot.trades.length === 0 ? (
              <p className="text-white/40 text-center py-8">No trades yet</p>
            ) : (
              <div className="space-y-2">
                {bot.trades.map((trade) => (
                  <div key={trade.id} className="p-4 rounded-xl bg-black/20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        trade.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {trade.side === 'BUY' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="font-medium text-white">{trade.symbol}</div>
                        <div className="text-xs text-white/40">
                          {trade.side} @ ${trade.entryPrice.toFixed(2)}
                          {trade.exitPrice && ` → $${trade.exitPrice.toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {trade.pnl !== null ? (
                        <>
                          <div className={`font-semibold ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                          </div>
                          <div className="text-xs text-white/40">
                            {trade.pnlPct !== null && `${trade.pnlPct >= 0 ? '+' : ''}${trade.pnlPct.toFixed(2)}%`}
                          </div>
                        </>
                      ) : (
                        <span className="text-amber-400 text-sm">Open</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
