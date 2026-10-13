"use client";

import { useEffect, useMemo, useRef } from "react";
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { defaultChartPreferences, type ChartPreferences } from "@/lib/chart-preferences";
import { movingAverage, normalizeCandles, type Candle } from "@/lib/chart-data";

export function PriceChart({ candles, height = 360, preferences = defaultChartPreferences }: { candles: Candle[]; height?: number; preferences?: ChartPreferences }) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const areaRef = useRef<ISeriesApi<"Area"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const averageRef = useRef<ISeriesApi<"Line"> | null>(null);
  const fitted = useRef(false);
  const normalized = useMemo(() => normalizeCandles(candles).map(candle => ({ ...candle, time: candle.time as UTCTimestamp })), [candles]);

  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      width: Math.max(1, container.current.clientWidth), height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9aa6bb", fontFamily: "system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: "rgba(255,255,255,.035)" }, horzLines: { color: "rgba(255,255,255,.035)" } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "rgba(255,255,255,.08)" },
      rightPriceScale: { borderColor: "rgba(255,255,255,.08)" },
    });
    chartRef.current = chart;
    candleRef.current = chart.addSeries(CandlestickSeries, { upColor: "#36d399", downColor: "#fb7185", borderVisible: false, wickUpColor: "#36d399", wickDownColor: "#fb7185" });
    lineRef.current = chart.addSeries(LineSeries, { color: "#a3a4ff", lineWidth: 2 });
    areaRef.current = chart.addSeries(AreaSeries, { lineColor: "#a3a4ff", topColor: "rgba(139,140,255,.3)", bottomColor: "rgba(139,140,255,0)", lineWidth: 2 });
    volumeRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", priceLineVisible: false, lastValueVisible: false });
    volumeRef.current.priceScale().applyOptions({ scaleMargins: { top: .82, bottom: 0 } });
    averageRef.current = chart.addSeries(LineSeries, { color: "#70d6ff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const resize = () => { if (container.current) chart.applyOptions({ width: Math.max(1, container.current.clientWidth) }); };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(container.current);
    if (!observer) window.addEventListener("resize", resize);
    fitted.current = false;
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); chart.remove(); chartRef.current = null; candleRef.current = null; lineRef.current = null; areaRef.current = null; volumeRef.current = null; averageRef.current = null; };
  }, [height]);

  useEffect(() => {
    candleRef.current?.applyOptions({ visible: preferences.type === "candles" });
    lineRef.current?.applyOptions({ visible: preferences.type === "line" });
    areaRef.current?.applyOptions({ visible: preferences.type === "area" });
    volumeRef.current?.applyOptions({ visible: preferences.volume });
    averageRef.current?.applyOptions({ visible: preferences.indicator !== "none", color: preferences.indicator === "ema20" ? "#fbbf24" : "#70d6ff" });
    chartRef.current?.applyOptions({ crosshair: { mode: preferences.crosshair ? CrosshairMode.Normal : CrosshairMode.Hidden } });
  }, [preferences, height]);

  useEffect(() => {
    const line = normalized.map(candle => ({ time: candle.time, value: candle.close }));
    candleRef.current?.setData(normalized);
    lineRef.current?.setData(line); areaRef.current?.setData(line);
    volumeRef.current?.setData(normalized.map(candle => ({ time: candle.time, value: candle.volume, color: candle.close >= candle.open ? "rgba(54,211,153,.22)" : "rgba(251,113,133,.22)" })));
    averageRef.current?.setData(movingAverage(normalized, preferences.period, preferences.indicator === "ema20").map(point => ({ ...point, time: point.time as UTCTimestamp })));
    if (!normalized.length) fitted.current = false;
    else if (!fitted.current) { chartRef.current?.timeScale().fitContent(); fitted.current = true; }
  }, [normalized, preferences.period, preferences.indicator, height]);

  return <div role="img" aria-label={`${preferences.type} price chart${preferences.indicator !== "none" ? ` with ${preferences.indicator === "sma20" ? "SMA" : "EMA"} ${preferences.period}` : ""}`} className="relative rounded-xl bg-black/10"><div ref={container} style={{ height }} className="w-full" />{!normalized.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">No candle data available.</div>}</div>;
}
