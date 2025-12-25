/**
 * WebSocket Client for Real-Time Data
 */

export type WsMessageType = 
  | 'connected'
  | 'subscribed'
  | 'unsubscribed'
  | 'candles:snapshot'
  | 'candles:update'
  | 'bot:decision'
  | 'bot:position'
  | 'bot:trade'
  | 'bot:status'
  | 'pong'
  | 'error';

export interface WsMessage {
  type: WsMessageType;
  timestamp: number;
  [key: string]: any;
}

export interface WsClientOptions {
  url: string;
  token?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

type MessageHandler = (message: WsMessage) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private options: Required<WsClientOptions>;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  public connected = false;
  public isDelayed = false;

  constructor(options: WsClientOptions) {
    this.options = {
      url: options.url,
      token: options.token || '',
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
    };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.options.token 
        ? `${this.options.url}?token=${this.options.token}`
        : this.options.url;

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('[WS] Connected');
          this.connected = true;
          this.isDelayed = false;
          this.reconnectAttempts = 0;
          this.startPing();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WsMessage;
            this.handleMessage(message);
          } catch (err) {
            console.error('[WS] Failed to parse message:', err);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error);
          this.isDelayed = true;
        };

        this.ws.onclose = () => {
          console.log('[WS] Disconnected');
          this.connected = false;
          this.stopPing();
          this.handleReconnect();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.options.reconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private handleReconnect(): void {
    if (!this.options.reconnect) return;
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectInterval * this.reconnectAttempts;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(message: WsMessage): void {
    // Emit to type-specific handlers
    const typeHandlers = this.handlers.get(message.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(message);
      }
    }

    // Emit to wildcard handlers
    const allHandlers = this.handlers.get('*');
    if (allHandlers) {
      for (const handler of allHandlers) {
        handler(message);
      }
    }
  }

  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  off(type: string, handler: MessageHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  // ============ Subscription Helpers ============

  subscribeCandles(symbol: string, timeframe: string): void {
    this.send({
      type: 'subscribe',
      channel: 'candles',
      symbol,
      timeframe,
    });
  }

  unsubscribeCandles(symbol: string, timeframe: string): void {
    this.send({
      type: 'unsubscribe',
      channel: 'candles',
      symbol,
      timeframe,
    });
  }

  subscribeBot(botId: string): void {
    this.send({
      type: 'subscribe',
      channel: 'bot',
      botId,
    });
  }

  unsubscribeBot(botId: string): void {
    this.send({
      type: 'unsubscribe',
      channel: 'bot',
      botId,
    });
  }
}

// Singleton instance
let wsClient: WsClient | null = null;

export function getWsClient(): WsClient {
  if (!wsClient) {
    const wsUrl = process.env['NEXT_PUBLIC_WS_URL'] || 'ws://localhost:3001/ws';
    wsClient = new WsClient({ url: wsUrl });
  }
  return wsClient;
}

export function initWsClient(token?: string): WsClient {
  const wsUrl = process.env['NEXT_PUBLIC_WS_URL'] || 'ws://localhost:3001/ws';
  wsClient = new WsClient({ url: wsUrl, token });
  return wsClient;
}
