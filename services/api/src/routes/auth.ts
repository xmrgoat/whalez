import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@whalez/database';
import crypto from 'crypto';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const CreateApiKeySchema = z.object({
  name: z.string(),
  scopes: z.array(z.enum(['read', 'trade', 'manage'])),
  expiresInDays: z.number().optional(),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register
  fastify.post('/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body);

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        password: hashedPassword,
        name: body.name,
      },
    });

    const token = fastify.jwt.sign({ userId: user.id });

    return { token, user: { id: user.id, email: user.email, name: user.name } };
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(body.password, user.password);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ userId: user.id });

    return { token, user: { id: user.id, email: user.email, name: user.name } };
  });

  // Get current user
  fastify.get('/me', {
    preHandler: [(fastify as any).authenticate],
  }, async (request) => {
    const { userId } = request.user as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    return { user };
  });

  // Create API key
  fastify.post('/api-keys', {
    preHandler: [(fastify as any).authenticate],
  }, async (request) => {
    const { userId } = request.user as { userId: string };
    const body = CreateApiKeySchema.parse(request.body);

    // Generate API key
    const rawKey = `ta_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: body.name,
        keyHash,
        scopes: body.scopes,
        expiresAt,
      },
    });

    // Return raw key only once
    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey, // Only shown once!
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    };
  });

  // List API keys
  fastify.get('/api-keys', {
    preHandler: [(fastify as any).authenticate],
  }, async (request) => {
    const { userId } = request.user as { userId: string };

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      select: {
        id: true,
        name: true,
        scopes: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return { apiKeys };
  });

  // Revoke API key
  fastify.delete('/api-keys/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const apiKey = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!apiKey) {
      return reply.status(404).send({ error: 'API key not found' });
    }

    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  });
};
