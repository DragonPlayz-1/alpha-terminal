import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createTradingAccount } from "@/server/auth/account";

export async function trader(capital = "10000", publicHistory = false) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  return db.$transaction(async tx => {
    const user = await tx.user.create({ data: { username: `test_${suffix}`, email: `${suffix}@example.test`, passwordHash: "not-a-login-hash", publicHistory } });
    const account = await createTradingAccount(user.id, capital, tx);
    return { user, account };
  });
}

export async function market(derivative = false, bid = "100", ask = "101") {
  const symbol = `T${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}-${derivative ? "PERP" : "USD"}`;
  const instrument = await db.instrument.create({ data: { symbol, name: "Isolated test instrument", providerSymbol: symbol, baseAsset: symbol.split("-")[0], quoteAsset: "USD", assetClass: "CRYPTO", instrumentType: derivative ? "PERPETUAL" : "SPOT", dataProvider: "test-fixture", maximumLeverage: derivative ? 20 : 1, tickSize: "0.01", minimumQuantity: "0.00000001" } });
  await quote(instrument.id, bid, ask);
  return instrument;
}

export async function quote(instrumentId: string, bid = "100", ask = "101", sourceTimestamp = new Date()) {
  return db.marketQuote.upsert({ where: { instrumentId }, create: { instrumentId, bid, ask, lastPrice: bid, markPrice: bid, mode: "LIVE", sourceTimestamp }, update: { bid, ask, lastPrice: bid, markPrice: bid, mode: "LIVE", sourceTimestamp } });
}

export const clientOrderId = () => randomUUID();
