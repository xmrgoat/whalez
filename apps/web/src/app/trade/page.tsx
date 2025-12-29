'use client';

/**
 * Trade Page - Main Trading Dashboard
 * 
 * Professional trading interface with:
 * - Live chart with indicators
 * - Position management
 * - Bot controls
 * - Real-time stats
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useWallet } from '@/context/WalletContext';
import { useMarketData } from '@/hooks/useMarketData';
import { useBotActions } from '@/hooks/useBotActions';
import { useTradeNotifications } from '@/hooks/useTradeNotifications';
import { useSymbols } from '@/hooks/useSymbols';
import { 
  TrendingUp, 
  TrendingDown, 
  Play, 
  Square, 
  Settings, 
  RefreshCw,
  Wallet,
  LogOut,
  ChevronDown,
  Activity,
  AlertTriangle,
  Brain,
  User,
  BarChart2,
  Shield,
  X,
  Trophy
} from 'lucide-react';

const TradingChartPro = dynamic(() => import('@/components/TradingChartPro'), { ssr: false });
const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false });
const AIPanel = dynamic(() => import('@/components/AIPanel'), { ssr: false });
const ActivityFeed = dynamic(() => import('@/components/ActivityFeed'), { ssr: false });
const StatsPanel = dynamic(() => import('@/components/StatsPanel'), { ssr: false });
const AIThinkingPanel = dynamic(() => import('@/components/AIThinkingPanel'), { ssr: false });
const AgentAuthorization = dynamic(() => import('@/components/AgentAuthorization'), { ssr: false });
const PnlChart = dynamic(() => import('@/components/PnlChart'), { ssr: false });
const MarketDataPanel = dynamic(() => import('@/components/MarketDataPanel'), { ssr: false });
const GrokDashboard = dynamic(() => import('@/components/GrokDashboard'), { ssr: false });

// Fallback symbols in case API is not available
const FALLBACK_SYMBOLS = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'XRP-PERP', 'BNB-PERP', 'DOGE-PERP'];
// All timeframes supported by Hyperliquid
const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1d', '3d', '1w', '1M'];

// Grouped timeframes for display
const TIMEFRAME_GROUPS = {
  MINUTES: ['1m', '3m', '5m', '15m', '30m'],
  HOURS: ['1h', '2h', '4h', '8h', '12h'],
  DAYS: ['1d', '3d', '1w', '1M'],
};

// Timeframe display labels
const TIMEFRAME_LABELS: Record<string, string> = {
  '1m': '1 minute',
  '3m': '3 minutes',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '30m': '30 minutes',
  '1h': '1 heure',
  '2h': '2 heures',
  '4h': '4 heures',
  '8h': '8 heures',
  '12h': '12 heures',
  '1d': '1 jour',
  '3d': '3 jours',
  '1w': '1 semaine',
  '1M': '1 mois',
};

// Timeframe to milliseconds
const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
};

// Candle Countdown Component
function CandleCountdown({ timeframe }: { timeframe: string }) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const tfMs = TIMEFRAME_MS[timeframe] || 60000;
    
    const updateCountdown = () => {
      const now = Date.now();
      const currentCandleStart = Math.floor(now / tfMs) * tfMs;
      const nextCandleStart = currentCandleStart + tfMs;
      const remaining = nextCandleStart - now;
      
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
      
      if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [timeframe]);

  return (
    <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
      ⏱ {countdown}
    </span>
  );
}

export default function TradePage() {
  const router = useRouter();
  const { wallet, disconnect } = useWallet();
  
  // Load symbols dynamically from Hyperliquid
  const { symbols: availableSymbols } = useSymbols();
  
  // Trading state - persist symbol and timeframe in localStorage
  const [symbol, setSymbol] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selected-symbol') || 'BTC-PERP';
    }
    return 'BTC-PERP';
  });
  const [timeframe, setTimeframe] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selected-timeframe') || '1h';
    }
    return '1h';
  });
  
  // Persist symbol and timeframe changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selected-symbol', symbol);
    }
  }, [symbol]);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selected-timeframe', timeframe);
    }
  }, [timeframe]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showAIThinking, setShowAIThinking] = useState(false);
  const [botPrompt, setBotPrompt] = useState('');
  
  // Bottom panel state (TradingView style)
  const [bottomTab, setBottomTab] = useState('Positions');
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  
  // Bottom panel resizable height
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bottomPanelHeight');
      return saved ? parseInt(saved, 10) : 192; // Default 192px (h-48)
    }
    return 192;
  });
  const [isResizing, setIsResizing] = useState(false);
  
  // Bot start confirmation state
  const [showStartModal, setShowStartModal] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState({
    lossRisk: false,
    noGuarantee: false,
    ownResponsibility: false,
  });
  const [signatureLoading, setSignatureLoading] = useState(false);
  
  // Agent authorization state
  const [isAgentAuthorized, setIsAgentAuthorized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Hyperliquid balance and positions (support multiple)
  const [hlBalance, setHlBalance] = useState<{ accountValue: number; withdrawable: number } | null>(null);
  const [hlPositions, setHlPositions] = useState<Array<{
    coin: string;
    side: 'long' | 'short';
    size: number;
    entryPrice: number;
    markPrice: number;
    pnl: number;
    pnlPercent: number;
    leverage: number;
    liquidationPrice: number;
    positionValue: number;
  }>>([]);
  const [closingPosition, setClosingPosition] = useState(false);
  
  // Bot config (paperTrading kept for compatibility but always false - live only)
  const [botConfig, setBotConfig] = useState({
    botName: 'Whalez Bot',
    symbol: 'BTC-PERP',
    timeframe: '1h',
    leverage: 3,
    positionSizePct: 2,
    stopLossPct: 3,
    takeProfitPct: 6,
    maxDrawdownPct: 10,
    minConfirmations: 3,
    paperTrading: false,
    dynamicLeverage: true,
    tradingMode: 'moderate' as 'conservative' | 'moderate' | 'aggressive',
    tradingBag: ['BTC-PERP'] as string[],
  });

  // Redirect if not connected
  useEffect(() => {
    if (!wallet.isConnected) {
      router.push('/');
    }
  }, [wallet.isConnected, router]);

  // Market data
  const {
    status,
    candles,
    currentCandle,
    ticker,
    position,
    botStatus,
  } = useMarketData({
    symbol,
    timeframe,
    autoConnect: true,
  });

  // Bot actions
  const {
    loading: botLoading,
    stats,
    startBot,
    stopBot,
    fetchStats,
  } = useBotActions({ botId: 'default' });

  // Trade notifications (sound + browser notification)
  useTradeNotifications({
    enabled: true,
    onTrade: (trade) => {
      console.log('🔔 New trade notification:', trade);
      // Refresh data when new trade is detected
      fetchHlData();
      fetchTradeHistory();
    },
  });

  // Fetch stats on mount and every 30 seconds (reduced to avoid rate limit)
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Fetch Hyperliquid balance and positions for connected MetaMask wallet
  const fetchHlData = useCallback(async () => {
    if (!wallet.address) return;
    
    try {
      // Use the connected MetaMask wallet to show user's Hyperliquid positions
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/account/balance?wallet=${wallet.address}`);
      if (res.ok) {
        const data = await res.json();
        setHlBalance({
          accountValue: data.accountValue || 0,
          withdrawable: data.withdrawable || 0,
        });
        
        // Parse all positions from response
        if (data.positions && data.positions.length > 0) {
          const positions = data.positions
            .map((p: any) => {
              const pos = p.position;
              const size = parseFloat(pos.szi);
              if (size === 0) return null;
              
              const entryPrice = parseFloat(pos.entryPx);
              const pnl = parseFloat(pos.unrealizedPnl);
              const roe = parseFloat(pos.returnOnEquity) * 100;
              
              return {
                coin: pos.coin,
                side: size > 0 ? 'long' : 'short',
                size: Math.abs(size),
                entryPrice,
                markPrice: entryPrice + (pnl / Math.abs(size)),
                pnl,
                pnlPercent: roe,
                leverage: pos.leverage?.value || 1,
                liquidationPrice: parseFloat(pos.liquidationPx) || 0,
                positionValue: parseFloat(pos.positionValue) || 0,
              };
            })
            .filter((p: any) => p !== null);
          
          setHlPositions(positions);
        } else {
          setHlPositions([]);
        }
      }
    } catch (err) {
      // Silently fail
    }
  }, [wallet.address]);

  useEffect(() => {
    fetchHlData();
    const interval = setInterval(fetchHlData, 3000); // Update position every 3s for real-time
    return () => clearInterval(interval);
  }, [fetchHlData]);

  // Load bot settings from backend on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (!wallet.address) return;
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/settings?wallet=${wallet.address}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.settings) {
            const s = data.settings;
            setBotConfig(prev => ({
              ...prev,
              botName: s.botName || prev.botName,
              leverage: s.maxLeverage || prev.leverage,
              dynamicLeverage: s.dynamicLeverage ?? prev.dynamicLeverage,
              positionSizePct: s.positionSizePct || prev.positionSizePct,
              stopLossPct: s.stopLossPct || prev.stopLossPct,
              takeProfitPct: s.takeProfitPct || prev.takeProfitPct,
              minConfirmations: s.minConfirmations || prev.minConfirmations,
              tradingMode: s.tradingMode || prev.tradingMode,
              tradingBag: s.tradingBag || prev.tradingBag,
            }));
            // Update symbol if trading bag has items
            if (s.tradingBag && s.tradingBag.length > 0) {
              setSymbol(s.tradingBag[0]);
            }
            console.log('[Settings] Loaded bot settings from backend');
          }
        }
      } catch (err) {
        console.log('[Settings] Using default settings (backend not available)');
      }
    };
    loadSettings();
  }, [wallet.address]);

  // Check agent authorization status on mount and re-register if needed
  useEffect(() => {
    const checkAgentStatus = async () => {
      if (!wallet.address) return;
      
      // Check local storage first
      const storedStr = localStorage.getItem(`hl_agent_${wallet.address.toLowerCase()}`);
      if (storedStr) {
        try {
          const stored = JSON.parse(storedStr);
          // Re-register with backend (in case backend was restarted)
          await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/register-agent`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                masterAddress: stored.masterAddress,
                agentAddress: stored.agentAddress,
                agentPrivateKey: stored.agentPrivateKey,
                agentName: stored.agentName,
              }),
            }
          );
          console.log('Agent re-registered with backend');
        } catch (err) {
          console.error('Failed to re-register agent:', err);
        }
        setIsAgentAuthorized(true);
        return;
      }
      
      // Check backend
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/agent-status?wallet=${wallet.address}`
        );
        const data = await res.json();
        setIsAgentAuthorized(data.hasAgent);
      } catch (err) {
        console.error('Failed to check agent status:', err);
      }
    };
    
    checkAgentStatus();
  }, [wallet.address]);

  // Fetch trade history
  const fetchTradeHistory = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/trade-history?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setTradeHistory(data.trades || []);
      }
    } catch (err) {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchTradeHistory();
    const interval = setInterval(fetchTradeHistory, 15000); // Reduced frequency
    return () => clearInterval(interval);
  }, [fetchTradeHistory]);

  // Check if all risks are accepted
  const allRisksAccepted = riskAccepted.lossRisk && riskAccepted.noGuarantee && riskAccepted.ownResponsibility;

  // Handle bot start with signature
  const handleStartWithSignature = async () => {
    if (!allRisksAccepted) return;
    
    setSignatureLoading(true);
    try {
      // First ARM the trading (required by backend) - do this before signature
      const armRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/arm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'I UNDERSTAND THE RISKS', mode: 'mainnet' }),
      });
      
      if (!armRes.ok) {
        const armData = await armRes.json();
        if (armData.error?.includes('rate limit') || armData.message?.includes('rate limit')) {
          alert('Rate limit exceeded. Please wait 1 minute and try again.');
        } else {
          alert(armData.message || armData.error || 'Failed to arm trading');
        }
        return;
      }
      
      // Then start the bot with user's wallet address
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      
      if (res.ok) {
        setBotRunning(true);
        setShowStartModal(false);
        setRiskAccepted({ lossRisk: false, noGuarantee: false, ownResponsibility: false });
      } else {
        const data = await res.json();
        if (data.error?.includes('rate limit') || data.message?.includes('rate limit')) {
          alert('Rate limit exceeded. Please wait 1 minute and try again.');
        } else {
          alert(data.message || 'Failed to start bot');
        }
      }
    } catch (err: any) {
      console.error('Start bot error:', err);
      alert('Failed to start bot. Please try again.');
    } finally {
      setSignatureLoading(false);
    }
  };

  // Handle close position manually via backend (uses agent wallet)
  const handleClosePosition = async (position?: typeof hlPositions[0]) => {
    const pos = position || hlPositions[0];
    if (!pos || !wallet.address) {
      alert('No position to close or wallet not connected');
      return;
    }
    
    // Confirm with user
    const confirmed = window.confirm(
      `Close ${pos.side.toUpperCase()} position?\n\nSize: ${pos.size} ${pos.coin}\nEntry: $${pos.entryPrice.toFixed(2)}\nPnL: $${pos.pnl.toFixed(2)}`
    );
    if (!confirmed) return;
    
    setClosingPosition(true);
    try {
      // First ARM the bot if not armed
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/arm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'I UNDERSTAND THE RISKS', mode: 'mainnet' }),
      });

      // Close via backend with user's wallet (uses agent wallet)
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/close-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      
      const result = await res.json();

      if (result.success) {
        alert('Position closed successfully!');
        setHlPositions([]);
        fetchHlData();
        fetchTradeHistory();
      } else {
        alert(`Failed to close position: ${result.error}`);
      }
    } catch (err: any) {
      console.error('Close position error:', err);
      alert(`Failed to close position: ${err.message}`);
    } finally {
      setClosingPosition(false);
    }
  };

  // Derived values - use ticker price (has decimals) or fallback to candle price
  const lastPrice = ticker?.price || currentCandle?.close || candles[candles.length - 1]?.close || 0;
  const prevClose = candles.length >= 2 ? candles[candles.length - 2]?.close || 0 : lastPrice;
  const priceChange = lastPrice - prevClose;
  const priceChangePercent = prevClose > 0 ? (priceChange / prevClose) * 100 : 0;
  
  // Bot running state (from new simple API)
  const [botRunning, setBotRunning] = useState(false);
  const [botLoading2, setBotLoading2] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<{
    action: string;
    confidence: number;
    reasoning: string;
    timestamp: number;
  } | null>(null);

  // Fetch bot status from simple API
  const fetchBotStatus = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/bot-status`);
      if (res.ok) {
        const data = await res.json();
        setBotRunning(data.running);
        if (data.lastAnalysis) {
          setLastAnalysis(data.lastAnalysis);
        }
      }
    } catch (err) {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 10000); // Reduced frequency
    return () => clearInterval(interval);
  }, [fetchBotStatus]);

  const isRunning = botRunning || botStatus?.running || false;

  const handleStartStop = async () => {
    setBotLoading2(true);
    try {
      if (isRunning) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/stop`, {
          method: 'POST',
        });
        if (res.ok) {
          setBotRunning(false);
        } else {
          const data = await res.json();
          alert(data.message || 'Failed to stop bot');
        }
      } else {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/start`, {
          method: 'POST',
        });
        if (res.ok) {
          setBotRunning(true);
        } else {
          const data = await res.json();
          alert(data.message || 'Failed to start bot');
        }
      }
    } catch (err) {
      alert('Failed to communicate with server');
    } finally {
      setBotLoading2(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    router.push('/');
  };

  if (!wallet.isConnected) {
    return null;
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Bar - Modern Glassmorphism Style */}
      <header className="h-12 border-b border-border/50 bg-card/80 backdrop-blur-xl flex items-center px-3 gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-display text-lg font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent hidden sm:block">Whalez</span>
        </div>

        {/* Symbol Selector with Search */}
        <div className="relative">
          <button 
            onClick={() => { setShowSymbolDropdown(!showSymbolDropdown); setSymbolSearch(''); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted border border-border/50 transition-all duration-200 hover:border-primary/50"
          >
            <span className="font-mono font-medium">{symbol}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showSymbolDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showSymbolDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[200px] max-h-[400px] overflow-hidden flex flex-col">
              {/* Search Input */}
              <div className="p-2 border-b border-border">
                <input
                  type="text"
                  placeholder="Search pairs..."
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>
              {/* Symbol List */}
              <div className="overflow-y-auto max-h-[340px]">
                {availableSymbols
                  .filter((s: string) => s.toLowerCase().includes(symbolSearch.toLowerCase()))
                  .map((s: string) => (
                    <button
                      key={s}
                      onClick={() => {
                        setSymbol(s);
                        setShowSymbolDropdown(false);
                        setSymbolSearch('');
                      }}
                      className={`w-full px-3 py-2 text-left text-sm font-mono hover:bg-muted transition-colors ${
                        s === symbol ? 'text-success bg-muted' : ''
                      }`}
                    >
                      {s.replace('-PERP', '')}
                    </button>
                  ))}
                {availableSymbols.filter((s: string) => s.toLowerCase().includes(symbolSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No pairs found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Live Price with Countdown */}
        <div className="flex items-center gap-3 px-3 py-1 rounded-lg bg-muted/30">
          <span className="font-mono text-lg font-bold">
            ${lastPrice >= 1000 ? Math.round(lastPrice).toLocaleString() : 
              lastPrice >= 1 ? lastPrice.toFixed(2) : 
              lastPrice >= 0.01 ? lastPrice.toFixed(4) : 
              lastPrice.toFixed(6)}
          </span>
          <span className={`font-mono text-sm flex items-center gap-1 ${priceChange >= 0 ? 'text-success' : 'text-danger'}`}>
            {priceChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
          </span>
          <CandleCountdown timeframe={timeframe} />
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.connected ? 'bg-success' : 'bg-danger'}`} />
          <span className="text-xs text-muted-foreground hidden sm:block">
            {status.connected ? 'Live' : 'Offline'}
          </span>
        </div>

        {/* Balance Display */}
        {hlBalance && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 text-sm">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-bold font-mono">${hlBalance.accountValue.toFixed(2)}</span>
          </div>
        )}

        {/* Leaderboard Link */}
        <button
          onClick={() => router.push('/leaderboard')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 text-amber-400 hover:from-amber-500/20 hover:to-orange-500/20 transition-all duration-200 text-sm"
        >
          <Trophy className="w-4 h-4" />
          <span className="hidden sm:inline font-medium">Leaderboard</span>
        </button>

        {/* Bot Controls in Header */}
        <div className="flex items-center gap-2 ml-auto">
          {isRunning && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/50 shadow-lg shadow-green-500/10">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-green-400 tracking-wider">LIVE</span>
            </div>
          )}
          {/* Authorization indicator - show Authorize button if not authorized */}
          {!isAgentAuthorized && (
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-3 py-1.5 rounded-lg font-medium text-sm flex items-center gap-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 hover:bg-yellow-500/30"
            >
              <Shield className="w-3 h-3" />
              Authorize
            </button>
          )}
          <button
            onClick={isRunning ? handleStartStop : () => setShowStartModal(true)}
            disabled={botLoading2}
            className={`px-4 py-1.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all duration-200 shadow-lg ${
              isRunning 
                ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-red-500/25' 
                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-green-500/25'
            }`}
          >
            {botLoading2 ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : isRunning ? (
              <>
                <Square className="w-3 h-3" />
                Stop
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                Start
              </>
            )}
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowAIPanel(true)}
            className="p-2 rounded-lg hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 transition-colors"
            title="AI Insights"
          >
            <Brain className="w-4 h-4" />
          </button>
        </div>

        {/* Wallet & Profile */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push('/profile')}
            className="p-2 rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            title="Profile"
          >
            <User className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/50 border border-border/50 text-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-mono text-xs">
              {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
            </span>
          </div>
          <button 
            onClick={handleDisconnect}
            className="p-2 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            title="Disconnect"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content - TradingView Style Layout */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Chart Area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <TradingChartPro
            candles={candles}
            symbol={symbol}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            wsConnected={status.connected}
            trades={tradeHistory}
            onTradeClick={(trade) => setSelectedTrade(trade)}
          />
        </div>

        {/* Bottom Panel - TradingView Style (Resizable) */}
        <div 
          className="border-t border-border/50 bg-card/95 backdrop-blur-sm flex flex-col shrink-0 relative"
          style={{ height: bottomPanelHeight }}
        >
          {/* Resize Handle */}
          <div
            className={`absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 hover:bg-primary/30 transition-colors ${isResizing ? 'bg-primary/50' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
              const startY = e.clientY;
              const startHeight = bottomPanelHeight;
              let currentHeight = startHeight;
              
              const onMouseMove = (moveEvent: MouseEvent) => {
                const deltaY = startY - moveEvent.clientY;
                currentHeight = Math.min(Math.max(startHeight + deltaY, 100), 600);
                setBottomPanelHeight(currentHeight);
              };
              
              const onMouseUp = () => {
                setIsResizing(false);
                localStorage.setItem('bottomPanelHeight', currentHeight.toString());
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
              };
              
              document.addEventListener('mousemove', onMouseMove);
              document.addEventListener('mouseup', onMouseUp);
            }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-1 rounded-full bg-muted-foreground/40 hover:bg-primary transition-colors" />
          </div>
          
          {/* Panel Header with Tabs */}
          <div className="flex items-center border-b border-border/50 px-2 mt-1">
            <div className="flex items-center gap-0.5">
              {['Positions', 'Trade History', 'Market Data', 'Grok AI', 'Performance', 'AI Insights'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setBottomTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                    bottomTab === tab
                      ? 'bg-muted/50 text-foreground border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                  }`}
                >
                  {tab}
                  {tab === 'Positions' && hlPositions.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 font-bold">{hlPositions.length}</span>
                  )}
                  {tab === 'Trade History' && tradeHistory.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">{tradeHistory.length}</span>
                  )}
                </button>
              ))}
            </div>
            
            {/* Account Summary */}
            <div className="ml-auto flex items-center gap-3 px-4 text-sm">
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted/30">
                <span className="text-muted-foreground text-xs">Balance</span>
                <span className="font-mono font-bold text-emerald-400">${hlBalance?.accountValue.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted/30">
                <span className="text-muted-foreground text-xs">Win Rate</span>
                <span className={`font-mono font-bold ${(stats?.winRate || 0) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats?.winRate?.toFixed(1) || '0.0'}%
                </span>
              </div>
            </div>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-auto">
            {bottomTab === 'Positions' && (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Symbol</th>
                    <th className="px-4 py-2 font-medium">Side</th>
                    <th className="px-4 py-2 font-medium">Size</th>
                    <th className="px-4 py-2 font-medium">Entry Price</th>
                    <th className="px-4 py-2 font-medium">Mark Price</th>
                    <th className="px-4 py-2 font-medium">Liq. Price</th>
                    <th className="px-4 py-2 font-medium">PnL</th>
                    <th className="px-4 py-2 font-medium">ROE</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hlPositions.length > 0 ? (
                    hlPositions.map((pos, idx) => (
                      <tr key={idx} className="border-b border-border hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono">{pos.coin}-PERP</td>
                        <td className={`px-4 py-2 font-medium ${pos.side === 'long' ? 'text-green-500' : 'text-red-500'}`}>
                          {pos.side.toUpperCase()} {pos.leverage}x
                        </td>
                        <td className="px-4 py-2 font-mono">{pos.size}</td>
                        <td className="px-4 py-2 font-mono">${pos.entryPrice.toFixed(2)}</td>
                        <td className="px-4 py-2 font-mono">${pos.markPrice.toFixed(2)}</td>
                        <td className="px-4 py-2 font-mono text-orange-500">${pos.liquidationPrice.toFixed(2)}</td>
                        <td className={`px-4 py-2 font-mono font-medium ${pos.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                        </td>
                        <td className={`px-4 py-2 font-mono font-medium ${pos.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => handleClosePosition(pos)}
                            disabled={closingPosition}
                            className="px-2 py-1 text-xs font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                          >
                            {closingPosition ? 'Closing...' : 'Close'}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Activity className="w-8 h-8 opacity-30" />
                          <span>No open positions</span>
                          <span className="text-xs">Start the bot to begin trading</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {bottomTab === 'Trade History' && (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Symbol</th>
                    <th className="px-4 py-2 font-medium">Side</th>
                    <th className="px-4 py-2 font-medium">Price</th>
                    <th className="px-4 py-2 font-medium">Size</th>
                    <th className="px-4 py-2 font-medium">SL / TP</th>
                    <th className="px-4 py-2 font-medium">Confidence</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeHistory.map((trade: any) => (
                    <tr key={trade.id} className="border-b border-border hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedTrade(trade)}>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(trade.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono">{trade.symbol}</td>
                      <td className={`px-4 py-3 font-medium ${trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                        {trade.side.toUpperCase()}
                      </td>
                      <td className="px-4 py-3 font-mono">${trade.price.toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono">{trade.quantity}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="text-red-500">${trade.stopLoss?.toFixed(0)}</span>
                        {' / '}
                        <span className="text-green-500">${trade.takeProfit?.toFixed(0)}</span>
                      </td>
                      <td className="px-4 py-3">{trade.confidence}%</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          trade.status === 'open' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {trade.status}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-mono font-medium ${(trade.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {trade.pnl ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))}
                  {tradeHistory.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <BarChart2 className="w-8 h-8 opacity-30" />
                          <span>No trade history yet</span>
                          <span className="text-xs">Trades will appear here once executed</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {bottomTab === 'Market Data' && (
              <div className="p-4 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <MarketDataPanel symbol={symbol} />
                </div>
              </div>
            )}

            {bottomTab === 'Grok AI' && (
              <div className="p-4 overflow-auto">
                <div className="max-w-2xl">
                  <GrokDashboard tradingBag={botConfig.tradingBag || [symbol]} />
                </div>
              </div>
            )}

            {bottomTab === 'Performance' && (
              <div className="p-4 overflow-auto">
                <PnlChart walletAddress={wallet.address || undefined} height={150} showStats={true} />
              </div>
            )}

            {bottomTab === 'AI Insights' && (
              <div className="p-3 flex gap-3 h-full overflow-hidden">
                {/* Left: Status & Metrics */}
                <div className="w-72 flex flex-col gap-2 shrink-0">
                  {/* Bot Status Card */}
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-3 h-3 rounded-full shrink-0 ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                      <div className={`text-sm font-medium ${isRunning ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {isRunning ? 'Bot Active' : 'Bot Stopped'}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-background/50">
                        <div className="text-muted-foreground">Mode</div>
                        <div className="font-medium text-primary">{botConfig.tradingMode?.toUpperCase() || 'AGGRESSIVE'}</div>
                      </div>
                      <div className="p-2 rounded bg-background/50">
                        <div className="text-muted-foreground">Interval</div>
                        <div className="font-medium">{botConfig.tradingMode === 'aggressive' ? '15s' : botConfig.tradingMode === 'moderate' ? '60s' : '300s'}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Last Signal Card */}
                  <div className="p-3 rounded-lg bg-muted/50 flex-1">
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                      <Activity className="w-3 h-3" />
                      Last Signal
                    </div>
                    {lastAnalysis ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`px-3 py-1 rounded text-sm font-bold ${
                            lastAnalysis.action === 'LONG' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            lastAnalysis.action === 'SHORT' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                            'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          }`}>
                            {lastAnalysis.action}
                          </span>
                          <div className="text-right">
                            <div className="text-lg font-bold">{lastAnalysis.confidence}%</div>
                            <div className="text-xs text-muted-foreground">confidence</div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
                          {new Date(lastAnalysis.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Waiting for signal...</div>
                    )}
                  </div>
                </div>

                {/* Right: AI Reasoning */}
                <div className="flex-1 p-3 rounded-lg bg-muted/50 overflow-auto">
                  <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2 border-b border-border pb-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span className="font-medium">Grok AI Analysis</span>
                  </div>
                  {lastAnalysis ? (
                    <div className="text-sm leading-relaxed space-y-3">
                      {lastAnalysis.reasoning.split('\n\n').map((paragraph: string, i: number) => {
                        if (paragraph.startsWith('📅') || paragraph.startsWith('📰') || paragraph.startsWith('🐋')) {
                          return (
                            <div key={i} className="p-2 rounded bg-background/50 text-xs">
                              {paragraph}
                            </div>
                          );
                        }
                        return <p key={i}>{paragraph}</p>;
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground flex flex-col items-center justify-center h-full gap-2">
                      <Brain className="w-8 h-8 text-muted-foreground/50" />
                      <span>Start the bot to see AI analysis</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bot Start Confirmation Modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowStartModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-[450px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <span className="font-medium">Risk Acknowledgment</span>
              </div>
              <button onClick={() => setShowStartModal(false)} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Before starting the trading bot, please acknowledge the following risks:
              </p>
              
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={riskAccepted.lossRisk}
                    onChange={(e) => setRiskAccepted(prev => ({ ...prev, lossRisk: e.target.checked }))}
                    className="mt-1"
                  />
                  <span className="text-sm">I understand that trading involves significant risk of loss</span>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={riskAccepted.noGuarantee}
                    onChange={(e) => setRiskAccepted(prev => ({ ...prev, noGuarantee: e.target.checked }))}
                    className="mt-1"
                  />
                  <span className="text-sm">I understand there is no guarantee of profits</span>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={riskAccepted.ownResponsibility}
                    onChange={(e) => setRiskAccepted(prev => ({ ...prev, ownResponsibility: e.target.checked }))}
                    className="mt-1"
                  />
                  <span className="text-sm">I take full responsibility for any losses</span>
                </label>
              </div>
              
              <button
                onClick={handleStartWithSignature}
                disabled={!allRisksAccepted || signatureLoading}
                className="w-full px-4 py-2 rounded-lg font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {signatureLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Starting...
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
          <div className="bg-card border border-border rounded-xl shadow-2xl w-[450px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="font-medium">Authorize Trading</span>
              </div>
              <button onClick={() => setShowAuthModal(false)} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <AgentAuthorization
                walletAddress={wallet.address}
                onAuthorized={(credentials) => {
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

      {/* Trade Detail Modal */}
      {selectedTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedTrade(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded font-bold ${
                  selectedTrade.side === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {selectedTrade.side.toUpperCase()}
                </span>
                <span className="font-mono font-medium">${selectedTrade.price.toFixed(2)}</span>
              </div>
              <button onClick={() => setSelectedTrade(null)} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-auto max-h-[60vh]">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">Symbol</div>
                  <div className="font-mono">{selectedTrade.symbol}</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">Size</div>
                  <div className="font-mono">{selectedTrade.quantity}</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">Confidence</div>
                  <div className="font-mono">{selectedTrade.confidence}%</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className={selectedTrade.status === 'open' ? 'text-blue-400' : 'text-gray-400'}>{selectedTrade.status}</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">Stop Loss</div>
                  <div className="font-mono text-red-400">${selectedTrade.stopLoss?.toFixed(2) || '-'}</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">Take Profit</div>
                  <div className="font-mono text-green-400">${selectedTrade.takeProfit?.toFixed(2) || '-'}</div>
                </div>
                {selectedTrade.pnl !== undefined && (
                  <div className="p-2 rounded bg-muted/50 col-span-2">
                    <div className="text-xs text-muted-foreground">PnL</div>
                    <div className={`font-mono font-bold ${selectedTrade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedTrade.pnl >= 0 ? '+' : ''}${selectedTrade.pnl.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3 rounded bg-muted/50">
                <div className="text-xs text-muted-foreground mb-2">AI Reasoning</div>
                <div className="text-sm leading-relaxed">{selectedTrade.reasoning}</div>
              </div>
              <div className="text-xs text-muted-foreground text-center">
                {new Date(selectedTrade.timestamp).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        config={{
          botName: botConfig.botName,
          tradingBag: botConfig.tradingBag,
          leverage: botConfig.leverage,
          dynamicLeverage: botConfig.dynamicLeverage,
          positionSizePct: botConfig.positionSizePct,
          stopLossPct: botConfig.stopLossPct,
          takeProfitPct: botConfig.takeProfitPct,
          maxDrawdownPct: botConfig.maxDrawdownPct,
          minConfirmations: botConfig.minConfirmations,
          tradingMode: botConfig.tradingMode,
          paperTrading: false,
          enableTrailingStop: true,
          trailingStopActivation: 0.5,
          trailingStopDistance: 0.3,
          useSmartSLTP: true,
          maxSimultaneousPositions: 3,
          enableSessionFilter: false,
          enableFundingAnalysis: true,
          enableOpenInterestAnalysis: true,
          enableLiquidationAnalysis: true,
          enableMultiTimeframe: true,
          enableDynamicSizing: true,
        }}
        onSave={(config) => {
          // Update local state immediately
          setBotConfig(prev => ({
            ...prev,
            botName: config.botName,
            tradingBag: config.tradingBag,
            leverage: config.leverage,
            dynamicLeverage: config.dynamicLeverage,
            positionSizePct: config.positionSizePct,
            stopLossPct: config.stopLossPct,
            takeProfitPct: config.takeProfitPct,
            maxDrawdownPct: config.maxDrawdownPct,
            minConfirmations: config.minConfirmations,
            tradingMode: config.tradingMode,
          }));
          // Update symbol to first in bag
          if (config.tradingBag && config.tradingBag.length > 0) {
            setSymbol(config.tradingBag[0]);
          }
          // Save to backend with wallet address
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet: wallet.address,
              botName: config.botName,
              tradingBag: config.tradingBag,
              maxLeverage: config.leverage,
              dynamicLeverage: config.dynamicLeverage,
              tradingMode: config.tradingMode,
              positionSizePct: config.positionSizePct,
              stopLossPct: config.stopLossPct,
              takeProfitPct: config.takeProfitPct,
            }),
          }).catch(console.error);
        }}
      />


      {/* AI Panel / Insights Modal */}
      {showAIPanel && (
        <AIPanel
          botId="default-trading-bot"
          isOpen={showAIPanel}
          onClose={() => setShowAIPanel(false)}
        />
      )}
    </div>
  );
}
