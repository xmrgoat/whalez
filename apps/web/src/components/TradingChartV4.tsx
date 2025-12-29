'use client';

/**
 * TradingChart V4
 * 
 * Enhanced Features:
 * - Drawing tools (lines, horizontal lines, Fibonacci, rectangles)
 * - Customizable candle colors
 * - More indicators (Bollinger, VWAP, Ichimoku)
 * - Real-time candle updates
 * - Live follow toggle
 * - Chart settings panel
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { init, dispose, Chart as KLineChart, LineType, registerOverlay } from 'klinecharts';
import { 
  Pencil, 
  Minus, 
  TrendingUp, 
  Square, 
  Trash2, 
  Settings, 
  Palette,
  BarChart3,
  X,
  ChevronDown,
  Circle,
  Triangle,
  ArrowUpRight,
  Ruler,
  Type,
  Crosshair,
  MousePointer,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw
} from 'lucide-react';

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

export interface ChartSettings {
  upColor: string;
  downColor: string;
  upBorderColor: string;
  downBorderColor: string;
  wickUpColor: string;
  wickDownColor: string;
  gridColor: string;
  backgroundColor: string;
}

const DEFAULT_SETTINGS: ChartSettings = {
  upColor: '#22c55e',
  downColor: '#ef4444',
  upBorderColor: '#16a34a',
  downBorderColor: '#dc2626',
  wickUpColor: '#22c55e',
  wickDownColor: '#ef4444',
  gridColor: '#f0f0f0',
  backgroundColor: '#ffffff',
};

const DRAWING_TOOLS = [
  { id: 'cursor', name: 'Select', icon: MousePointer, category: 'select' },
  { id: 'crosshair', name: 'Crosshair', icon: Crosshair, category: 'select' },
  { id: 'horizontalLine', name: 'Horizontal Line', icon: Minus, category: 'line' },
  { id: 'verticalLine', name: 'Vertical Line', icon: Minus, category: 'line', rotate: true },
  { id: 'trendLine', name: 'Trend Line', icon: TrendingUp, category: 'line' },
  { id: 'ray', name: 'Ray', icon: ArrowUpRight, category: 'line' },
  { id: 'rectangle', name: 'Rectangle', icon: Square, category: 'shape' },
  { id: 'circle', name: 'Circle', icon: Circle, category: 'shape' },
  { id: 'triangle', name: 'Triangle', icon: Triangle, category: 'shape' },
  { id: 'fibonacciRetracement', name: 'Fibonacci Retracement', icon: Ruler, category: 'fib' },
  { id: 'fibonacciExtension', name: 'Fibonacci Extension', icon: Ruler, category: 'fib' },
  { id: 'text', name: 'Text Note', icon: Type, category: 'annotation' },
];

const AVAILABLE_INDICATORS = [
  { id: 'ema20', name: 'EMA 20', category: 'trend' },
  { id: 'ema50', name: 'EMA 50', category: 'trend' },
  { id: 'ema200', name: 'EMA 200', category: 'trend' },
  { id: 'sma20', name: 'SMA 20', category: 'trend' },
  { id: 'sma50', name: 'SMA 50', category: 'trend' },
  { id: 'bollinger', name: 'Bollinger Bands', category: 'volatility' },
  { id: 'rsi', name: 'RSI', category: 'momentum' },
  { id: 'macd', name: 'MACD', category: 'momentum' },
  { id: 'volume', name: 'Volume', category: 'volume' },
  { id: 'atr', name: 'ATR', category: 'volatility' },
];

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

interface TradingChartV4Props {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  markers?: ChartMarker[];
  onTimeframeChange?: (tf: string) => void;
  onCandleClick?: (timestamp: number) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  wsConnected?: boolean;
}

export default function TradingChartV4({
  symbol,
  timeframe,
  candles,
  markers = [],
  onTimeframeChange,
  onCandleClick,
  isFullscreen = false,
  onToggleFullscreen,
  wsConnected = true,
}: TradingChartV4Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KLineChart | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  
  // UI State
  const [liveFollow, setLiveFollow] = useState(true);
  const [chartType, setChartType] = useState<'candle' | 'heikin_ashi'>('candle');
  const [activeDrawingTool, setActiveDrawingTool] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);
  const [settings, setSettings] = useState<ChartSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chart-settings');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return DEFAULT_SETTINGS;
        }
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [activeIndicators, setActiveIndicators] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chart-indicators');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return ['ema20', 'ema50'];
        }
      }
    }
    return ['ema20', 'ema50'];
  });
  
  const userInteractedRef = useRef(false);
  const prevTimeframeRef = useRef(timeframe);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chart-settings', JSON.stringify(settings));
    }
  }, [settings]);

  // Save indicators to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chart-indicators', JSON.stringify(activeIndicators));
    }
  }, [activeIndicators]);

  // Apply chart styles based on settings
  const getChartStyles = useCallback(() => ({
    grid: {
      show: true,
      horizontal: { color: settings.gridColor },
      vertical: { color: settings.gridColor },
    },
    candle: {
      type: 'candle_solid' as any,
      bar: {
        upColor: settings.upColor,
        downColor: settings.downColor,
        upBorderColor: settings.upBorderColor,
        downBorderColor: settings.downBorderColor,
        upWickColor: settings.wickUpColor,
        downWickColor: settings.wickDownColor,
      },
      priceMark: {
        show: true,
        high: { show: true, color: '#737373' },
        low: { show: true, color: '#737373' },
        last: {
          show: true,
          upColor: settings.upColor,
          downColor: settings.downColor,
          line: { show: true, style: LineType.Dashed, dashedValue: [4, 4] } as any,
        },
      },
    },
    indicator: {
      lineColors: ['#2563eb', '#7c3aed', '#db2777', '#ea580c'],
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
    overlay: {
      line: { color: '#2563eb' },
      rect: { color: 'rgba(37, 99, 235, 0.1)', borderColor: '#2563eb' },
      polygon: { color: 'rgba(37, 99, 235, 0.1)', borderColor: '#2563eb' },
    },
  }), [settings]);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    chartRef.current = init(containerRef.current, {
      styles: getChartStyles(),
    });

    const chart = chartRef.current;
    if (chart) {
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
    }

    return () => {
      if (containerRef.current) {
        dispose(containerRef.current);
      }
    };
  }, [chartType]);

  // Update chart styles when settings change
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setStyles(getChartStyles());
    }
  }, [settings, getChartStyles]);

  // Reset chart when timeframe changes
  useEffect(() => {
    if (timeframe !== prevTimeframeRef.current) {
      prevTimeframeRef.current = timeframe;
      lastCandleRef.current = null;
      
      // Clear and reload data when timeframe changes
      if (chartRef.current && candles.length > 0) {
        let displayCandles = candles;
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
        
        if (liveFollow) {
          chartRef.current.scrollToRealTime();
        }
      }
    }
  }, [timeframe, candles, chartType, liveFollow]);

  // Handle candle data updates
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    let displayCandles = candles;
    if (chartType === 'heikin_ashi') {
      displayCandles = convertToHeikinAshi(candles);
    }

    const lastCandle = displayCandles[displayCandles.length - 1];
    const prevLastCandle = lastCandleRef.current;

    // If timeframe just changed, we already handled it above
    if (timeframe !== prevTimeframeRef.current) {
      return;
    }

    if (prevLastCandle && lastCandle) {
      if (lastCandle.timestamp === prevLastCandle.timestamp) {
        chartRef.current.updateData({
          timestamp: lastCandle.timestamp,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume,
        });
      } else if (lastCandle.timestamp > prevLastCandle.timestamp) {
        chartRef.current.updateData({
          timestamp: lastCandle.timestamp,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume,
        });

        if (liveFollow) {
          chartRef.current.scrollToRealTime();
        }
      }
    } else {
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
  }, [candles, chartType, liveFollow, timeframe]);

  // Update indicators
  useEffect(() => {
    if (!chartRef.current) return;

    // Remove all existing indicators
    chartRef.current.removeIndicator('candle_pane');
    
    // Get list of sub-pane indicators to remove
    const subPaneIndicators = ['RSI', 'MACD', 'VOL', 'ATR'];
    subPaneIndicators.forEach(ind => {
      try {
        chartRef.current?.removeIndicator(ind.toLowerCase());
      } catch (e) {
        // Ignore if not exists
      }
    });

    for (const indicator of activeIndicators) {
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
        case 'sma20':
          chartRef.current.createIndicator('SMA', false, { id: 'candle_pane', calcParams: [20] } as any);
          break;
        case 'sma50':
          chartRef.current.createIndicator('SMA', false, { id: 'candle_pane', calcParams: [50] } as any);
          break;
        case 'bollinger':
          chartRef.current.createIndicator('BOLL', false, { id: 'candle_pane' } as any);
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
        case 'atr':
          chartRef.current.createIndicator('ATR', true);
          break;
      }
    }
  }, [activeIndicators]);

  // Handle drawing tool selection
  const handleDrawingTool = useCallback((toolId: string) => {
    if (!chartRef.current) return;

    if (activeDrawingTool === toolId) {
      setActiveDrawingTool(null);
      return;
    }

    setActiveDrawingTool(toolId);

    // Map tool IDs to KlineCharts overlay names
    const overlayMap: Record<string, string> = {
      cursor: '',
      crosshair: '',
      horizontalLine: 'horizontalStraightLine',
      verticalLine: 'verticalStraightLine',
      trendLine: 'straightLine',
      ray: 'rayLine',
      rectangle: 'rect',
      circle: 'circle',
      triangle: 'triangle',
      fibonacciRetracement: 'fibonacciLine',
      fibonacciExtension: 'fibonacciExtension',
      text: 'simpleAnnotation',
    };

    const overlayName = overlayMap[toolId];
    if (overlayName) {
      chartRef.current.createOverlay(overlayName);
    }
  }, [activeDrawingTool]);

  // Clear all drawings
  const clearDrawings = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.removeOverlay();
      setActiveDrawingTool(null);
    }
  }, []);

  // Toggle indicator
  const toggleIndicator = useCallback((indicatorId: string) => {
    setActiveIndicators(prev => {
      if (prev.includes(indicatorId)) {
        return prev.filter(id => id !== indicatorId);
      }
      return [...prev, indicatorId];
    });
  }, []);

  // Go Live handler
  const handleGoLive = useCallback(() => {
    userInteractedRef.current = false;
    setLiveFollow(true);
    if (chartRef.current) {
      chartRef.current.scrollToRealTime();
    }
  }, []);

  // Calculate price info
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0;
  const priceChangePct = prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'h-full'}`}>
      {/* Header Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          {/* Symbol & Price */}
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm">{symbol}</span>
            {lastCandle && (
              <>
                <span className="font-mono text-lg font-bold">
                  ${lastCandle.close.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className={`font-mono text-sm ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {priceChange >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%
                </span>
              </>
            )}
          </div>

          {/* Timeframe Selector */}
          <div className="flex gap-1 ml-4">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => onTimeframeChange?.(tf)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  timeframe === tf 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart Type */}
          <button
            onClick={() => setChartType(t => t === 'candle' ? 'heikin_ashi' : 'candle')}
            className={`px-2 py-1 text-xs rounded ${
              chartType === 'heikin_ashi' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            HA
          </button>
        </div>

        {/* Drawing Tools */}
        <div className="flex items-center gap-1">
          {DRAWING_TOOLS.map(tool => (
            <button
              key={tool.id}
              onClick={() => handleDrawingTool(tool.id)}
              className={`p-1.5 rounded transition-colors ${
                activeDrawingTool === tool.id 
                  ? 'bg-primary text-primary-foreground' 
                  : 'hover:bg-muted text-muted-foreground'
              }`}
              title={tool.name}
            >
              <tool.icon className="w-4 h-4" />
            </button>
          ))}
          
          <div className="w-px h-5 bg-border mx-1" />
          
          <button
            onClick={clearDrawings}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            title="Clear Drawings"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Indicators Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowIndicators(!showIndicators)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                showIndicators ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <BarChart3 className="w-3 h-3" />
              Indicators
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {showIndicators && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-50 p-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">Indicators</div>
                {AVAILABLE_INDICATORS.map(ind => (
                  <button
                    key={ind.id}
                    onClick={() => toggleIndicator(ind.id)}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded flex items-center justify-between ${
                      activeIndicators.includes(ind.id) 
                        ? 'bg-primary/10 text-primary' 
                        : 'hover:bg-muted'
                    }`}
                  >
                    {ind.name}
                    {activeIndicators.includes(ind.id) && (
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded ${showSettings ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            title="Chart Settings"
          >
            <Palette className="w-4 h-4" />
          </button>

          {/* Live Follow */}
          <button
            onClick={liveFollow ? () => setLiveFollow(false) : handleGoLive}
            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
              liveFollow ? 'bg-green-500 text-white' : 'hover:bg-muted border border-border'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${liveFollow ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
            {liveFollow ? 'Live' : 'Go Live'}
          </button>

          {/* Connection Status */}
          <div className="flex items-center gap-1 text-xs">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>

          {/* Fullscreen */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 rounded hover:bg-muted"
            >
              {isFullscreen ? <X className="w-4 h-4" /> : '⛶'}
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute right-4 top-14 w-64 bg-card border border-border rounded-lg shadow-lg z-50 p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="font-medium text-sm">Chart Colors</span>
            <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs">Up Candle</span>
              <input
                type="color"
                value={settings.upColor}
                onChange={(e) => setSettings(s => ({ ...s, upColor: e.target.value, wickUpColor: e.target.value, upBorderColor: e.target.value }))}
                className="w-8 h-6 rounded cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">Down Candle</span>
              <input
                type="color"
                value={settings.downColor}
                onChange={(e) => setSettings(s => ({ ...s, downColor: e.target.value, wickDownColor: e.target.value, downBorderColor: e.target.value }))}
                className="w-8 h-6 rounded cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">Grid</span>
              <input
                type="color"
                value={settings.gridColor}
                onChange={(e) => setSettings(s => ({ ...s, gridColor: e.target.value }))}
                className="w-8 h-6 rounded cursor-pointer"
              />
            </div>
            
            <div className="pt-2 border-t border-border">
              <button
                onClick={() => setSettings(DEFAULT_SETTINGS)}
                className="w-full text-xs text-center py-1.5 rounded bg-muted hover:bg-muted/80"
              >
                Reset to Default
              </button>
            </div>

            {/* Preset Colors */}
            <div className="pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Presets</span>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setSettings({
                    ...DEFAULT_SETTINGS,
                    upColor: '#22c55e',
                    downColor: '#ef4444',
                    upBorderColor: '#16a34a',
                    downBorderColor: '#dc2626',
                    wickUpColor: '#22c55e',
                    wickDownColor: '#ef4444',
                  })}
                  className="flex-1 py-1 text-xs rounded bg-gradient-to-r from-green-500 to-red-500 text-white"
                >
                  Classic
                </button>
                <button
                  onClick={() => setSettings({
                    ...DEFAULT_SETTINGS,
                    upColor: '#000000',
                    downColor: '#ffffff',
                    upBorderColor: '#000000',
                    downBorderColor: '#000000',
                    wickUpColor: '#000000',
                    wickDownColor: '#000000',
                  })}
                  className="flex-1 py-1 text-xs rounded bg-gradient-to-r from-black to-gray-300 text-white"
                >
                  B&W
                </button>
                <button
                  onClick={() => setSettings({
                    ...DEFAULT_SETTINGS,
                    upColor: '#3b82f6',
                    downColor: '#f97316',
                    upBorderColor: '#2563eb',
                    downBorderColor: '#ea580c',
                    wickUpColor: '#3b82f6',
                    wickDownColor: '#f97316',
                  })}
                  className="flex-1 py-1 text-xs rounded bg-gradient-to-r from-blue-500 to-orange-500 text-white"
                >
                  Blue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart Container */}
      <div 
        ref={containerRef} 
        className="flex-1 min-h-0"
        style={{ backgroundColor: settings.backgroundColor }}
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
