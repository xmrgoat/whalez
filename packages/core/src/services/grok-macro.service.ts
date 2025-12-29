/**
 * Grok Macro Service - Macroeconomic Analysis for Trading
 * 
 * Features:
 * - Periodic macro analysis (independent of technical signals)
 * - Multi-pair analysis from trading bag
 * - Cost tracking and optimization
 * - Graceful degradation (system works without Grok)
 * - Integration with backtest system
 */

import { EventEmitter } from 'eventemitter3';

const GROK_API_KEY = process.env['GROK_API_KEY'] || '';
const GROK_BASE_URL = process.env['GROK_BASE_URL'] || 'https://api.x.ai/v1';
const GROK_MODEL = process.env['GROK_MODEL'] || 'grok-3-latest';

// Cost per 1M tokens (approximate for Grok)
const COST_PER_1M_INPUT_TOKENS = 5.00;  // $5 per 1M input tokens
const COST_PER_1M_OUTPUT_TOKENS = 15.00; // $15 per 1M output tokens
const AVG_INPUT_TOKENS_PER_CALL = 1500;
const AVG_OUTPUT_TOKENS_PER_CALL = 800;

// ============================================================================
// TYPES
// ============================================================================

export interface GrokMacroAnalysis {
  timestamp: number;
  symbols: string[];
  
  // Market Regime
  marketRegime: 'risk_on' | 'risk_off' | 'neutral' | 'uncertain';
  regimeConfidence: number;
  
  // Macro Events
  upcomingEvents: MacroEvent[];
  recentNews: NewsItem[];
  
  // Per-Symbol Analysis
  symbolAnalysis: Record<string, SymbolMacroAnalysis>;
  
  // Overall Recommendation
  overallBias: 'bullish' | 'bearish' | 'neutral';
  biasStrength: number; // 0-100
  
  // Warnings
  warnings: string[];
  
  // Cost tracking
  tokensUsed: { input: number; output: number };
  estimatedCost: number;
}

export interface MacroEvent {
  name: string;
  date: string;
  impact: 'high' | 'medium' | 'low';
  expectedEffect: string;
}

export interface NewsItem {
  headline: string;
  source: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevance: number; // 0-100
  timestamp?: number;
}

export interface SymbolMacroAnalysis {
  symbol: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -100 to +100
  keyFactors: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendation: 'buy' | 'sell' | 'hold' | 'avoid';
}

export interface GrokCostStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedTotalCost: number;
  callsToday: number;
  costToday: number;
  avgCostPerCall: number;
  lastResetDate: string;
}

export interface GrokMacroConfig {
  enabled: boolean;
  intervalMinutes: number;      // How often to run macro analysis
  maxCallsPerDay: number;       // Hard limit
  minIntervalMs: number;        // Minimum time between calls
  analyzeAllPairs: boolean;     // Analyze all pairs in bag or just best one
  cacheValidityMs: number;      // How long to cache results
}

// ============================================================================
// GROK MACRO SERVICE
// ============================================================================

class GrokMacroService extends EventEmitter {
  private static instance: GrokMacroService;
  
  // State
  private config: GrokMacroConfig = {
    enabled: true,
    intervalMinutes: 30,        // Analyze every 30 minutes by default
    maxCallsPerDay: 48,         // 48 calls = every 30 min for 24h
    minIntervalMs: 15 * 60 * 1000, // 15 minutes minimum
    analyzeAllPairs: true,
    cacheValidityMs: 25 * 60 * 1000, // 25 minutes cache
  };
  
  // Cost tracking
  private costStats: GrokCostStats = {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedTotalCost: 0,
    callsToday: 0,
    costToday: 0,
    avgCostPerCall: 0,
    lastResetDate: new Date().toDateString(),
  };
  
  // Analysis cache
  private lastAnalysis: GrokMacroAnalysis | null = null;
  private lastAnalysisTime: number = 0;
  private analysisHistory: GrokMacroAnalysis[] = [];
  
  // Rate limiting
  private lastCallTime: number = 0;
  private consecutiveErrors: number = 0;
  private rateLimitUntil: number = 0;

  private constructor() {
    super();
  }

  static getInstance(): GrokMacroService {
    if (!GrokMacroService.instance) {
      GrokMacroService.instance = new GrokMacroService();
    }
    return GrokMacroService.instance;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Check if Grok is available and has credits
   */
  isAvailable(): boolean {
    if (!GROK_API_KEY) return false;
    if (!this.config.enabled) return false;
    if (Date.now() < this.rateLimitUntil) return false;
    return this.costStats.callsToday < this.config.maxCallsPerDay;
  }

  /**
   * Get remaining calls for today
   */
  getRemainingCalls(): number {
    this.resetDailyStatsIfNeeded();
    return Math.max(0, this.config.maxCallsPerDay - this.costStats.callsToday);
  }

  /**
   * Get cost statistics
   */
  getCostStats(): GrokCostStats {
    this.resetDailyStatsIfNeeded();
    return { ...this.costStats };
  }

  /**
   * Get cached analysis if still valid
   */
  getCachedAnalysis(): GrokMacroAnalysis | null {
    if (!this.lastAnalysis) return null;
    if (Date.now() - this.lastAnalysisTime > this.config.cacheValidityMs) return null;
    return this.lastAnalysis;
  }

  /**
   * Get analysis history
   */
  getAnalysisHistory(limit: number = 20): GrokMacroAnalysis[] {
    return this.analysisHistory.slice(-limit);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GrokMacroConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[GrokMacro] Config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): GrokMacroConfig {
    return { ...this.config };
  }

  /**
   * Main analysis function - analyzes macro conditions for trading bag
   * Returns cached result if still valid, otherwise fetches new analysis
   */
  async analyzeMacro(params: {
    symbols: string[];
    marketData?: Record<string, { price: number; change24h: number }>;
    forceRefresh?: boolean;
  }): Promise<GrokMacroAnalysis | null> {
    const { symbols, marketData, forceRefresh } = params;
    
    // Check cache first (unless forced refresh)
    if (!forceRefresh) {
      const cached = this.getCachedAnalysis();
      if (cached && this.arraysEqual(cached.symbols, symbols)) {
        console.log('[GrokMacro] 📦 Returning cached analysis');
        return cached;
      }
    }
    
    // Check if we can make a call
    if (!this.canMakeCall()) {
      console.log('[GrokMacro] ⚠️ Cannot make call - returning cached or null');
      return this.lastAnalysis;
    }
    
    // Make the API call
    try {
      const analysis = await this.fetchMacroAnalysis(symbols, marketData);
      
      if (analysis) {
        this.lastAnalysis = analysis;
        this.lastAnalysisTime = Date.now();
        this.analysisHistory.push(analysis);
        
        // Keep only last 100 analyses
        if (this.analysisHistory.length > 100) {
          this.analysisHistory = this.analysisHistory.slice(-100);
        }
        
        this.emit('analysis', analysis);
        console.log(`[GrokMacro] ✅ Analysis complete: ${analysis.marketRegime} regime, ${analysis.overallBias} bias`);
      }
      
      return analysis;
    } catch (error) {
      console.error('[GrokMacro] ❌ Analysis failed:', error);
      this.consecutiveErrors++;
      return this.lastAnalysis; // Return cached on error
    }
  }

  /**
   * Quick sentiment check for a single symbol (cheaper, faster)
   */
  async getQuickSentiment(symbol: string): Promise<{
    sentiment: 'bullish' | 'bearish' | 'neutral';
    score: number;
    reason: string;
  } | null> {
    // Try to get from cached analysis first
    const cached = this.getCachedAnalysis();
    if (cached?.symbolAnalysis[symbol]) {
      const sa = cached.symbolAnalysis[symbol];
      return {
        sentiment: sa.sentiment,
        score: sa.sentimentScore,
        reason: sa.keyFactors.join(', '),
      };
    }
    
    // If no cache and can't make call, return null (graceful degradation)
    if (!this.canMakeCall()) {
      return null;
    }
    
    // Make a lightweight call
    return this.fetchQuickSentiment(symbol);
  }

  /**
   * For backtest - simulate Grok analysis based on historical data
   * This doesn't make API calls, just provides a framework for backtesting
   */
  simulateForBacktest(params: {
    timestamp: number;
    symbol: string;
    price: number;
    indicators: Record<string, number>;
  }): { bias: 'bullish' | 'bearish' | 'neutral'; confidence: number } {
    // In backtest mode, we can't call Grok API (historical data)
    // Instead, we provide a neutral bias with low confidence
    // The backtest can optionally use recorded Grok analyses if available
    
    const { indicators } = params;
    
    // Simple heuristic based on indicators (not actual Grok)
    let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let confidence = 30; // Low confidence for simulated
    
    const rsi = indicators['rsi'] || 50;
    const macdHist = indicators['macdHistogram'] || 0;
    
    if (rsi > 60 && macdHist > 0) {
      bias = 'bullish';
      confidence = 40;
    } else if (rsi < 40 && macdHist < 0) {
      bias = 'bearish';
      confidence = 40;
    }
    
    return { bias, confidence };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private canMakeCall(): boolean {
    this.resetDailyStatsIfNeeded();
    
    // Check API key
    if (!GROK_API_KEY) {
      return false;
    }
    
    // Check if enabled
    if (!this.config.enabled) {
      return false;
    }
    
    // Check rate limit
    if (Date.now() < this.rateLimitUntil) {
      return false;
    }
    
    // Check daily limit
    if (this.costStats.callsToday >= this.config.maxCallsPerDay) {
      return false;
    }
    
    // Check minimum interval
    if (Date.now() - this.lastCallTime < this.config.minIntervalMs) {
      return false;
    }
    
    return true;
  }

  private resetDailyStatsIfNeeded(): void {
    const today = new Date().toDateString();
    if (today !== this.costStats.lastResetDate) {
      console.log(`[GrokMacro] 🔄 New day - resetting daily stats (was ${this.costStats.callsToday} calls, $${this.costStats.costToday.toFixed(4)})`);
      this.costStats.callsToday = 0;
      this.costStats.costToday = 0;
      this.costStats.lastResetDate = today;
      this.consecutiveErrors = 0;
    }
  }

  private recordCall(inputTokens: number, outputTokens: number): void {
    const cost = this.calculateCost(inputTokens, outputTokens);
    
    this.costStats.totalCalls++;
    this.costStats.callsToday++;
    this.costStats.totalInputTokens += inputTokens;
    this.costStats.totalOutputTokens += outputTokens;
    this.costStats.estimatedTotalCost += cost;
    this.costStats.costToday += cost;
    this.costStats.avgCostPerCall = this.costStats.estimatedTotalCost / this.costStats.totalCalls;
    
    this.lastCallTime = Date.now();
    this.consecutiveErrors = 0;
    
    console.log(`[GrokMacro] 💰 Call #${this.costStats.callsToday}/${this.config.maxCallsPerDay} | Cost: $${cost.toFixed(4)} | Today: $${this.costStats.costToday.toFixed(4)}`);
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens / 1_000_000) * COST_PER_1M_INPUT_TOKENS +
           (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT_TOKENS;
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }

  private async fetchMacroAnalysis(
    symbols: string[],
    marketData?: Record<string, { price: number; change24h: number }>
  ): Promise<GrokMacroAnalysis | null> {
    const symbolsList = symbols.join(', ');
    const marketDataStr = marketData 
      ? Object.entries(marketData).map(([s, d]) => `${s}: $${d.price.toFixed(2)} (${d.change24h >= 0 ? '+' : ''}${d.change24h.toFixed(2)}%)`).join('\n')
      : 'Not provided';

    const prompt = `You are an elite macroeconomic analyst for cryptocurrency trading. Analyze the current market conditions.

═══════════════════════════════════════════════════════════════════════════════
                    GROK MACRO ANALYSIS - MULTI-PAIR
═══════════════════════════════════════════════════════════════════════════════

SYMBOLS TO ANALYZE: ${symbolsList}

CURRENT MARKET DATA:
${marketDataStr}

═══════════════════════════════════════════════════════════════════════════════
                              ANALYSIS REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

1. MACRO REGIME DETECTION:
   - Check Fed policy stance, interest rate expectations
   - Analyze risk appetite (VIX, DXY, bond yields)
   - Identify if we're in risk-on, risk-off, or transition

2. UPCOMING EVENTS (next 48h):
   - CPI, PPI, FOMC, NFP, GDP releases
   - Fed speeches, ECB decisions
   - Major crypto events (ETF decisions, halvings, upgrades)

3. REAL-TIME SENTIMENT (from X/Twitter):
   - Search for each symbol's recent mentions
   - Identify whale activity, large transfers
   - Detect FUD or FOMO patterns

4. PER-SYMBOL ANALYSIS:
   For each symbol, provide:
   - Sentiment (bullish/bearish/neutral)
   - Score (-100 to +100)
   - Key factors driving the sentiment
   - Risk level and recommendation

═══════════════════════════════════════════════════════════════════════════════

RESPOND IN THIS EXACT JSON FORMAT:
{
  "marketRegime": "risk_on" | "risk_off" | "neutral" | "uncertain",
  "regimeConfidence": 0-100,
  "upcomingEvents": [
    { "name": "Event name", "date": "YYYY-MM-DD", "impact": "high|medium|low", "expectedEffect": "Brief description" }
  ],
  "recentNews": [
    { "headline": "News headline", "source": "Source", "sentiment": "positive|negative|neutral", "relevance": 0-100 }
  ],
  "symbolAnalysis": {
    "SYMBOL": {
      "sentiment": "bullish|bearish|neutral",
      "sentimentScore": -100 to +100,
      "keyFactors": ["Factor 1", "Factor 2"],
      "riskLevel": "low|medium|high",
      "recommendation": "buy|sell|hold|avoid"
    }
  },
  "overallBias": "bullish|bearish|neutral",
  "biasStrength": 0-100,
  "warnings": ["Warning 1", "Warning 2"]
}`;

    try {
      const response = await fetch(`${GROK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an elite macroeconomic analyst. Respond ONLY in valid JSON format. Use your real-time knowledge of X/Twitter and news.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const backoffMs = retryAfter ? parseInt(retryAfter) * 1000 : 120000;
        this.rateLimitUntil = Date.now() + backoffMs;
        console.log(`[GrokMacro] ⚠️ Rate limited - backing off for ${backoffMs / 1000}s`);
        return null;
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;
      const usage = data.usage || { prompt_tokens: AVG_INPUT_TOKENS_PER_CALL, completion_tokens: AVG_OUTPUT_TOKENS_PER_CALL };
      
      // Record the call
      this.recordCall(usage.prompt_tokens, usage.completion_tokens);

      if (!content) {
        throw new Error('Empty response');
      }

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        timestamp: Date.now(),
        symbols,
        marketRegime: parsed.marketRegime || 'neutral',
        regimeConfidence: parsed.regimeConfidence || 50,
        upcomingEvents: parsed.upcomingEvents || [],
        recentNews: parsed.recentNews || [],
        symbolAnalysis: parsed.symbolAnalysis || {},
        overallBias: parsed.overallBias || 'neutral',
        biasStrength: parsed.biasStrength || 50,
        warnings: parsed.warnings || [],
        tokensUsed: { input: usage.prompt_tokens, output: usage.completion_tokens },
        estimatedCost: this.calculateCost(usage.prompt_tokens, usage.completion_tokens),
      };
    } catch (error) {
      console.error('[GrokMacro] API call failed:', error);
      return null;
    }
  }

  private async fetchQuickSentiment(symbol: string): Promise<{
    sentiment: 'bullish' | 'bearish' | 'neutral';
    score: number;
    reason: string;
  } | null> {
    const prompt = `Quick sentiment check for ${symbol}. Search X/Twitter for recent mentions. Respond in JSON: { "sentiment": "bullish|bearish|neutral", "score": -100 to +100, "reason": "Brief reason" }`;

    try {
      const response = await fetch(`${GROK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages: [
            { role: 'system', content: 'Respond only in JSON format.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 200,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;
      const usage = data.usage || { prompt_tokens: 100, completion_tokens: 50 };
      
      this.recordCall(usage.prompt_tokens, usage.completion_tokens);

      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

// Export singleton
export const grokMacroService = GrokMacroService.getInstance();
export default GrokMacroService;
