import { prisma } from '@whalez/database';
import { BotRunner } from './bot-runner.js';

const POLL_INTERVAL = 5000; // 5 seconds

// Active bot runners
const runners = new Map<string, BotRunner>();

async function main() {
  console.log('🤖 Trading Agent Worker starting...');

  // Load running bots from database
  await loadRunningBots();

  // Poll for bot status changes
  setInterval(syncBots, POLL_INTERVAL);

  // Handle shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('✅ Worker ready');
}

async function loadRunningBots() {
  const runningBots = await prisma.bot.findMany({
    where: { status: 'RUNNING' },
  });

  console.log(`Found ${runningBots.length} running bots`);

  for (const bot of runningBots) {
    await startBot(bot.id);
  }
}

async function syncBots() {
  try {
    // Get all bots that should be running
    const shouldRun = await prisma.bot.findMany({
      where: { status: 'RUNNING' },
      select: { id: true },
    });

    const shouldRunIds = new Set(shouldRun.map(b => b.id));

    // Stop bots that shouldn't be running
    for (const [botId, runner] of runners) {
      if (!shouldRunIds.has(botId)) {
        console.log(`Stopping bot ${botId} (status changed)`);
        await stopBot(botId);
      }
    }

    // Start bots that should be running but aren't
    for (const { id } of shouldRun) {
      if (!runners.has(id)) {
        console.log(`Starting bot ${id}`);
        await startBot(id);
      }
    }
  } catch (error) {
    console.error('Error syncing bots:', error);
  }
}

async function startBot(botId: string) {
  if (runners.has(botId)) {
    console.log(`Bot ${botId} already running`);
    return;
  }

  try {
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { user: { select: { id: true } } },
    });

    if (!bot) {
      console.error(`Bot ${botId} not found`);
      return;
    }

    const runner = new BotRunner(bot);
    runners.set(botId, runner);
    
    await runner.start();
    console.log(`✅ Bot ${botId} (${bot.name}) started`);
  } catch (error) {
    console.error(`Failed to start bot ${botId}:`, error);
    
    // Update bot status to ERROR
    await prisma.bot.update({
      where: { id: botId },
      data: { status: 'ERROR' },
    });
  }
}

async function stopBot(botId: string) {
  const runner = runners.get(botId);
  if (!runner) return;

  try {
    await runner.stop();
    runners.delete(botId);
    console.log(`🛑 Bot ${botId} stopped`);
  } catch (error) {
    console.error(`Error stopping bot ${botId}:`, error);
  }
}

async function shutdown() {
  console.log('\n🛑 Shutting down worker...');

  // Stop all bots
  for (const [botId] of runners) {
    await stopBot(botId);
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(console.error);
