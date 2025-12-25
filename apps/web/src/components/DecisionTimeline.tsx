'use client';

/**
 * DecisionTimeline Component
 * 
 * Shows a scrollable list of bot decisions (latest first)
 * Click to open inspector for that decision
 */

import { ConfidenceMini } from './ConfidenceBadge';

export interface DecisionSummary {
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: Date | string;
  action: 'LONG' | 'SHORT' | 'HOLD' | 'NO_TRADE' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  confidenceScore: number;
  blockedReason?: string | null;
  executed: boolean;
}

interface DecisionTimelineProps {
  decisions: DecisionSummary[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}

const ACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  LONG: { bg: 'bg-black', text: 'text-white', label: 'LONG' },
  SHORT: { bg: 'bg-gray-600', text: 'text-white', label: 'SHORT' },
  HOLD: { bg: 'bg-gray-200', text: 'text-black', label: 'HOLD' },
  NO_TRADE: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'NO TRADE' },
  CLOSE_LONG: { bg: 'bg-gray-400', text: 'text-white', label: 'CLOSE L' },
  CLOSE_SHORT: { bg: 'bg-gray-400', text: 'text-white', label: 'CLOSE S' },
};

export default function DecisionTimeline({
  decisions,
  selectedId,
  onSelect,
  loading = false,
}: DecisionTimelineProps) {
  const formatTime = (ts: Date | string) => {
    const date = typeof ts === 'string' ? new Date(ts) : ts;
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (ts: Date | string) => {
    const date = typeof ts === 'string' ? new Date(ts) : ts;
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) return 'Today';
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
        Loading decisions...
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground">
        <span>No decisions yet</span>
        <span className="text-[10px] mt-1">Waiting for bot activity...</span>
      </div>
    );
  }

  // Group by date
  const grouped = decisions.reduce((acc, d) => {
    const dateKey = formatDate(d.timestamp);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(d);
    return acc;
  }, {} as Record<string, DecisionSummary[]>);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-xs font-bold">Decision Timeline</span>
        <span className="text-[10px] text-muted-foreground ml-2">
          {decisions.length} total
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([dateKey, items]) => (
          <div key={dateKey}>
            {/* Date header */}
            <div className="sticky top-0 bg-muted/80 backdrop-blur px-3 py-1 text-[10px] text-muted-foreground border-b border-border">
              {dateKey}
            </div>

            {/* Decision items */}
            {items.map((decision) => {
              const style = ACTION_STYLES[decision.action] || ACTION_STYLES.HOLD;
              const isSelected = selectedId === decision.id;

              return (
                <button
                  key={decision.id}
                  onClick={() => onSelect(decision.id)}
                  className={`w-full px-3 py-2 text-left border-b border-border hover:bg-muted/50 transition-colors ${
                    isSelected ? 'bg-muted' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Action badge */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>

                      {/* Symbol & timeframe */}
                      <span className="text-xs font-mono">
                        {decision.symbol}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {decision.timeframe}
                      </span>
                    </div>

                    {/* Time */}
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatTime(decision.timestamp)}
                    </span>
                  </div>

                  {/* Second row: confidence + status */}
                  <div className="flex items-center justify-between mt-1">
                    <ConfidenceMini score={decision.confidenceScore} />

                    <div className="flex items-center gap-2">
                      {decision.executed && (
                        <span className="text-[10px] text-green-600">✓ Executed</span>
                      )}
                      {decision.blockedReason && (
                        <span className="text-[10px] text-red-500 truncate max-w-[100px]" title={decision.blockedReason}>
                          ⚠ {decision.blockedReason.slice(0, 20)}...
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
