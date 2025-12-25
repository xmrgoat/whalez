/**
 * useMarketData Hook
 * 
 * Connects to the API WebSocket and provides real-time market data.
 * Handles reconnection, status tracking, and data normalization.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const WS_URL = process.env['NEXT_PUBLIC_WS_URL'] || 'ws://localhost:3001/ws';
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

export function useMarketData(options: UseMarketDataOptions) {
  const { symbol, timeframe, botId, autoConnect = true } = options;

  // Connection state
  const [status, setStatus] = useState<MarketStatus>({
    connected: false,
    isDelayed: false,
    latencyMs: 0,
    lastUpdate: 0,
  });

  // Market data
  const [candles, setCandles] = useState<OHLC[]>([]);
  const [currentCandle, setCurrentCandle] = useState<OHLC | null>(null);
  const [ticker, setTicker] = useState<{ price: number; change24h: number } | null>(null);

  // Bot data
  const [decision, setDecision] = useState<BotDecision | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [botStatus, setBotStatus] = useState<{
    running: boolean;
    mode: 'paper' | 'live';
    armed: boolean;
  } | null>(null);

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  // Fetch initial candles via REST
  const fetchInitialCandles = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/market/candles?symbol=${symbol}&timeframe=${timeframe}&limit=500`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.candles && Array.isArray(data.candles)) {
        setCandles(data.candles);
        setStatus(prev => ({
          ...prev,
          isDelayed: data.status?.isDelayed || false,
          latencyMs: data.status?.latencyMs || 0,
          lastUpdate: Date.now(),
        }));
      }
    } catch (error) {
      console.error('[useMarketData] Failed to fetch candles:', error);
    }
  }, [symbol, timeframe]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useMarketData] WebSocket connected');
        setStatus(prev => ({ ...prev, connected: true }));
        reconnectAttempts.current = 0;

        // Subscribe to candles
        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: 'candles',
          symbol,
          timeframe,
        }));

        // Subscribe to bot if botId provided
        if (botId) {
          ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'bot',
            botId,
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('[useMarketData] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[useMarketData] WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('[useMarketData] WebSocket closed');
        setStatus(prev => ({ ...prev, connected: false }));
        wsRef.current = null;

        // Reconnect with exponential backoff
        if (reconnectAttempts.current < 10) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };
    } catch (error) {
      console.error('[useMarketData] Failed to connect:', error);
    }
  }, [symbol, timeframe, botId]);

  // Handle incoming messages
  const handleMessage = useCallback((message: any) => {
    const now = Date.now();

    switch (message.type) {
      case 'candles:snapshot':
        if (message.symbol === symbol && message.timeframe === timeframe) {
          setCandles(message.candles || []);
          setStatus(prev => ({ ...prev, lastUpdate: now }));
        }
        break;

      case 'candles:update':
        if (message.symbol === symbol && message.timeframe === timeframe) {
          const candle = message.candle;
          setCurrentCandle(candle);
          
          setCandles(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            
            if (lastIdx >= 0 && updated[lastIdx]!.timestamp === candle.timestamp) {
              // Update existing candle
              updated[lastIdx] = candle;
            } else if (message.isClosed || (lastIdx >= 0 && candle.timestamp > updated[lastIdx]!.timestamp)) {
              // Add new candle
              updated.push(candle);
              // Keep max 500 candles
              if (updated.length > 500) {
                updated.shift();
              }
            }
            
            return updated;
          });

          setStatus(prev => ({
            ...prev,
            isDelayed: false,
            lastUpdate: now,
          }));
        }
        break;

      case 'bot:decision':
        if (!botId || message.botId === botId) {
          setDecision({
            ...message.decision,
            timestamp: message.timestamp,
          });
        }
        break;

      case 'bot:position':
        if (!botId || message.botId === botId) {
          setPosition(message.position);
        }
        break;

      case 'bot:trade':
        if (!botId || message.botId === botId) {
          setTrades(prev => [{
            ...message.trade,
            timestamp: message.timestamp,
          }, ...prev].slice(0, 50));
        }
        break;

      case 'bot:status':
        if (!botId || message.botId === botId) {
          setBotStatus(message.status);
        }
        break;

      case 'connected':
        console.log('[useMarketData] Server acknowledged connection');
        break;

      case 'subscribed':
        console.log('[useMarketData] Subscribed to:', message.key);
        break;

      case 'error':
        console.error('[useMarketData] Server error:', message.message);
        break;
    }
  }, [symbol, timeframe, botId]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Change subscription
  const changeSubscription = useCallback((newSymbol: string, newTimeframe: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Unsubscribe from old
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'candles',
        symbol,
        timeframe,
      }));

      // Subscribe to new
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        channel: 'candles',
        symbol: newSymbol,
        timeframe: newTimeframe,
      }));
    }
  }, [symbol, timeframe]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      fetchInitialCandles();
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, fetchInitialCandles, connect, disconnect]);

  // Refetch when symbol/timeframe changes
  useEffect(() => {
    fetchInitialCandles();
    changeSubscription(symbol, timeframe);
  }, [symbol, timeframe, fetchInitialCandles, changeSubscription]);

  return {
    // Connection
    status,
    connect,
    disconnect,

    // Market data
    candles,
    currentCandle,
    ticker,

    // Bot data
    decision,
    position,
    trades,
    botStatus,

    // Actions
    refetch: fetchInitialCandles,
    changeSubscription,
  };
}

export default useMarketData;
