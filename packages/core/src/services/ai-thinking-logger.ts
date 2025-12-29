/**
 * AI Thinking Logger Service
 * 
 * Provides real-time streaming of AI thinking process
 * and persists sessions to database for audit/replay
 */

import { EventEmitter } from 'events';

export type AISessionType = 
  | 'MARKET_ANALYSIS'
  | 'TRADE_DECISION'
  | 'SELF_CRITIQUE'
  | 'PARAMETER_OPTIMIZATION'
  | 'SENTIMENT_CHECK';

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
export type AISessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

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
  botId?: string;
  userId?: string;
  symbol: string;
  timeframe: string;
  sessionType: AISessionType;
  status: AISessionStatus;
  startedAt: Date;
  completedAt?: Date;
  totalDurationMs?: number;
  finalAction?: string;
  finalConfidence?: number;
  inputData: Record<string, any>;
  outputData?: Record<string, any>;
  steps: ThinkingStep[];
}

export interface ThinkingEvent {
  type: 'session_start' | 'step_start' | 'step_update' | 'step_complete' | 'session_complete' | 'error';
  sessionId: string;
  step?: ThinkingStep;
  session?: ThinkingSession;
  error?: string;
  timestamp: Date;
}

// Generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

class AIThinkingLogger extends EventEmitter {
  private sessions: Map<string, ThinkingSession> = new Map();
  private persistCallback?: (session: ThinkingSession) => Promise<void>;
  private stepPersistCallback?: (sessionId: string, step: ThinkingStep) => Promise<void>;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Set callback for persisting sessions to database
   */
  setPersistCallback(callback: (session: ThinkingSession) => Promise<void>): void {
    this.persistCallback = callback;
  }

  /**
   * Set callback for persisting individual steps
   */
  setStepPersistCallback(callback: (sessionId: string, step: ThinkingStep) => Promise<void>): void {
    this.stepPersistCallback = callback;
  }

  /**
   * Start a new thinking session
   */
  startSession(params: {
    botId?: string;
    userId?: string;
    symbol: string;
    timeframe: string;
    sessionType: AISessionType;
    inputData: Record<string, any>;
  }): ThinkingSession {
    const session: ThinkingSession = {
      id: generateId(),
      botId: params.botId,
      userId: params.userId,
      symbol: params.symbol,
      timeframe: params.timeframe,
      sessionType: params.sessionType,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      inputData: params.inputData,
      steps: [],
    };

    this.sessions.set(session.id, session);

    const event: ThinkingEvent = {
      type: 'session_start',
      sessionId: session.id,
      session,
      timestamp: new Date(),
    };

    this.emit('thinking', event);
    return session;
  }

  /**
   * Add a thinking step to a session
   */
  addStep(sessionId: string, params: {
    stepType: AIStepType;
    title: string;
    content: string;
    data?: Record<string, any>;
  }): ThinkingStep | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const step: ThinkingStep = {
      id: generateId(),
      stepNumber: session.steps.length + 1,
      stepType: params.stepType,
      title: params.title,
      content: params.content,
      data: params.data,
      status: 'IN_PROGRESS',
      createdAt: new Date(),
    };

    session.steps.push(step);

    const event: ThinkingEvent = {
      type: 'step_start',
      sessionId,
      step,
      timestamp: new Date(),
    };

    this.emit('thinking', event);

    // Persist step if callback is set
    if (this.stepPersistCallback) {
      this.stepPersistCallback(sessionId, step).catch(err => {
        console.error('[AIThinkingLogger] Failed to persist step:', err);
      });
    }

    return step;
  }

  /**
   * Update a step's content (for streaming)
   */
  updateStep(sessionId: string, stepId: string, content: string, data?: Record<string, any>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const step = session.steps.find(s => s.id === stepId);
    if (!step) return;

    step.content = content;
    if (data) step.data = { ...step.data, ...data };

    const event: ThinkingEvent = {
      type: 'step_update',
      sessionId,
      step,
      timestamp: new Date(),
    };

    this.emit('thinking', event);
  }

  /**
   * Complete a step
   */
  completeStep(sessionId: string, stepId: string, finalContent?: string, data?: Record<string, any>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const step = session.steps.find(s => s.id === stepId);
    if (!step) return;

    if (finalContent) step.content = finalContent;
    if (data) step.data = { ...step.data, ...data };
    step.status = 'COMPLETED';
    step.durationMs = Date.now() - step.createdAt.getTime();

    const event: ThinkingEvent = {
      type: 'step_complete',
      sessionId,
      step,
      timestamp: new Date(),
    };

    this.emit('thinking', event);
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: string, result: {
    finalAction: string;
    finalConfidence: number;
    outputData: Record<string, any>;
  }): Promise<ThinkingSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.status = 'COMPLETED';
    session.completedAt = new Date();
    session.totalDurationMs = Date.now() - session.startedAt.getTime();
    session.finalAction = result.finalAction;
    session.finalConfidence = result.finalConfidence;
    session.outputData = result.outputData;

    const event: ThinkingEvent = {
      type: 'session_complete',
      sessionId,
      session,
      timestamp: new Date(),
    };

    this.emit('thinking', event);

    // Persist session if callback is set
    if (this.persistCallback) {
      try {
        await this.persistCallback(session);
      } catch (err) {
        console.error('[AIThinkingLogger] Failed to persist session:', err);
      }
    }

    return session;
  }

  /**
   * Fail a session
   */
  failSession(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'FAILED';
    session.completedAt = new Date();
    session.totalDurationMs = Date.now() - session.startedAt.getTime();

    const event: ThinkingEvent = {
      type: 'error',
      sessionId,
      session,
      error,
      timestamp: new Date(),
    };

    this.emit('thinking', event);
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ThinkingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ThinkingSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'IN_PROGRESS');
  }

  /**
   * Clean up old sessions from memory
   */
  cleanup(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.status !== 'IN_PROGRESS' && 
          session.completedAt && 
          now - session.completedAt.getTime() > maxAgeMs) {
        this.sessions.delete(id);
      }
    }
  }
}

// Singleton instance
export const aiThinkingLogger = new AIThinkingLogger();

// Helper function to create a thinking session with automatic step logging
export async function withThinkingSession<T>(
  params: {
    botId?: string;
    userId?: string;
    symbol: string;
    timeframe: string;
    sessionType: AISessionType;
    inputData: Record<string, any>;
  },
  fn: (logger: {
    addStep: (stepType: AIStepType, title: string, content: string, data?: Record<string, any>) => string;
    updateStep: (stepId: string, content: string, data?: Record<string, any>) => void;
    completeStep: (stepId: string, finalContent?: string, data?: Record<string, any>) => void;
  }) => Promise<{ action: string; confidence: number; data: Record<string, any> }>
): Promise<T> {
  const session = aiThinkingLogger.startSession(params);

  const logger = {
    addStep: (stepType: AIStepType, title: string, content: string, data?: Record<string, any>): string => {
      const step = aiThinkingLogger.addStep(session.id, { stepType, title, content, data });
      return step?.id || '';
    },
    updateStep: (stepId: string, content: string, data?: Record<string, any>): void => {
      aiThinkingLogger.updateStep(session.id, stepId, content, data);
    },
    completeStep: (stepId: string, finalContent?: string, data?: Record<string, any>): void => {
      aiThinkingLogger.completeStep(session.id, stepId, finalContent, data);
    },
  };

  try {
    const result = await fn(logger);
    await aiThinkingLogger.completeSession(session.id, {
      finalAction: result.action,
      finalConfidence: result.confidence,
      outputData: result.data,
    });
    return result as unknown as T;
  } catch (error) {
    aiThinkingLogger.failSession(session.id, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

export default aiThinkingLogger;
