'use client';

/**
 * GrokTradeExecutor Component
 * Listens for Grok trading signals and executes trades via MetaMask
 * Users must approve each trade with their wallet
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  placeOrder, 
  getAccountInfo, 
  getAllMids,
  type HLOrderResult,
  type HLAccountInfo 
} from '@/lib/hyperliquid-client';

interface GrokSignal {
  action: 'LONG' | 'SHORT' | 'HOLD' | 'NO_TRADE';
  confidence: number;
  reasoning: string;
  suggestedLeverage?: number;
  timestamp: number;
}

interface TradeExecution {
  id: string;
  signal: GrokSignal;
  result: HLOrderResult;
  price: number;
  size: number;
  timestamp: number;
}

interface Props {
  walletAddress: string | null;
  autoExecute?: boolean; // If true, auto-execute trades without confirmation
  minConfidence?: number; // Minimum confidence to show trade prompt
  onTradeExecuted?: (trade: TradeExecution) => void;
}

export default function GrokTradeExecutor({ 
  walletAddress, 
  autoExecute = false,
  minConfidence = 70,
  onTradeExecuted 
}: Props) {
  const [accountInfo, setAccountInfo] = useState<HLAccountInfo | null>(null);
  const [pendingSignal, setPendingSignal] = useState<GrokSignal | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastTrade, setLastTrade] = useState<TradeExecution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [btcPrice, setBtcPrice] = useState<number>(0);

  // Fetch account info
  useEffect(() => {
    if (!walletAddress) return;

    const fetchAccountInfo = async () => {
      try {
        const info = await getAccountInfo(walletAddress);
        setAccountInfo(info);
      } catch (err) {
        console.error('Failed to fetch account info:', err);
      }
    };

    fetchAccountInfo();
    const interval = setInterval(fetchAccountInfo, 10000); // Every 10s
    return () => clearInterval(interval);
  }, [walletAddress]);

  // Fetch BTC price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const mids = await getAllMids();
        setBtcPrice(parseFloat(mids['BTC'] || '0'));
      } catch (err) {
        console.error('Failed to fetch price:', err);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000); // Every 5s
    return () => clearInterval(interval);
  }, []);

  // Listen for Grok signals from the API
  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    const checkForSignals = async () => {
      try {
        const res = await fetch(`${API_URL}/trading/bot-status`);
        const data = await res.json();
        
        if (data.lastAnalysis && 
            data.lastAnalysis.action !== 'HOLD' && 
            data.lastAnalysis.action !== 'NO_TRADE' &&
            data.lastAnalysis.confidence >= minConfidence) {
          
          const signal: GrokSignal = {
            action: data.lastAnalysis.action,
            confidence: data.lastAnalysis.confidence,
            reasoning: data.lastAnalysis.reasoning,
            timestamp: data.lastAnalysis.timestamp,
          };

          // Only show if it's a new signal
          if (!pendingSignal || pendingSignal.timestamp !== signal.timestamp) {
            setPendingSignal(signal);
          }
        }
      } catch (err) {
        console.error('Failed to check for signals:', err);
      }
    };

    const interval = setInterval(checkForSignals, 5000); // Every 5s
    return () => clearInterval(interval);
  }, [minConfidence, pendingSignal]);

  // Execute trade
  const executeTrade = useCallback(async (signal: GrokSignal) => {
    if (!walletAddress || !accountInfo) {
      setError('Wallet not connected or no account info');
      return;
    }

    setIsExecuting(true);
    setError(null);

    try {
      const equity = parseFloat(accountInfo.accountValue);
      const positionSize = (equity * 0.02) / btcPrice; // 2% of account

      if (positionSize < 0.0001) {
        setError('Position size too small');
        setIsExecuting(false);
        return;
      }

      const isBuy = signal.action === 'LONG';
      
      const result = await placeOrder({
        coin: 'BTC',
        isBuy,
        size: positionSize,
      });

      const trade: TradeExecution = {
        id: `trade_${Date.now()}`,
        signal,
        result,
        price: btcPrice,
        size: positionSize,
        timestamp: Date.now(),
      };

      setLastTrade(trade);
      setPendingSignal(null);
      
      if (onTradeExecuted) {
        onTradeExecuted(trade);
      }

      if (!result.success) {
        setError(result.error || 'Trade failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExecuting(false);
    }
  }, [walletAddress, accountInfo, btcPrice, onTradeExecuted]);

  // Auto-execute if enabled
  useEffect(() => {
    if (autoExecute && pendingSignal && !isExecuting) {
      executeTrade(pendingSignal);
    }
  }, [autoExecute, pendingSignal, isExecuting, executeTrade]);

  if (!walletAddress) {
    return (
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <p className="text-yellow-400 text-sm">
          Connect your wallet to enable Grok trading
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Account Info */}
      {accountInfo && (
        <div className="p-4 bg-muted/30 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Account Value</span>
            <span className="font-mono font-bold">${parseFloat(accountInfo.accountValue).toFixed(2)}</span>
          </div>
          {accountInfo.positions.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Open Positions: {accountInfo.positions.length}</span>
            </div>
          )}
        </div>
      )}

      {/* Pending Signal */}
      {pendingSignal && !autoExecute && (
        <div className={`p-4 rounded-lg border ${
          pendingSignal.action === 'LONG' 
            ? 'bg-green-500/10 border-green-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`px-2 py-1 rounded text-xs font-bold ${
              pendingSignal.action === 'LONG' 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              🤖 GROK: {pendingSignal.action}
            </span>
            <span className="text-sm font-mono">{pendingSignal.confidence}% confidence</span>
          </div>
          
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {pendingSignal.reasoning.substring(0, 150)}...
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => executeTrade(pendingSignal)}
              disabled={isExecuting}
              className={`flex-1 px-4 py-2 rounded font-medium ${
                pendingSignal.action === 'LONG'
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              } disabled:opacity-50`}
            >
              {isExecuting ? 'Signing...' : `Execute ${pendingSignal.action}`}
            </button>
            <button
              onClick={() => setPendingSignal(null)}
              className="px-4 py-2 rounded bg-muted hover:bg-muted/80"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Last Trade */}
      {lastTrade && (
        <div className={`p-3 rounded-lg ${
          lastTrade.result.success 
            ? 'bg-green-500/10 border border-green-500/30' 
            : 'bg-red-500/10 border border-red-500/30'
        }`}>
          <div className="flex items-center gap-2">
            <span>{lastTrade.result.success ? '✅' : '❌'}</span>
            <span className="text-sm">
              {lastTrade.result.success 
                ? `${lastTrade.signal.action} executed @ $${lastTrade.result.avgPx || lastTrade.price.toFixed(0)}`
                : `Failed: ${lastTrade.result.error}`
              }
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">❌ {error}</p>
        </div>
      )}

      {/* Auto-execute indicator */}
      {autoExecute && (
        <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <p className="text-purple-400 text-xs text-center">
            🤖 Auto-execute enabled - Trades will be signed automatically
          </p>
        </div>
      )}
    </div>
  );
}
