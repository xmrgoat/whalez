'use client';

/**
 * AI Panel - Shows Grok's reasoning, suggestions, and insights
 * 
 * Features:
 * - Real-time reasoning display
 * - Suggestions with apply/reject
 * - Learning insights
 * - Rule configuration
 */

import { useState, useEffect } from 'react';
import { 
  Brain, 
  Lightbulb, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Shield,
  Settings,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface Suggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  reasoning: string;
  impact: string;
  confidence: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  parameters?: Record<string, any>;
  sources: any[];
  createdAt: string;
}

interface Insight {
  id: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  dataPoints: number;
  createdAt: string;
}

interface AIRule {
  id: string;
  category: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  priority: number;
}

interface Analysis {
  id: string;
  action: string;
  confidence: number;
  reasoning: string;
  price: number;
  timestamp: number;
  sources: any[];
  warnings: string[];
}

interface AIPanelProps {
  botId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function AIPanel({ botId, isOpen, onClose }: AIPanelProps) {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'insights' | 'rules' | 'reasoning'>('reasoning');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [rules, setRules] = useState<AIRule[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && botId) {
      fetchData();
    }
  }, [isOpen, botId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch suggestions
      const sugRes = await fetch(`${API_URL}/api/ai/suggestions?botId=${botId}&status=PENDING`);
      if (sugRes.ok) {
        const data = await sugRes.json();
        setSuggestions(data.suggestions || []);
      }

      // Fetch insights
      const insRes = await fetch(`${API_URL}/api/ai/insights?botId=${botId}`);
      if (insRes.ok) {
        const data = await insRes.json();
        setInsights(data.insights || []);
      }

      // Fetch rules
      const rulesRes = await fetch(`${API_URL}/api/ai/rules?botId=${botId}`);
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules || []);
      }

      // Fetch analysis history
      const analysisRes = await fetch(`${API_URL}/trading/analysis-history?limit=20`);
      if (analysisRes.ok) {
        const data = await analysisRes.json();
        setAnalyses(data.analyses || []);
      }
    } catch (err) {
      console.error('Failed to fetch AI data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh analyses every 30 seconds when panel is open
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/trading/analysis-history?limit=20`);
        if (res.ok) {
          const data = await res.json();
          setAnalyses(data.analyses || []);
        }
      } catch (err) {
        // Silently fail
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const applySuggestion = async (id: string) => {
    setApplyingId(id);
    try {
      const res = await fetch(`${API_URL}/api/ai/suggestions/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error('Failed to apply suggestion:', err);
    } finally {
      setApplyingId(null);
    }
  };

  const rejectSuggestion = async (id: string, feedback?: string) => {
    try {
      const res = await fetch(`${API_URL}/api/ai/suggestions/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error('Failed to reject suggestion:', err);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'text-danger bg-danger/20';
      case 'HIGH': return 'text-warning bg-warning/20';
      case 'MEDIUM': return 'text-success bg-success/20';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'PATTERN_DETECTED': return <Sparkles className="w-4 h-4" />;
      case 'PARAMETER_SUGGESTION': return <Settings className="w-4 h-4" />;
      case 'RISK_WARNING': return <AlertTriangle className="w-4 h-4" />;
      case 'PERFORMANCE_TREND': return <TrendingUp className="w-4 h-4" />;
      default: return <Lightbulb className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Panel */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-display text-lg">AI Assistant</h2>
              <p className="text-xs text-muted-foreground">Powered by Grok • Real-time analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {[
            { id: 'reasoning', label: 'Reasoning', count: analyses.length },
            { id: 'suggestions', label: 'Suggestions', count: suggestions.length },
            { id: 'insights', label: 'Insights', count: insights.length },
            { id: 'rules', label: 'Rules', count: rules.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-success text-success'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-muted">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Suggestions Tab */}
              {activeTab === 'suggestions' && (
                <div className="space-y-4">
                  {suggestions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No pending suggestions</p>
                      <p className="text-sm">Grok will analyze your trades and provide recommendations</p>
                    </div>
                  ) : (
                    suggestions.map(suggestion => (
                      <div key={suggestion.id} className="border border-border rounded-xl overflow-hidden">
                        {/* Suggestion Header */}
                        <div 
                          className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setExpandedSuggestion(
                            expandedSuggestion === suggestion.id ? null : suggestion.id
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              {expandedSuggestion === suggestion.id ? (
                                <ChevronDown className="w-5 h-5 mt-0.5 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-5 h-5 mt-0.5 text-muted-foreground" />
                              )}
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium">{suggestion.title}</h3>
                                  <span className={`badge ${getPriorityColor(suggestion.priority)}`}>
                                    {suggestion.priority}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {suggestion.description}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {suggestion.confidence}% confident
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {expandedSuggestion === suggestion.id && (
                          <div className="px-4 pb-4 border-t border-border pt-4 bg-muted/20">
                            {/* Reasoning */}
                            <div className="mb-4">
                              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                <Brain className="w-4 h-4" />
                                Reasoning
                              </h4>
                              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                                {suggestion.reasoning}
                              </p>
                            </div>

                            {/* Expected Impact */}
                            <div className="mb-4">
                              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Expected Impact
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {suggestion.impact}
                              </p>
                            </div>

                            {/* Parameters */}
                            {suggestion.parameters && Object.keys(suggestion.parameters).length > 0 && (
                              <div className="mb-4">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <Settings className="w-4 h-4" />
                                  Proposed Changes
                                </h4>
                                <div className="grid grid-cols-2 gap-2">
                                  {Object.entries(suggestion.parameters).map(([key, value]) => (
                                    <div key={key} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                                      <span className="text-sm font-mono">{key}</span>
                                      <span className="text-sm font-mono text-success">{String(value)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sources */}
                            {suggestion.sources && suggestion.sources.length > 0 && (
                              <div className="mb-4">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <ExternalLink className="w-4 h-4" />
                                  Data Sources
                                </h4>
                                <div className="space-y-1">
                                  {suggestion.sources.slice(0, 3).map((source: any, i: number) => (
                                    <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                      {source.url ? (
                                        <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                                          {source.author || source.url}
                                        </a>
                                      ) : (
                                        <span>{source.text || source}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-3 pt-2">
                              <button
                                onClick={() => applySuggestion(suggestion.id)}
                                disabled={applyingId === suggestion.id}
                                className="btn btn-primary flex items-center gap-2"
                              >
                                {applyingId === suggestion.id ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4" />
                                )}
                                Apply Suggestion
                              </button>
                              <button
                                onClick={() => rejectSuggestion(suggestion.id)}
                                className="btn btn-ghost flex items-center gap-2"
                              >
                                <XCircle className="w-4 h-4" />
                                Dismiss
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Insights Tab */}
              {activeTab === 'insights' && (
                <div className="space-y-3">
                  {insights.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No insights yet</p>
                      <p className="text-sm">Grok learns from your trading history</p>
                    </div>
                  ) : (
                    insights.map(insight => (
                      <div key={insight.id} className="p-4 border border-border rounded-xl">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                            {getInsightIcon(insight.type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium">{insight.title}</h3>
                              <span className="text-xs text-muted-foreground">
                                {insight.confidence}% • {insight.dataPoints} data points
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {insight.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Rules Tab */}
              {activeTab === 'rules' && (
                <div className="space-y-3">
                  {rules.map(rule => (
                    <div 
                      key={rule.id} 
                      className={`p-4 border rounded-xl ${
                        rule.isSystem ? 'border-border bg-muted/20' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{rule.name}</h3>
                            {rule.isSystem && (
                              <span className="badge badge-neutral">System</span>
                            )}
                            <span className="badge bg-muted text-muted-foreground">
                              {rule.category.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {rule.description}
                          </p>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${rule.isActive ? 'bg-success' : 'bg-muted'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reasoning Tab - Live Analysis History */}
              {activeTab === 'reasoning' && (
                <div className="space-y-4">
                  {/* Live Analysis Feed */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-400" />
                      Live Analysis Feed
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {analyses.length} analyses • Auto-refresh 30s
                    </span>
                  </div>

                  {analyses.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No analyses yet</p>
                      <p className="text-sm">Start the bot to see Grok's reasoning in real-time</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analyses.map((analysis, index) => (
                        <div 
                          key={analysis.id} 
                          className={`border rounded-xl overflow-hidden ${
                            index === 0 ? 'border-purple-500/50 bg-purple-500/5' : 'border-border'
                          }`}
                        >
                          {/* Analysis Header */}
                          <div 
                            className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedAnalysis(
                              expandedAnalysis === analysis.id ? null : analysis.id
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                {expandedAnalysis === analysis.id ? (
                                  <ChevronDown className="w-5 h-5 mt-0.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-5 h-5 mt-0.5 text-muted-foreground" />
                                )}
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                      analysis.action === 'LONG' ? 'bg-green-500/20 text-green-400' :
                                      analysis.action === 'SHORT' ? 'bg-red-500/20 text-red-400' :
                                      'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                      {analysis.action}
                                    </span>
                                    <span className="text-sm font-mono text-muted-foreground">
                                      ${analysis.price.toLocaleString()}
                                    </span>
                                    {index === 0 && (
                                      <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 animate-pulse">
                                        LATEST
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                    {analysis.reasoning.substring(0, 120)}...
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold">
                                  {analysis.confidence}%
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(analysis.timestamp).toLocaleTimeString()}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content */}
                          {expandedAnalysis === analysis.id && (
                            <div className="px-4 pb-4 border-t border-border pt-4 bg-muted/20">
                              {/* Full Reasoning */}
                              <div className="mb-4">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <Brain className="w-4 h-4 text-purple-400" />
                                  Full Reasoning
                                </h4>
                                <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg whitespace-pre-wrap">
                                  {analysis.reasoning}
                                </p>
                              </div>

                              {/* Confidence Breakdown */}
                              <div className="mb-4">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4" />
                                  Confidence: {analysis.confidence}%
                                </h4>
                                <div className="w-full bg-muted rounded-full h-2">
                                  <div 
                                    className={`h-2 rounded-full ${
                                      analysis.confidence >= 70 ? 'bg-green-500' :
                                      analysis.confidence >= 50 ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${analysis.confidence}%` }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {analysis.confidence >= 70 ? 'High confidence - Trade eligible' :
                                   analysis.confidence >= 50 ? 'Medium confidence - Monitoring' :
                                   'Low confidence - Holding'}
                                </p>
                              </div>

                              {/* Warnings */}
                              {analysis.warnings && analysis.warnings.length > 0 && (
                                <div className="mb-4">
                                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-warning">
                                    <AlertTriangle className="w-4 h-4" />
                                    Warnings
                                  </h4>
                                  <ul className="text-sm text-muted-foreground space-y-1">
                                    {analysis.warnings.map((warning, i) => (
                                      <li key={i} className="flex items-start gap-2">
                                        <span className="text-warning">•</span>
                                        {warning}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Sources */}
                              {analysis.sources && analysis.sources.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <ExternalLink className="w-4 h-4" />
                                    Data Sources ({analysis.sources.length})
                                  </h4>
                                  <div className="space-y-1">
                                    {analysis.sources.slice(0, 5).map((source: any, i: number) => (
                                      <div key={i} className="text-xs text-muted-foreground flex items-center gap-2 p-2 bg-muted rounded">
                                        <span className={`w-2 h-2 rounded-full ${
                                          source.type === 'indicator' ? 'bg-blue-400' :
                                          source.type === 'x_post' ? 'bg-purple-400' :
                                          'bg-gray-400'
                                        }`} />
                                        <span className="font-mono">{source.type}</span>
                                        <span className="flex-1 truncate">{source.content}</span>
                                        {source.relevance && (
                                          <span className="text-muted-foreground">{source.relevance}%</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* How Grok Works - Collapsed by default */}
                  <details className="border border-border rounded-xl overflow-hidden">
                    <summary className="p-4 cursor-pointer hover:bg-muted/30 transition-colors font-medium flex items-center gap-2">
                      <Shield className="w-5 h-5 text-warning" />
                      How Grok Makes Decisions & Safety Rules
                    </summary>
                    <div className="px-4 pb-4 border-t border-border pt-4 bg-muted/20">
                      <div className="space-y-3 text-sm text-muted-foreground">
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold">1</span>
                          <div>
                            <p className="font-medium text-foreground">Data Collection</p>
                            <p>Fetches real-time price, indicators, and sentiment. Never uses assumptions.</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold">2</span>
                          <div>
                            <p className="font-medium text-foreground">Analysis</p>
                            <p>Requires minimum 3 confirmations before recommending a trade.</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold">3</span>
                          <div>
                            <p className="font-medium text-foreground">Execution</p>
                            <p>Only executes trades with ≥70% confidence. Uses 2% position size.</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 p-3 border border-warning/50 rounded-lg bg-warning/10">
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• Max leverage: 5x</li>
                          <li>• Max drawdown: 10%</li>
                          <li>• Position size: 2% of account</li>
                          <li>• All trades have SL/TP</li>
                        </ul>
                      </div>
                    </div>
                  </details>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
