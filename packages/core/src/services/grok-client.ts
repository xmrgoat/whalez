/**
 * Grok Client - Strict Grounded Mode
 * 
 * Provides AI-powered market analysis with mandatory source citations.
 * Two modes:
 * - STRICT: Citations obligatoires, refuse de répondre sans sources
 * - RELAXED: Autorise du qualitatif sans chiffres si pas de sources
 * 
 * The bot can function WITHOUT Grok - it's an optional enhancement.
 */

import { EventEmitter } from 'eventemitter3';

// Configuration
const GROK_API_KEY = process.env['GROK_API_KEY'] || '';
const GROK_BASE_URL = process.env['GROK_BASE_URL'] || 'https://api.x.ai/v1';
const GROK_MODEL = process.env['GROK_MODEL'] || 'grok-3-latest';
const GROK_TIMEOUT_MS = parseInt(process.env['GROK_TIMEOUT_MS'] || '30000');
const GROK_MAX_TOKENS = parseInt(process.env['GROK_MAX_TOKENS'] || '1200');
const GROK_TEMPERATURE = parseFloat(process.env['GROK_TEMPERATURE'] || '0');

// X API for evidence retrieval
const X_BEARER_TOKEN = process.env['X_BEARER_TOKEN'] || '';
const X_SEARCH_MAX_RESULTS = parseInt(process.env['X_SEARCH_MAX_RESULTS'] || '30');
const X_EVIDENCE_WINDOW_HOURS = parseInt(process.env['X_EVIDENCE_WINDOW_HOURS'] || '24');

export type StrictnessMode = 'STRICT' | 'RELAXED';

export interface GrokSource {
  url: string;
  author: string;
  text: string;
  timestamp: string;
  platform: 'x' | 'news' | 'other';
}

export interface GrokAnalysis {
  summary: string;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  confidence: number; // 0-100
  sources: GrokSource[];
  insufficientSources: boolean;
  mode: StrictnessMode;
  timestamp: number;
}

export interface MacroAnalysis extends GrokAnalysis {
  keyEvents: string[];
  riskFactors: string[];
  opportunities: string[];
}

export interface RumorCheck extends GrokAnalysis {
  claim: string;
  verdict: 'confirmed' | 'likely_true' | 'unverified' | 'likely_false' | 'false';
  evidence: string[];
}

// Cache for rate limiting and efficiency
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class GrokClient extends EventEmitter {
  private static instance: GrokClient;
  private cache = new Map<string, CacheEntry<any>>();
  private requestCount = 0;
  private lastRequestTime = 0;
  private rateLimitPerMin = parseInt(process.env['GROK_RATE_LIMIT_PER_MIN'] || '20');

  private constructor() {
    super();
  }

  static getInstance(): GrokClient {
    if (!GrokClient.instance) {
      GrokClient.instance = new GrokClient();
    }
    return GrokClient.instance;
  }

  /**
   * Check if Grok is configured and available
   */
  isAvailable(): boolean {
    return !!GROK_API_KEY;
  }

  /**
   * Check if X API is configured for evidence retrieval
   */
  hasXAccess(): boolean {
    return !!X_BEARER_TOKEN;
  }

  // ============ Public Analysis Methods ============

  /**
   * Get macro market analysis
   */
  async getMacroAnalysis(
    topic: string = 'crypto market',
    mode: StrictnessMode = 'STRICT'
  ): Promise<MacroAnalysis> {
    const cacheKey = `macro:${topic}:${mode}`;
    const cached = this.getFromCache<MacroAnalysis>(cacheKey);
    if (cached) return cached;

    // Step 1: Retrieve evidence from X
    const sources = await this.retrieveXEvidence(`${topic} market analysis`);

    // Step 2: Check if we have enough sources
    if (sources.length < 3 && mode === 'STRICT') {
      const result: MacroAnalysis = {
        summary: 'Insufficient sources available for reliable macro analysis.',
        sentiment: 'neutral',
        confidence: 0,
        sources: [],
        insufficientSources: true,
        mode,
        timestamp: Date.now(),
        keyEvents: [],
        riskFactors: [],
        opportunities: [],
      };
      return result;
    }

    // Step 3: Synthesize with Grok
    const analysis = await this.synthesizeMacro(topic, sources, mode);
    
    this.setCache(cacheKey, analysis, 60 * 1000); // 60s TTL
    return analysis;
  }

  /**
   * Check a rumor/claim
   */
  async checkRumor(
    claim: string,
    mode: StrictnessMode = 'STRICT'
  ): Promise<RumorCheck> {
    const cacheKey = `rumor:${claim}:${mode}`;
    const cached = this.getFromCache<RumorCheck>(cacheKey);
    if (cached) return cached;

    // Step 1: Search for evidence
    const sources = await this.retrieveXEvidence(claim);

    // Step 2: Check sources
    if (sources.length < 2 && mode === 'STRICT') {
      const result: RumorCheck = {
        claim,
        summary: 'Unable to verify - insufficient sources.',
        verdict: 'unverified',
        sentiment: 'neutral',
        confidence: 0,
        sources: [],
        insufficientSources: true,
        mode,
        timestamp: Date.now(),
        evidence: [],
      };
      return result;
    }

    // Step 3: Analyze with Grok
    const result = await this.analyzeRumor(claim, sources, mode);
    
    this.setCache(cacheKey, result, 120 * 1000); // 120s TTL
    return result;
  }

  /**
   * Get trading confirmation from macro perspective
   * Returns a simple yes/no with reason - for use in DecisionPolicy
   */
  async getTradingConfirmation(
    symbol: string,
    direction: 'long' | 'short'
  ): Promise<{ confirmed: boolean; reason: string; confidence: number }> {
    if (!this.isAvailable()) {
      return {
        confirmed: true, // Don't block trades if Grok unavailable
        reason: 'Grok not configured - skipping macro check',
        confidence: 0,
      };
    }

    try {
      const macro = await this.getMacroAnalysis(`${symbol} ${direction}`, 'RELAXED');
      
      if (macro.insufficientSources) {
        return {
          confirmed: true, // Don't block on insufficient data
          reason: 'Insufficient macro data - proceeding with technical signals',
          confidence: 0,
        };
      }

      // Check if macro sentiment aligns with trade direction
      const aligned = (
        (direction === 'long' && macro.sentiment === 'bullish') ||
        (direction === 'short' && macro.sentiment === 'bearish')
      );

      return {
        confirmed: aligned || macro.sentiment === 'neutral',
        reason: `Macro sentiment: ${macro.sentiment} (${macro.confidence}% confidence)`,
        confidence: macro.confidence,
      };
    } catch (error) {
      console.error('[Grok] Trading confirmation error:', error);
      return {
        confirmed: true, // Don't block on errors
        reason: 'Macro check failed - proceeding with technical signals',
        confidence: 0,
      };
    }
  }

  // ============ Private Methods ============

  /**
   * Retrieve evidence from X (Twitter)
   */
  private async retrieveXEvidence(query: string): Promise<GrokSource[]> {
    if (!this.hasXAccess()) {
      console.log('[Grok] X API not configured - skipping evidence retrieval');
      return [];
    }

    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - X_EVIDENCE_WINDOW_HOURS * 60 * 60 * 1000);

      const params = new URLSearchParams({
        query: `${query} -is:retweet lang:en`,
        max_results: X_SEARCH_MAX_RESULTS.toString(),
        'tweet.fields': 'created_at,author_id,text',
        'user.fields': 'username',
        expansions: 'author_id',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
      });

      const response = await fetch(
        `https://api.twitter.com/2/tweets/search/recent?${params}`,
        {
          headers: {
            Authorization: `Bearer ${X_BEARER_TOKEN}`,
          },
        }
      );

      if (!response.ok) {
        console.error('[Grok] X API error:', response.status);
        return [];
      }

      const data = await response.json() as { data?: any[]; includes?: { users?: any[] } };
      const tweets = data.data || [];
      const users = new Map((data.includes?.users || []).map((u: any) => [u.id, u.username]));

      return tweets.map((tweet: any) => ({
        url: `https://x.com/i/status/${tweet.id}`,
        author: users.get(tweet.author_id) || 'unknown',
        text: tweet.text,
        timestamp: tweet.created_at,
        platform: 'x' as const,
      }));
    } catch (error) {
      console.error('[Grok] X evidence retrieval error:', error);
      return [];
    }
  }

  /**
   * Synthesize macro analysis with Grok
   */
  private async synthesizeMacro(
    topic: string,
    sources: GrokSource[],
    mode: StrictnessMode
  ): Promise<MacroAnalysis> {
    const sourcesText = sources.map((s, i) => 
      `[${i + 1}] @${s.author}: "${s.text.slice(0, 200)}..." (${s.timestamp})`
    ).join('\n');

    const prompt = mode === 'STRICT'
      ? `Analyze the following X posts about "${topic}" and provide a market analysis.
RULES:
- ONLY use information from the provided sources
- CITE sources using [1], [2], etc.
- Do NOT invent any data or statistics
- If sources are insufficient, say so

SOURCES:
${sourcesText}

Respond in JSON format:
{
  "summary": "brief analysis with citations",
  "sentiment": "bullish|bearish|neutral|mixed",
  "confidence": 0-100,
  "keyEvents": ["event1", "event2"],
  "riskFactors": ["risk1"],
  "opportunities": ["opp1"]
}`
      : `Analyze "${topic}" based on these sources. You may provide qualitative analysis but do NOT invent specific numbers or statistics.

SOURCES:
${sourcesText}

Respond in JSON format with summary, sentiment, confidence, keyEvents, riskFactors, opportunities.`;

    const response = await this.callGrok(prompt);
    
    try {
      const parsed = JSON.parse(response);
      return {
        ...parsed,
        sources,
        insufficientSources: false,
        mode,
        timestamp: Date.now(),
      };
    } catch {
      return {
        summary: response,
        sentiment: 'neutral',
        confidence: 30,
        sources,
        insufficientSources: false,
        mode,
        timestamp: Date.now(),
        keyEvents: [],
        riskFactors: [],
        opportunities: [],
      };
    }
  }

  /**
   * Analyze a rumor with Grok
   */
  private async analyzeRumor(
    claim: string,
    sources: GrokSource[],
    mode: StrictnessMode
  ): Promise<RumorCheck> {
    const sourcesText = sources.map((s, i) => 
      `[${i + 1}] @${s.author}: "${s.text.slice(0, 200)}..." (${s.timestamp})`
    ).join('\n');

    const prompt = `Fact-check this claim: "${claim}"

SOURCES:
${sourcesText}

RULES:
- Base verdict ONLY on provided sources
- Cite sources [1], [2], etc.
- Do NOT assume or invent information

Respond in JSON:
{
  "verdict": "confirmed|likely_true|unverified|likely_false|false",
  "summary": "explanation with citations",
  "evidence": ["evidence point 1", "evidence point 2"],
  "confidence": 0-100
}`;

    const response = await this.callGrok(prompt);
    
    try {
      const parsed = JSON.parse(response);
      return {
        claim,
        ...parsed,
        sentiment: parsed.verdict === 'confirmed' || parsed.verdict === 'likely_true' ? 'bullish' : 'neutral',
        sources,
        insufficientSources: false,
        mode,
        timestamp: Date.now(),
      };
    } catch {
      return {
        claim,
        summary: response,
        verdict: 'unverified',
        sentiment: 'neutral',
        confidence: 20,
        sources,
        insufficientSources: false,
        mode,
        timestamp: Date.now(),
        evidence: [],
      };
    }
  }

  /**
   * Call Grok API
   */
  private async callGrok(prompt: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('Grok API key not configured');
    }

    // Rate limiting
    await this.checkRateLimit();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GROK_TIMEOUT_MS);

    try {
      const response = await fetch(`${GROK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROK_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are a financial analyst. Provide factual, citation-based analysis. Never invent data.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: GROK_MAX_TOKENS,
          temperature: GROK_TEMPERATURE,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Grok API error: ${response.status}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content || '';
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    if (this.lastRequestTime < windowStart) {
      this.requestCount = 0;
    }

    if (this.requestCount >= this.rateLimitPerMin) {
      const waitTime = 60000 - (now - this.lastRequestTime);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      this.requestCount = 0;
    }

    this.requestCount++;
    this.lastRequestTime = now;
  }

  // ============ Cache Helpers ============

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton
export const grokClient = GrokClient.getInstance();
export default grokClient;
