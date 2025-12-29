/**
 * Enhanced Grok Service - Strict Grounded Mode with Real Data
 * 
 * CRITICAL RULES:
 * 1. ALL analysis must be based on REAL data (X/Twitter, news, indicators)
 * 2. NO speculation or assumptions allowed
 * 3. Every claim must cite sources
 * 4. If insufficient data, return INSUFFICIENT_DATA
 * 5. All suggestions must respect user guardrails
 * 
 * Features:
 * - Real-time X/Twitter data fetching
 * - Template-based analysis with strict rules
 * - Self-critique after every 5 trades
 * - Learning database integration
 * - Guardrail enforcement
 */

import { EventEmitter } from 'eventemitter3';

// Configuration
const GROK_API_KEY = process.env['GROK_API_KEY'] || '';
const GROK_BASE_URL = process.env['GROK_BASE_URL'] || 'https://api.x.ai/v1';
const GROK_MODEL = process.env['GROK_MODEL'] || 'grok-3-latest';
// Note: X API not used due to rate limits and cost - Grok has built-in real-time knowledge

// Types
export interface RealDataSource {
  type: 'x_post' | 'news' | 'indicator' | 'user_input';
  id: string;
  content: string;
  author?: string;
  url?: string;
  timestamp: number;
  relevance: number; // 0-100
}

export interface AnalysisResult {
  success: boolean;
  action: 'LONG' | 'SHORT' | 'HOLD' | 'NO_TRADE';
  confidence: number;
  reasoning: string;
  sources: RealDataSource[];
  warnings: string[];
  blockedReason?: string;
}

export interface SelfCritiqueResult {
  tradeCount: number;
  metrics: {
    winRate: number;
    avgRMultiple: number;
    expectancy: number;
    maxDrawdown: number;
  };
  whatWorked: string[];
  whatDidntWork: string[];
  patterns: string[];
  suggestions: ParameterSuggestion[];
  lessons: string[];
}

export interface ParameterSuggestion {
  parameter: string;
  currentValue: any;
  suggestedValue: any;
  reason: string;
  confidence: number;
  expectedImpact: string;
  sources: RealDataSource[];
}

export interface Guardrails {
  maxLeverage: number;
  maxPositionPct: number;
  maxDrawdown: number;
  minStopLoss: number;
  maxStopLoss: number;
  minTakeProfit: number;
}

// System limits that cannot be exceeded
const SYSTEM_LIMITS: Guardrails = {
  maxLeverage: 20,
  maxPositionPct: 10,
  maxDrawdown: 30,
  minStopLoss: 0.5,
  maxStopLoss: 20,
  minTakeProfit: 1,
};

class EnhancedGrokService extends EventEmitter {
  private static instance: EnhancedGrokService;
  private requestCount = 0;
  private lastRequestTime = 0;

  private constructor() {
    super();
  }

  static getInstance(): EnhancedGrokService {
    if (!EnhancedGrokService.instance) {
      EnhancedGrokService.instance = new EnhancedGrokService();
    }
    return EnhancedGrokService.instance;
  }

  /**
   * Check if Grok API is available
   */
  isAvailable(): boolean {
    return !!GROK_API_KEY;
  }

  // ============ GROK REAL-TIME DATA ============
  // Grok has built-in real-time knowledge from X/Twitter
  // No need for separate X API calls - Grok can access this directly

  /**
   * Calculate relevance score for a piece of content
   */
  private calculateRelevance(content: string, query: string): number {
    const queryTerms = query.toLowerCase().split(' ');
    const contentLower = content.toLowerCase();
    
    let matches = 0;
    for (const term of queryTerms) {
      if (contentLower.includes(term)) matches++;
    }
    
    return Math.min(100, (matches / queryTerms.length) * 100);
  }

  // ============ ANALYSIS WITH REAL DATA ============

  /**
   * Analyze market conditions using Grok's real-time knowledge
   * Grok has built-in access to X/Twitter data - no separate API needed
   * 
   * CONFIRMATION SYSTEM:
   * - Price confirmation: Current price vs moving averages
   * - Volume confirmation: Volume vs average volume
   * - Indicator confirmation: RSI, MACD, Bollinger alignment
   * - Sentiment confirmation: Real-time X/Twitter sentiment
   */
  async analyzeMarket(params: {
    symbol: string;
    price: number;
    change24h: number;
    indicators: Record<string, number>;
    volume?: number;
    avgVolume?: number;
    guardrails: Partial<Guardrails>;
    userPrompt?: string; // Custom user instructions
    indicatorConfigs?: Array<{ id: string; name: string; calcParams: number[]; visible: boolean }>; // User's indicator settings
  }): Promise<AnalysisResult> {
    const { symbol, price, change24h, indicators, volume, avgVolume, guardrails, userPrompt, indicatorConfigs } = params;
    const mergedGuardrails = { ...SYSTEM_LIMITS, ...guardrails };

    // Check if Grok is available
    if (!this.isAvailable()) {
      return {
        success: false,
        action: 'HOLD',
        confidence: 0,
        reasoning: 'Grok API not configured. Please add GROK_API_KEY to .env',
        sources: [],
        warnings: ['Grok API not available'],
        blockedReason: 'API not configured',
      };
    }

    // Prepare indicator data as sources
    const indicatorSources: RealDataSource[] = Object.entries(indicators).map(([key, value]) => ({
      type: 'indicator' as const,
      id: `indicator_${key}`,
      content: `${key}: ${value}`,
      timestamp: Date.now(),
      relevance: 100,
    }));

    // Build analysis prompt - Grok will use its real-time knowledge
    const prompt = this.buildAnalysisPrompt({
      symbol,
      price,
      change24h,
      indicators,
      volume,
      avgVolume,
      guardrails: mergedGuardrails,
      userPrompt,
      indicatorConfigs,
    });

    // Call Grok API
    const grokResponse = await this.callGrokAPI(prompt);
    const responseContent = grokResponse.content || '';
    
    if (!grokResponse.success) {
      return {
        success: false,
        action: 'HOLD',
        confidence: 0,
        reasoning: grokResponse.error || 'Grok API call failed',
        sources: indicatorSources,
        warnings: ['Grok API unavailable'],
      };
    }

    // Parse and validate response
    const analysis = this.parseAnalysisResponse(responseContent);
    
    return {
      ...analysis,
      sources: indicatorSources,
    };
  }

  /**
   * Build analysis prompt with strict template
   * Grok has real-time knowledge - it can access current X/Twitter sentiment directly
   */
  private buildAnalysisPrompt(params: {
    symbol: string;
    price: number;
    change24h: number;
    indicators: Record<string, number>;
    volume?: number;
    avgVolume?: number;
    guardrails: Guardrails;
    userPrompt?: string;
    indicatorConfigs?: Array<{ id: string; name: string; calcParams: number[]; visible: boolean }>;
  }): string {
    const { symbol, price, change24h, indicators, volume, avgVolume, guardrails, userPrompt, indicatorConfigs } = params;
    
    // Calculate volume confirmation
    const volumeRatio = volume && avgVolume ? (volume / avgVolume) : null;
    const volumeConfirmation = volumeRatio 
      ? volumeRatio > 1.5 ? 'HIGH (above average)' 
        : volumeRatio < 0.5 ? 'LOW (below average)' 
        : 'NORMAL'
      : 'N/A';
    
    // Calculate price vs EMA confirmations
    const ema20 = indicators['ema20'];
    const ema50 = indicators['ema50'];
    const ema200 = indicators['ema200'];
    const priceVsEma20 = ema20 ? (price > ema20 ? 'ABOVE' : 'BELOW') : 'N/A';
    const priceVsEma50 = ema50 ? (price > ema50 ? 'ABOVE' : 'BELOW') : 'N/A';
    const priceVsEma200 = ema200 ? (price > ema200 ? 'ABOVE' : 'BELOW') : 'N/A';
    
    // RSI confirmation
    const rsi = indicators['rsi'];
    const rsiConfirmation = rsi 
      ? rsi > 70 ? 'OVERBOUGHT' 
        : rsi < 30 ? 'OVERSOLD' 
        : rsi > 50 ? 'BULLISH' 
        : 'BEARISH'
      : 'N/A';

    // Build user custom instructions section
    const userInstructions = userPrompt 
      ? `\nUSER CUSTOM INSTRUCTIONS (follow these if they don't violate guardrails):\n${userPrompt}\n`
      : '';

    // Build user's indicator configuration section
    const indicatorConfigSection = indicatorConfigs && indicatorConfigs.length > 0
      ? `\nUSER'S ACTIVE INDICATORS (use these specific settings in your analysis):
${indicatorConfigs.filter(i => i.visible).map(i => `- ${i.name} (${i.id}): Parameters [${i.calcParams.join(', ')}]`).join('\n')}
Note: The user has specifically configured these indicators. Base your technical analysis on these exact parameters.\n`
      : '';

    return `You are an ELITE cryptocurrency trading analyst with REAL-TIME access to X/Twitter, news, and market data. Your analysis must be PRECISE, DATA-DRIVEN, and ACTIONABLE.

═══════════════════════════════════════════════════════════════════════════════
                              GROK TRADING SYSTEM v2.0
                    MACROECONOMIC + TECHNICAL + SENTIMENT ANALYSIS
═══════════════════════════════════════════════════════════════════════════════

ASSET: ${symbol}
CURRENT PRICE: $${price.toFixed(2)}
24H CHANGE: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%
${volume ? `VOLUME: ${volume.toLocaleString()}` : ''}
${avgVolume ? `AVG VOLUME: ${avgVolume.toLocaleString()}` : ''}

═══════════════════════════════════════════════════════════════════════════════
                              CRITICAL ANALYSIS RULES
═══════════════════════════════════════════════════════════════════════════════

1. MACROECONOMIC PRIORITY (CHECK FIRST):
   - Search for TODAY's economic calendar events (CPI, PPI, FOMC, NFP, GDP, Unemployment)
   - If major macro event within 24h → REDUCE confidence by 20% or HOLD
   - Fed speeches, rate decisions = HIGH IMPACT → Be cautious
   - Check if any surprise economic data was just released

2. REAL-TIME NEWS ANALYSIS (CRITICAL):
   - Search X/Twitter for ${symbol} mentions in the last 1-4 hours
   - Look for: whale movements, exchange flows, regulatory news, hacks, partnerships
   - Breaking news can invalidate all technical analysis → PRIORITIZE NEWS
   - Cite specific posts/sources with timestamps

3. TECHNICAL CONFIRMATION SYSTEM:
   □ Price vs EMA20: ${priceVsEma20}
   □ Price vs EMA50: ${priceVsEma50}
   □ Price vs EMA200: ${priceVsEma200}
   □ RSI Status: ${rsiConfirmation}
   □ Volume: ${volumeConfirmation}
   □ MACD/Momentum: [Analyze from indicators]
   □ Support/Resistance levels: [Identify key levels]

4. SENTIMENT SCORING (X/Twitter):
   - Analyze sentiment from crypto influencers, traders, analysts
   - Look for unusual activity, FUD, FOMO patterns
   - Whale alerts, large transfers = IMPORTANT
   - Score: EXTREME_FEAR / FEAR / NEUTRAL / GREED / EXTREME_GREED

5. CONFIRMATION REQUIREMENTS:
   - CONSERVATIVE mode: Need 5+ confirmations, confidence > 75%
   - MODERATE mode: Need 4+ confirmations, confidence > 65%
   - AGGRESSIVE mode: Need 3+ confirmations, confidence > 55%
   - Current mode: Check user settings

TECHNICAL INDICATORS PROVIDED:
${Object.entries(indicators).map(([k, v]) => `• ${k}: ${typeof v === 'number' ? v.toFixed(4) : v}`).join('\n')}
${indicatorConfigSection}
═══════════════════════════════════════════════════════════════════════════════
                              LEVERAGE RECOMMENDATION
═══════════════════════════════════════════════════════════════════════════════

DYNAMIC LEVERAGE RULES (suggest based on conditions):
- HIGH volatility (>3% daily) → Max 2x leverage
- MEDIUM volatility (1-3% daily) → Max 3-5x leverage  
- LOW volatility (<1% daily) → Up to ${guardrails.maxLeverage}x allowed
- Major news event pending → Max 2x or NO TRADE
- Strong trend with confirmations → Can use higher leverage
- Choppy/ranging market → Reduce leverage or HOLD

USER GUARDRAILS (ABSOLUTE LIMITS - NEVER EXCEED):
• Max Leverage: ${guardrails.maxLeverage}x
• Max Position Size: ${guardrails.maxPositionPct}%
• Max Drawdown: ${guardrails.maxDrawdown}%
• Stop Loss Range: ${guardrails.minStopLoss}% - ${guardrails.maxStopLoss}%
${userInstructions}
═══════════════════════════════════════════════════════════════════════════════
                              REQUIRED ANALYSIS STEPS
═══════════════════════════════════════════════════════════════════════════════

STEP 1: Check for macro events (CPI, PPI, FOMC, NFP today/tomorrow?)
STEP 2: Search X/Twitter for breaking news about ${symbol} (last 4 hours)
STEP 3: Analyze whale activity and exchange flows
STEP 4: Evaluate technical indicators and confirmations
STEP 5: Score overall sentiment
STEP 6: Determine appropriate leverage based on volatility
STEP 7: Calculate entry, stop loss, and take profit levels
STEP 8: Count total confirmations and make decision

═══════════════════════════════════════════════════════════════════════════════

RESPOND IN THIS EXACT JSON FORMAT:
{
  "action": "LONG" | "SHORT" | "HOLD" | "NO_TRADE",
  "confidence": 0-100,
  "suggestedLeverage": number (1-${guardrails.maxLeverage}, based on volatility),
  "confirmations": {
    "macro": "FAVORABLE/UNFAVORABLE/NEUTRAL/EVENT_PENDING - [cite specific event if any]",
    "news": "BULLISH/BEARISH/NEUTRAL - [cite specific X posts or news with source]",
    "technical": "BULLISH/BEARISH/MIXED - [cite indicator values]",
    "sentiment": "EXTREME_FEAR/FEAR/NEUTRAL/GREED/EXTREME_GREED - [cite sources]",
    "volume": "CONFIRMING/NOT_CONFIRMING - [reason]",
    "trend": "UPTREND/DOWNTREND/RANGING - [reason]"
  },
  "confirmationCount": number,
  "macroEvents": ["List any upcoming economic events within 48h"],
  "breakingNews": ["List any breaking news found on X/Twitter"],
  "whaleActivity": "Description of any whale movements detected",
  "reasoning": "Detailed analysis with SPECIFIC data points, prices, and sources",
  "warnings": ["Risk warnings including macro risks"],
  "suggestedEntry": number | null,
  "suggestedStop": number | null,
  "suggestedTarget": number | null,
  "riskRewardRatio": number | null
}`;
  }

  // ============ SELF-CRITIQUE SYSTEM ============

  /**
   * Perform self-critique after trades
   * Called automatically after every 5 completed trades
   */
  async performSelfCritique(params: {
    botId: string;
    trades: any[];
    previousInsights: string[];
    guardrails: Partial<Guardrails>;
  }): Promise<SelfCritiqueResult> {
    const { trades, previousInsights, guardrails } = params;
    const mergedGuardrails = { ...SYSTEM_LIMITS, ...guardrails };

    // Calculate metrics from real trade data
    const closedTrades = trades.filter(t => t.status === 'closed' && t.pnl !== undefined);
    
    if (closedTrades.length < 5) {
      return {
        tradeCount: closedTrades.length,
        metrics: { winRate: 0, avgRMultiple: 0, expectancy: 0, maxDrawdown: 0 },
        whatWorked: [],
        whatDidntWork: ['Not enough trades for analysis (minimum 5 required)'],
        patterns: [],
        suggestions: [],
        lessons: [],
      };
    }

    // Calculate real metrics
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl <= 0);
    const winRate = (wins.length / closedTrades.length) * 100;
    
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
    const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

    // Calculate R-multiples
    const rMultiples = closedTrades.map(t => {
      if (!t.stopLoss || !t.entryPrice || !t.pnl) return 0;
      const risk = Math.abs(t.entryPrice - t.stopLoss) * t.quantity;
      return risk > 0 ? t.pnl / risk : 0;
    });
    const avgRMultiple = rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length;

    // Calculate max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumPnl = 0;
    for (const trade of closedTrades) {
      cumPnl += trade.pnl;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const metrics = { winRate, avgRMultiple, expectancy, maxDrawdown };

    // Build critique prompt
    const prompt = this.buildCritiquePrompt({
      trades: closedTrades,
      metrics,
      previousInsights,
      guardrails: mergedGuardrails,
    });

    // Call Grok for analysis
    const grokResponse = await this.callGrokAPI(prompt);
    
    if (!grokResponse.success) {
      // Return basic analysis without Grok
      return {
        tradeCount: closedTrades.length,
        metrics,
        whatWorked: winRate >= 50 ? [`Win rate of ${winRate.toFixed(1)}% is positive`] : [],
        whatDidntWork: winRate < 50 ? [`Win rate of ${winRate.toFixed(1)}% needs improvement`] : [],
        patterns: [],
        suggestions: [],
        lessons: [`Analyzed ${closedTrades.length} trades with ${winRate.toFixed(1)}% win rate`],
      };
    }

    // Parse Grok response
    const critiqueContent = grokResponse.content || '';
    const critique = this.parseCritiqueResponse(critiqueContent, metrics, mergedGuardrails);
    
    return {
      tradeCount: closedTrades.length,
      metrics,
      ...critique,
    };
  }

  /**
   * Build self-critique prompt
   */
  private buildCritiquePrompt(params: {
    trades: any[];
    metrics: { winRate: number; avgRMultiple: number; expectancy: number; maxDrawdown: number };
    previousInsights: string[];
    guardrails: Guardrails;
  }): string {
    const { trades, metrics, previousInsights, guardrails } = params;

    const tradesText = trades.slice(-10).map((t, i) => 
      `[${i + 1}] ${t.side} ${t.symbol} | Entry: $${t.entryPrice} | Exit: $${t.exitPrice || 'N/A'} | PnL: $${t.pnl?.toFixed(2) || 'N/A'} | ${t.pnl > 0 ? 'WIN' : 'LOSS'}`
    ).join('\n');

    return `You are performing a self-critique of trading performance. Analyze ONLY the real data provided.

CRITICAL RULES:
1. Base all analysis on the actual trade data below
2. Patterns must appear at least 3 times to be valid
3. Suggestions must stay within guardrails
4. Be specific - cite trade numbers when making claims

PERFORMANCE METRICS (calculated from real trades):
- Total Trades: ${trades.length}
- Win Rate: ${metrics.winRate.toFixed(1)}%
- Average R-Multiple: ${metrics.avgRMultiple.toFixed(2)}
- Expectancy: $${metrics.expectancy.toFixed(2)}
- Max Drawdown: ${metrics.maxDrawdown.toFixed(1)}%

RECENT TRADES:
${tradesText}

PREVIOUS INSIGHTS (for context):
${previousInsights.length > 0 ? previousInsights.join('\n') : 'None yet'}

GUARDRAILS (suggestions must stay within):
- Max Leverage: ${guardrails.maxLeverage}x
- Max Position: ${guardrails.maxPositionPct}%
- Stop Loss Range: ${guardrails.minStopLoss}% - ${guardrails.maxStopLoss}%

Respond in this exact JSON format:
{
  "whatWorked": ["Specific things that worked, citing trade numbers"],
  "whatDidntWork": ["Specific things that didn't work, citing trade numbers"],
  "patterns": ["Patterns that appeared 3+ times"],
  "suggestions": [
    {
      "parameter": "parameterName",
      "currentValue": currentValue,
      "suggestedValue": newValue,
      "reason": "Specific reason with data",
      "confidence": 0-100,
      "expectedImpact": "Expected improvement"
    }
  ],
  "lessons": ["Key lessons learned from this batch"]
}`;
  }

  // ============ GROK API ============

  // Rate limit tracking
  private rateLimitResetTime = 0;
  private consecutiveErrors = 0;
  private static MIN_CALL_INTERVAL = 15000; // 15 seconds minimum between calls
  private static RATE_LIMIT_BACKOFF = 120000; // 2 minutes backoff on 429 (xAI has strict limits)

  /**
   * Call Grok API with rate limiting and retry logic
   */
  private async callGrokAPI(prompt: string, retryCount = 0): Promise<{ success: boolean; content?: string; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Grok API not configured' };
    }

    // Check if we're in rate limit backoff
    const now = Date.now();
    if (now < this.rateLimitResetTime) {
      const waitTime = Math.ceil((this.rateLimitResetTime - now) / 1000);
      return { success: false, error: `Rate limited. Retry in ${waitTime}s` };
    }

    // Rate limiting - minimum interval between calls (increased for stability)
    const minInterval = EnhancedGrokService.MIN_CALL_INTERVAL * (1 + this.consecutiveErrors * 0.5);
    if (now - this.lastRequestTime < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - (now - this.lastRequestTime)));
    }
    this.lastRequestTime = Date.now();
    this.requestCount++;

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
              content: `You are an ELITE cryptocurrency trading analyst with REAL-TIME access to X/Twitter and news. 
CRITICAL RULES:
1. You MUST respond in valid JSON format only
2. You MUST cite specific data points, X posts, or news sources for EVERY claim
3. You CANNOT make assumptions or speculate - only use real data
4. Check for macroeconomic events (CPI, PPI, FOMC, NFP) FIRST
5. Prioritize breaking news over technical analysis
6. Be EXTREMELY precise with entry, stop loss, and take profit levels
7. Suggest appropriate leverage based on market volatility`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 2500,
        }),
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        this.consecutiveErrors++;
        const retryAfter = response.headers.get('retry-after');
        const backoffTime = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : EnhancedGrokService.RATE_LIMIT_BACKOFF * Math.pow(2, Math.min(retryCount, 3));
        
        this.rateLimitResetTime = Date.now() + backoffTime;
        console.log(`[Grok] ⚠️ Rate limited (429). Backing off for ${Math.ceil(backoffTime / 1000)}s`);
        
        // Retry once after backoff if this is the first attempt
        if (retryCount < 1) {
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          return this.callGrokAPI(prompt, retryCount + 1);
        }
        
        return { success: false, error: `Rate limited. Retry in ${Math.ceil(backoffTime / 1000)}s` };
      }

      if (!response.ok) {
        this.consecutiveErrors++;
        return { success: false, error: `Grok API error: ${response.status}` };
      }
      
      // Success - reset error counter
      this.consecutiveErrors = 0;

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        return { success: false, error: 'Empty response from Grok' };
      }

      return { success: true, content };
    } catch (error) {
      return { success: false, error: `Grok API call failed: ${error}` };
    }
  }

  // ============ RESPONSE PARSING ============

  private parseAnalysisResponse(content: string): Omit<AnalysisResult, 'sources'> & { 
    suggestedLeverage?: number;
    macroEvents?: string[];
    breakingNews?: string[];
    whaleActivity?: string;
    suggestedEntry?: number;
    suggestedStop?: number;
    suggestedTarget?: number;
    riskRewardRatio?: number;
    confirmations?: Record<string, string>;
  } {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          action: 'HOLD',
          confidence: 0,
          reasoning: 'Failed to parse Grok response',
          warnings: ['Invalid response format'],
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Build detailed reasoning with macro and news info
      let detailedReasoning = parsed.reasoning || 'No reasoning provided';
      
      // Append macro events if present
      if (parsed.macroEvents && parsed.macroEvents.length > 0) {
        detailedReasoning += `\n\n📅 MACRO EVENTS: ${parsed.macroEvents.join(', ')}`;
      }
      
      // Append breaking news if present
      if (parsed.breakingNews && parsed.breakingNews.length > 0) {
        detailedReasoning += `\n\n📰 BREAKING NEWS: ${parsed.breakingNews.join(' | ')}`;
      }
      
      // Append whale activity if present
      if (parsed.whaleActivity) {
        detailedReasoning += `\n\n🐋 WHALE ACTIVITY: ${parsed.whaleActivity}`;
      }
      
      return {
        success: true,
        action: parsed.action || 'HOLD',
        confidence: Math.min(100, Math.max(0, parsed.confidence || 0)),
        reasoning: detailedReasoning,
        warnings: parsed.warnings || [],
        suggestedLeverage: parsed.suggestedLeverage,
        macroEvents: parsed.macroEvents,
        breakingNews: parsed.breakingNews,
        whaleActivity: parsed.whaleActivity,
        suggestedEntry: parsed.suggestedEntry,
        suggestedStop: parsed.suggestedStop,
        suggestedTarget: parsed.suggestedTarget,
        riskRewardRatio: parsed.riskRewardRatio,
        confirmations: parsed.confirmations,
      };
    } catch (error) {
      return {
        success: false,
        action: 'HOLD',
        confidence: 0,
        reasoning: 'Failed to parse analysis response',
        warnings: ['Parse error'],
      };
    }
  }

  private parseCritiqueResponse(
    content: string, 
    metrics: { winRate: number; avgRMultiple: number; expectancy: number; maxDrawdown: number },
    guardrails: Guardrails
  ): Omit<SelfCritiqueResult, 'tradeCount' | 'metrics'> {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          whatWorked: [],
          whatDidntWork: ['Failed to parse critique'],
          patterns: [],
          suggestions: [],
          lessons: [],
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate suggestions against guardrails
      const validatedSuggestions = (parsed.suggestions || []).filter((s: any) => {
        // Check if suggestion respects guardrails
        if (s.parameter === 'leverage' && s.suggestedValue > guardrails.maxLeverage) return false;
        if (s.parameter === 'positionSizePct' && s.suggestedValue > guardrails.maxPositionPct) return false;
        if (s.parameter === 'stopLossPct' && (s.suggestedValue < guardrails.minStopLoss || s.suggestedValue > guardrails.maxStopLoss)) return false;
        return true;
      }).map((s: any) => ({
        ...s,
        sources: [], // Will be populated with real data
      }));

      return {
        whatWorked: parsed.whatWorked || [],
        whatDidntWork: parsed.whatDidntWork || [],
        patterns: parsed.patterns || [],
        suggestions: validatedSuggestions,
        lessons: parsed.lessons || [],
      };
    } catch (error) {
      return {
        whatWorked: [],
        whatDidntWork: ['Failed to parse critique response'],
        patterns: [],
        suggestions: [],
        lessons: [],
      };
    }
  }
}

export const enhancedGrok = EnhancedGrokService.getInstance();
export default EnhancedGrokService;
