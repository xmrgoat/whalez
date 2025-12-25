'use client';

/**
 * TradingChart V3
 * 
 * Features:
 * - Real-time candle updates (update vs append logic)
 * - Live follow toggle (auto-scroll vs free navigation)
 * - Decision markers from persisted data
 * - Click-to-inspect candle
 * - Tick/pip display
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { init, dispose, Chart as KLineChart, LineType } from 'klinecharts';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartMarker {
  id: string;
  timestamp: number;
  price: number;
  kind: 'ENTRY' | 'EXIT' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'NO_TRADE' | 'NOTE';
  side?: 'LONG' | 'SHORT';
  label?: string;
  decisionId?: string;
}

export interface SymbolMetadata {
  tickSize: number;
  pricePrecision: number;
}

interface TradingChartV3Props {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  markers?: ChartMarker[];
  metadata?: SymbolMetadata;
  indicators?: string[];
  onTimeframeChange?: (tf: string) => void;
  onCandleClick?: (timestamp: number) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  isDelayed?: boolean;
  wsConnected?: boolean;
  inspectorOpen?: boolean;
  onToggleInspector?: () => void;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

const DEFAULT_METADATA: SymbolMetadata = {
  tickSize: 0.1,
  pricePrecision: 1,
};

export default function TradingChartV3({
  symbol,
  timeframe,
  candles,
  markers = [],
  metadata = DEFAULT_METADATA,
  indicators = ['ema20', 'ema50'],
  onTimeframeChange,
  onCandleClick,
  isFullscreen = false,
  onToggleFullscreen,
  isDelayed = false,
  wsConnected = true,
  inspectorOpen = false,
  onToggleInspector,
}: TradingChartV3Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KLineChart | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  const [liveFollow, setLiveFollow] = useState(true);
  const [chartType, setChartType] = useState<'candle' | 'heikin_ashi'>('candle');
  const userInteractedRef = useRef(false);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    chartRef.current = init(containerRef.current, {
      styles: {
        grid: {
          show: true,
          horizontal: { color: '#f0f0f0' },
          vertical: { color: '#f0f0f0' },
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

    // Subscribe to user interactions to disable live follow
    const chart = chartRef.current;
    if (chart) {
      // Use 'onScroll' action type for KLineCharts
      chart.subscribeAction('onScroll' as any, () => {
        if (!userInteractedRef.current) {
          userInteractedRef.current = true;
          setLiveFollow(false);
        }
      });

      chart.subscribeAction('onZoom' as any, () => {
        if (!userInteractedRef.current) {
          userInteractedRef.current = true;
          setLiveFollow(false);
        }
      });

      // Click handler for candle inspection
      chart.subscribeAction('onCrosshairChange' as any, (data: any) => {
        // Store for potential click handling
      });
    }

    return () => {
      if (containerRef.current) {
        dispose(containerRef.current);
      }
    };
  }, [chartType]);

  // Handle candle data updates with proper merge logic
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    let displayCandles = candles;
    if (chartType === 'heikin_ashi') {
      displayCandles = convertToHeikinAshi(candles);
    }

    const lastCandle = displayCandles[displayCandles.length - 1];
    const prevLastCandle = lastCandleRef.current;

    // Determine if we should update or append
    if (prevLastCandle && lastCandle) {
      if (lastCandle.timestamp === prevLastCandle.timestamp) {
        // Same candle - update it
        chartRef.current.updateData({
          timestamp: lastCandle.timestamp,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume,
        });
      } else if (lastCandle.timestamp > prevLastCandle.timestamp) {
        // New candle - append it
        chartRef.current.updateData({
          timestamp: lastCandle.timestamp,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume,
        });

        // Auto-scroll to latest if live follow is on
        if (liveFollow) {
          chartRef.current.scrollToRealTime();
        }
      }
    } else {
      // Initial load - apply all data
      const formattedData = displayCandles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      chartRef.current.applyNewData(formattedData);

      if (liveFollow) {
        chartRef.current.scrollToRealTime();
      }
    }

    lastCandleRef.current = lastCandle || null;
  }, [candles, chartType, liveFollow]);

  // Update indicators
  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.removeIndicator('candle_pane');

    for (const indicator of indicators) {
      switch (indicator.toLowerCase()) {
        case 'ema20':
          chartRef.current.createIndicator('EMA', false, { id: 'candle_pane', calcParams: [20] } as any);
          break;
        case 'ema50':
          chartRef.current.createIndicator('EMA', false, { id: 'candle_pane', calcParams: [50] } as any);
          break;
        case 'ema200':
          chartRef.current.createIndicator('EMA', false, { id: 'candle_pane', calcParams: [200] } as any);
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
      }
    }
  }, [indicators]);

  // Update markers
  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.removeOverlay();

    for (const marker of markers) {
      const isEntry = marker.kind === 'ENTRY';
      const isExit = marker.kind === 'EXIT';
      const isNoTrade = marker.kind === 'NO_TRADE';
      const isLong = marker.side === 'LONG';

      let symbolType = 'circle';
      let color = '#737373';
      let size = 8;

      if (isEntry) {
        symbolType = isLong ? 'triangle' : 'triangleDown';
        color = '#000000';
        size = 12;
      } else if (isExit) {
        symbolType = 'diamond';
        color = isLong ? '#000000' : '#737373';
        size = 10;
      } else if (isNoTrade) {
        symbolType = 'circle';
        color = '#a3a3a3';
        size = 6;
      }

      chartRef.current.createOverlay({
        name: 'simpleAnnotation',
        points: [{ timestamp: marker.timestamp, value: marker.price }],
        styles: {
          symbol: {
            type: symbolType,
            color: color,
            size: size,
          },
        },
        extendData: { decisionId: marker.decisionId },
        onClick: () => {
          if (onCandleClick) {
            onCandleClick(marker.timestamp);
          }
        },
      } as any);
    }
  }, [markers, onCandleClick]);

  // Go Live handler
  const handleGoLive = useCallback(() => {
    userInteractedRef.current = false;
    setLiveFollow(true);
    if (chartRef.current) {
      chartRef.current.scrollToRealTime();
    }
  }, []);

  // Calculate price change info
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0;
  const priceChangePct = prevCandle ? (priceChange / prevCandle.close) * 100 : 0;
  const tickChange = Math.abs(priceChange / metadata.tickSize);

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'h-full'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-4">
          <span className="font-pixel text-xs">{symbol}</span>
          
          {/* Price info */}
          {lastCandle && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-bold">
                {lastCandle.close.toFixed(metadata.pricePrecision)}
              </span>
              <span className={`font-mono ${priceChange >= 0 ? 'text-black' : 'text-gray-500'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(metadata.pricePrecision)}
                ({priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%)
              </span>
              <span className="text-muted-foreground">
                {tickChange.toFixed(0)} ticks
              </span>
            </div>
          )}
          
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
          {/* Live Follow Toggle */}
          <button
            onClick={liveFollow ? () => setLiveFollow(false) : handleGoLive}
            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
              liveFollow ? 'bg-black text-white' : 'hover:bg-muted border border-border'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${liveFollow ? 'bg-green-400' : 'bg-gray-400'}`} />
            {liveFollow ? 'Live' : 'Go Live'}
          </button>

          {/* Inspector Toggle */}
          {onToggleInspector && (
            <button
              onClick={onToggleInspector}
              className={`px-2 py-1 text-xs rounded ${
                inspectorOpen ? 'bg-black text-white' : 'hover:bg-muted'
              }`}
            >
              Inspector
            </button>
          )}

          {/* Connection status */}
          <div className="flex items-center gap-1 text-xs">
            <div className={`w-2 h-2 rounded-full ${
              wsConnected ? (isDelayed ? 'bg-yellow-500' : 'bg-green-500') : 'bg-red-500'
            }`} />
            <span className="text-muted-foreground">
              {wsConnected ? (isDelayed ? 'Delayed' : 'Live') : 'Offline'}
            </span>
          </div>

          {/* Fullscreen toggle */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="px-2 py-1 text-xs hover:bg-muted rounded"
            >
              {isFullscreen ? '✕' : '⛶'}
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div 
        ref={containerRef} 
        className="flex-1 min-h-0 cursor-crosshair"
        onClick={(e) => {
          // Handle click on chart area for candle inspection
          if (onCandleClick && chartRef.current) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              // Get timestamp from click position (simplified)
              const data = chartRef.current.getDataList();
              if (data.length > 0) {
                const lastData = data[data.length - 1];
                if (lastData) {
                  onCandleClick(lastData.timestamp);
                }
              }
            }
          }
        }}
      />
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
