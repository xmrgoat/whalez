import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@whalez/database';

/**
 * AI Routes - Manage AI rules, suggestions, insights and learning
 */

// Guardrail limits that users cannot exceed
const GUARDRAIL_LIMITS = {
  leverage: { min: 1, max: 20, default: 3 },
  positionSizePct: { min: 0.1, max: 10, default: 2 },
  stopLossPct: { min: 0.5, max: 20, default: 3 },
  takeProfitPct: { min: 1, max: 50, default: 6 },
  maxDrawdownPct: { min: 5, max: 30, default: 10 },
  minConfirmations: { min: 2, max: 5, default: 3 },
};

export const aiRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ============ RULES ============
  
  // Get all rules (system + user)
  fastify.get('/rules', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { botId, category } = request.query as { botId?: string; category?: string };

    const where: any = {
      OR: [
        { botId: null },
        { botId: botId || undefined },
      ],
      isActive: true,
    };

    if (category) {
      where.category = category;
    }

    const rules = await prisma.aIRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return { rules, guardrailLimits: GUARDRAIL_LIMITS };
  });

  // Create custom rule
  fastify.post('/rules', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { botId, category, name, description, template, priority } = request.body as {
      botId: string;
      category: string;
      name: string;
      description: string;
      template: string;
      priority?: number;
    };

    const validCategories = ['MACRO_ANALYSIS', 'TECHNICAL_ANALYSIS', 'RISK_MANAGEMENT', 
                           'ENTRY_CONDITIONS', 'EXIT_CONDITIONS', 'SELF_CRITIQUE', 'USER_CUSTOM'];
    if (!validCategories.includes(category)) {
      return reply.status(400).send({ error: 'Invalid category' });
    }

    const dangerousPatterns = ['eval(', 'exec(', 'system(', 'rm -rf', 'DROP TABLE'];
    for (const pattern of dangerousPatterns) {
      if (template.includes(pattern)) {
        return reply.status(400).send({ error: 'Template contains forbidden patterns' });
      }
    }

    const rule = await prisma.aIRule.create({
      data: {
        botId,
        category: category as any,
        name,
        description,
        template,
        isSystem: false,
        priority: Math.min(priority || 0, 50),
      },
    });

    return { rule };
  });

  // Delete rule (only non-system)
  fastify.delete('/rules/:id', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.aIRule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Rule not found' });
    }
    if (existing.isSystem) {
      return reply.status(403).send({ error: 'Cannot delete system rules' });
    }

    await prisma.aIRule.delete({ where: { id } });
    return { success: true };
  });

  // ============ SUGGESTIONS ============

  // Get suggestions for bot
  fastify.get('/suggestions', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { botId, status, limit = 20 } = request.query as {
      botId: string;
      status?: string;
      limit?: number;
    };

    const where: any = { botId };
    if (status) {
      where.status = status;
    }

    const suggestions = await prisma.aISuggestion.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: Number(limit),
    });

    return { suggestions };
  });

  // Apply suggestion
  fastify.post('/suggestions/:id/apply', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { id } = request.params as { id: string };

    const suggestion = await prisma.aISuggestion.findUnique({ where: { id } });
    if (!suggestion) {
      return reply.status(404).send({ error: 'Suggestion not found' });
    }

    if (suggestion.parameters && suggestion.type === 'PARAMETER_CHANGE') {
      const bot = await prisma.bot.findUnique({ where: { id: suggestion.botId } });
      if (bot) {
        const config = bot.config as Record<string, any>;
        const params = suggestion.parameters as Record<string, any>;
        
        const guardrails = await prisma.userGuardrail.findMany({
          where: { botId: suggestion.botId, isActive: true },
        });

        for (const [key, value] of Object.entries(params)) {
          const guardrail = guardrails.find((g: any) => g.parameter === key);
          if (guardrail) {
            if (guardrail.minValue !== null && value < guardrail.minValue) {
              return reply.status(400).send({ 
                error: `Parameter ${key} (${value}) is below minimum (${guardrail.minValue})` 
              });
            }
            if (guardrail.maxValue !== null && value > guardrail.maxValue) {
              return reply.status(400).send({ 
                error: `Parameter ${key} (${value}) exceeds maximum (${guardrail.maxValue})` 
              });
            }
          }
          
          const limit = GUARDRAIL_LIMITS[key as keyof typeof GUARDRAIL_LIMITS];
          if (limit) {
            if (value < limit.min || value > limit.max) {
              return reply.status(400).send({
                error: `Parameter ${key} must be between ${limit.min} and ${limit.max}`
              });
            }
          }
        }

        Object.assign(config, params);
        await prisma.bot.update({
          where: { id: suggestion.botId },
          data: { config },
        });

        for (const [key, value] of Object.entries(params)) {
          await prisma.paramChange.create({
            data: {
              botId: suggestion.botId,
              parameter: key,
              previousValue: (bot.config as any)[key],
              newValue: value,
              reason: suggestion.reasoning,
              applied: true,
            },
          });
        }
      }
    }

    await prisma.aISuggestion.update({
      where: { id },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });

    return { success: true };
  });

  // Reject suggestion
  fastify.post('/suggestions/:id/reject', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const { feedback } = request.body as { feedback?: string };

    const suggestion = await prisma.aISuggestion.findUnique({ where: { id } });
    if (!suggestion) {
      return reply.status(404).send({ error: 'Suggestion not found' });
    }

    await prisma.aISuggestion.update({
      where: { id },
      data: { 
        status: 'REJECTED', 
        reviewedAt: new Date(),
        userFeedback: feedback,
      },
    });

    return { success: true };
  });

  // ============ INSIGHTS ============

  fastify.get('/insights', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { botId, type, limit = 50 } = request.query as {
      botId: string;
      type?: string;
      limit?: number;
    };

    const where: any = { botId, isValid: true };
    if (type) {
      where.type = type;
    }

    const insights = await prisma.aIInsight.findMany({
      where,
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
      take: Number(limit),
    });

    return { insights };
  });

  // ============ GUARDRAILS ============

  fastify.get('/guardrails', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { botId } = request.query as { botId: string };

    const guardrails = await prisma.userGuardrail.findMany({
      where: { botId },
    });

    return { guardrails, limits: GUARDRAIL_LIMITS };
  });

  fastify.post('/guardrails', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply: any) => {
    const { botId, parameter, minValue, maxValue, description } = request.body as {
      botId: string;
      parameter: string;
      minValue?: number;
      maxValue?: number;
      description?: string;
    };

    const limit = GUARDRAIL_LIMITS[parameter as keyof typeof GUARDRAIL_LIMITS];
    if (limit) {
      if (minValue !== undefined && minValue < limit.min) {
        return reply.status(400).send({ 
          error: `Minimum for ${parameter} cannot be below system limit (${limit.min})` 
        });
      }
      if (maxValue !== undefined && maxValue > limit.max) {
        return reply.status(400).send({ 
          error: `Maximum for ${parameter} cannot exceed system limit (${limit.max})` 
        });
      }
    }

    const guardrail = await prisma.userGuardrail.upsert({
      where: { botId_parameter: { botId, parameter } },
      create: { botId, parameter, minValue, maxValue, description },
      update: { minValue, maxValue, description },
    });

    return { guardrail };
  });

  // ============ LEARNING ============

  fastify.get('/learning', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { botId, type, limit = 100 } = request.query as {
      botId: string;
      type?: string;
      limit?: number;
    };

    const where: any = { botId };
    if (type) {
      where.entryType = type;
    }

    const entries = await prisma.learningEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });

    return { entries };
  });

  // ============ ANALYSIS ============

  fastify.get('/analysis', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any) => {
    const { botId, type, limit = 20 } = request.query as {
      botId?: string;
      type?: string;
      limit?: number;
    };

    const where: any = {};
    if (botId) where.botId = botId;
    if (type) where.analysisType = type;

    const analyses = await prisma.grokAnalysis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });

    return { analyses };
  });
};
