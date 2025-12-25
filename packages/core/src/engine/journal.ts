import type { Trade, Signal, BotEvent } from '../types/index.js';

/**
 * Journal
 * Records trades, signals, and events for analysis and critique.
 */

export interface JournalEntry {
  id: string;
  botId: string;
  type: 'trade' | 'signal' | 'event';
  data: Trade | Signal | BotEvent;
  timestamp: number;
}

export interface JournalStorage {
  save(entry: JournalEntry): Promise<void>;
  getByBotId(botId: string, type?: string, from?: number, to?: number): Promise<JournalEntry[]>;
  getTrades(botId: string, limit?: number): Promise<Trade[]>;
  getSignals(botId: string, limit?: number): Promise<Signal[]>;
  getClosedTrades(botId: string, limit?: number): Promise<Trade[]>;
}

/**
 * In-memory journal storage (for development/testing)
 */
export class InMemoryJournalStorage implements JournalStorage {
  private entries: JournalEntry[] = [];

  async save(entry: JournalEntry): Promise<void> {
    this.entries.push(entry);
  }

  async getByBotId(
    botId: string, 
    type?: string, 
    from?: number, 
    to?: number
  ): Promise<JournalEntry[]> {
    return this.entries.filter(e => {
      if (e.botId !== botId) return false;
      if (type && e.type !== type) return false;
      if (from && e.timestamp < from) return false;
      if (to && e.timestamp > to) return false;
      return true;
    });
  }

  async getTrades(botId: string, limit?: number): Promise<Trade[]> {
    const entries = await this.getByBotId(botId, 'trade');
    const trades = entries.map(e => e.data as Trade);
    return limit ? trades.slice(-limit) : trades;
  }

  async getSignals(botId: string, limit?: number): Promise<Signal[]> {
    const entries = await this.getByBotId(botId, 'signal');
    const signals = entries.map(e => e.data as Signal);
    return limit ? signals.slice(-limit) : signals;
  }

  async getClosedTrades(botId: string, limit?: number): Promise<Trade[]> {
    const trades = await this.getTrades(botId);
    const closed = trades.filter(t => t.status === 'closed');
    return limit ? closed.slice(-limit) : closed;
  }

  clear(): void {
    this.entries = [];
  }
}

/**
 * Journal class for recording and retrieving trading data
 */
export class Journal {
  private storage: JournalStorage;
  private botId: string;

  constructor(botId: string, storage?: JournalStorage) {
    this.botId = botId;
    this.storage = storage || new InMemoryJournalStorage();
  }

  /**
   * Record a trade
   */
  async recordTrade(trade: Trade): Promise<void> {
    const entry: JournalEntry = {
      id: `trade-${trade.id}`,
      botId: this.botId,
      type: 'trade',
      data: trade,
      timestamp: Date.now(),
    };
    await this.storage.save(entry);
  }

  /**
   * Record a signal
   */
  async recordSignal(signal: Signal): Promise<void> {
    const entry: JournalEntry = {
      id: `signal-${signal.id}`,
      botId: this.botId,
      type: 'signal',
      data: signal,
      timestamp: Date.now(),
    };
    await this.storage.save(entry);
  }

  /**
   * Record an event
   */
  async recordEvent(event: BotEvent): Promise<void> {
    const entry: JournalEntry = {
      id: `event-${event.type}-${event.timestamp}`,
      botId: this.botId,
      type: 'event',
      data: event,
      timestamp: event.timestamp,
    };
    await this.storage.save(entry);
  }

  /**
   * Get recent trades
   */
  async getTrades(limit?: number): Promise<Trade[]> {
    return this.storage.getTrades(this.botId, limit);
  }

  /**
   * Get closed trades
   */
  async getClosedTrades(limit?: number): Promise<Trade[]> {
    return this.storage.getClosedTrades(this.botId, limit);
  }

  /**
   * Get recent signals
   */
  async getSignals(limit?: number): Promise<Signal[]> {
    return this.storage.getSignals(this.botId, limit);
  }

  /**
   * Get last N closed trades for critique
   */
  async getTradesForCritique(count: number = 5): Promise<Trade[]> {
    const closed = await this.getClosedTrades();
    return closed.slice(-count);
  }

  /**
   * Get all entries in a time range
   */
  async getEntries(from?: number, to?: number): Promise<JournalEntry[]> {
    return this.storage.getByBotId(this.botId, undefined, from, to);
  }
}
