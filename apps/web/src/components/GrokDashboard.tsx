'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity,
  AlertTriangle,
  RefreshCw,
  Zap,
  Clock,
  BarChart3,
  Globe,
  Newspaper,
  Settings,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Minus
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface GrokDashboardData {
  status: {
    available: boolean;
    enabled: boolean;
    apiKeyConfigured: boolean;
  };
  usage: {
    callsToday: number;
    maxCalls: number;
    remaining: number;
    percentUsed: number;
  };
  costs: {
    today: number;
    total: number;
    avgPerCall: number;
    projectedDaily: number;
  };
  latestAnalysis: {
    timestamp: number;
    age: number;
    marketRegime: string;
    regimeConfidence: number;
    overallBias: string;
    biasStrength: number;
    symbols: string[];
    upcomingEvents: Array<{ name: string; date: string; impact: string; expectedEffect: string }>;
    recentNews: Array<{ headline: string; source: string; sentiment: string; relevance: number }>;
    warnings: string[];
    symbolAnalysis: Record<string, {
      sentiment: string;
      sentimentScore: number;
      keyFactors: string[];
      riskLevel: string;
      recommendation: string;
    }>;
  } | null;
  history: Array<{
    timestamp: number;
    regime: string;
    bias: string;
    strength: number;
  }>;
  config: {
    intervalMinutes: number;
    maxCallsPerDay: number;
    cacheValidityMinutes: number;
  };
}

interface GrokDashboardProps {
  tradingBag?: string[];
  onAnalysisUpdate?: (analysis: any) => void;
}

export default function GrokDashboard({ tradingBag = ['BTC-PERP'], onAnalysisUpdate }: GrokDashboardProps) {
  const [data, setData] = useState<GrokDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/grok/dashboard`);
      const json = await res.json();
      setData(json);
      setError(null);
      if (json.latestAnalysis && onAnalysisUpdate) {
        onAnalysisUpdate(json.latestAnalysis);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [onAnalysisUpdate]);

  const triggerAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch(`${API_URL}/api/grok/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbols: tradingBag,
          forceRefresh: true 
        }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchDashboard();
      } else {
        setError(json.error || 'Analysis failed');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <div className="p-6 rounded-xl bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/20 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-6 h-6 text-purple-400" />
          <span className="text-lg font-semibold">Grok AI Dashboard</span>
        </div>
        <div className="h-32 bg-white/5 rounded-lg"></div>
      </div>
    );
  }

  const getBiasColor = (bias: string) => {
    switch (bias) {
      case 'bullish': return 'text-green-400';
      case 'bearish': return 'text-red-400';
      default: return 'text-yellow-400';
    }
  };

  const getBiasIcon = (bias: string) => {
    switch (bias) {
      case 'bullish': return <TrendingUp className="w-5 h-5" />;
      case 'bearish': return <TrendingDown className="w-5 h-5" />;
      default: return <Minus className="w-5 h-5" />;
    }
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'risk_on': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'risk_off': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <CheckCircle className="w-3 h-3 text-green-400" />;
      case 'negative': return <XCircle className="w-3 h-3 text-red-400" />;
      default: return <Minus className="w-3 h-3 text-gray-400" />;
    }
  };

  const formatAge = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
            <Brain className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Grok AI Macro</h3>
            <p className="text-xs text-white/50">Real-time market intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white/70 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={fetchDashboard}
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white/70 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <div className={`w-2 h-2 rounded-full ${data?.status.available ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-sm text-white/70">
          {data?.status.available ? 'Grok Available' : 'Grok Unavailable'}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-white/50">Calls:</span>
            <span className="text-white/70">{data?.usage.callsToday}/{data?.usage.maxCalls}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-green-400" />
            <span className="text-white/50">Cost:</span>
            <span className="text-white/70">${data?.costs.today.toFixed(4)}</span>
          </div>
        </div>
      </div>

      {/* Usage Progress */}
      <div className="p-3 rounded-lg bg-white/5">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-white/50">Daily API Usage</span>
          <span className="text-white/70">{data?.usage.percentUsed.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 ${
              (data?.usage.percentUsed || 0) > 80 ? 'bg-red-500' : 
              (data?.usage.percentUsed || 0) > 50 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${data?.usage.percentUsed || 0}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/40 mt-1">
          <span>{data?.usage.remaining} calls remaining</span>
          <span>~${data?.costs.projectedDaily.toFixed(2)}/day projected</span>
        </div>
      </div>

      {/* Trigger Analysis Button */}
      <button
        onClick={triggerAnalysis}
        disabled={analyzing || !data?.status.available}
        className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
          data?.status.available 
            ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white'
            : 'bg-white/10 text-white/40 cursor-not-allowed'
        }`}
      >
        {analyzing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Analyzing {tradingBag.length} pairs...
          </>
        ) : (
          <>
            <Brain className="w-4 h-4" />
            Analyze Market ({tradingBag.join(', ')})
          </>
        )}
      </button>

      {/* Latest Analysis */}
      {data?.latestAnalysis ? (
        <div className="space-y-3">
          {/* Market Regime */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-white/70">Market Regime</span>
              </div>
              <span className="text-[10px] text-white/40">
                {formatAge(data.latestAnalysis.age)}
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${getRegimeColor(data.latestAnalysis.marketRegime)}`}>
                {data.latestAnalysis.marketRegime.replace('_', ' ').toUpperCase()}
              </span>
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1 ${getBiasColor(data.latestAnalysis.overallBias)}`}>
                  {getBiasIcon(data.latestAnalysis.overallBias)}
                  <span className="font-bold">{data.latestAnalysis.overallBias.toUpperCase()}</span>
                </span>
                <span className="text-white/50 text-sm">
                  ({data.latestAnalysis.biasStrength}% confidence)
                </span>
              </div>
            </div>
          </div>

          {/* Upcoming Events */}
          {data.latestAnalysis.upcomingEvents.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">Upcoming Events</span>
              </div>
              <div className="space-y-1">
                {data.latestAnalysis.upcomingEvents.map((event, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-white/70">{event.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        event.impact === 'high' ? 'bg-red-500/20 text-red-400' :
                        event.impact === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {event.impact}
                      </span>
                      <span className="text-white/40">{event.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent News */}
          {data.latestAnalysis.recentNews.length > 0 && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Newspaper className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-white/70">Recent News</span>
              </div>
              <div className="space-y-2">
                {data.latestAnalysis.recentNews.map((news, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {getSentimentIcon(news.sentiment)}
                    <div className="flex-1">
                      <p className="text-white/70">{news.headline}</p>
                      <p className="text-white/40">{news.source}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Symbol Analysis */}
          {Object.keys(data.latestAnalysis.symbolAnalysis).length > 0 && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-white/70">Symbol Analysis</span>
              </div>
              <div className="space-y-2">
                {Object.entries(data.latestAnalysis.symbolAnalysis).map(([symbol, analysis]) => (
                  <div key={symbol} className="rounded-lg bg-white/5 overflow-hidden">
                    <button
                      onClick={() => setExpandedSymbol(expandedSymbol === symbol ? null : symbol)}
                      className="w-full p-2 flex items-center justify-between hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-white">{symbol}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          analysis.sentiment === 'bullish' ? 'bg-green-500/20 text-green-400' :
                          analysis.sentiment === 'bearish' ? 'bg-red-500/20 text-red-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {analysis.sentiment}
                        </span>
                        <span className={`text-xs ${
                          analysis.sentimentScore > 0 ? 'text-green-400' : 
                          analysis.sentimentScore < 0 ? 'text-red-400' : 'text-gray-400'
                        }`}>
                          {analysis.sentimentScore > 0 ? '+' : ''}{analysis.sentimentScore}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          analysis.recommendation === 'buy' ? 'bg-green-500/20 text-green-400' :
                          analysis.recommendation === 'sell' ? 'bg-red-500/20 text-red-400' :
                          analysis.recommendation === 'avoid' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {analysis.recommendation.toUpperCase()}
                        </span>
                        {expandedSymbol === symbol ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>
                    {expandedSymbol === symbol && (
                      <div className="p-3 border-t border-white/10 text-xs space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white/40">Risk Level:</span>
                          <span className={`px-1.5 py-0.5 rounded ${
                            analysis.riskLevel === 'high' ? 'bg-red-500/20 text-red-400' :
                            analysis.riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-green-500/20 text-green-400'
                          }`}>
                            {analysis.riskLevel}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/40">Key Factors:</span>
                          <ul className="mt-1 space-y-1">
                            {analysis.keyFactors.map((factor, i) => (
                              <li key={i} className="text-white/60 pl-2 border-l border-white/20">
                                {factor}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {data.latestAnalysis.warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">Warnings</span>
              </div>
              <ul className="space-y-1">
                {data.latestAnalysis.warnings.map((warning, i) => (
                  <li key={i} className="text-xs text-red-300/70">• {warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 rounded-lg bg-white/5 border border-white/10 text-center">
          <Brain className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <p className="text-white/50">No analysis available</p>
          <p className="text-xs text-white/30 mt-1">Click "Analyze Market" to get started</p>
        </div>
      )}

      {/* Config Panel */}
      {showConfig && (
        <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
          <h4 className="text-sm font-medium text-white/70">Configuration</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-white/40">Analysis Interval</span>
              <p className="text-white/70">{data?.config.intervalMinutes} minutes</p>
            </div>
            <div>
              <span className="text-white/40">Max Calls/Day</span>
              <p className="text-white/70">{data?.config.maxCallsPerDay}</p>
            </div>
            <div>
              <span className="text-white/40">Cache Validity</span>
              <p className="text-white/70">{data?.config.cacheValidityMinutes} minutes</p>
            </div>
            <div>
              <span className="text-white/40">Avg Cost/Call</span>
              <p className="text-white/70">${data?.costs.avgPerCall.toFixed(4)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
