CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "OrderStatus",
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradeJournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orderId" TEXT,
    "instrumentId" TEXT,
    "title" TEXT,
    "notes" TEXT NOT NULL,
    "tags" JSONB,
    "emotionalState" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradeJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");
CREATE INDEX "TradeJournalEntry_userId_createdAt_idx" ON "TradeJournalEntry"("userId", "createdAt");
CREATE INDEX "TradeJournalEntry_accountId_createdAt_idx" ON "TradeJournalEntry"("accountId", "createdAt");
CREATE INDEX "TradeJournalEntry_orderId_idx" ON "TradeJournalEntry"("orderId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_linkedOrderId_fkey" FOREIGN KEY ("linkedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeJournalEntry" ADD CONSTRAINT "TradeJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeJournalEntry" ADD CONSTRAINT "TradeJournalEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeJournalEntry" ADD CONSTRAINT "TradeJournalEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TradeJournalEntry" ADD CONSTRAINT "TradeJournalEntry_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION prevent_order_event_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Order events are append-only.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_order_event BEFORE UPDATE OR DELETE ON "OrderEvent" FOR EACH ROW EXECUTE FUNCTION prevent_order_event_rewrite();
