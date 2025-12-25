'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import BionicText from '@/components/BionicText';
import WalletButton from '@/components/WalletButton';
import { useMarketData } from '@/hooks/useMarketData';
import { useDecisions, fetchDecisionDetail, fetchDecisionByTimestamp, type DecisionDetail } from '@/hooks/useDecisions';
import DecisionTimeline from '@/components/DecisionTimeline';
import DecisionInspectorPanel from '@/components/DecisionInspectorPanel';

const TradingChartV3 = dynamic(() => import('@/components/TradingChartV3'), { ssr: false });
const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false });

// Types
interface LiveFeedItem {
  id: string;
  timestamp: number;
  type: 'decision' | 'trade' | 'info';
  message: string;
  details?: string;
}

const SYMBOLS = ['BTC-PERP', 'ETH-PERP'];
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function Dashboard() {
  // UI State
  const [symbol, setSymbol] = useState('BTC-PERP');
  const [timeframe, setTimeframe] = useState('1h');
  const [indicators, setIndicators] = useState(['ema20', 'ema50']);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);
  
  // Inspector State
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<DecisionDetail | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  
  // Trading mode
  const [botMode, setBotMode] = useState<'paper' | 'live'>('paper');
  const [armed, setArmed] = useState(false);
  const [showArmConfirm, setShowArmConfirm] = useState(false);
  const [armPhrase, setArmPhrase] = useState('');

  // Real-time market data hook
  const {
    status,
    candles,
    currentCandle,
    decision,
    position,
    trades,
    botStatus,
  } = useMarketData({
    symbol,
    timeframe,
    autoConnect: true,
  });

  // Decisions hook
  const { decisions, loading: decisionsLoading } = useDecisions({
    symbol,
    timeframe,
    limit: 50,
    autoRefresh: true,
  });

  // Derived state
  const wsConnected = status.connected;
  const isDelayed = status.isDelayed;
  const lastPrice = currentCandle?.close || candles[candles.length - 1]?.close || 0;

  const toggleIndicator = (ind: string) => {
    setIndicators(prev => 
      prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
    );
  };

  // Add to live feed
  const addToFeed = useCallback((type: LiveFeedItem['type'], message: string, details?: string) => {
    setLiveFeed(prev => [{
      id: Date.now().toString(),
      timestamp: Date.now(),
      type,
      message,
      details,
    }, ...prev].slice(0, 50));
  }, []);

  // Handle decision selection
  const handleSelectDecision = useCallback(async (id: string) => {
    setSelectedDecisionId(id);
    setInspectorLoading(true);
    setInspectorOpen(true);
    
    const detail = await fetchDecisionDetail(id);
    setSelectedDecision(detail);
    setInspectorLoading(false);
  }, []);

  // Handle candle click for inspection
  const handleCandleClick = useCallback(async (timestamp: number) => {
    setInspectorLoading(true);
    setInspectorOpen(true);
    
    const detail = await fetchDecisionByTimestamp(symbol, timeframe, timestamp);
    if (detail) {
      setSelectedDecisionId(detail.id);
      setSelectedDecision(detail);
    } else {
      setSelectedDecision(null);
    }
    setInspectorLoading(false);
  }, [symbol, timeframe]);

  // Handle ARM confirmation
  const handleArmLive = () => {
    if (armPhrase === 'I UNDERSTAND THE RISKS') {
      setArmed(true);
      setBotMode('live');
      setShowArmConfirm(false);
      setArmPhrase('');
      addToFeed('info', 'LIVE MODE ARMED', 'Trading with real funds enabled');
    }
  };

  // Fullscreen chart view
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <TradingChart
          symbol={symbol}
          timeframe={timeframe}
          candles={candles}
          indicators={indicators}
          decision={decision}
          onTimeframeChange={setTimeframe}
          isFullscreen={true}
          onToggleFullscreen={() => setIsFullscreen(false)}
          wsConnected={wsConnected}
          isDelayed={isDelayed}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-border px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="font-pixel text-sm">WHAL<span className="text-gray-400">EZ</span></h1>
          <div className="flex items-center gap-4">
            {/* Symbol selector */}
            <select 
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="text-xs bg-transparent border border-border rounded px-2 py-1"
            >
              {SYMBOLS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Mode indicator */}
            <div className={`px-2 py-1 text-xs rounded ${
              botMode === 'live' ? 'bg-red-600 text-white' :
              botStatus?.running ? 'bg-black text-white' :
              botMode === 'paper' ? 'bg-muted' : 'bg-white border border-border'
            }`}>
              {botMode === 'live' ? 'LIVE' : botStatus?.running ? 'RUNNING' : 'PAPER'}
            </div>

            {/* WS status */}
            <div className="flex items-center gap-1 text-xs">
              <div className={`w-2 h-2 rounded-full ${
                wsConnected ? (isDelayed ? 'bg-yellow-500' : 'bg-green-500') : 'bg-red-500'
              }`} />
              <span className="text-muted-foreground">
                {wsConnected ? (isDelayed ? 'Delayed' : 'Connected') : 'Offline'}
              </span>
            </div>

            {/* Wallet */}
            <WalletButton />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border p-4 min-h-[calc(100vh-57px)] overflow-y-auto">
          {/* Bot Controls */}
          <div className="mb-6">
            <h2 className="font-pixel text-xs mb-3">CONTROLS</h2>
            <div className="space-y-2">
              <button 
                onClick={() => console.log('TODO: Start/Stop bot via API')}
                className={`w-full btn ${botStatus?.running ? 'btn-primary' : ''}`}
              >
                <BionicText>{botStatus?.running ? 'Stop Bot' : 'Start Bot'}</BionicText>
              </button>
              <button 
                onClick={() => { setBotMode('paper'); setArmed(false); }}
                className={`w-full btn ${botMode === 'paper' ? 'btn-primary' : ''}`}
              >
                <BionicText>Paper Mode</BionicText>
              </button>
              <button 
                onClick={() => setShowArmConfirm(true)}
                disabled={armed}
                className={`w-full btn ${armed ? 'bg-red-600 text-white' : 'border-red-600 text-red-600'}`}
              >
                <BionicText>{armed ? '🔴 ARMED' : 'ARM LIVE'}</BionicText>
              </button>
            </div>
          </div>

          {/* Position */}
          {position && position.side !== 'none' && (
            <div className="mb-6 p-3 border border-border rounded">
              <h2 className="font-pixel text-xs mb-2">POSITION</h2>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className={position.side === 'long' ? 'text-green-600' : 'text-red-600'}>
                    {position.side.toUpperCase()}
                  </span>
                  <span>{position.leverage}x</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Entry</span>
                  <span>${position.entryPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Mark</span>
                  <span>${position.markPrice.toLocaleString()}</span>
                </div>
                <div className={`flex justify-between font-bold ${position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span>PnL</span>
                  <span>{position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} ({position.pnlPercent.toFixed(2)}%)</span>
                </div>
              </div>
            </div>
          )}

          {/* Indicators */}
          <div className="mb-6">
            <h2 className="font-pixel text-xs mb-3">INDICATORS</h2>
            <div className="space-y-2">
              {['ema20', 'ema50', 'ema200', 'rsi', 'volume', 'ichimoku'].map(ind => (
                <label key={ind} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indicators.includes(ind)}
                    onChange={() => toggleIndicator(ind)}
                    className="rounded border-border"
                  />
                  {ind.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          {/* Risk Settings */}
          <div className="mb-6">
            <h2 className="font-pixel text-xs mb-3">RISK</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-muted-foreground text-xs"><BionicText>Position Size</BionicText></label>
                <input type="range" min="1" max="5" defaultValue="2" className="w-full" />
                <span className="text-xs"><BionicText>2% equity</BionicText></span>
              </div>
              <div>
                <label className="text-muted-foreground text-xs"><BionicText>Max Drawdown</BionicText></label>
                <input type="range" min="5" max="20" defaultValue="10" className="w-full" />
                <span className="text-xs"><BionicText>10%</BionicText></span>
              </div>
              <div>
                <label className="text-muted-foreground text-xs"><BionicText>Max Leverage</BionicText></label>
                <input type="range" min="1" max="10" defaultValue="5" className="w-full" />
                <span className="text-xs"><BionicText>5x</BionicText></span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-hidden flex gap-4">
          <div className="flex-1 flex flex-col">
            {/* Chart */}
            <div className="card h-[400px] mb-4">
              <TradingChartV3
                symbol={symbol}
                timeframe={timeframe}
                candles={candles}
                indicators={indicators}
                onTimeframeChange={setTimeframe}
                onToggleFullscreen={() => setIsFullscreen(true)}
                onCandleClick={handleCandleClick}
                wsConnected={wsConnected}
                isDelayed={isDelayed}
                inspectorOpen={inspectorOpen}
                onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
              />
            </div>

          {/* Bottom Panels */}
          <div className="grid grid-cols-3 gap-4">
            {/* Live Feed */}
            <div className="card col-span-1 max-h-[200px] overflow-y-auto">
              <h3 className="font-pixel text-xs mb-3">LIVE BOT FEED</h3>
              <div className="space-y-2 text-xs">
                {liveFeed.length === 0 ? (
                  <p className="text-muted-foreground">No activity yet...</p>
                ) : (
                  liveFeed.map(item => (
                    <div key={item.id} className={`p-2 rounded ${
                      item.type === 'decision' ? 'bg-blue-50' :
                      item.type === 'trade' ? 'bg-green-50' : 'bg-muted'
                    }`}>
                      <div className="font-medium">{item.message}</div>
                      {item.details && (
                        <div className="text-muted-foreground mt-1">{item.details}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Trades */}
            <div className="card col-span-1">
              <h3 className="font-pixel text-xs mb-3">RECENT TRADES</h3>
              {trades.length === 0 ? (
                <p className="text-xs text-muted-foreground">No trades yet...</p>
              ) : (
                <table className="table text-sm">
                  <thead>
                    <tr>
                      <th>Side</th>
                      <th>Price</th>
                      <th>PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 5).map((trade) => (
                      <tr key={trade.id}>
                        <td className={trade.side === 'long' ? 'text-green-600' : 'text-red-600'}>
                          {trade.side.toUpperCase()}
                        </td>
                        <td>${trade.price.toLocaleString()}</td>
                        <td className={trade.pnl && trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {trade.pnl ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Critique */}
            <div className="card col-span-1">
              <h3 className="font-pixel text-xs mb-3">LAST CRITIQUE</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground"><BionicText>Win Rate</BionicText></span>
                  <span>66.7%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground"><BionicText>Expectancy</BionicText></span>
                  <span>$25.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground"><BionicText>Avg R</BionicText></span>
                  <span>1.2</span>
                </div>
                <div className="mt-3 p-2 bg-muted rounded text-xs">
                  <div className="font-semibold mb-1"><BionicText>Recommendation:</BionicText></div>
                  <p className="text-muted-foreground">
                    <BionicText>Consider widening ATR multiplier from 2.0 to 2.2.</BionicText>
                  </p>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Decision Timeline (right side when inspector closed) */}
          {!inspectorOpen && (
            <div className="w-64 border border-border rounded bg-white h-[600px]">
              <DecisionTimeline
                decisions={decisions}
                selectedId={selectedDecisionId}
                onSelect={handleSelectDecision}
                loading={decisionsLoading}
              />
            </div>
          )}

          {/* Decision Inspector Panel */}
          {inspectorOpen && (
            <DecisionInspectorPanel
              decision={selectedDecision as any}
              onClose={() => setInspectorOpen(false)}
              loading={inspectorLoading}
            />
          )}
        </main>
      </div>

      {/* ARM Confirmation Modal */}
      {showArmConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md">
            <h2 className="font-pixel text-sm mb-4 text-red-600">⚠️ ARM LIVE TRADING</h2>
            <p className="text-sm mb-4">
              <BionicText>You are about to enable LIVE trading with real funds. This action cannot be undone automatically.</BionicText>
            </p>
            <p className="text-sm mb-4">
              <BionicText>Type "I UNDERSTAND THE RISKS" to confirm:</BionicText>
            </p>
            <input
              type="text"
              value={armPhrase}
              onChange={(e) => setArmPhrase(e.target.value)}
              className="w-full border border-border rounded px-3 py-2 mb-4 text-sm"
              placeholder="Type confirmation phrase..."
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowArmConfirm(false); setArmPhrase(''); }}
                className="flex-1 btn"
              >
                Cancel
              </button>
              <button
                onClick={handleArmLive}
                disabled={armPhrase !== 'I UNDERSTAND THE RISKS'}
                className="flex-1 btn bg-red-600 text-white disabled:opacity-50"
              >
                ARM LIVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border px-6 py-2 text-center text-xs text-muted-foreground">
        <BionicText>⚠️ Not financial advice. Trading involves risk. Paper mode recommended.</BionicText>
      </footer>
    </div>
  );
}
