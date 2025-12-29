'use client';

/**
 * Trade Notifications Hook
 * 
 * Plays sound and shows notification when a trade is executed
 */

import { useEffect, useRef, useCallback } from 'react';

const NOTIFICATION_SOUND_URL = '/sounds/trade-notification.mp3';
const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface Trade {
  id: string;
  side: 'buy' | 'sell';
  symbol: string;
  price: number;
  quantity: number;
  timestamp: number;
}

interface UseTradeNotificationsOptions {
  enabled?: boolean;
  onTrade?: (trade: Trade) => void;
}

export function useTradeNotifications(options: UseTradeNotificationsOptions = {}) {
  const { enabled = true, onTrade } = options;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTradeIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
      audioRef.current.volume = 0.5;
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Play notification sound
  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log('Could not play notification sound:', err);
      });
    }
  }, []);

  // Show browser notification
  const showNotification = useCallback((trade: Trade) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const side = trade.side === 'buy' ? '🟢 LONG' : '🔴 SHORT';
      new Notification(`Trade Executed: ${side}`, {
        body: `${trade.symbol} @ $${trade.price.toLocaleString()}\nSize: ${trade.quantity.toFixed(6)}`,
        icon: '/favicon.ico',
        tag: trade.id,
      });
    }
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  // Poll for new trades
  useEffect(() => {
    if (!enabled) return;

    // Request notification permission on mount
    requestPermission();

    const checkForNewTrades = async () => {
      try {
        const res = await fetch(`${API_URL}/trading/trade-history?limit=1`);
        if (!res.ok) return;
        
        const data = await res.json();
        const trades = data.trades || [];
        
        if (trades.length > 0) {
          const latestTrade = trades[0];
          
          // Check if this is a new trade
          if (lastTradeIdRef.current !== null && latestTrade.id !== lastTradeIdRef.current) {
            // New trade detected!
            console.log('[Notifications] 🔔 New trade detected:', latestTrade.id);
            
            playSound();
            showNotification(latestTrade);
            
            if (onTrade) {
              onTrade(latestTrade);
            }
          }
          
          lastTradeIdRef.current = latestTrade.id;
        }
      } catch (err) {
        // Silently fail
      }
    };

    // Initial check
    checkForNewTrades();

    // Poll every 5 seconds
    pollIntervalRef.current = setInterval(checkForNewTrades, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [enabled, playSound, showNotification, onTrade, requestPermission]);

  return {
    playSound,
    requestPermission,
  };
}

export default useTradeNotifications;
