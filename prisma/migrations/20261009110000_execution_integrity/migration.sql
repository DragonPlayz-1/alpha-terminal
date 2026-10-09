ALTER TABLE "Order" ADD COLUMN "feeRate" DECIMAL(18,8) NOT NULL DEFAULT 0.001;
ALTER TABLE "Watchlist" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Execution_orderId_key" ON "Execution"("orderId");
UPDATE "Watchlist" SET "isDefault" = true WHERE id IN (SELECT DISTINCT ON ("userId") id FROM "Watchlist" ORDER BY "userId", "createdAt");
CREATE UNIQUE INDEX "one_default_watchlist" ON "Watchlist"("userId") WHERE "isDefault";
ALTER TABLE "TradingAccount" ADD CONSTRAINT "nonnegative_cash" CHECK ("availableCash" >= 0 AND "reservedCash" >= 0);
ALTER TABLE "TradingAccount" ADD CONSTRAINT "valid_capital" CHECK ("initialCapital" >= 100 AND "initialCapital" <= 1000000);
ALTER TABLE "Position" ADD CONSTRAINT "positive_inventory" CHECK (quantity > 0);
ALTER TABLE "Order" ADD CONSTRAINT "positive_order" CHECK (quantity > 0 AND "filledQuantity" >= 0 AND "filledQuantity" <= quantity AND "reservedAmount" >= 0 AND "reservedQuantity" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "valid_fee_rate" CHECK ("feeRate" >= 0 AND "feeRate" <= 0.1);

CREATE FUNCTION prevent_financial_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Financial records are append-only. Use an explicit adjustment record.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_execution BEFORE UPDATE OR DELETE ON "Execution" FOR EACH ROW EXECUTE FUNCTION prevent_financial_rewrite();
CREATE TRIGGER immutable_ledger_entry BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION prevent_financial_rewrite();
CREATE TRIGGER immutable_ledger_transaction BEFORE UPDATE OR DELETE ON "LedgerTransaction" FOR EACH ROW EXECUTE FUNCTION prevent_financial_rewrite();

CREATE FUNCTION protect_starting_capital() RETURNS trigger AS $$
BEGIN
  IF NEW."initialCapital" IS DISTINCT FROM OLD."initialCapital" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW."dataMode" IS DISTINCT FROM OLD."dataMode" THEN
    RAISE EXCEPTION 'Account origin is immutable. Create a separate simulation account.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_account_origin BEFORE UPDATE ON "TradingAccount" FOR EACH ROW EXECUTE FUNCTION protect_starting_capital();

CREATE FUNCTION protect_challenge_rules() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ChallengeParticipant" WHERE "challengeId" = OLD.id) AND (
    NEW."startingCapital" IS DISTINCT FROM OLD."startingCapital" OR NEW.configuration IS DISTINCT FROM OLD.configuration OR
    NEW."startTime" IS DISTINCT FROM OLD."startTime" OR NEW."endTime" IS DISTINCT FROM OLD."endTime") THEN
    RAISE EXCEPTION 'Competition rules are immutable after the first participant joins.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_challenge_rules BEFORE UPDATE ON "Challenge" FOR EACH ROW EXECUTE FUNCTION protect_challenge_rules();
