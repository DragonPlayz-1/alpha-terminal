export type Candle = { time: number; open: string; high: string; low: string; close: string; volume: string };
export function normalizeCandles(candles: Candle[]) {
  const values = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();
  for (const candle of candles) {
    const row = { time: candle.time, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume) };
    if (!Number.isInteger(row.time) || row.time <= 0 || !Object.values(row).every(Number.isFinite) || Math.min(row.open, row.high, row.low, row.close) <= 0 || row.volume < 0 || row.high < Math.max(row.open, row.close, row.low) || row.low > Math.min(row.open, row.close)) continue;
    values.set(row.time, row);
  }
  return [...values.values()].sort((a, b) => a.time - b.time);
}
export function movingAverage(candles: Array<{ time: number; close: number }>, period: number, exponential = false) {
  if (!Number.isInteger(period) || period < 2) return [];
  const result: Array<{ time: number; value: number }> = [];
  let sum = 0, previous = 0;
  for (let index = 0; index < candles.length; index++) {
    sum += candles[index].close;
    if (index >= period) sum -= candles[index - period].close;
    if (index < period - 1) continue;
    previous = exponential && index >= period ? previous + (candles[index].close - previous) * 2 / (period + 1) : sum / period;
    result.push({ time: candles[index].time, value: previous });
  }
  return result;
}
