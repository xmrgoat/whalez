'use client';

/**
 * AI Thinking Panel
 * 
 * Displays real-time AI thinking process with streaming logs
 * Shows each step of analysis: data collection, indicators, sentiment, etc.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Activity,
  TrendingUp,
  MessageSquare,
  Newspaper,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
  Maximize2,
  Minimize2,
  RefreshCw
} from 'lucide-react';

export type AIStepType =
  | 'DATA_COLLECTION'
  | 'INDICATOR_ANALYSIS'
  | 'SENTIMENT_ANALYSIS'
  | 'NEWS_ANALYSIS'
  | 'CONFIRMATION_CHECK'
  | 'RISK_ASSESSMENT'
  | 'DECISION_MAKING'
  | 'REASONING';

export type AIStepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'FAILED';

export interface ThinkingStep {
  id: string;
  stepNumber: number;
  stepType: AIStepType;
  title: string;
  content: string;
  data?: Record<string, any>;
  status: AIStepStatus;
  durationMs?: number;
  createdAt: Date;
}

export interface ThinkingSession {
  id: string;
  symbol: string;
  timeframe: string;
  sessionType: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  startedAt: Date;
  completedAt?: Date;
  totalDurationMs?: number;
  finalAction?: string;
  finalConfidence?: number;
  steps: ThinkingStep[];
}

const STEP_ICONS: Record<AIStepType, React.ElementType> = {
  DATA_COLLECTION: Activity,
  INDICATOR_ANALYSIS: TrendingUp,
  SENTIMENT_ANALYSIS: MessageSquare,
  NEWS_ANALYSIS: Newspaper,
  CONFIRMATION_CHECK: CheckCircle2,
  RISK_ASSESSMENT: AlertTriangle,
  DECISION_MAKING: Brain,
  REASONING: Brain,
};

const STEP_COLORS: Record<AIStepType, string> = {
  DATA_COLLECTION: 'text-blue-400',
  INDICATOR_ANALYSIS: 'text-purple-400',
  SENTIMENT_ANALYSIS: 'text-green-400',
  NEWS_ANALYSIS: 'text-yellow-400',
  CONFIRMATION_CHECK: 'text-cyan-400',
  RISK_ASSESSMENT: 'text-orange-400',
  DECISION_MAKING: 'text-pink-400',
  REASONING: 'text-gray-400',
};

interface AIThinkingPanelProps {
  symbol: string;
  timeframe: string;
  isVisible: boolean;
  onClose: () => void;
  onRequestAnalysis?: () => void;
}

export default function AIThinkingPanel({
  symbol,
  timeframe,
  isVisible,
  onClose,
  onRequestAnalysis,
}: AIThinkingPanelProps) {
  const [sessions, setSessions] = useState<ThinkingSession[]>([]);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    if (!isVisible) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const wsUrl = apiUrl.replace('http', 'ws') + '/ws';

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        // Subscribe to AI thinking events
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'ai:thinking' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ai:thinking') {
            handleThinkingEvent(data.payload);
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      return () => {
        ws.close();
      };
    } catch (e) {
      console.error('Failed to connect to WebSocket:', e);
    }
  }, [isVisible]);

  // Handle incoming thinking events
  const handleThinkingEvent = (event: any) => {
    switch (event.type) {
      case 'session_start':
        setSessions(prev => [event.session, ...prev].slice(0, 10));
        break;

      case 'step_start':
      case 'step_update':
      case 'step_complete':
        setSessions(prev => prev.map(session => {
          if (session.id === event.sessionId) {
            const stepIndex = session.steps.findIndex(s => s.id === event.step.id);
            if (stepIndex >= 0) {
              const newSteps = [...session.steps];
              newSteps[stepIndex] = event.step;
              return { ...session, steps: newSteps };
            } else {
              return { ...session, steps: [...session.steps, event.step] };
            }
          }
          return session;
        }));
        // Auto-scroll to bottom
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        break;

      case 'session_complete':
        setSessions(prev => prev.map(session => 
          session.id === event.sessionId ? event.session : session
        ));
        break;

      case 'error':
        setSessions(prev => prev.map(session => 
          session.id === event.sessionId 
            ? { ...session, status: 'FAILED' as const }
            : session
        ));
        break;
    }
  };

  // Toggle step expansion
  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  // Demo: Add mock session for testing
  const addMockSession = () => {
    const mockSession: ThinkingSession = {
      id: `mock-${Date.now()}`,
      symbol,
      timeframe,
      sessionType: 'MARKET_ANALYSIS',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      steps: [],
    };

    setSessions(prev => [mockSession, ...prev]);

    // Simulate steps
    const steps: Partial<ThinkingStep>[] = [
      { stepType: 'DATA_COLLECTION', title: 'Collecting Market Data', content: `Fetching price data for ${symbol}...\nCurrent price: $87,341.00\n24h change: +0.85%` },
      { stepType: 'INDICATOR_ANALYSIS', title: 'Analyzing Indicators', content: 'MA(5,10,30,60): Bullish crossover detected\nRSI(14): 58.3 - Neutral zone\nMACD: Positive histogram' },
      { stepType: 'SENTIMENT_ANALYSIS', title: 'Checking X/Twitter Sentiment', content: 'Scanning recent posts about BTC...\n@whale_alert: Large BTC transfer detected\nOverall sentiment: Slightly bullish (62%)' },
      { stepType: 'CONFIRMATION_CHECK', title: 'Checking Confirmations', content: '✓ Price above EMA20\n✓ Price above EMA50\n✓ RSI not overbought\n✓ Volume above average\n4/4 confirmations passed' },
      { stepType: 'DECISION_MAKING', title: 'Making Decision', content: 'Based on 4 confirmations and bullish sentiment...\nRecommendation: HOLD with bullish bias\nConfidence: 72%' },
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex >= steps.length) {
        clearInterval(interval);
        setSessions(prev => prev.map(s => 
          s.id === mockSession.id 
            ? { ...s, status: 'COMPLETED', finalAction: 'HOLD', finalConfidence: 72, completedAt: new Date() }
            : s
        ));
        return;
      }

      const step: ThinkingStep = {
        id: `step-${Date.now()}`,
        stepNumber: stepIndex + 1,
        stepType: steps[stepIndex].stepType!,
        title: steps[stepIndex].title!,
        content: steps[stepIndex].content!,
        status: 'COMPLETED',
        durationMs: Math.random() * 1000 + 500,
        createdAt: new Date(),
      };

      setSessions(prev => prev.map(s => 
        s.id === mockSession.id 
          ? { ...s, steps: [...s.steps, step] }
          : s
      ));

      stepIndex++;
    }, 1500);
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed ${isExpanded ? 'inset-4' : 'bottom-4 right-4 w-96 h-[500px]'} z-40 bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl shadow-2xl flex flex-col transition-all duration-200`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-400" />
          <span className="font-semibold text-white">AI Thinking</span>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={addMockSession}
            className="p-1.5 hover:bg-[#2a2a2a] rounded text-gray-400 hover:text-white"
            title="Test Analysis"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-[#2a2a2a] rounded text-gray-400 hover:text-white"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#2a2a2a] rounded text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Brain className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm">No analysis sessions yet</p>
            <p className="text-xs mt-1">AI thinking will appear here in real-time</p>
            <button
              onClick={addMockSession}
              className="mt-4 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
            >
              Run Test Analysis
            </button>
          </div>
        ) : (
          sessions.map(session => (
            <div key={session.id} className="bg-[#1a1a1a] rounded-lg overflow-hidden">
              {/* Session Header */}
              <div className="px-3 py-2 border-b border-[#2a2a2a] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{session.symbol}</span>
                  <span className="text-xs text-gray-500">{session.timeframe}</span>
                  {session.status === 'IN_PROGRESS' && (
                    <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {session.finalAction && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      session.finalAction === 'LONG' ? 'bg-green-500/20 text-green-400' :
                      session.finalAction === 'SHORT' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {session.finalAction}
                    </span>
                  )}
                  {session.finalConfidence && (
                    <span className="text-xs text-gray-400">{session.finalConfidence}%</span>
                  )}
                </div>
              </div>

              {/* Steps */}
              <div className="divide-y divide-[#2a2a2a]">
                {session.steps.map(step => {
                  const Icon = STEP_ICONS[step.stepType] || Brain;
                  const colorClass = STEP_COLORS[step.stepType] || 'text-gray-400';
                  const isStepExpanded = expandedSteps.has(step.id);

                  return (
                    <div key={step.id} className="px-3 py-2">
                      <button
                        onClick={() => toggleStep(step.id)}
                        className="w-full flex items-center gap-2 text-left"
                      >
                        {isStepExpanded ? (
                          <ChevronDown className="w-3 h-3 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-gray-500" />
                        )}
                        <Icon className={`w-4 h-4 ${colorClass}`} />
                        <span className="text-sm text-gray-300 flex-1">{step.title}</span>
                        {step.status === 'IN_PROGRESS' && (
                          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                        )}
                        {step.status === 'COMPLETED' && (
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                        )}
                        {step.durationMs && (
                          <span className="text-xs text-gray-500">{(step.durationMs / 1000).toFixed(1)}s</span>
                        )}
                      </button>
                      {isStepExpanded && (
                        <div className="mt-2 ml-7 text-xs text-gray-400 whitespace-pre-wrap font-mono bg-[#0a0a0a] p-2 rounded">
                          {step.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Session Footer */}
              {session.status === 'COMPLETED' && session.totalDurationMs && (
                <div className="px-3 py-2 border-t border-[#2a2a2a] flex items-center gap-2 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>Completed in {(session.totalDurationMs / 1000).toFixed(1)}s</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
