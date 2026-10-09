-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('SPOT', 'MARGIN', 'FUTURES');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('CRYPTO', 'STOCK', 'ETF', 'FOREX', 'COMMODITY', 'INDEX');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('SPOT', 'PERPETUAL', 'FUTURE');

-- CreateEnum
CREATE TYPE "TradingStatus" AS ENUM ('ACTIVE', 'HALTED', 'DELISTED', 'DATA_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "MarketDataMode" AS ENUM ('LIVE', 'DELAYED', 'REPLAY', 'FIXTURE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_LIMIT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TimeInForce" AS ENUM ('GTC', 'IOC', 'FOK', 'DAY');

-- CreateEnum
CREATE TYPE "PositionSide" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('INITIAL_CAPITAL', 'DEPOSIT', 'WITHDRAWAL', 'ORDER_SETTLEMENT', 'FEE', 'FUNDING', 'REALIZED_PNL', 'LIQUIDATION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CASH', 'ASSET', 'FEE', 'PNL', 'MARGIN', 'FUNDING');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_FILLED', 'ORDER_TRIGGERED', 'ORDER_REJECTED', 'ORDER_CANCELLED', 'LIQUIDATION', 'ACHIEVEMENT', 'CHALLENGE', 'LEADERBOARD', 'PRICE_ALERT', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "publicProfile" BOOLEAN NOT NULL DEFAULT true,
    "publicHistory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "defaultMarket" TEXT NOT NULL DEFAULT 'CRYPTO',
    "chartPreferences" JSONB,
    "notificationPreferences" JSONB,
    "privacySettings" JSONB,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'main',
    "dataMode" "MarketDataMode" NOT NULL DEFAULT 'LIVE',
    "accountType" "AccountType" NOT NULL DEFAULT 'SPOT',
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "initialCapital" DECIMAL(38,18) NOT NULL,
    "availableCash" DECIMAL(38,18) NOT NULL,
    "reservedCash" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "feesPaid" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "fundingPaid" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountReset" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "previousEquity" DECIMAL(38,18) NOT NULL,
    "newCapital" DECIMAL(38,18) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "providerSymbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "instrumentType" "InstrumentType" NOT NULL DEFAULT 'SPOT',
    "baseAsset" TEXT NOT NULL,
    "quoteAsset" TEXT NOT NULL,
    "contractMultiplier" DECIMAL(38,18) NOT NULL DEFAULT 1,
    "tickSize" DECIMAL(38,18) NOT NULL DEFAULT 0.00000001,
    "minimumQuantity" DECIMAL(38,18) NOT NULL DEFAULT 0.00000001,
    "maximumLeverage" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "tradingStatus" "TradingStatus" NOT NULL DEFAULT 'ACTIVE',
    "dataProvider" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketQuote" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "bid" DECIMAL(38,18),
    "ask" DECIMAL(38,18),
    "lastPrice" DECIMAL(38,18),
    "markPrice" DECIMAL(38,18),
    "volume" DECIMAL(38,18),
    "priceChange" DECIMAL(38,18),
    "priceChangePct" DECIMAL(18,8),
    "mode" "MarketDataMode" NOT NULL DEFAULT 'UNAVAILABLE',
    "sourceTimestamp" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketCandle" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "closeTime" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(38,18) NOT NULL,
    "high" DECIMAL(38,18) NOT NULL,
    "low" DECIMAL(38,18) NOT NULL,
    "close" DECIMAL(38,18) NOT NULL,
    "volume" DECIMAL(38,18) NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MarketCandle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "filledQuantity" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "limitPrice" DECIMAL(38,18),
    "stopPrice" DECIMAL(38,18),
    "averageFillPrice" DECIMAL(38,18),
    "estimatedFee" DECIMAL(38,18),
    "reservedAmount" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "timeInForce" "TimeInForce" NOT NULL DEFAULT 'GTC',
    "reduceOnly" BOOLEAN NOT NULL DEFAULT false,
    "orderGroupId" TEXT,
    "linkedOrderId" TEXT,
    "positionSide" "PositionSide" NOT NULL DEFAULT 'LONG',
    "leverage" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "bracketStop" DECIMAL(38,18),
    "bracketTarget" DECIMAL(38,18),
    "reservedQuantity" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "rejectionReason" TEXT,
    "triggeredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "executionPrice" DECIMAL(38,18) NOT NULL,
    "fee" DECIMAL(38,18) NOT NULL,
    "feeAsset" TEXT NOT NULL,
    "executionTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executionMetadata" JSONB,
    "realizedPnl" DECIMAL(38,18) NOT NULL DEFAULT 0,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "positionSide" "PositionSide" NOT NULL DEFAULT 'LONG',
    "quantity" DECIMAL(38,18) NOT NULL,
    "averageEntryPrice" DECIMAL(38,18) NOT NULL,
    "realizedPnl" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "unrealizedPnl" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "initialMargin" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "maintenanceMargin" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "leverage" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "lastFundingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fundingTotal" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "liquidationPrice" DECIMAL(38,18),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionType" "LedgerTransactionType" NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "assetCode" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "equity" DECIMAL(38,18) NOT NULL,
    "cashBalance" DECIMAL(38,18) NOT NULL,
    "reservedCash" DECIMAL(38,18) NOT NULL,
    "spotValue" DECIMAL(38,18) NOT NULL,
    "realizedPnl" DECIMAL(38,18) NOT NULL,
    "unrealizedPnl" DECIMAL(38,18) NOT NULL,
    "snapshotTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startingCapital" DECIMAL(38,18) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "configuration" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeParticipant" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startingEquity" DECIMAL(38,18) NOT NULL,
    "finalEquity" DECIMAL(38,18),
    "performance" DECIMAL(18,8),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardSnapshot" (
    "id" TEXT NOT NULL,
    "leaderboardType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "returnPercentage" DECIMAL(18,8) NOT NULL,
    "realizedPnl" DECIMAL(38,18) NOT NULL,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "winRate" DECIMAL(18,8),
    "snapshotTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "target" DECIMAL(38,18) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "intervalKey" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidationEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "loss" DECIMAL(38,18) NOT NULL,
    "fee" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "TradingAccount_accountStatus_idx" ON "TradingAccount"("accountStatus");

-- CreateIndex
CREATE UNIQUE INDEX "TradingAccount_userId_scope_key" ON "TradingAccount"("userId", "scope");

-- CreateIndex
CREATE INDEX "AccountReset_accountId_createdAt_idx" ON "AccountReset"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE INDEX "Instrument_assetClass_tradingStatus_idx" ON "Instrument"("assetClass", "tradingStatus");

-- CreateIndex
CREATE INDEX "Instrument_dataProvider_idx" ON "Instrument"("dataProvider");

-- CreateIndex
CREATE UNIQUE INDEX "MarketQuote_instrumentId_key" ON "MarketQuote"("instrumentId");

-- CreateIndex
CREATE INDEX "MarketCandle_instrumentId_timeframe_openTime_idx" ON "MarketCandle"("instrumentId", "timeframe", "openTime");

-- CreateIndex
CREATE UNIQUE INDEX "MarketCandle_instrumentId_timeframe_openTime_key" ON "MarketCandle"("instrumentId", "timeframe", "openTime");

-- CreateIndex
CREATE INDEX "Order_accountId_status_createdAt_idx" ON "Order"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_instrumentId_status_idx" ON "Order"("instrumentId", "status");

-- CreateIndex
CREATE INDEX "Order_orderGroupId_idx" ON "Order"("orderGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accountId_clientOrderId_key" ON "Order"("accountId", "clientOrderId");

-- CreateIndex
CREATE INDEX "Execution_orderId_executionTimestamp_idx" ON "Execution"("orderId", "executionTimestamp");

-- CreateIndex
CREATE INDEX "Position_accountId_updatedAt_idx" ON "Position"("accountId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Position_accountId_instrumentId_positionSide_key" ON "Position"("accountId", "instrumentId", "positionSide");

-- CreateIndex
CREATE INDEX "LedgerTransaction_accountId_createdAt_idx" ON "LedgerTransaction"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerTransaction_referenceType_referenceId_idx" ON "LedgerTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_assetCode_createdAt_idx" ON "LedgerEntry"("accountId", "assetCode", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_accountId_snapshotTimestamp_idx" ON "PortfolioSnapshot"("accountId", "snapshotTimestamp");

-- CreateIndex
CREATE INDEX "Watchlist_userId_createdAt_idx" ON "Watchlist"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_name_key" ON "Watchlist"("userId", "name");

-- CreateIndex
CREATE INDEX "WatchlistItem_watchlistId_sortOrder_idx" ON "WatchlistItem"("watchlistId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_watchlistId_instrumentId_key" ON "WatchlistItem"("watchlistId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_name_key" ON "Achievement"("name");

-- CreateIndex
CREATE INDEX "UserAchievement_userId_unlockedAt_idx" ON "UserAchievement"("userId", "unlockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "Challenge_status_startTime_endTime_idx" ON "Challenge"("status", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_challengeId_performance_idx" ON "ChallengeParticipant"("challengeId", "performance");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeParticipant_challengeId_userId_key" ON "ChallengeParticipant"("challengeId", "userId");

-- CreateIndex
CREATE INDEX "LeaderboardSnapshot_leaderboardType_periodKey_rank_idx" ON "LeaderboardSnapshot"("leaderboardType", "periodKey", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardSnapshot_leaderboardType_periodKey_userId_key" ON "LeaderboardSnapshot"("leaderboardType", "periodKey", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordToken_tokenHash_key" ON "PasswordToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordToken_userId_kind_idx" ON "PasswordToken"("userId", "kind");

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- CreateIndex
CREATE INDEX "PriceAlert_active_symbol_idx" ON "PriceAlert"("active", "symbol");

-- CreateIndex
CREATE INDEX "FundingEvent_accountId_createdAt_idx" ON "FundingEvent"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FundingEvent_positionId_intervalKey_key" ON "FundingEvent"("positionId", "intervalKey");

-- CreateIndex
CREATE INDEX "LiquidationEvent_accountId_createdAt_idx" ON "LiquidationEvent"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReset" ADD CONSTRAINT "AccountReset_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketQuote" ADD CONSTRAINT "MarketQuote_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketCandle" ADD CONSTRAINT "MarketCandle_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardSnapshot" ADD CONSTRAINT "LeaderboardSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordToken" ADD CONSTRAINT "PasswordToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingEvent" ADD CONSTRAINT "FundingEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidationEvent" ADD CONSTRAINT "LiquidationEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
