import { z } from "zod";

export const chartPreferenceSchema = z.object({
  type: z.enum(["candles", "line", "area"]),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "6h", "1d"]),
  indicator: z.enum(["none", "sma20", "ema20"]),
  period: z.number().int().min(2).max(100),
  volume: z.boolean(),
  crosshair: z.boolean(),
});
export type ChartPreferences = z.infer<typeof chartPreferenceSchema>;
export const defaultChartPreferences: ChartPreferences = { type: "candles", timeframe: "1h", indicator: "none", period: 20, volume: true, crosshair: true };
export function normalizeChartPreferences(value: unknown): ChartPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaultChartPreferences };
  const result = { ...defaultChartPreferences };
  for (const key of Object.keys(defaultChartPreferences) as Array<keyof ChartPreferences>) {
    const parsed = chartPreferenceSchema.shape[key].safeParse((value as Record<string, unknown>)[key]);
    if (parsed.success) Object.assign(result, { [key]: parsed.data });
  }
  return result;
}
