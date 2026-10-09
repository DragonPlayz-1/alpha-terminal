"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";

type Candle = { time: number; open: string; high: string; low: string; close: string; volume: string };

export function PriceChart({ candles, height = 360 }: { candles: Candle[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#7f8ba0", fontFamily: "Arial, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: "rgba(255,255,255,.035)" }, horzLines: { color: "rgba(255,255,255,.035)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,.08)" },
      timeScale: { borderColor: "rgba(255,255,255,.08)", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "rgba(139,140,255,.45)", width: 1, style: 2 }, horzLine: { color: "rgba(139,140,255,.45)", width: 1, style: 2 } },
    });
    const candlesSeries = chart.addSeries(CandlestickSeries, { upColor: "#36d399", downColor: "#fb7185", borderVisible: false, wickUpColor: "#36d399", wickDownColor: "#fb7185" });
    const volumes = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", color: "rgba(139,140,255,.22)" });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart; candleRef.current = candlesSeries; volumeRef.current = volumes;
    const resize = () => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }); };
    const observer = new ResizeObserver(resize); observer.observe(containerRef.current);
    return () => { observer.disconnect(); chart.remove(); chartRef.current = null; };
  }, [height]);

  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;
    const candleData = candles.map((candle) => ({ time: candle.time as never, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close) }));
    const volumeData = candles.map((candle) => ({ time: candle.time as never, value: Number(candle.volume), color: Number(candle.close) >= Number(candle.open) ? "rgba(54,211,153,.22)" : "rgba(251,113,133,.22)" }));
    candleRef.current.setData(candleData); volumeRef.current.setData(volumeData); chartRef.current?.timeScale().fitContent();
  }, [candles, height]);

  return <div className="relative"><div ref={containerRef} style={{ height }} className="w-full" />{!candles.length && <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">No candle data available yet.</div>}</div>;
}
