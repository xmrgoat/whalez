import { prisma, Bot } from '@whalez/database';
import {
  StrategyEngine,
  RiskEngine,
  ExecutionEngine,
  Journal,
  Critic,
  LearningManager,
  PaperExecutionAdapter,
  PaperMarketDataAdapter,
  HyperliquidExecutionAdapter,
  HyperliquidMarketDataAdapter,
  EnhancedGrokService,
  RealtimeDataService,
  getRealtimeDataService,
  type BotConfig,
  type OHLC,
  type Signal,
  type Trade,
  type MarketDataAdapter,
  type ExecutionAdapter,
  type MarketContext,
} from '@whalez/core';

const CRITIQUE_INTERVAL = 5; // Every 5 closed trades

export class BotRunner {
  private bot: Bot;
  private config: BotConfig;
  private running = false;

  private strategyEngine: StrategyEngine;
  private riskEngine: RiskEngine;
  private executionEngine: ExecutionEngine;
  private journal: Journal;
  private critic: Critic;
  private learningManager: LearningManager;

  private marketDataAdapter: MarketDataAdapter;
  private executionAdapter: ExecutionAdapter;
  private realtimeDataService: RealtimeDataService | null = null;

  private unsubscribes: Array<() => void> = [];
  private closedTradeCount = 0;
  private lastCritiqueAt = 0;
  private lastMarketContext: MarketContext | null = null;

  constructor(bot: Bot) {
    this.bot = bot;
    this.config = bot.config as BotConfig;

    // Initialize adapters based on config
    const isPaper = bot.paperTrading || process.env['PAPER_TRADING'] === 'true';
    const executionType = process.env['EXECUTION_ADAPTER'] || 'paper';
    const marketDataType = process.env['MARKETDATA_ADAPTER'] || 'paper';

    // Execution adapter
    if (isPaper || executionType === 'paper') {
      this.executionAdapter = new PaperExecutionAdapter({ initialEquity: 10000 });
    } else if (executionType === 'hyperliquid') {
      this.executionAdapter = new HyperliquidExecutionAdapter();
    } else {
      this.executionAdapter = new PaperExecutionAdapter({ initialEquity: 10000 });
    }

    // Market data adapter
    if (marketDataType === 'hyperliquid') {
      this.marketDataAdapter = new HyperliquidMarketDataAdapter();
    } else {
      this.marketDataAdapter = new PaperMarketDataAdapter({ symbols: [this.config.symbol] });
    }

    // Initialize engines
    this.strategyEngine = new StrategyEngine(this.config);
    this.riskEngine = new RiskEngine(this.config.risk, 10000);
    this.executionEngine = new ExecutionEngine(this.executionAdapter, this.config);
    this.journal = new Journal(bot.id);
    this.critic = new Critic(bot.id);
    this.learningManager = new LearningManager(bot.id, this.config);
  }

  async start(): Promise<void> {
    if (this.running) return;

    console.log(`[BotRunner] Starting bot ${this.bot.id} (${this.bot.name})`);

    // Connect adapters
    await this.marketDataAdapter.connect();
    await this.executionAdapter.connect();

    // Initialize realtime data service for orderbook, liquidations, funding
    try {
      this.realtimeDataService = getRealtimeDataService();
      await this.realtimeDataService.connect();
      this.realtimeDataService.subscribeToL2Book(this.config.symbol);
      this.realtimeDataService.subscribeTrades(this.config.symbol);
      console.log(`[BotRunner] Connected to realtime data for ${this.config.symbol}`);
    } catch (e) {
      console.warn(`[BotRunner] Realtime data service unavailable:`, e);
    }

    this.running = true;

    // Subscribe to market data for each timeframe
    for (const timeframe of this.config.timeframes) {
      const unsub = this.marketDataAdapter.subscribeOHLC(
        this.config.symbol,
        timeframe,
        (candle) => this.onCandle(candle, timeframe)
      );
      this.unsubscribes.push(unsub);
    }

    // Subscribe to order updates
    const unsubOrders = this.executionAdapter.onOrderUpdate((order) => {
      console.log(`[BotRunner] Order update: ${order.id} - ${order.status}`);
    });
    this.unsubscribes.push(unsubOrders);

    // Subscribe to position updates
    const unsubPositions = this.executionAdapter.onPositionUpdate((position) => {
      console.log(`[BotRunner] Position update: ${position.symbol} - ${position.size}`);
    });
    this.unsubscribes.push(unsubPositions);

    // Initial data load
    await this.loadHistoricalData();

    console.log(`[BotRunner] Bot ${this.bot.id} started successfully`);
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    console.log(`[BotRunner] Stopping bot ${this.bot.id}`);

    this.running = false;

    // Unsubscribe from all
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];

    // Disconnect adapters
    await this.marketDataAdapter.disconnect();
    await this.executionAdapter.disconnect();

    console.log(`[BotRunner] Bot ${this.bot.id} stopped`);
  }

  private async loadHistoricalData(): Promise<void> {
    const now = Date.now();
    const from = now - 30 * 24 * 60 * 60 * 1000; // 30 days

    for (const timeframe of this.config.timeframes) {
      const candles = await this.marketDataAdapter.getOHLC(
        this.config.symbol,
        timeframe,
        from,
        now
      );
      console.log(`[BotRunner] Loaded ${candles.length} ${timeframe} candles`);
    }
  }

  private async onCandle(candle: OHLC, timeframe: string): Promise<void> {
    if (!this.running) return;

    try {
      // Get historical candles for analysis
      const now = Date.now();
      const from = now - 30 * 24 * 60 * 60 * 1000;
      const candles = await this.marketDataAdapter.getOHLC(
        this.config.symbol,
        timeframe as any,
        from,
        now
      );

      if (candles.length < 200) {
        return; // Not enough data
      }

      // Process through strategy engine (technical analysis)
      const signal = this.strategyEngine.processCandles(candles, timeframe as any);

      // Get realtime market context (orderbook, funding, liquidations, market info)
      let marketSignals = { fundingBias: 0, orderbookBias: 0, liquidationBias: 0, volumeBias: 0 };
      if (this.realtimeDataService) {
        const fullData = await this.realtimeDataService.getFullMarketData(this.config.symbol);
        this.lastMarketContext = fullData.context;
        
        // Log market data
        if (this.lastMarketContext?.orderBook) {
          console.log(`[BotRunner] Orderbook: spread=${this.lastMarketContext.orderBook.spreadPct.toFixed(4)}%, imbalance=${(this.lastMarketContext.orderBook.imbalance * 100).toFixed(1)}%`);
        }
        if (this.lastMarketContext?.funding) {
          const fundingAPY = fullData.fundingAPY;
          console.log(`[BotRunner] Funding: ${(this.lastMarketContext.funding.fundingRate * 100).toFixed(4)}% (APY: ${fundingAPY.toFixed(2)}%)`);
        }
        if (this.lastMarketContext?.marketInfo) {
          console.log(`[BotRunner] Market: maxLev=${this.lastMarketContext.marketInfo.maxLeverage}x, tick=${this.lastMarketContext.marketInfo.tickSize}`);
        }
        console.log(`[BotRunner] Volume: ${fullData.volumeTrend}, Liquidations: ${fullData.recentLiquidationPressure}`);
        
        // Calculate market biases for signal enhancement
        // Funding bias: positive funding = longs pay shorts (bearish), negative = bullish
        marketSignals.fundingBias = fullData.fundingAPY > 20 ? -1 : fullData.fundingAPY < -20 ? 1 : 0;
        
        // Orderbook bias: imbalance > 0.6 = bullish, < 0.4 = bearish
        marketSignals.orderbookBias = fullData.orderBookImbalance > 0.6 ? 1 : fullData.orderBookImbalance < 0.4 ? -1 : 0;
        
        // Liquidation bias: long liquidations = bearish pressure, short = bullish
        marketSignals.liquidationBias = fullData.recentLiquidationPressure === 'long' ? -1 : fullData.recentLiquidationPressure === 'short' ? 1 : 0;
        
        // Volume bias
        marketSignals.volumeBias = fullData.volumeTrend === 'bullish' ? 1 : fullData.volumeTrend === 'bearish' ? -1 : 0;
      }

      // Use Grok AI for enhanced analysis
      const grok = EnhancedGrokService.getInstance();
      if (grok.isAvailable()) {
        const lastCandle = candles[candles.length - 1]!;
        const prevCandle = candles[candles.length - 2];
        const change24h = prevCandle ? ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100 : 0;
        
        const grokAnalysis = await grok.analyzeMarket({
          symbol: this.config.symbol,
          price: lastCandle.close,
          change24h,
          indicators: signal?.indicators || {},
          volume: lastCandle.volume,
          guardrails: {
            maxLeverage: this.config.risk.maxLeverage,
            maxPositionPct: this.config.risk.maxPositionSizePercent,
            maxDrawdown: this.config.risk.maxDrawdownPercent,
          },
        });

        console.log(`[BotRunner] Grok Analysis: ${grokAnalysis.action} (confidence: ${grokAnalysis.confidence}%)`);
        console.log(`[BotRunner] Grok Reasoning: ${grokAnalysis.reasoning}`);

        // Save Grok decision to database
        await this.saveGrokDecision(grokAnalysis, lastCandle);

        // Only proceed if Grok agrees with the signal or has high confidence
        if (grokAnalysis.action === 'HOLD' || grokAnalysis.action === 'NO_TRADE') {
          console.log(`[BotRunner] Grok says HOLD/NO_TRADE - skipping signal`);
          return;
        }

        // Map Grok action to signal action
        if (signal && grokAnalysis.confidence >= 60) {
          // Grok confirms the signal
          await this.handleSignal(signal, candles);
        } else if (grokAnalysis.confidence >= 75) {
          // Grok has high confidence even without technical signal
          const grokSignal: Signal = {
            id: `grok_${Date.now()}`,
            botId: this.config.id,
            symbol: this.config.symbol,
            timeframe: timeframe as any,
            action: grokAnalysis.action === 'LONG' ? 'long' : 'short',
            confidence: grokAnalysis.confidence,
            price: lastCandle.close,
            indicators: signal?.indicators || {},
            reasons: [grokAnalysis.reasoning],
            timestamp: Date.now(),
          };
          await this.handleSignal(grokSignal, candles);
        }
      } else if (signal) {
        // Grok not available, use technical signal only
        await this.handleSignal(signal, candles);
      }

      // Update risk state
      const account = await this.executionAdapter.getAccountInfo();
      const positions = await this.executionAdapter.getPositions();
      this.riskEngine.updateState(account, positions);

      // Check if bot should stop due to risk
      const shouldStop = this.riskEngine.shouldStopBot();
      if (shouldStop.stop) {
        console.log(`[BotRunner] Stopping bot due to risk: ${shouldStop.reason}`);
        await this.emergencyStop(shouldStop.reason || 'Unknown risk');
      }

    } catch (error) {
      console.error(`[BotRunner] Error processing candle:`, error);
    }
  }

  private async handleSignal(signal: Signal, candles: OHLC[]): Promise<void> {
    console.log(`[BotRunner] Signal: ${signal.action} (confidence: ${signal.confidence}%)`);

    // Record signal
    await this.journal.recordSignal(signal);
    await this.saveSignalToDb(signal);

    // Handle close signals
    if (signal.action === 'close_long' || signal.action === 'close_short') {
      const trade = await this.executionEngine.closeBySignal(signal);
      if (trade) {
        await this.handleClosedTrade(trade);
      }
      return;
    }

    // Handle entry signals
    if (signal.action === 'long' || signal.action === 'short') {
      // Get ATR for risk calculations
      const lastCandle = candles[candles.length - 1]!;
      const atr = this.calculateATR(candles);

      // Check risk
      const riskCheck = this.riskEngine.checkTradeAllowed(signal, lastCandle.close, atr);

      if (!riskCheck.allowed) {
        console.log(`[BotRunner] Trade not allowed: ${riskCheck.reason}`);
        return;
      }

      // Execute trade
      const trade = await this.executionEngine.executeSignal({
        signal,
        quantity: riskCheck.adjustedQuantity!,
        stopLoss: riskCheck.stopLoss,
        takeProfit: riskCheck.takeProfit,
        leverage: this.config.risk.maxLeverage,
      });

      if (trade) {
        await this.journal.recordTrade(trade);
        await this.saveTradeToDb(trade);
        console.log(`[BotRunner] Trade opened: ${trade.id}`);
      }
    }
  }

  private async handleClosedTrade(trade: Trade): Promise<void> {
    await this.journal.recordTrade(trade);
    await this.updateTradeInDb(trade);
    this.riskEngine.recordTrade(trade);

    console.log(`[BotRunner] Trade closed: ${trade.id}, PnL: $${trade.pnl?.toFixed(2)}`);

    this.closedTradeCount++;

    // Check if it's time for critique
    if (this.closedTradeCount >= CRITIQUE_INTERVAL) {
      await this.runCritique();
      this.closedTradeCount = 0;
    }
  }

  private async runCritique(): Promise<void> {
    console.log(`[BotRunner] Running critique after ${CRITIQUE_INTERVAL} trades`);

    const trades = await this.journal.getTradesForCritique(CRITIQUE_INTERVAL);
    const report = this.critic.generateReport(trades);

    // Save report
    await this.saveCritiqueToDb(report);

    console.log(`[BotRunner] Critique report generated:`);
    console.log(`  - Win rate: ${report.metrics.winRate.toFixed(1)}%`);
    console.log(`  - Expectancy: $${report.metrics.expectancy.toFixed(2)}`);
    console.log(`  - Recommendations: ${report.recommendations.length}`);

    // Apply safe recommendations
    if (report.recommendations.length > 0) {
      const applied = this.learningManager.applyRecommendations(report);
      
      if (applied.length > 0) {
        console.log(`[BotRunner] Applied ${applied.length} parameter changes`);
        
        // Update config in engines
        const newConfig = this.learningManager.getConfig();
        this.strategyEngine.updateConfig(newConfig);
        this.riskEngine.updateConfig(newConfig.risk);
        this.executionEngine.updateConfig(newConfig);

        // Save changes to DB
        for (const change of applied) {
          await this.saveParamChangeToDb(change, report.id);
        }
      }
    }

    this.lastCritiqueAt = Date.now();
  }

  private calculateATR(candles: OHLC[], period: number = 14): number {
    if (candles.length < period + 1) return 0;

    let atrSum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const current = candles[i]!;
      const prev = candles[i - 1]!;
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - prev.close),
        Math.abs(current.low - prev.close)
      );
      atrSum += tr;
    }

    return atrSum / period;
  }

  private async emergencyStop(reason: string): Promise<void> {
    // Close all positions
    await this.executionEngine.cancelAllOrders();
    
    // Update bot status
    await prisma.bot.update({
      where: { id: this.bot.id },
      data: { status: 'STOPPED' },
    });

    // Close run
    const activeRun = await prisma.botRun.findFirst({
      where: { botId: this.bot.id, stoppedAt: null },
    });

    if (activeRun) {
      await prisma.botRun.update({
        where: { id: activeRun.id },
        data: { stoppedAt: new Date(), reason },
      });
    }

    await this.stop();
  }

  // Database helpers
  private async saveSignalToDb(signal: Signal): Promise<void> {
    await prisma.signal.create({
      data: {
        id: signal.id,
        botId: this.bot.id,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        action: signal.action.toUpperCase() as any,
        confidence: signal.confidence,
        price: signal.price,
        indicators: signal.indicators,
        reasons: signal.reasons,
      },
    });
  }

  private async saveTradeToDb(trade: Trade): Promise<void> {
    await prisma.trade.create({
      data: {
        id: trade.id,
        botId: this.bot.id,
        symbol: trade.symbol,
        side: trade.side.toUpperCase() as any,
        entryPrice: trade.entryPrice,
        quantity: trade.quantity,
        entryTime: new Date(trade.entryTime),
        fees: trade.fees,
        status: 'OPEN',
        signalId: trade.signalId,
        orderId: trade.orderId,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
      },
    });
  }

  private async updateTradeInDb(trade: Trade): Promise<void> {
    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        exitPrice: trade.exitPrice,
        exitTime: trade.exitTime ? new Date(trade.exitTime) : undefined,
        pnl: trade.pnl,
        pnlPercent: trade.pnlPercent,
        status: 'CLOSED',
        exitOrderId: trade.exitOrderId,
      },
    });
  }

  private async saveCritiqueToDb(report: any): Promise<void> {
    await prisma.critiqueReport.create({
      data: {
        id: report.id,
        botId: this.bot.id,
        tradeIds: report.tradeIds,
        metrics: report.metrics,
        whatWorked: report.whatWorked,
        whatDidntWork: report.whatDidntWork,
        failurePatterns: report.failurePatterns,
        recommendations: report.recommendations,
        appliedChanges: report.appliedChanges,
      },
    });
  }

  private async saveParamChangeToDb(change: any, critiqueReportId: string): Promise<void> {
    await prisma.paramChange.create({
      data: {
        botId: this.bot.id,
        critiqueReportId,
        parameter: change.parameter,
        previousValue: change.previousValue,
        newValue: change.newValue,
        reason: change.reason,
        applied: change.applied,
      },
    });
  }

  private async saveGrokDecision(analysis: any, candle: OHLC): Promise<void> {
    // Log the decision - database save is optional
    console.log(`[BotRunner] Grok Decision: ${analysis.action} @ $${candle.close} (${analysis.confidence}%)`);
    console.log(`[BotRunner] Reasoning: ${analysis.reasoning?.substring(0, 200)}...`);
  }
}
