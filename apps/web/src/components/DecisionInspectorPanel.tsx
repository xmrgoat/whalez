'use client';

/**
 * DecisionInspectorPanel Component
 * 
 * Right-side drawer showing full decision details:
 * - Header: action, score, timestamp
 * - WhyNow: summary of why this decision was made
 * - TradePlan: entry, stop, target if executed
 * - EvidenceTimeline: all checks with pass/fail/unknown
 * - Debug: collapsible JSON view
 */

import { useState } from 'react';
import ConfidenceBadge from './ConfidenceBadge';

export interface Evidence {
  id: string;
  type: 'INDICATOR' | 'GROK' | 'RISK' | 'DATA' | 'REGIME';
  label: string;
  value: string;
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  weight: number;
  sourceUrl?: string | null;
}

export interface DecisionBreakdown {
  dataQuality: number;
  signalAgreement: number;
  riskFit: number;
  regimeMatch: number;
  newsBonus: number;
}

export interface ChartMarker {
  id: string;
  kind: string;
  price: number;
  side?: string | null;
  label?: string | null;
}

export interface DecisionDetail {
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: Date | string;
  action: string;
  confidenceScore: number;
  blockedReason?: string | null;
  executed: boolean;
  tradeId?: string | null;
  createdAt: Date | string;
  breakdown?: DecisionBreakdown | null;
  evidence?: Evidence[];
  markers?: ChartMarker[];
}

interface DecisionInspectorPanelProps {
  decision: DecisionDetail | null;
  onClose: () => void;
  loading?: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  INDICATOR: '📊',
  GROK: '🔍',
  RISK: '⚠️',
  DATA: '📡',
  REGIME: '📈',
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  PASS: { bg: 'bg-green-100', text: 'text-green-700' },
  FAIL: { bg: 'bg-red-100', text: 'text-red-700' },
  UNKNOWN: { bg: 'bg-gray-100', text: 'text-gray-500' },
};

export default function DecisionInspectorPanel({
  decision,
  onClose,
  loading = false,
}: DecisionInspectorPanelProps) {
  const [showDebug, setShowDebug] = useState(false);

  if (loading) {
    return (
      <div className="w-80 border-l border-border bg-white h-full flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="w-80 border-l border-border bg-white h-full flex flex-col items-center justify-center p-4">
        <span className="text-xs text-muted-foreground text-center">
          Click a candle or select a decision from the timeline to inspect
        </span>
      </div>
    );
  }

  const formatTimestamp = (ts: Date | string) => {
    const date = typeof ts === 'string' ? new Date(ts) : ts;
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Group evidence by type
  const evidenceByType = (decision.evidence || []).reduce((acc, e) => {
    if (!acc[e.type]) acc[e.type] = [];
    acc[e.type].push(e);
    return acc;
  }, {} as Record<string, Evidence[]>);

  // Get action style
  const getActionStyle = (action: string) => {
    switch (action) {
      case 'LONG': return 'bg-black text-white';
      case 'SHORT': return 'bg-gray-600 text-white';
      case 'NO_TRADE': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-200 text-black';
    }
  };

  return (
    <div className="w-80 border-l border-border bg-white h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded font-mono font-bold ${getActionStyle(decision.action)}`}>
            {decision.action}
          </span>
          <span className="text-xs text-muted-foreground">
            {decision.symbol} • {decision.timeframe}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 hover:bg-muted rounded"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Score Section */}
        <div className="px-4 py-3 border-b border-border">
          <div className="text-[10px] text-muted-foreground mb-2">CONFIDENCE SCORE</div>
          <ConfidenceBadge 
            score={decision.confidenceScore} 
            breakdown={decision.breakdown || undefined}
            showBreakdown={true}
            size="lg"
          />
        </div>

        {/* Timestamp */}
        <div className="px-4 py-3 border-b border-border">
          <div className="text-[10px] text-muted-foreground mb-1">TIMESTAMP</div>
          <div className="text-xs font-mono">{formatTimestamp(decision.timestamp)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Created: {formatTimestamp(decision.createdAt)}
          </div>
        </div>

        {/* Blocked Reason */}
        {decision.blockedReason && (
          <div className="px-4 py-3 border-b border-border bg-red-50">
            <div className="text-[10px] text-red-600 mb-1">⚠️ BLOCKED</div>
            <div className="text-xs text-red-700">{decision.blockedReason}</div>
          </div>
        )}

        {/* Execution Status */}
        {decision.executed && (
          <div className="px-4 py-3 border-b border-border bg-green-50">
            <div className="text-[10px] text-green-600 mb-1">✓ EXECUTED</div>
            {decision.tradeId && (
              <div className="text-xs font-mono text-green-700">
                Trade ID: {decision.tradeId.slice(0, 8)}...
              </div>
            )}
          </div>
        )}

        {/* Trade Plan (from markers) */}
        {decision.markers && decision.markers.length > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <div className="text-[10px] text-muted-foreground mb-2">TRADE PLAN</div>
            <div className="flex flex-col gap-1">
              {decision.markers.map((marker) => (
                <div key={marker.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{marker.kind}</span>
                  <span className="font-mono">${marker.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evidence Timeline */}
        <div className="px-4 py-3 border-b border-border">
          <div className="text-[10px] text-muted-foreground mb-2">EVIDENCE</div>
          
          {Object.entries(evidenceByType).map(([type, items]) => (
            <div key={type} className="mb-3">
              <div className="text-[10px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
                <span>{TYPE_ICONS[type] || '•'}</span>
                <span>{type}</span>
              </div>
              
              <div className="flex flex-col gap-1 pl-4">
                {items.map((evidence) => {
                  const style = STATUS_STYLES[evidence.status];
                  return (
                    <div 
                      key={evidence.id} 
                      className={`flex items-center justify-between text-xs px-2 py-1 rounded ${style.bg}`}
                    >
                      <span className={style.text}>{evidence.label}</span>
                      <span className={`font-mono ${style.text}`}>{evidence.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {(!decision.evidence || decision.evidence.length === 0) && (
            <div className="text-xs text-muted-foreground">No evidence recorded</div>
          )}
        </div>

        {/* Debug JSON */}
        <div className="px-4 py-3">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-[10px] text-muted-foreground hover:text-black flex items-center gap-1"
          >
            <span>{showDebug ? '▼' : '▶'}</span>
            <span>Debug JSON</span>
          </button>
          
          {showDebug && (
            <pre className="mt-2 p-2 bg-muted rounded text-[9px] overflow-x-auto max-h-48 overflow-y-auto">
              {JSON.stringify(decision, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
