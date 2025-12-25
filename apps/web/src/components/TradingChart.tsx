'use client';

import { useEffect, useRef, useState } from 'react';
import { init, dispose, Chart as KLineChart, LineType, CandleType } from 'klinecharts';

// Use 'as any' for KLineCharts style types that vary between versions

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeMarker {
  id: string;
  timestamp: number;
  price: number;
  side: 'long' | 'short';
  action: 'entry' | 'exit';
}

export interface PriceLine {
  id: string;
  price: number;
  type: 'entry' | 'stop' | 'target';
  color: string;
}

export interface BotDecision {
  action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE';
  confirmations: Array<{ name: string; passed: boolean; reason: string }>;
  confidence: number;
  reason: string;
}

interface TradingChartProps {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  indicators?: string[];
  tradeMarkers?: TradeMarker[];
  priceLines?: PriceLine[];
  decision?: BotDecision | null;
  onTimeframeChange?: (tf: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  isDelayed?: boolean;
  wsConnected?: boolean;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function TradingChart({
  symbol,
  timeframe,
  candles,
  indicators = ['ema20', 'ema50', 'ema200'],
  tradeMarkers = [],
  priceLines = [],
  decision = null,
  onTimeframeChange,
  isFullscreen = false,
  onToggleFullscreen,
  isDelayed = false,
  wsConnected = true,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KLineChart | null>(null);
  const [chartType, setChartType] = useState<'candle' | 'heikin_ashi'>('candle');

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    chartRef.current = init(containerRef.current, {
      styles: {
        grid: {
          show: true,
          horizontal: { color: '#1a1a1a' },
          vertical: { color: '#1a1a1a' },
        },
        candle: {
          type: 'candle_solid' as any,
          bar: {
            upColor: '#000000',
            downColor: '#ffffff',
            upBorderColor: '#000000',
            downBorderColor: '#000000',
            upWickColor: '#000000',
            downWickColor: '#000000',
          },
          priceMark: {
            show: true,
            high: { show: true, color: '#000000' },
            low: { show: true, color: '#000000' },
            last: {
              show: true,
              upColor: '#000000',
              downColor: '#737373',
              line: { show: true, style: LineType.Dashed, dashedValue: [4, 4] } as any,
            },
          },
        },
        indicator: {
          lineColors: ['#000000', '#737373', '#a3a3a3', '#d4d4d4'],
        },
        xAxis: {
          axisLine: { color: '#e5e5e5' },
          tickLine: { color: '#e5e5e5' },
          tickText: { color: '#737373', size: 10 },
        },
        yAxis: {
          axisLine: { color: '#e5e5e5' },
          tickLine: { color: '#e5e5e5' },
          tickText: { color: '#737373', size: 10 },
        },
        crosshair: {
          show: true,
          horizontal: { 
            show: true,
            line: { color: '#000000', style: 'dashed' as any, size: 1 },
            text: { color: '#ffffff', backgroundColor: '#000000' },
          },
          vertical: { 
            show: true,
            line: { color: '#000000', style: 'dashed' as any, size: 1 },
            text: { color: '#ffffff', backgroundColor: '#000000' },
          },
        },
        separator: { color: '#e5e5e5' },
      },
    });

    return () => {
      if (containerRef.current) {
        dispose(containerRef.current);
      }
    };
  }, [chartType]);

  // Update candle data
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    let displayCandles = candles;

    // Convert to Heikin Ashi if needed
    if (chartType === 'heikin_ashi') {
      displayCandles = convertToHeikinAshi(candles);
    }

    const formattedData = displayCandles.map(c => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    chartRef.current.applyNewData(formattedData);
  }, [candles, chartType]);

  // Update indicators
  useEffect(() => {
    if (!chartRef.current) return;

    // Remove existing indicators
    chartRef.current.removeIndicator('candle_pane');

    // Add requested indicators
    for (const indicator of indicators) {
      switch (indicator.toLowerCase()) {
        case 'ema20':
          chartRef.current.createIndicator('EMA', false, { id: 'candle_pane' } as any);
          break;
        case 'ema50':
          chartRef.current.createIndicator('EMA', false, { id: 'candle_pane' } as any);
          break;
        case 'ema200':
          chartRef.current.createIndicator('EMA', false, { id: 'candle_pane' } as any);
          break;
        case 'rsi':
          chartRef.current.createIndicator('RSI', true);
          break;
        case 'macd':
          chartRef.current.createIndicator('MACD', true);
          break;
        case 'volume':
          chartRef.current.createIndicator('VOL', true);
          break;
        case 'ichimoku':
          // Custom Ichimoku would go here
          break;
      }
    }
  }, [indicators]);

  // Update price lines (entry, stop, target)
  useEffect(() => {
    if (!chartRef.current) return;

    // Remove existing overlays
    chartRef.current.removeOverlay();

    // Add price lines
    for (const line of priceLines) {
      chartRef.current.createOverlay({
        name: 'priceLine',
        points: [{ value: line.price }],
        styles: {
          line: {
            color: line.color,
            style: (line.type === 'entry' ? 'solid' : 'dashed') as any,
            size: line.type === 'entry' ? 2 : 1,
          },
        },
      } as any);
    }

    // Add trade markers
    for (const marker of tradeMarkers) {
      const isEntry = marker.action === 'entry';
      const isLong = marker.side === 'long';
      
      chartRef.current.createOverlay({
        name: 'simpleAnnotation',
        points: [{ timestamp: marker.timestamp, value: marker.price }],
        styles: {
          symbol: {
            type: isEntry ? (isLong ? 'triangle' : 'triangleDown') : 'circle',
            color: isLong ? '#000000' : '#737373',
            size: 12,
          },
        },
      });
    }
  }, [priceLines, tradeMarkers]);

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'h-full'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-4">
          <span className="font-pixel text-xs">{symbol}</span>
          
          {/* Timeframe selector */}
          <div className="flex gap-1">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => onTimeframeChange?.(tf)}
                className={`px-2 py-1 text-xs rounded ${
                  timeframe === tf 
                    ? 'bg-black text-white' 
                    : 'hover:bg-muted'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart type toggle */}
          <button
            onClick={() => setChartType(t => t === 'candle' ? 'heikin_ashi' : 'candle')}
            className={`px-2 py-1 text-xs rounded ${
              chartType === 'heikin_ashi' ? 'bg-black text-white' : 'hover:bg-muted'
            }`}
          >
            HA
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1 text-xs">
            <div className={`w-2 h-2 rounded-full ${
              wsConnected ? (isDelayed ? 'bg-yellow-500' : 'bg-green-500') : 'bg-red-500'
            }`} />
            <span className="text-muted-foreground">
              {wsConnected ? (isDelayed ? 'Delayed' : 'Live') : 'Disconnected'}
            </span>
          </div>

          {/* Fullscreen toggle */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="px-2 py-1 text-xs hover:bg-muted rounded"
            >
              {isFullscreen ? '✕ Exit' : '⛶ Expand'}
            </button>
          )}
        </div>
      </div>

      {/* Decision Ribbon */}
      {decision && (
        <div className="px-3 py-2 border-b border-border bg-muted/50">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className={`font-bold ${
                decision.action === 'LONG' ? 'text-green-600' :
                decision.action === 'SHORT' ? 'text-red-600' :
                'text-muted-foreground'
              }`}>
                {decision.action}
              </span>
              <span className="text-muted-foreground">
                {decision.confirmations.filter(c => c.passed).length}/{decision.confirmations.length} confirmations
              </span>
              <span className="text-muted-foreground">
                {decision.confidence}% confidence
              </span>
            </div>
            <div className="flex gap-2">
              {decision.confirmations.map((c, i) => (
                <span 
                  key={i}
                  className={`px-1 rounded ${c.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  title={c.reason}
                >
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}

// Convert candles to Heikin Ashi
function convertToHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];

  const result: Candle[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = result[i - 1];

    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = prev 
      ? (prev.open + prev.close) / 2 
      : (c.open + c.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    result.push({
      timestamp: c.timestamp,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
    });
  }

  return result;
}
