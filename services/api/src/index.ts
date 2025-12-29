import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from root directory
config({ path: resolve(process.cwd(), '../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';

import { authRoutes } from './routes/auth.js';
import { botRoutes } from './routes/bots.js';
import { tradeRoutes } from './routes/trades.js';
import { critiqueRoutes } from './routes/critique.js';
import { wsRoutes } from './routes/websocket.js';
import { marketRoutes } from './routes/market.js';
import { debugRoutes } from './routes/debug.js';
import { tradingRoutes } from './routes/trading.js';
import { decisionsRoutes } from './routes/decisions.js';
import { aiRoutes } from './routes/ai-routes.js';
import { statsRoutes } from './routes/stats.js';
import { accountRoutes } from './routes/account.js';
import { backtestRoutes } from './routes/backtest.js';
import { grokRoutes } from './routes/grok.js';

const PORT = Number(process.env['API_PORT']) || 3001;
const HOST = process.env['API_HOST'] || '0.0.0.0';

async function main() {
  const fastify = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] || 'info',
    },
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true, // Allow all origins in development
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: process.env['JWT_SECRET'] || 'dev-secret-change-in-production',
  });

  await fastify.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
  });

  await fastify.register(websocket);

  // Auth decorator
  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  // API Key auth decorator
  fastify.decorate('authenticateApiKey', async function (request: any, reply: any) {
    const apiKey = request.headers['x-api-key'];
    if (!apiKey) {
      reply.status(401).send({ error: 'API key required' });
      return;
    }
    // Validate API key (implementation in routes)
    request.apiKey = apiKey;
  });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

  // Register routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(botRoutes, { prefix: '/api/bots' });
  await fastify.register(tradeRoutes, { prefix: '/api/trades' });
  await fastify.register(critiqueRoutes, { prefix: '/api/critique' });
  await fastify.register(marketRoutes, { prefix: '/api/market' });
  await fastify.register(decisionsRoutes, { prefix: '/api/decisions' });
  await fastify.register(aiRoutes, { prefix: '/api/ai' });
  await fastify.register(statsRoutes, { prefix: '/api/stats' });
  await fastify.register(accountRoutes, { prefix: '/api/account' });
  await fastify.register(debugRoutes, { prefix: '/debug' });
  await fastify.register(tradingRoutes, { prefix: '/trading' });
  await fastify.register(wsRoutes, { prefix: '/ws' });
  await fastify.register(backtestRoutes, { prefix: '/api/backtest' });
  await fastify.register(grokRoutes, { prefix: '/api/grok' });

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 API server running on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
