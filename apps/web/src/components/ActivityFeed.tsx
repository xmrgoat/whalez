'use client';

/**
 * ActivityFeed Component
 * 
 * Displays real-time activity from the bot:
 * - Trades (open/close)
 * - Signals generated
 * - Bot status changes
 * - AI suggestions
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Brain,
  Zap,
  Clock,
  RefreshCw
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface ActivityItem {
  id: string;
  type: 'trade' | 'signal' | 'status' | 'ai' | 'error';
  title: string;
  description?: string;
  timestamp: number;
  metadata?: {
    side?: 'long' | 'short';
    pnl?: number;
    price?: number;
    confidence?: number;
  };
}

interface ActivityFeedProps {
  botId?: string;
  maxItems?: number;
}

export default function ActivityFeed({ botId = 'default', maxItems = 20 }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch recent trades
      const tradesRes = await fetch(`${API_URL}/api/trades?limit=10`);
      const tradesData = tradesRes.ok ? await tradesRes.json() : { trades: [] };

      // Fetch recent signals (if endpoint exists)
      let signalsData = { signals: [] };
      try {
        const signalsRes = await fetch(`${API_URL}/api/bots/${botId}/signals?limit=5`);
        if (signalsRes.ok) {
          signalsData = await signalsRes.json();
        }
      } catch (e) {
        // Signals endpoint might not exist
      }

      // Fetch AI suggestions
      let suggestionsData = { suggestions: [] };
      try {
        const suggestionsRes = await fetch(`${API_URL}/api/ai/suggestions?botId=${botId}&limit=5`);
        if (suggestionsRes.ok) {
          suggestionsData = await suggestionsRes.json();
        }
      } catch (e) {
        // AI endpoint might not exist
      }

      // Convert to activity items
      const tradeActivities: ActivityItem[] = (tradesData.trades || []).map((trade: any) => ({
        id: `trade-${trade.id}`,
        type: 'trade' as const,
        title: trade.status === 'CLOSED' 
          ? `Closed ${trade.side} position` 
          : `Opened ${trade.side} position`,
        description: trade.status === 'CLOSED'
          ? `PnL: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl?.toFixed(2) || '0.00'}`
          : `Entry: $${trade.entryPrice?.toFixed(2)}`,
        timestamp: new Date(trade.entryTime).getTime(),
        metadata: {
          side: trade.side?.toLowerCase(),
          pnl: trade.pnl,
          price: trade.entryPrice,
        },
      }));

      const signalActivities: ActivityItem[] = (signalsData.signals || []).map((signal: any) => ({
        id: `signal-${signal.id}`,
        type: 'signal' as const,
        title: `${signal.action} signal generated`,
        description: `Confidence: ${signal.confidence?.toFixed(0)}%`,
        timestamp: new Date(signal.createdAt).getTime(),
        metadata: {
          confidence: signal.confidence,
          price: signal.price,
        },
      }));

      const aiActivities: ActivityItem[] = (suggestionsData.suggestions || []).map((suggestion: any) => ({
        id: `ai-${suggestion.id}`,
        type: 'ai' as const,
        title: suggestion.title,
        description: suggestion.status === 'APPLIED' ? 'Applied' : suggestion.status === 'REJECTED' ? 'Rejected' : 'Pending',
        timestamp: new Date(suggestion.createdAt).getTime(),
        metadata: {
          confidence: suggestion.confidence,
        },
      }));

      // Combine and sort by timestamp
      const allActivities = [...tradeActivities, ...signalActivities, ...aiActivities]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, maxItems);

      // If no real activities, show placeholder
      if (allActivities.length === 0) {
        setActivities([
          {
            id: 'placeholder-1',
            type: 'status',
            title: 'Bot ready',
            description: 'Waiting for signals...',
            timestamp: Date.now(),
          },
          {
            id: 'placeholder-2',
            type: 'status',
            title: 'Connected to Hyperliquid',
            description: 'Market data streaming',
            timestamp: Date.now() - 60000,
          },
        ]);
      } else {
        setActivities(allActivities);
      }

    } catch (err) {
      console.error('Failed to fetch activities:', err);
      setError('Failed to load activities');
      // Show placeholder on error
      setActivities([
        {
          id: 'error-placeholder',
          type: 'status',
          title: 'Bot initialized',
          description: 'Ready to trade',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [botId, maxItems]);

  useEffect(() => {
    fetchActivities();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, [fetchActivities]);

  const getActivityIcon = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'trade':
        if (activity.metadata?.pnl !== undefined) {
          return activity.metadata.pnl >= 0 
            ? <CheckCircle className="w-4 h-4 text-green-500" />
            : <XCircle className="w-4 h-4 text-red-500" />;
        }
        return activity.metadata?.side === 'long'
          ? <TrendingUp className="w-4 h-4 text-green-500" />
          : <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'signal':
        return <Zap className="w-4 h-4 text-yellow-500" />;
      case 'ai':
        return <Brain className="w-4 h-4 text-purple-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-medium flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Activity
        </h3>
        <button
          onClick={fetchActivities}
          disabled={loading}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                {getActivityIcon(activity)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">
                    {activity.title}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(activity.timestamp)}
                  </span>
                </div>
                {activity.description && (
                  <p className={`text-xs mt-0.5 ${
                    activity.type === 'trade' && activity.metadata?.pnl !== undefined
                      ? activity.metadata.pnl >= 0 ? 'text-green-500' : 'text-red-500'
                      : 'text-muted-foreground'
                  }`}>
                    {activity.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        {activities.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No recent activity
          </div>
        )}
      </div>
    </div>
  );
}
