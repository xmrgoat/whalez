'use client';

/**
 * My Bots Page - Modern & Clean Design
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import { AgentAuthorization } from '@/components/AgentAuthorization';
import {
  Bot,
  Plus,
  Play,
  Square,
  Settings,
  Trash2,
  Clock,
  Activity,
  ArrowLeft,
  Zap,
  AlertTriangle,
  Loader2,
  Shield,
  X,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface UserBot {
  id: string;
  name: string;
  description: string | null;
  symbol: string;
  timeframe: string;
  status: 'DRAFT' | 'READY' | 'BACKTESTING' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR';
  strategyType: string;
  totalTrades: number;
  winningTrades: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdown: number;
  createdAt: string;
  startedAt: string | null;
  tradesCount: number;
}

const STATUS_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  DRAFT: { color: 'text-white/40', dot: 'bg-white/20', label: 'Draft' },
  READY: { color: 'text-blue-400', dot: 'bg-blue-400', label: 'Ready' },
  BACKTESTING: { color: 'text-purple-400', dot: 'bg-purple-400', label: 'Testing' },
  RUNNING: { color: 'text-emerald-400', dot: 'bg-emerald-400 animate-pulse', label: 'Running' },
  PAUSED: { color: 'text-amber-400', dot: 'bg-amber-400', label: 'Paused' },
  STOPPED: { color: 'text-white/40', dot: 'bg-white/20', label: 'Stopped' },
  ERROR: { color: 'text-red-400', dot: 'bg-red-400', label: 'Error' },
};

export default function BotsPage() {
  const router = useRouter();
  const { wallet } = useWallet();
  const [bots, setBots] = useState<UserBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(true);
  const [maxBots, setMaxBots] = useState(5);
  
  // Agent authorization state
  const [isAgentAuthorized, setIsAgentAuthorized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [checkingAgent, setCheckingAgent] = useState(true);
  
  // Risk acknowledgment modal state
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [selectedBotForStart, setSelectedBotForStart] = useState<UserBot | null>(null);
  const [riskAccepted, setRiskAccepted] = useState({
    lossRisk: false,
    noGuarantee: false,
    ownResponsibility: false,
  });
  const [startingBot, setStartingBot] = useState(false);

  // Check agent authorization status
  const checkAgentStatus = useCallback(async () => {
    if (!wallet.address) return;
    
    setCheckingAgent(true);
    try {
      // Check local storage first
      const storedAgent = localStorage.getItem(`hl_agent_${wallet.address.toLowerCase()}`);
      if (storedAgent) {
        // Re-register with bot runner
        const stored = JSON.parse(storedAgent);
        await fetch(`${API_URL}/api/user-bots/register-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            masterAddress: stored.masterAddress,
            agentAddress: stored.agentAddress,
            agentPrivateKey: stored.agentPrivateKey,
            agentName: stored.agentName,
          }),
        });
        setIsAgentAuthorized(true);
      } else {
        // Check backend
        const res = await fetch(`${API_URL}/trading/agent-status?wallet=${wallet.address}`);
        const data = await res.json();
        setIsAgentAuthorized(data.hasAgent);
      }
    } catch (err) {
      console.error('Failed to check agent status:', err);
    } finally {
      setCheckingAgent(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    if (!wallet.isConnected) {
      router.push('/');
      return;
    }
    fetchBots();
    checkAgentStatus();
  }, [wallet.isConnected, wallet.address, checkAgentStatus]);

  const fetchBots = async () => {
    if (!wallet.address) return;
    
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/user-bots?wallet=${wallet.address}`);
      const data = await res.json();
      
      if (data.success) {
        setBots(data.bots || []);
        setCanCreate(data.canCreate);
        setMaxBots(data.maxBots);
      }
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initiate bot start - checks agent auth first, then shows risk modal
  const initiateStartBot = (bot: UserBot) => {
    if (!isAgentAuthorized) {
      // Need to authorize agent first
      setShowAuthModal(true);
      return;
    }
    
    // Show risk acknowledgment modal
    setSelectedBotForStart(bot);
    setRiskAccepted({ lossRisk: false, noGuarantee: false, ownResponsibility: false });
    setShowRiskModal(true);
  };
  
  // Actually start the bot after risk acknowledgment
  const handleStartBot = async () => {
    if (!selectedBotForStart || !allRisksAccepted) return;
    
    setStartingBot(true);
    try {
      // Start the bot directly - BotRunner handles its own agent validation
      // No need to ARM the global trading system (that's for /trade page only)
      const res = await fetch(`${API_URL}/api/user-bots/${selectedBotForStart.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      const data = await res.json();
      
      if (data.success) {
        setShowRiskModal(false);
        setSelectedBotForStart(null);
        fetchBots();
      } else {
        alert(data.error || 'Failed to start bot');
      }
    } catch (error) {
      console.error('Failed to start bot:', error);
      alert('Failed to start bot. Please try again.');
    } finally {
      setStartingBot(false);
    }
  };
  
  const allRisksAccepted = riskAccepted.lossRisk && riskAccepted.noGuarantee && riskAccepted.ownResponsibility;

  const handleStopBot = async (botId: string) => {
    setActionLoading(botId);
    try {
      const res = await fetch(`${API_URL}/api/user-bots/${botId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      const data = await res.json();
      if (data.success) {
        fetchBots();
      } else {
        alert(data.error || 'Failed to stop bot');
      }
    } catch (error) {
      console.error('Failed to stop bot:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (!confirm('Are you sure you want to delete this bot? This action cannot be undone.')) {
      return;
    }
    
    setActionLoading(botId);
    try {
      const res = await fetch(`${API_URL}/api/user-bots/${botId}?wallet=${wallet.address}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchBots();
      } else {
        alert(data.error || 'Failed to delete bot');
      }
    } catch (error) {
      console.error('Failed to delete bot:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const runningCount = bots.filter(b => b.status === 'RUNNING').length;
  const totalPnl = bots.reduce((sum, b) => sum + b.totalPnl, 0);
  const totalTrades = bots.reduce((sum, b) => sum + b.totalTrades, 0);

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
                <Bot className="w-4 h-4 text-blue-400" />
                <h1 className="text-[15px] font-medium text-white/90">My Bots</h1>
              </div>
              <span className="text-xs text-white/30">{bots.length}/{maxBots}</span>
            </div>
            
            {canCreate && (
              <button
                onClick={() => router.push('/bots/create')}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-xs font-medium text-white/80 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Bot
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats Row */}
        <div className="flex gap-6 mb-6 pb-6 border-b border-white/[0.04]">
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Running</p>
            <p className="text-lg font-semibold text-emerald-400">{runningCount}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Trades</p>
            <p className="text-lg font-semibold text-white/80">{totalTrades}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Total PnL</p>
            <p className={`text-lg font-semibold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Bots List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
          </div>
        ) : bots.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <Bot className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-sm text-white/40 mb-4">No bots yet</p>
            <button
              onClick={() => router.push('/bots/create')}
              className="px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-sm font-medium text-white/80 transition-colors"
            >
              Create your first bot
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {bots.map((bot) => {
              const statusConfig = STATUS_CONFIG[bot.status] || STATUS_CONFIG.DRAFT;
              const isLoading = actionLoading === bot.id;
              const winRate = bot.totalTrades > 0 ? (bot.winningTrades / bot.totalTrades) * 100 : 0;
              
              return (
                <div
                  key={bot.id}
                  className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all"
                >
                  <div className="flex items-center justify-between gap-4">
                    {/* Bot Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-white/40" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-white/90 truncate">{bot.name}</h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusConfig.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                            {statusConfig.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-white/30 mt-0.5">
                          <span>{bot.symbol}</span>
                          <span>{bot.timeframe}</span>
                          <span>{bot.totalTrades} trades</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-6">
                      <div className="text-right">
                        <p className={`text-sm font-medium ${bot.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {bot.totalPnl >= 0 ? '+' : ''}${bot.totalPnl.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-white/30">PnL</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-white/70">{winRate.toFixed(0)}%</p>
                        <p className="text-[10px] text-white/30">Win</p>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {bot.status === 'RUNNING' ? (
                        <button
                          onClick={() => handleStopBot(bot.id)}
                          disabled={isLoading}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium transition-colors disabled:opacity-50"
                        >
                          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                          Stop
                        </button>
                      ) : bot.status !== 'DRAFT' && bot.status !== 'BACKTESTING' ? (
                        <button
                          onClick={() => initiateStartBot(bot)}
                          disabled={isLoading || checkingAgent}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-medium transition-colors disabled:opacity-50"
                        >
                          {isLoading || checkingAgent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          {!isAgentAuthorized && !checkingAgent ? 'Authorize & Start' : 'Start'}
                        </button>
                      ) : null}
                      
                      <button
                        onClick={() => router.push(`/bots/${bot.id}`)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      
                      <button
                        onClick={() => handleDeleteBot(bot.id)}
                        disabled={isLoading || bot.status === 'RUNNING'}
                        className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => router.push('/bots/create')}
            className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 hover:border-indigo-500/40 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold mb-1">Create from Template</h3>
                <p className="text-sm text-white/40">Start with a proven strategy</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white/60 transition-colors" />
            </div>
          </button>
          
          <button
            onClick={() => router.push('/library')}
            className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 hover:border-emerald-500/40 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold mb-1">Browse Library</h3>
                <p className="text-sm text-white/40">Remix community bots</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white/60 transition-colors" />
            </div>
          </button>
          
          <button
            onClick={() => router.push('/backtest')}
            className="p-6 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold mb-1">Backtest Strategies</h3>
                <p className="text-sm text-white/40">Test before you trade</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white/60 transition-colors" />
            </div>
          </button>
        </div>
      </main>

      {/* Risk Acknowledgment Modal */}
      {showRiskModal && selectedBotForStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowRiskModal(false)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-[450px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="font-medium text-white">Risk Acknowledgment</span>
              </div>
              <button onClick={() => setShowRiskModal(false)} className="p-1 hover:bg-white/10 rounded text-white/60">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-sm text-emerald-400 font-medium">Starting: {selectedBotForStart.name}</p>
                <p className="text-xs text-white/50 mt-1">{selectedBotForStart.symbol} • {selectedBotForStart.timeframe}</p>
              </div>
              
              <p className="text-sm text-white/60">
                Before starting this trading bot, please acknowledge the following risks:
              </p>
              
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={riskAccepted.lossRisk}
                    onChange={(e) => setRiskAccepted(prev => ({ ...prev, lossRisk: e.target.checked }))}
                    className="mt-1 accent-emerald-500"
                  />
                  <span className="text-sm text-white/80">I understand that trading involves significant risk of loss</span>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={riskAccepted.noGuarantee}
                    onChange={(e) => setRiskAccepted(prev => ({ ...prev, noGuarantee: e.target.checked }))}
                    className="mt-1 accent-emerald-500"
                  />
                  <span className="text-sm text-white/80">I understand there is no guarantee of profits</span>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={riskAccepted.ownResponsibility}
                    onChange={(e) => setRiskAccepted(prev => ({ ...prev, ownResponsibility: e.target.checked }))}
                    className="mt-1 accent-emerald-500"
                  />
                  <span className="text-sm text-white/80">I take full responsibility for any losses</span>
                </label>
              </div>
              
              <button
                onClick={handleStartBot}
                disabled={!allRisksAccepted || startingBot}
                className="w-full px-4 py-3 rounded-xl font-medium bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
              >
                {startingBot ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting Bot...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start Trading Bot
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Authorization Modal */}
      {showAuthModal && wallet.address && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAuthModal(false)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-[500px] max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                <span className="font-medium text-white">Authorize Trading</span>
              </div>
              <button onClick={() => setShowAuthModal(false)} className="p-1 hover:bg-white/10 rounded text-white/60">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <AgentAuthorization
                walletAddress={wallet.address}
                onAuthorized={async (credentials) => {
                  // Register with bot runner
                  try {
                    await fetch(`${API_URL}/api/user-bots/register-agent`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        masterAddress: credentials.masterAddress,
                        agentAddress: credentials.agentAddress,
                        agentPrivateKey: credentials.agentPrivateKey,
                        agentName: credentials.agentName,
                      }),
                    });
                  } catch (err) {
                    console.error('Failed to register agent with bot runner:', err);
                  }
                  
                  setIsAgentAuthorized(true);
                  setShowAuthModal(false);
                }}
                onRevoked={() => {
                  setIsAgentAuthorized(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
