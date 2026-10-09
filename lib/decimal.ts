import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export const ZERO = new Decimal(0);

export function asDecimal(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function decimalString(value: Decimal.Value, places = 2): string {
  return new Decimal(value).toDecimalPlaces(places).toFixed(places);
}

export function decimalNumber(value: Decimal.Value): number {
  return new Decimal(value).toNumber();
}

export function jsonDecimal(value: Decimal | null | undefined): string | null {
  return value == null ? null : value.toString();
}
