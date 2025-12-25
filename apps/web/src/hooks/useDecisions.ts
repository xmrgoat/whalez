'use client';

/**
 * useDecisions Hook
 * 
 * Manages decision data fetching and real-time updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface DecisionSummary {
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: Date | string;
  action: 'LONG' | 'SHORT' | 'HOLD' | 'NO_TRADE' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  confidenceScore: number;
  blockedReason?: string | null;
  executed: boolean;
  breakdown?: {
    dataQuality: number;
    signalAgreement: number;
    riskFit: number;
    regimeMatch: number;
    newsBonus: number;
  } | null;
}

export interface DecisionDetail extends DecisionSummary {
  tradeId?: string | null;
  critiqueId?: string | null;
  createdAt: Date | string;
  evidence?: Array<{
    id: string;
    type: 'INDICATOR' | 'GROK' | 'RISK' | 'DATA' | 'REGIME';
    label: string;
    value: string;
    status: 'PASS' | 'FAIL' | 'UNKNOWN';
    weight: number;
    sourceUrl?: string | null;
  }>;
  markers?: Array<{
    id: string;
    kind: string;
    price: number;
    side?: string | null;
    label?: string | null;
  }>;
}

interface UseDecisionsOptions {
  symbol?: string;
  timeframe?: string;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

export function useDecisions(options: UseDecisionsOptions = {}) {
  const {
    symbol,
    timeframe,
    limit = 50,
    autoRefresh = true,
    refreshInterval = 10000,
  } = options;

  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDecisions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (symbol) params.set('symbol', symbol);
      if (timeframe) params.set('timeframe', timeframe);
      params.set('limit', limit.toString());

      const response = await fetch(`${API_URL}/api/decisions?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setDecisions(data.decisions || []);
      setError(null);
    } catch (err) {
      console.error('[useDecisions] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch decisions');
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, limit]);

  // Initial fetch
  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    intervalRef.current = setInterval(fetchDecisions, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, fetchDecisions]);

  // Add new decision (for real-time updates)
  const addDecision = useCallback((decision: DecisionSummary) => {
    setDecisions(prev => [decision, ...prev].slice(0, limit));
  }, [limit]);

  return {
    decisions,
    loading,
    error,
    refresh: fetchDecisions,
    addDecision,
  };
}

/**
 * Fetch single decision detail
 */
export async function fetchDecisionDetail(id: string): Promise<DecisionDetail | null> {
  try {
    const response = await fetch(`${API_URL}/api/decisions/${id}`);
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error('[fetchDecisionDetail] Error:', err);
    return null;
  }
}

/**
 * Fetch decision by candle timestamp
 */
export async function fetchDecisionByTimestamp(
  symbol: string,
  timeframe: string,
  timestamp: number
): Promise<DecisionDetail | null> {
  try {
    const params = new URLSearchParams({
      symbol,
      timeframe,
      timestamp: timestamp.toString(),
    });

    const response = await fetch(`${API_URL}/api/decisions/by-timestamp?${params}`);
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error('[fetchDecisionByTimestamp] Error:', err);
    return null;
  }
}

/**
 * Fetch chart markers for a symbol/timeframe
 */
export async function fetchMarkers(
  symbol: string,
  timeframe: string,
  from?: number,
  to?: number
): Promise<Array<{
  id: string;
  timestamp: Date;
  price: number;
  kind: string;
  side?: string;
  decisionId?: string;
}>> {
  try {
    const params = new URLSearchParams({ symbol, timeframe });
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());

    const response = await fetch(`${API_URL}/api/decisions/markers?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.markers || [];
  } catch (err) {
    console.error('[fetchMarkers] Error:', err);
    return [];
  }
}
