ALTER TABLE "Order" ADD COLUMN "requestFingerprint" TEXT;
ALTER TABLE "ChallengeParticipant" ADD COLUMN "finalizedAt" TIMESTAMP(3), ADD COLUMN "valuationAt" TIMESTAMP(3);

ALTER TABLE "Execution" ADD CONSTRAINT "valid_execution" CHECK (quantity > 0 AND "executionPrice" > 0 AND fee >= 0);
ALTER TABLE "Position" ADD CONSTRAINT "valid_position_values" CHECK ("averageEntryPrice" > 0 AND leverage >= 1 AND leverage <= 20);
ALTER TABLE "Instrument" ADD CONSTRAINT "valid_instrument_values" CHECK ("tickSize" > 0 AND "minimumQuantity" > 0 AND "contractMultiplier" > 0 AND "maximumLeverage" >= 1);
ALTER TABLE "Order" ADD CONSTRAINT "valid_order_prices" CHECK (("limitPrice" IS NULL OR "limitPrice" > 0) AND ("stopPrice" IS NULL OR "stopPrice" > 0) AND leverage >= 1 AND leverage <= 20);
ALTER TABLE "Order" ADD CONSTRAINT "valid_order_reservations" CHECK ("reservedQuantity" <= quantity AND "reservedAmount" >= 0);
ALTER TABLE "MarketQuote" ADD CONSTRAINT "valid_quote_values" CHECK ((bid IS NULL OR bid > 0) AND (ask IS NULL OR ask >= bid) AND ("lastPrice" IS NULL OR "lastPrice" > 0));
ALTER TABLE "Challenge" ADD CONSTRAINT "valid_challenge_window" CHECK ("endTime" > "startTime");
CREATE INDEX "Order_status_id_idx" ON "Order" (status, id);
CREATE INDEX "PasswordToken_expiresAt_idx" ON "PasswordToken" ("expiresAt");

CREATE FUNCTION protect_final_challenge_result() RETURNS trigger AS $$
BEGIN
  IF OLD."finalizedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Final challenge results are immutable.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_challenge_result BEFORE UPDATE ON "ChallengeParticipant" FOR EACH ROW EXECUTE FUNCTION protect_final_challenge_result();

CREATE FUNCTION verify_ledger_account() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LedgerTransaction" WHERE id = NEW."transactionId" AND "accountId" = NEW."accountId") THEN
    RAISE EXCEPTION 'Ledger entry and transaction must belong to the same account.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_account_match BEFORE INSERT ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION verify_ledger_account();
