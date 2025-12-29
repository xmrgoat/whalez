/**
 * Community Library Routes
 * 
 * Browse, publish, remix, rate community content
 * - GET /library - Browse library items
 * - GET /library/trending - Trending items
 * - GET /library/featured - Featured items
 * - GET /library/:id - Get item details
 * - POST /library - Publish an item
 * - POST /library/:id/remix - Remix (copy to user's bots)
 * - POST /library/:id/like - Like an item
 * - POST /library/:id/rate - Rate an item
 * - POST /library/:id/comment - Comment on item
 * - GET /library/user/:wallet - Get user's published items
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@whalez/database';

export const libraryRoutes: FastifyPluginAsync = async (fastify) => {
  
  /**
   * GET /library
   * Browse library items with filters
   */
  fastify.get('/', async (request, reply) => {
    const query = request.query as {
      type?: string;
      symbol?: string;
      tag?: string;
      sort?: 'trending' | 'recent' | 'top_rated' | 'most_remixed';
      page?: string;
      limit?: string;
      search?: string;
    };
    
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 50);
    const skip = (page - 1) * limit;
    
    try {
      // Build where clause
      const where: any = { isPublic: true };
      
      if (query.type) {
        where.type = query.type.toUpperCase();
      }
      if (query.symbol) {
        where.symbol = query.symbol.toUpperCase();
      }
      if (query.tag) {
        where.tags = { has: query.tag.toLowerCase() };
      }
      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ];
      }
      
      // Build orderBy
      let orderBy: any = { createdAt: 'desc' };
      switch (query.sort) {
        case 'trending':
          // Trending = recent + popular
          orderBy = [{ likes: 'desc' }, { createdAt: 'desc' }];
          break;
        case 'top_rated':
          orderBy = { avgRating: 'desc' };
          break;
        case 'most_remixed':
          orderBy = { remixes: 'desc' };
          break;
        case 'recent':
        default:
          orderBy = { createdAt: 'desc' };
      }
      
      const [items, total] = await Promise.all([
        prisma.libraryItem.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            author: {
              select: { walletAddress: true, nickname: true, avatarUrl: true }
            },
            _count: {
              select: { ratings: true, comments: true }
            }
          }
        }),
        prisma.libraryItem.count({ where }),
      ]);
      
      return {
        success: true,
        items: items.map(item => ({
          ...item,
          ratingsCount: item._count.ratings,
          commentsCount: item._count.comments,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('[Library] Error fetching items:', error);
      return reply.status(500).send({ error: 'Failed to fetch library items' });
    }
  });
  
  /**
   * GET /library/trending
   * Get trending items (most liked in last 7 days)
   */
  fastify.get('/trending', async (request, reply) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const items = await prisma.libraryItem.findMany({
        where: {
          isPublic: true,
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: [
          { likes: 'desc' },
          { remixes: 'desc' },
        ],
        take: 10,
        include: {
          author: {
            select: { walletAddress: true, nickname: true }
          }
        }
      });
      
      return { success: true, items };
    } catch (error) {
      console.error('[Library] Error fetching trending:', error);
      return reply.status(500).send({ error: 'Failed to fetch trending items' });
    }
  });
  
  /**
   * GET /library/featured
   * Get featured items (curated by admins)
   */
  fastify.get('/featured', async (request, reply) => {
    try {
      const items = await prisma.libraryItem.findMany({
        where: {
          isPublic: true,
          isFeatured: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          author: {
            select: { walletAddress: true, nickname: true }
          }
        }
      });
      
      return { success: true, items };
    } catch (error) {
      console.error('[Library] Error fetching featured:', error);
      return reply.status(500).send({ error: 'Failed to fetch featured items' });
    }
  });
  
  /**
   * GET /library/:id
   * Get item details
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const item = await prisma.libraryItem.findUnique({
        where: { id },
        include: {
          author: {
            select: { walletAddress: true, nickname: true, avatarUrl: true }
          },
          ratings: {
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
          comments: {
            take: 20,
            orderBy: { createdAt: 'desc' },
          },
          sourceBot: {
            select: { id: true, name: true, totalTrades: true, totalPnlPct: true }
          }
        }
      });
      
      if (!item) {
        return reply.status(404).send({ error: 'Item not found' });
      }
      
      // Increment view count
      await prisma.libraryItem.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
      
      return { success: true, item };
    } catch (error) {
      console.error('[Library] Error fetching item:', error);
      return reply.status(500).send({ error: 'Failed to fetch item' });
    }
  });
  
  /**
   * POST /library
   * Publish an item to the library
   */
  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      wallet: string;
      type: string;
      name: string;
      description: string;
      config: any;
      tags?: string[];
      symbol?: string;
      performance?: any;
      sourceBotId?: string;
    };
    
    if (!body.wallet || !body.type || !body.name || !body.description || !body.config) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }
    
    const walletAddress = body.wallet.toLowerCase();
    
    try {
      // Ensure wallet profile exists
      await prisma.walletProfile.upsert({
        where: { walletAddress },
        create: { walletAddress },
        update: { lastActiveAt: new Date() },
      });
      
      // Create library item
      const item = await prisma.libraryItem.create({
        data: {
          authorWallet: walletAddress,
          type: body.type.toUpperCase() as any,
          name: body.name,
          description: body.description,
          config: body.config,
          tags: body.tags?.map(t => t.toLowerCase()) || [],
          symbol: body.symbol?.toUpperCase() || null,
          performance: body.performance || null,
          sourceBotId: body.sourceBotId || null,
          isPublic: true,
        },
      });
      
      console.log(`[Library] Published item ${item.id} by ${walletAddress}`);
      
      return { success: true, item };
    } catch (error) {
      console.error('[Library] Error publishing item:', error);
      return reply.status(500).send({ error: 'Failed to publish item' });
    }
  });
  
  /**
   * POST /library/:id/remix
   * Remix an item (copy to user's bots)
   */
  fastify.post('/:id/remix', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { wallet } = request.body as { wallet: string };
    
    if (!wallet) {
      return reply.status(400).send({ error: 'Wallet address required' });
    }
    
    const walletAddress = wallet.toLowerCase();
    
    try {
      // Get the library item
      const item = await prisma.libraryItem.findUnique({
        where: { id },
      });
      
      if (!item) {
        return reply.status(404).send({ error: 'Item not found' });
      }
      
      if (!item.isPublic && item.authorWallet !== walletAddress) {
        return reply.status(403).send({ error: 'Item is not public' });
      }
      
      // Check user's bot limit
      const existingCount = await prisma.userBot.count({
        where: { walletAddress }
      });
      
      if (existingCount >= 5) {
        return reply.status(400).send({ error: 'Maximum 5 bots allowed. Delete one to remix.' });
      }
      
      // Ensure wallet profile exists
      await prisma.walletProfile.upsert({
        where: { walletAddress },
        create: { walletAddress },
        update: { lastActiveAt: new Date() },
      });
      
      // Create a new bot from the library item
      const config = item.config as any;
      
      const newBot = await prisma.userBot.create({
        data: {
          walletAddress,
          name: `${item.name} (Remix)`,
          description: `Remixed from ${item.name}`,
          symbol: item.symbol || 'BTC',
          timeframe: config.timeframe || '1h',
          strategyType: 'TEMPLATE',
          strategyConfig: config.strategyConfig || config,
          riskConfig: config.riskConfig || {
            positionSizePct: 2,
            maxLeverage: 5,
            stopLossPct: 2,
            takeProfitPct: 4,
          },
          status: 'DRAFT',
          remixedFromId: id,
        },
      });
      
      // Increment remix count
      await prisma.libraryItem.update({
        where: { id },
        data: { remixes: { increment: 1 } },
      });
      
      console.log(`[Library] Remixed item ${id} to bot ${newBot.id} for ${walletAddress}`);
      
      return { 
        success: true, 
        bot: newBot,
        message: 'Bot created from remix. You can now customize it.',
      };
    } catch (error) {
      console.error('[Library] Error remixing item:', error);
      return reply.status(500).send({ error: 'Failed to remix item' });
    }
  });
  
  /**
   * POST /library/:id/like
   * Like/unlike an item
   */
  fastify.post('/:id/like', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { wallet, unlike } = request.body as { wallet: string; unlike?: boolean };
    
    if (!wallet) {
      return reply.status(400).send({ error: 'Wallet address required' });
    }
    
    try {
      const item = await prisma.libraryItem.findUnique({ where: { id } });
      
      if (!item) {
        return reply.status(404).send({ error: 'Item not found' });
      }
      
      // Update like count
      await prisma.libraryItem.update({
        where: { id },
        data: { 
          likes: unlike ? { decrement: 1 } : { increment: 1 }
        },
      });
      
      return { 
        success: true, 
        liked: !unlike,
        newLikes: item.likes + (unlike ? -1 : 1),
      };
    } catch (error) {
      console.error('[Library] Error liking item:', error);
      return reply.status(500).send({ error: 'Failed to like item' });
    }
  });
  
  /**
   * POST /library/:id/rate
   * Rate an item (1-5 stars)
   */
  fastify.post('/:id/rate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { 
      wallet: string; 
      rating: number; 
      review?: string;
    };
    
    if (!body.wallet || !body.rating) {
      return reply.status(400).send({ error: 'Wallet and rating required' });
    }
    
    if (body.rating < 1 || body.rating > 5) {
      return reply.status(400).send({ error: 'Rating must be between 1 and 5' });
    }
    
    const walletAddress = body.wallet.toLowerCase();
    
    try {
      // Upsert rating
      await prisma.libraryRating.upsert({
        where: {
          libraryItemId_walletAddress: {
            libraryItemId: id,
            walletAddress,
          }
        },
        create: {
          libraryItemId: id,
          walletAddress,
          rating: body.rating,
          review: body.review || null,
        },
        update: {
          rating: body.rating,
          review: body.review || null,
        },
      });
      
      // Recalculate average rating
      const ratings = await prisma.libraryRating.findMany({
        where: { libraryItemId: id },
        select: { rating: true },
      });
      
      const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
      
      await prisma.libraryItem.update({
        where: { id },
        data: {
          avgRating,
          totalRatings: ratings.length,
        },
      });
      
      return { 
        success: true, 
        avgRating,
        totalRatings: ratings.length,
      };
    } catch (error) {
      console.error('[Library] Error rating item:', error);
      return reply.status(500).send({ error: 'Failed to rate item' });
    }
  });
  
  /**
   * POST /library/:id/comment
   * Add a comment to an item
   */
  fastify.post('/:id/comment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { 
      wallet: string; 
      content: string;
      parentId?: string;
    };
    
    if (!body.wallet || !body.content) {
      return reply.status(400).send({ error: 'Wallet and content required' });
    }
    
    const walletAddress = body.wallet.toLowerCase();
    
    try {
      const comment = await prisma.libraryComment.create({
        data: {
          libraryItemId: id,
          walletAddress,
          content: body.content,
          parentId: body.parentId || null,
        },
      });
      
      return { success: true, comment };
    } catch (error) {
      console.error('[Library] Error adding comment:', error);
      return reply.status(500).send({ error: 'Failed to add comment' });
    }
  });
  
  /**
   * GET /library/user/:wallet
   * Get all items published by a user
   */
  fastify.get('/user/:wallet', async (request, reply) => {
    const { wallet } = request.params as { wallet: string };
    
    try {
      const items = await prisma.libraryItem.findMany({
        where: { 
          authorWallet: wallet.toLowerCase(),
          isPublic: true,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { ratings: true, comments: true }
          }
        }
      });
      
      return { success: true, items };
    } catch (error) {
      console.error('[Library] Error fetching user items:', error);
      return reply.status(500).send({ error: 'Failed to fetch user items' });
    }
  });
  
  /**
   * GET /library/verify/:id
   * Verify on-chain performance for an item
   */
  fastify.get('/verify/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const item = await prisma.libraryItem.findUnique({
        where: { id },
        include: {
          sourceBot: {
            include: {
              trades: {
                where: { status: 'CLOSED' },
                select: {
                  entryTxHash: true,
                  exitTxHash: true,
                  pnl: true,
                  pnlPct: true,
                  entryTime: true,
                  exitTime: true,
                }
              }
            }
          }
        }
      });
      
      if (!item) {
        return reply.status(404).send({ error: 'Item not found' });
      }
      
      // Collect all transaction hashes
      const txHashes: string[] = [];
      if (item.sourceBot?.trades) {
        for (const trade of item.sourceBot.trades) {
          if (trade.entryTxHash) txHashes.push(trade.entryTxHash);
          if (trade.exitTxHash) txHashes.push(trade.exitTxHash);
        }
      }
      
      // Calculate verified performance
      const trades = item.sourceBot?.trades || [];
      const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const winningTrades = trades.filter(t => (t.pnl || 0) > 0).length;
      const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
      
      return {
        success: true,
        verification: {
          isVerified: txHashes.length > 0,
          txCount: txHashes.length,
          txHashes: txHashes.slice(0, 10), // First 10 for display
          performance: {
            totalTrades: trades.length,
            winRate,
            totalPnl,
          },
          hyperliquidExplorerUrl: 'https://app.hyperliquid.xyz/explorer',
        },
      };
    } catch (error) {
      console.error('[Library] Error verifying item:', error);
      return reply.status(500).send({ error: 'Failed to verify item' });
    }
  });
};
