import { FastifyPluginAsync } from 'fastify';
import { WebSocket } from 'ws';

/**
 * WebSocket Real-Time API
 * 
 * Channels:
 * - candles:snapshot - Initial candle history
 * - candles:update - Real-time candle updates (current/closed)
 * - bot:decision - Bot trading decisions with confirmations
 * - bot:position - Current position state
 * - bot:trade - Trade executed (paper/live)
 * - bot:status - Bot running/stopped, mode paper/live
 */

// Connection state
interface WsClient {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>; // "candles:BTC-PERP:1h", "bot:abc123"
  lastActivity: number;
}

// Store active connections
const clients = new Map<WebSocket, WsClient>();
const userConnections = new Map<string, Set<WebSocket>>();

// Throttle state for candle updates (max 10/sec per symbol)
const candleThrottle = new Map<string, number>();
const CANDLE_THROTTLE_MS = 100; // 10 updates/sec max

export const wsRoutes: FastifyPluginAsync = async (fastify) => {
  // WebSocket endpoint for real-time updates
  fastify.get('/', { websocket: true }, (connection: any, req: any) => {
    const ws = connection.socket as WebSocket;
    const token = req.query?.token as string;

    // Verify JWT token (optional for public candle data)
    let userId = 'anonymous';
    if (token) {
      try {
        const decoded = fastify.jwt.verify(token) as { userId: string };
        userId = decoded.userId;
      } catch {
        // Allow anonymous for public data
      }
    }

    // Create client state
    const client: WsClient = {
      ws,
      userId,
      subscriptions: new Set(),
      lastActivity: Date.now(),
    };

    clients.set(ws, client);

    // Track user connections
    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set());
    }
    userConnections.get(userId)!.add(ws);

    console.log(`[WS] Client connected (user: ${userId})`);

    // Send welcome message
    sendToClient(ws, {
      type: 'connected',
      userId,
      timestamp: Date.now(),
    });

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        client.lastActivity = Date.now();
        handleMessage(client, message);
      } catch (err) {
        sendToClient(ws, { type: 'error', message: 'Invalid message format' });
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      clients.delete(ws);
      userConnections.get(userId)?.delete(ws);
      if (userConnections.get(userId)?.size === 0) {
        userConnections.delete(userId);
      }
      console.log(`[WS] Client disconnected (user: ${userId})`);
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeat);
      }
    }, 30000);
  });
};

function sendToClient(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function handleMessage(client: WsClient, message: any) {
  const { ws } = client;

  switch (message.type) {
    case 'subscribe':
      handleSubscribe(client, message);
      break;

    case 'unsubscribe':
      handleUnsubscribe(client, message);
      break;

    case 'ping':
      sendToClient(ws, { type: 'pong', timestamp: Date.now() });
      break;

    case 'get_status':
      sendToClient(ws, {
        type: 'status',
        subscriptions: Array.from(client.subscriptions),
        timestamp: Date.now(),
      });
      break;

    default:
      sendToClient(ws, { type: 'error', message: 'Unknown message type' });
  }
}

function handleSubscribe(client: WsClient, message: any) {
  const { channel, symbol, timeframe, botId } = message;
  let subKey = '';

  switch (channel) {
    case 'candles':
      if (!symbol || !timeframe) {
        sendToClient(client.ws, { type: 'error', message: 'Missing symbol or timeframe' });
        return;
      }
      subKey = `candles:${symbol}:${timeframe}`;
      break;

    case 'bot':
      if (!botId) {
        sendToClient(client.ws, { type: 'error', message: 'Missing botId' });
        return;
      }
      subKey = `bot:${botId}`;
      break;

    default:
      sendToClient(client.ws, { type: 'error', message: 'Unknown channel' });
      return;
  }

  client.subscriptions.add(subKey);
  console.log(`[WS] Subscribed: ${subKey}`);

  sendToClient(client.ws, {
    type: 'subscribed',
    channel,
    key: subKey,
    timestamp: Date.now(),
  });
}

function handleUnsubscribe(client: WsClient, message: any) {
  const { channel, symbol, timeframe, botId } = message;
  let subKey = '';

  switch (channel) {
    case 'candles':
      subKey = `candles:${symbol}:${timeframe}`;
      break;
    case 'bot':
      subKey = `bot:${botId}`;
      break;
    default:
      return;
  }

  client.subscriptions.delete(subKey);
  console.log(`[WS] Unsubscribed: ${subKey}`);

  sendToClient(client.ws, {
    type: 'unsubscribed',
    channel,
    key: subKey,
    timestamp: Date.now(),
  });
}

// ============ Broadcast Functions ============

/**
 * Broadcast candle snapshot (initial history)
 */
export function broadcastCandleSnapshot(symbol: string, timeframe: string, candles: any[]) {
  const subKey = `candles:${symbol}:${timeframe}`;
  const data = {
    type: 'candles:snapshot',
    symbol,
    timeframe,
    candles,
    timestamp: Date.now(),
  };

  broadcastToSubscribers(subKey, data);
}

/**
 * Broadcast candle update (throttled)
 */
export function broadcastCandleUpdate(symbol: string, timeframe: string, candle: any, isClosed: boolean) {
  const subKey = `candles:${symbol}:${timeframe}`;
  
  // Throttle check
  const lastSent = candleThrottle.get(subKey) || 0;
  if (Date.now() - lastSent < CANDLE_THROTTLE_MS && !isClosed) {
    return; // Skip, too fast (unless candle closed)
  }
  candleThrottle.set(subKey, Date.now());

  const data = {
    type: 'candles:update',
    symbol,
    timeframe,
    candle,
    isClosed,
    timestamp: Date.now(),
  };

  broadcastToSubscribers(subKey, data);
}

/**
 * Broadcast bot decision
 */
export function broadcastBotDecision(botId: string, decision: {
  action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE';
  confirmations: Array<{ name: string; passed: boolean; reason: string }>;
  confidence: number;
  reason: string;
}) {
  const subKey = `bot:${botId}`;
  const data = {
    type: 'bot:decision',
    botId,
    decision,
    timestamp: Date.now(),
  };

  broadcastToSubscribers(subKey, data);
}

/**
 * Broadcast bot position update
 */
export function broadcastBotPosition(botId: string, position: {
  symbol: string;
  side: 'long' | 'short' | 'none';
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
} | null) {
  const subKey = `bot:${botId}`;
  const data = {
    type: 'bot:position',
    botId,
    position,
    timestamp: Date.now(),
  };

  broadcastToSubscribers(subKey, data);
}

/**
 * Broadcast bot trade
 */
export function broadcastBotTrade(botId: string, trade: {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  action: 'open' | 'close';
  price: number;
  quantity: number;
  pnl?: number;
  mode: 'paper' | 'live';
}) {
  const subKey = `bot:${botId}`;
  const data = {
    type: 'bot:trade',
    botId,
    trade,
    timestamp: Date.now(),
  };

  broadcastToSubscribers(subKey, data);
}

/**
 * Broadcast bot status
 */
export function broadcastBotStatus(botId: string, status: {
  running: boolean;
  mode: 'paper' | 'live';
  armed: boolean;
  symbol: string;
  timeframe: string;
  wsConnected: boolean;
  isDelayed: boolean;
}) {
  const subKey = `bot:${botId}`;
  const data = {
    type: 'bot:status',
    botId,
    status,
    timestamp: Date.now(),
  };

  broadcastToSubscribers(subKey, data);
}

// ============ Internal Helpers ============

function broadcastToSubscribers(subKey: string, data: any) {
  const message = JSON.stringify(data);
  
  for (const [ws, client] of clients) {
    if (client.subscriptions.has(subKey) && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Broadcast to specific user (for authenticated events)
 */
export function broadcastToUser(userId: string, data: any) {
  const connections = userConnections.get(userId);
  if (!connections) return;

  const message = JSON.stringify(data);
  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

// Legacy exports for compatibility
export function broadcastBotEvent(userId: string, botId: string, event: any) {
  broadcastToUser(userId, {
    type: 'bot_event',
    botId,
    event,
    timestamp: Date.now(),
  });
}

export function broadcastTradeUpdate(userId: string, botId: string, trade: any) {
  broadcastToUser(userId, {
    type: 'trade_update',
    botId,
    trade,
    timestamp: Date.now(),
  });
}

export function broadcastSignal(userId: string, botId: string, signal: any) {
  broadcastToUser(userId, {
    type: 'signal',
    botId,
    signal,
    timestamp: Date.now(),
  });
}

export function broadcastCritiqueReport(userId: string, botId: string, report: any) {
  broadcastToUser(userId, {
    type: 'critique_report',
    botId,
    report,
    timestamp: Date.now(),
  });
}

export function broadcastCandle(userId: string, botId: string, candle: any) {
  broadcastToUser(userId, {
    type: 'candle',
    botId,
    candle,
    timestamp: Date.now(),
  });
}
