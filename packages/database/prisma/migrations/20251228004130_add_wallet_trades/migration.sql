-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('RUNNING', 'STOPPED', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SignalAction" AS ENUM ('LONG', 'SHORT', 'CLOSE_LONG', 'CLOSE_SHORT', 'HOLD');

-- CreateEnum
CREATE TYPE "DecisionAction" AS ENUM ('LONG', 'SHORT', 'CLOSE_LONG', 'CLOSE_SHORT', 'HOLD', 'NO_TRADE');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('INDICATOR', 'GROK', 'RISK', 'DATA', 'REGIME');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PASS', 'FAIL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MarkerKind" AS ENUM ('ENTRY', 'EXIT', 'STOP_LOSS', 'TAKE_PROFIT', 'NO_TRADE', 'NOTE');

-- CreateEnum
CREATE TYPE "AIRuleCategory" AS ENUM ('MACRO_ANALYSIS', 'TECHNICAL_ANALYSIS', 'RISK_MANAGEMENT', 'ENTRY_CONDITIONS', 'EXIT_CONDITIONS', 'SELF_CRITIQUE', 'USER_CUSTOM');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('PATTERN_DETECTED', 'PARAMETER_SUGGESTION', 'RISK_WARNING', 'PERFORMANCE_TREND', 'MARKET_CONDITION', 'STRATEGY_IMPROVEMENT');

-- CreateEnum
CREATE TYPE "SuggestionType" AS ENUM ('PARAMETER_CHANGE', 'RULE_ADDITION', 'RULE_MODIFICATION', 'RISK_ADJUSTMENT', 'STRATEGY_CHANGE', 'MARKET_ALERT');

-- CreateEnum
CREATE TYPE "SuggestionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'VIEWED', 'APPLIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExternalSource" AS ENUM ('X_TWITTER', 'NEWS_API', 'COINGECKO', 'HYPERLIQUID', 'USER_INPUT');

-- CreateEnum
CREATE TYPE "GrokAnalysisType" AS ENUM ('MACRO_SENTIMENT', 'RUMOR_CHECK', 'TRADE_ANALYSIS', 'SELF_CRITIQUE', 'PARAMETER_OPTIMIZATION', 'MARKET_REGIME');

-- CreateEnum
CREATE TYPE "LearningType" AS ENUM ('SUCCESSFUL_TRADE', 'FAILED_TRADE', 'MISSED_OPPORTUNITY', 'AVOIDED_LOSS', 'PARAMETER_CHANGE_RESULT', 'MARKET_REGIME_CHANGE');

-- CreateEnum
CREATE TYPE "AISessionType" AS ENUM ('MARKET_ANALYSIS', 'TRADE_DECISION', 'SELF_CRITIQUE', 'PARAMETER_OPTIMIZATION', 'SENTIMENT_CHECK');

-- CreateEnum
CREATE TYPE "AISessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AIStepType" AS ENUM ('DATA_COLLECTION', 'INDICATOR_ANALYSIS', 'SENTIMENT_ANALYSIS', 'NEWS_ANALYSIS', 'CONFIRMATION_CHECK', 'RISK_ASSESSMENT', 'DECISION_MAKING', 'REASONING');

-- CreateEnum
CREATE TYPE "AIStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsed" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "status" "BotStatus" NOT NULL DEFAULT 'STOPPED',
    "paperTrading" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotRun" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "reason" TEXT,
    "metrics" JSONB,

    CONSTRAINT "BotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "botRunId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3),
    "pnl" DOUBLE PRECISION,
    "pnlPercent" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "signalId" TEXT,
    "orderId" TEXT,
    "exitOrderId" TEXT,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "action" "SignalAction" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "indicators" JSONB NOT NULL,
    "reasons" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CritiqueReport" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "tradeIds" TEXT[],
    "metrics" JSONB NOT NULL,
    "whatWorked" TEXT[],
    "whatDidntWork" TEXT[],
    "failurePatterns" TEXT[],
    "recommendations" JSONB NOT NULL,
    "appliedChanges" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CritiqueReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParamChange" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "critiqueReportId" TEXT,
    "parameter" TEXT NOT NULL,
    "previousValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParamChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "botId" TEXT,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "action" "DecisionAction" NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "blockedReason" TEXT,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "tradeId" TEXT,
    "critiqueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionBreakdown" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "dataQuality" INTEGER NOT NULL,
    "signalAgreement" INTEGER NOT NULL,
    "riskFit" INTEGER NOT NULL,
    "regimeMatch" INTEGER NOT NULL,
    "newsBonus" INTEGER NOT NULL,

    CONSTRAINT "DecisionBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionEvidence" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "status" "EvidenceStatus" NOT NULL,
    "weight" INTEGER NOT NULL,
    "sourceUrl" TEXT,

    CONSTRAINT "DecisionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartMarker" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT,
    "botId" TEXT,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "kind" "MarkerKind" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "side" TEXT,
    "label" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRule" (
    "id" TEXT NOT NULL,
    "botId" TEXT,
    "category" "AIRuleCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "constraints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInsight" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "type" "InsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "dataPoints" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AIInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISuggestion" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "type" "SuggestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "priority" "SuggestionPriority" NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "parameters" JSONB,
    "sources" JSONB NOT NULL,
    "userFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AISuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalData" (
    "id" TEXT NOT NULL,
    "source" "ExternalSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "url" TEXT,
    "sentiment" TEXT,
    "relevance" DOUBLE PRECISION,
    "symbols" TEXT[],
    "metadata" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrokAnalysis" (
    "id" TEXT NOT NULL,
    "botId" TEXT,
    "analysisType" "GrokAnalysisType" NOT NULL,
    "query" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "parsedResult" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "processingTimeMs" INTEGER NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrokAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGuardrail" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGuardrail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningEntry" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "entryType" "LearningType" NOT NULL,
    "context" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "tradeIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIThinkingSession" (
    "id" TEXT NOT NULL,
    "botId" TEXT,
    "userId" TEXT,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "sessionType" "AISessionType" NOT NULL,
    "status" "AISessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalDurationMs" INTEGER,
    "finalAction" TEXT,
    "finalConfidence" DOUBLE PRECISION,
    "inputData" JSONB NOT NULL,
    "outputData" JSONB,

    CONSTRAINT "AIThinkingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIThinkingStep" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "stepType" "AIStepType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "data" JSONB,
    "status" "AIStepStatus" NOT NULL DEFAULT 'PENDING',
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIThinkingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletProfile" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nickname" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settings" JSONB,

    CONSTRAINT "WalletProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioStats" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "initialEquity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentEquity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peakEquity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unrealizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "winningTrades" INTEGER NOT NULL DEFAULT 0,
    "losingTrades" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgWin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "largestWin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "largestLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectancy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sharpeRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDrawdown" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDrawdownPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentDrawdown" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "longestLoseStreak" INTEGER NOT NULL DEFAULT 0,
    "avgHoldTime" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStats" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnlPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trades" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeHistory" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "pnl" DOUBLE PRECISION,
    "pnlPercent" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3),
    "holdDuration" INTEGER,
    "decisionId" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "aiReasoning" TEXT,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerAddress" TEXT NOT NULL,
    "referredAddress" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrerReward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "referredReward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTrade" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "entryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exitFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnl" DOUBLE PRECISION,
    "pnlWithFees" DOUBLE PRECISION,
    "confidence" INTEGER,
    "reasoning" TEXT,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "entryTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitTime" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "WalletTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "Bot_userId_idx" ON "Bot"("userId");

-- CreateIndex
CREATE INDEX "Bot_status_idx" ON "Bot"("status");

-- CreateIndex
CREATE INDEX "BotRun_botId_idx" ON "BotRun"("botId");

-- CreateIndex
CREATE INDEX "BotRun_startedAt_idx" ON "BotRun"("startedAt");

-- CreateIndex
CREATE INDEX "Trade_botId_idx" ON "Trade"("botId");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_entryTime_idx" ON "Trade"("entryTime");

-- CreateIndex
CREATE INDEX "Trade_symbol_idx" ON "Trade"("symbol");

-- CreateIndex
CREATE INDEX "Signal_botId_idx" ON "Signal"("botId");

-- CreateIndex
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");

-- CreateIndex
CREATE INDEX "CritiqueReport_botId_idx" ON "CritiqueReport"("botId");

-- CreateIndex
CREATE INDEX "CritiqueReport_createdAt_idx" ON "CritiqueReport"("createdAt");

-- CreateIndex
CREATE INDEX "ParamChange_botId_idx" ON "ParamChange"("botId");

-- CreateIndex
CREATE INDEX "ParamChange_createdAt_idx" ON "ParamChange"("createdAt");

-- CreateIndex
CREATE INDEX "Decision_botId_idx" ON "Decision"("botId");

-- CreateIndex
CREATE INDEX "Decision_symbol_timeframe_idx" ON "Decision"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "Decision_timestamp_idx" ON "Decision"("timestamp");

-- CreateIndex
CREATE INDEX "Decision_createdAt_idx" ON "Decision"("createdAt");

-- CreateIndex
CREATE INDEX "Decision_action_idx" ON "Decision"("action");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionBreakdown_decisionId_key" ON "DecisionBreakdown"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionEvidence_decisionId_idx" ON "DecisionEvidence"("decisionId");

-- CreateIndex
CREATE INDEX "ChartMarker_symbol_timeframe_timestamp_idx" ON "ChartMarker"("symbol", "timeframe", "timestamp");

-- CreateIndex
CREATE INDEX "ChartMarker_decisionId_idx" ON "ChartMarker"("decisionId");

-- CreateIndex
CREATE INDEX "MarketSnapshot_symbol_timeframe_idx" ON "MarketSnapshot"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "MarketSnapshot_timestamp_idx" ON "MarketSnapshot"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshot_symbol_timeframe_timestamp_key" ON "MarketSnapshot"("symbol", "timeframe", "timestamp");

-- CreateIndex
CREATE INDEX "AIRule_botId_idx" ON "AIRule"("botId");

-- CreateIndex
CREATE INDEX "AIRule_category_idx" ON "AIRule"("category");

-- CreateIndex
CREATE INDEX "AIRule_isActive_idx" ON "AIRule"("isActive");

-- CreateIndex
CREATE INDEX "AIInsight_botId_idx" ON "AIInsight"("botId");

-- CreateIndex
CREATE INDEX "AIInsight_type_idx" ON "AIInsight"("type");

-- CreateIndex
CREATE INDEX "AIInsight_createdAt_idx" ON "AIInsight"("createdAt");

-- CreateIndex
CREATE INDEX "AISuggestion_botId_idx" ON "AISuggestion"("botId");

-- CreateIndex
CREATE INDEX "AISuggestion_status_idx" ON "AISuggestion"("status");

-- CreateIndex
CREATE INDEX "AISuggestion_createdAt_idx" ON "AISuggestion"("createdAt");

-- CreateIndex
CREATE INDEX "ExternalData_source_idx" ON "ExternalData"("source");

-- CreateIndex
CREATE INDEX "ExternalData_fetchedAt_idx" ON "ExternalData"("fetchedAt");

-- CreateIndex
CREATE INDEX "ExternalData_symbols_idx" ON "ExternalData"("symbols");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalData_source_sourceId_key" ON "ExternalData"("source", "sourceId");

-- CreateIndex
CREATE INDEX "GrokAnalysis_botId_idx" ON "GrokAnalysis"("botId");

-- CreateIndex
CREATE INDEX "GrokAnalysis_analysisType_idx" ON "GrokAnalysis"("analysisType");

-- CreateIndex
CREATE INDEX "GrokAnalysis_createdAt_idx" ON "GrokAnalysis"("createdAt");

-- CreateIndex
CREATE INDEX "UserGuardrail_botId_idx" ON "UserGuardrail"("botId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGuardrail_botId_parameter_key" ON "UserGuardrail"("botId", "parameter");

-- CreateIndex
CREATE INDEX "LearningEntry_botId_idx" ON "LearningEntry"("botId");

-- CreateIndex
CREATE INDEX "LearningEntry_entryType_idx" ON "LearningEntry"("entryType");

-- CreateIndex
CREATE INDEX "LearningEntry_createdAt_idx" ON "LearningEntry"("createdAt");

-- CreateIndex
CREATE INDEX "AIThinkingSession_botId_idx" ON "AIThinkingSession"("botId");

-- CreateIndex
CREATE INDEX "AIThinkingSession_userId_idx" ON "AIThinkingSession"("userId");

-- CreateIndex
CREATE INDEX "AIThinkingSession_symbol_timeframe_idx" ON "AIThinkingSession"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "AIThinkingSession_startedAt_idx" ON "AIThinkingSession"("startedAt");

-- CreateIndex
CREATE INDEX "AIThinkingSession_status_idx" ON "AIThinkingSession"("status");

-- CreateIndex
CREATE INDEX "AIThinkingStep_sessionId_idx" ON "AIThinkingStep"("sessionId");

-- CreateIndex
CREATE INDEX "AIThinkingStep_stepNumber_idx" ON "AIThinkingStep"("stepNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WalletProfile_walletAddress_key" ON "WalletProfile"("walletAddress");

-- CreateIndex
CREATE INDEX "WalletProfile_walletAddress_idx" ON "WalletProfile"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioStats_walletAddress_key" ON "PortfolioStats"("walletAddress");

-- CreateIndex
CREATE INDEX "PortfolioStats_walletAddress_idx" ON "PortfolioStats"("walletAddress");

-- CreateIndex
CREATE INDEX "DailyStats_walletAddress_idx" ON "DailyStats"("walletAddress");

-- CreateIndex
CREATE INDEX "DailyStats_date_idx" ON "DailyStats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStats_walletAddress_date_key" ON "DailyStats"("walletAddress", "date");

-- CreateIndex
CREATE INDEX "TradeHistory_walletAddress_idx" ON "TradeHistory"("walletAddress");

-- CreateIndex
CREATE INDEX "TradeHistory_symbol_idx" ON "TradeHistory"("symbol");

-- CreateIndex
CREATE INDEX "TradeHistory_entryTime_idx" ON "TradeHistory"("entryTime");

-- CreateIndex
CREATE INDEX "TradeHistory_status_idx" ON "TradeHistory"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredAddress_key" ON "Referral"("referredAddress");

-- CreateIndex
CREATE INDEX "Referral_referrerAddress_idx" ON "Referral"("referrerAddress");

-- CreateIndex
CREATE INDEX "Referral_code_idx" ON "Referral"("code");

-- CreateIndex
CREATE INDEX "WalletTrade_walletAddress_idx" ON "WalletTrade"("walletAddress");

-- CreateIndex
CREATE INDEX "WalletTrade_symbol_idx" ON "WalletTrade"("symbol");

-- CreateIndex
CREATE INDEX "WalletTrade_status_idx" ON "WalletTrade"("status");

-- CreateIndex
CREATE INDEX "WalletTrade_entryTime_idx" ON "WalletTrade"("entryTime");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotRun" ADD CONSTRAINT "BotRun_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_botRunId_fkey" FOREIGN KEY ("botRunId") REFERENCES "BotRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CritiqueReport" ADD CONSTRAINT "CritiqueReport_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParamChange" ADD CONSTRAINT "ParamChange_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParamChange" ADD CONSTRAINT "ParamChange_critiqueReportId_fkey" FOREIGN KEY ("critiqueReportId") REFERENCES "CritiqueReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionBreakdown" ADD CONSTRAINT "DecisionBreakdown_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvidence" ADD CONSTRAINT "DecisionEvidence_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartMarker" ADD CONSTRAINT "ChartMarker_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIThinkingStep" ADD CONSTRAINT "AIThinkingStep_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIThinkingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioStats" ADD CONSTRAINT "PortfolioStats_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "WalletProfile"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStats" ADD CONSTRAINT "DailyStats_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "WalletProfile"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeHistory" ADD CONSTRAINT "TradeHistory_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "WalletProfile"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerAddress_fkey" FOREIGN KEY ("referrerAddress") REFERENCES "WalletProfile"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredAddress_fkey" FOREIGN KEY ("referredAddress") REFERENCES "WalletProfile"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTrade" ADD CONSTRAINT "WalletTrade_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "WalletProfile"("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE;
