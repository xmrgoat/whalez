'use client';

import { useEffect, useRef } from 'react';
import { init, dispose, Chart as KLineChart, CandleType, LineType } from 'klinecharts';

interface ChartProps {
  symbol: string;
  timeframe: string;
  data?: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  indicators?: string[];
}

export default function Chart({ symbol, timeframe, data = [], indicators = [] }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KLineChart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize chart
    chartRef.current = init(containerRef.current, {
      styles: {
        grid: {
          show: true,
          horizontal: { color: '#e5e5e5' },
          vertical: { color: '#e5e5e5' },
        },
        candle: {
          type: CandleType.CandleSolid,
          bar: {
            upColor: '#000000',
            downColor: '#ffffff',
            upBorderColor: '#000000',
            downBorderColor: '#000000',
          },
        },
        indicator: {
          lineColors: ['#000000', '#737373', '#a3a3a3'],
        },
        xAxis: {
          axisLine: { color: '#e5e5e5' },
          tickLine: { color: '#e5e5e5' },
          tickText: { color: '#737373' },
        },
        yAxis: {
          axisLine: { color: '#e5e5e5' },
          tickLine: { color: '#e5e5e5' },
          tickText: { color: '#737373' },
        },
        crosshair: {
          horizontal: { line: { color: '#000000', style: LineType.Dashed } },
          vertical: { line: { color: '#000000', style: LineType.Dashed } },
        },
      },
    });

    return () => {
      if (containerRef.current) {
        dispose(containerRef.current);
      }
    };
  }, []);

  // Update data
  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const formattedData = data.map(d => ({
      timestamp: d.timestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    }));

    chartRef.current.applyNewData(formattedData);
  }, [data]);

  // Update indicators
  useEffect(() => {
    if (!chartRef.current) return;

    // Remove all indicators first
    chartRef.current.removeIndicator('candle_pane');

    // Add requested indicators
    for (const indicator of indicators) {
      switch (indicator.toLowerCase()) {
        case 'ema20':
          chartRef.current.createIndicator({ name: 'EMA', calcParams: [20] }, false, { id: 'candle_pane' });
          break;
        case 'ema50':
          chartRef.current.createIndicator({ name: 'EMA', calcParams: [50] }, false, { id: 'candle_pane' });
          break;
        case 'ema200':
          chartRef.current.createIndicator({ name: 'EMA', calcParams: [200] }, false, { id: 'candle_pane' });
          break;
        case 'rsi':
          chartRef.current.createIndicator({ name: 'RSI', calcParams: [14] }, true);
          break;
        case 'macd':
          chartRef.current.createIndicator('MACD', true);
          break;
        case 'volume':
          chartRef.current.createIndicator('VOL', true);
          break;
      }
    }
  }, [indicators]);

  return (
    <div className="w-full h-full">
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="font-pixel text-xs">{symbol}</div>
        <div className="text-xs text-muted-foreground">{timeframe}</div>
      </div>
      <div ref={containerRef} className="w-full h-[calc(100%-24px)]" />
    </div>
  );
}
