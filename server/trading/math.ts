import { Decimal } from "@/lib/decimal";
export const D = (value: { toString(): string } | string | number) => new Decimal(value.toString());
export const fixed = (value: Decimal) => value.toDecimalPlaces(18).toFixed();
export const MAINTENANCE = D("0.025");
export const LIQUIDATION_FEE = D("0.005");
export function averageCost(oldQuantity: Decimal, oldPrice: Decimal, quantity: Decimal, price: Decimal) {
  return oldQuantity.mul(oldPrice).plus(quantity.mul(price)).div(oldQuantity.plus(quantity));
}
export function linearPnl(quantity: Decimal, entry: Decimal, mark: Decimal, side: "LONG" | "SHORT") {
  return mark.minus(entry).mul(quantity).mul(side === "LONG" ? 1 : -1);
}
// Isolated linear USD contracts: allocated margin + P&L = maintenance notional + liquidation fee.
export function liquidationPrice(quantity: Decimal, entry: Decimal, margin: Decimal, side: "LONG" | "SHORT") {
  const r = MAINTENANCE.plus(LIQUIDATION_FEE);
  return Decimal.max(0, side === "LONG"
    ? quantity.mul(entry).minus(margin).div(quantity.mul(D(1).minus(r)))
    : quantity.mul(entry).plus(margin).div(quantity.mul(D(1).plus(r))));
}
export function normalizedReturn(equity: Decimal, capital: Decimal, externalFlows = D(0)) {
  return equity.minus(capital).minus(externalFlows).div(capital).mul(100);
}
export function conditionalState(type: string, side: string, bid: Decimal, ask: Decimal, limit: Decimal | null, stop: Decimal | null, triggered: boolean) {
  const px = side === "BUY" ? ask : bid;
  const conditional = !["MARKET", "LIMIT"].includes(type);
  const take = type.startsWith("TAKE_PROFIT");
  const hit = !conditional || triggered || !!stop && ((side === "BUY") !== take ? px.gte(stop) : px.lte(stop));
  const isLimit = type.includes("LIMIT");
  return { triggered: conditional && hit, executable: hit && (!isLimit || !!limit && (side === "BUY" ? px.lte(limit) : px.gte(limit))) };
}
