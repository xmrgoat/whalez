/**
 * useMarketData Hook - ROBUST VERSION
 * 
 * Fetches market data via REST API with proper symbol tracking.
 * Each symbol/timeframe combination gets its own isolated data.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketStatus {
  connected: boolean;
  isDelayed: boolean;
  latencyMs: number;
  lastUpdate: number;
}

export interface BotDecision {
  action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE';
  confirmations: Array<{ name: string; passed: boolean; reason: string }>;
  confidence: number;
  reason: string;
  timestamp: number;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short' | 'none';
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  action: 'open' | 'close';
  price: number;
  quantity: number;
  pnl?: number;
  mode: 'paper' | 'live';
  timestamp: number;
}

interface UseMarketDataOptions {
  symbol: string;
  timeframe: string;
  botId?: string;
  autoConnect?: boolean;
}

// Data state interface
interface MarketDataState {
  candles: OHLC[];
  currentCandle: OHLC | null;
  ticker: { price: number; change24h: number } | null;
  status: MarketStatus;
  dataSymbol: string; // Track which symbol this data belongs to
  dataTimeframe: string;
}

const initialState: MarketDataState = {
  candles: [],
  currentCandle: null,
  ticker: null,
  status: { connected: true, isDelayed: false, latencyMs: 0, lastUpdate: 0 },
  dataSymbol: '',
  dataTimeframe: '',
};

export function useMarketData(options: UseMarketDataOptions) {
  const { symbol, timeframe, autoConnect = true } = options;

  // Single state object to ensure atomic updates
  const [state, setState] = useState<MarketDataState>(initialState);

  // Bot data (kept for compatibility)
  const [decision, setDecision] = useState<BotDecision | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [botStatus, setBotStatus] = useState<{
    running: boolean;
    mode: 'paper' | 'live';
    armed: boolean;
  } | null>(null);

  // Unique key for this symbol/timeframe combination
  const dataKey = useMemo(() => `${symbol}:${timeframe}`, [symbol, timeframe]);

  // Main effect: fetch data when symbol/timeframe changes
  useEffect(() => {
    if (!autoConnect) return;
    
    // Create abort controller for this effect instance
    const abortController = new AbortController();
    const currentSymbol = symbol;
    const currentTimeframe = timeframe;
    const currentKey = dataKey;
    
    // Clear existing data immediately when symbol changes
    setState({
      ...initialState,
      dataSymbol: currentSymbol,
      dataTimeframe: currentTimeframe,
    });
    
    // Fetch candles for the current symbol
    const fetchCandles = async () => {
      if (abortController.signal.aborted) return;
      
      try {
        const response = await fetch(
          `${API_URL}/api/market/candles?symbol=${currentSymbol}&timeframe=${currentTimeframe}&limit=500`,
          { signal: abortController.signal }
        );
        
        if (!response.ok || abortController.signal.aborted) return;
        
        const data = await response.json();
        
        if (!abortController.signal.aborted && data.candles && Array.isArray(data.candles)) {
          setState(prev => {
            // Only update if this is still the current symbol
            if (prev.dataSymbol !== currentSymbol || prev.dataTimeframe !== currentTimeframe) {
              return prev;
            }
            return {
              ...prev,
              candles: data.candles,
              currentCandle: data.candles.length > 0 ? data.candles[data.candles.length - 1] : null,
              status: {
                ...prev.status,
                isDelayed: data.status?.isDelayed || false,
                latencyMs: data.status?.latencyMs || 0,
                lastUpdate: Date.now(),
              },
            };
          });
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error(`[useMarketData] Failed to fetch candles for ${currentSymbol}:`, error);
        }
      }
    };
    
    // Fetch ticker for the current symbol
    const fetchTicker = async () => {
      if (abortController.signal.aborted) return;
      
      try {
        const response = await fetch(
          `${API_URL}/api/market/ticker?symbol=${currentSymbol}`,
          { signal: abortController.signal }
        );
        
        if (!response.ok || abortController.signal.aborted) return;
        
        const data = await response.json();
        
        if (!abortController.signal.aborted) {
          setState(prev => {
            // Only update if this is still the current symbol
            if (prev.dataSymbol !== currentSymbol) {
              return prev;
            }
            return {
              ...prev,
              ticker: { 
                price: data.price || data.last || 0, 
                change24h: data.change24h || 0 
              },
            };
          });
        }
      } catch (error: any) {
        // Silently fail for ticker
      }
    };
    
    // Initial fetch
    fetchCandles();
    fetchTicker();
    
    // Poll for updates - use shorter interval for more responsive updates
    const candlePollInterval = setInterval(fetchCandles, 5000);
    const tickerPollInterval = setInterval(fetchTicker, 1000);
    
    return () => {
      abortController.abort();
      clearInterval(candlePollInterval);
      clearInterval(tickerPollInterval);
    };
  }, [symbol, timeframe, autoConnect, dataKey]);

  // Refetch function
  const refetch = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/market/candles?symbol=${symbol}&timeframe=${timeframe}&limit=500`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.candles && Array.isArray(data.candles)) {
          setState(prev => {
            if (prev.dataSymbol !== symbol || prev.dataTimeframe !== timeframe) {
              return prev;
            }
            return {
              ...prev,
              candles: data.candles,
              currentCandle: data.candles.length > 0 ? data.candles[data.candles.length - 1] : null,
            };
          });
        }
      }
    } catch (error) {
      console.error('[useMarketData] Failed to refetch:', error);
    }
  }, [symbol, timeframe]);

  // Only return candles if they match the current symbol
  const validCandles = state.dataSymbol === symbol && state.dataTimeframe === timeframe 
    ? state.candles 
    : [];
  const validTicker = state.dataSymbol === symbol ? state.ticker : null;
  const validCurrentCandle = state.dataSymbol === symbol && state.dataTimeframe === timeframe 
    ? state.currentCandle 
    : null;

  return {
    // Connection
    status: state.status,
    connect: () => {},
    disconnect: () => {},

    // Market data - only return if matches current symbol
    candles: validCandles,
    currentCandle: validCurrentCandle,
    ticker: validTicker,

    // Bot data
    decision,
    position,
    trades,
    botStatus,

    // Actions
    refetch,
    changeSubscription: () => {},
  };
}

export default useMarketData;
