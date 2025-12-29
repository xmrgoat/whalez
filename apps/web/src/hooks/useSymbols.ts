/**
 * useSymbols Hook
 * 
 * Fetches available trading symbols dynamically from Hyperliquid via the backend API.
 * Symbols are cached and refreshed periodically.
 */

import { useState, useEffect } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

// Cache symbols in memory to avoid refetching on every component mount
let cachedSymbols: string[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Default fallback symbols if API fails
const FALLBACK_SYMBOLS = [
  'BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'XRP-PERP', 'BNB-PERP', 'DOGE-PERP',
  'ADA-PERP', 'AVAX-PERP', 'DOT-PERP', 'LINK-PERP', 'LTC-PERP', 'ATOM-PERP',
];

export function useSymbols() {
  const [symbols, setSymbols] = useState<string[]>(cachedSymbols.length > 0 ? cachedSymbols : FALLBACK_SYMBOLS);
  const [loading, setLoading] = useState(cachedSymbols.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSymbols = async () => {
      // Use cache if still valid
      if (cachedSymbols.length > 0 && Date.now() - lastFetchTime < CACHE_DURATION) {
        setSymbols(cachedSymbols);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/api/market/symbols`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch symbols');
        }
        
        const data = await response.json();
        
        if (data.symbols && Array.isArray(data.symbols) && data.symbols.length > 0) {
          // Sort alphabetically
          const sortedSymbols = data.symbols.sort();
          cachedSymbols = sortedSymbols;
          lastFetchTime = Date.now();
          setSymbols(sortedSymbols);
          setError(null);
        }
      } catch (err: any) {
        console.error('[useSymbols] Failed to fetch symbols:', err);
        setError(err.message);
        // Keep using fallback or cached symbols
        if (cachedSymbols.length === 0) {
          setSymbols(FALLBACK_SYMBOLS);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSymbols();
    
    // Refresh symbols every 5 minutes
    const interval = setInterval(fetchSymbols, CACHE_DURATION);
    return () => clearInterval(interval);
  }, []);

  // Force refresh function
  const refresh = async () => {
    lastFetchTime = 0; // Invalidate cache
    cachedSymbols = [];
    setLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/market/symbols`);
      if (response.ok) {
        const data = await response.json();
        if (data.symbols && Array.isArray(data.symbols)) {
          const sortedSymbols = data.symbols.sort();
          cachedSymbols = sortedSymbols;
          lastFetchTime = Date.now();
          setSymbols(sortedSymbols);
        }
      }
    } catch (err) {
      console.error('[useSymbols] Failed to refresh symbols:', err);
    } finally {
      setLoading(false);
    }
  };

  return { symbols, loading, error, refresh };
}

export default useSymbols;
