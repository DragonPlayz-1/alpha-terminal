import { db } from "@/lib/db";
import { createNotification } from "@/server/notifications";
import { getTradingConfig } from "@/server/config";
import { isFresh } from "@/server/market-data/service";
import { assertWorkerRunning, fenceWorkerTransaction } from "@/server/worker-context";

export async function processPriceAlerts() {
  const { quoteMaxAgeMs } = await getTradingConfig();
  const alerts = await db.priceAlert.findMany({ where: { active: true }, select: { id: true, userId: true, symbol: true, direction: true, target: true } });
  if (!alerts.length) return 0;
  const symbols = [...new Set(alerts.map(alert => alert.symbol))];
  const quotes = await db.marketQuote.findMany({ where: { instrument: { symbol: { in: symbols } } }, include: { instrument: { select: { symbol: true, name: true } } } });
  const bySymbol = new Map(quotes.map(quote => [quote.instrument.symbol, quote]));
  let triggered = 0;
  for (const alert of alerts) {
    assertWorkerRunning();
    const quote = bySymbol.get(alert.symbol);
    if (!quote || quote.mode !== "LIVE" || !isFresh(quote, Date.now(), quoteMaxAgeMs)) continue;
    const price = quote?.lastPrice ?? quote?.markPrice;
    if (!price) continue;
    const reached = alert.direction === "ABOVE" ? price.gte(alert.target) : price.lte(alert.target);
    if (!reached) continue;
    const result = await db.$transaction(async tx => {
      await fenceWorkerTransaction(tx);
      const claimed = await tx.priceAlert.updateMany({ where: { id: alert.id, active: true }, data: { active: false } });
      if (!claimed.count) return false;
      await createNotification(tx, { user: { connect: { id: alert.userId } }, notificationType: "PRICE_ALERT", title: `${alert.symbol} price alert`, message: `${alert.symbol} reached ${price.toString()} (${alert.direction === "ABOVE" ? "at or above" : "at or below"} ${alert.target.toString()}).`, metadata: { alertId: alert.id, symbol: alert.symbol, target: alert.target.toString(), price: price.toString() } });
      await fenceWorkerTransaction(tx);
      return true;
    });
    if (result) triggered++;
  }
  return triggered;
}
