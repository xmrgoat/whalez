'use client';

/**
 * TradingChart Pro
 * 
 * Professional trading chart with all KLineChart Pro features:
 * - Drawing bar with all tools (lines, fibonacci, waves, etc.)
 * - Right-click context menu
 * - Indicator management with settings
 * - Screenshot functionality
 * - Timezone selection
 * - Theme switching
 * - Magnet mode for drawings
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  init, 
  dispose, 
  Chart as KLineChart, 
  OverlayMode,
  ActionType,
  DomPosition,
  FormatDateType,
  utils
} from 'klinecharts';
import { registerCustomOverlays, BUILTIN_OVERLAYS, CUSTOM_OVERLAYS } from '@/lib/chart-overlays';
import { 
  Minus, 
  TrendingUp, 
  Square, 
  Circle,
  Triangle,
  Ruler,
  ArrowRight,
  Type,
  Trash2,
  Settings,
  Palette,
  BarChart3,
  X,
  ChevronDown,
  ChevronRight,
  MousePointer,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Camera,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Magnet,
  Grid3X3,
  Clock,
  Sun,
  Moon,
  Download,
  Plus,
  Brain,
  Activity,
  CheckCircle2,
  MessageSquare
} from 'lucide-react';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartSettings {
  // Candle colors
  upColor: string;
  downColor: string;
  upBorderColor: string;
  downBorderColor: string;
  upWickColor: string;
  downWickColor: string;
  // Background & Grid
  backgroundColor: string;
  gridColor: string;
  gridHorizontalShow: boolean;
  gridVerticalShow: boolean;
  // Axis
  axisColor: string;
  axisTextColor: string;
  // Crosshair
  crosshairColor: string;
  crosshairTextColor: string;
  crosshairTextBgColor: string;
  // Price line
  priceLineColor: string;
  priceLineShow: boolean;
  // Volume
  volumeUpColor: string;
  volumeDownColor: string;
  // Display options
  showOHLC: boolean;
  showVolume: boolean;
  showChange: boolean;
  showHighLow: boolean;
}

// Indicator with settings
export interface IndicatorConfig {
  id: string;
  name: string;
  paneId: string;
  visible: boolean;
  calcParams: number[];
}

// Saved drawing
export interface SavedDrawing {
  id: string;
  name: string;
  points: any[];
  styles?: any;
}

// Trade marker for displaying AI trades on chart
export interface TradeMarker {
  id: string;
  timestamp: number;
  price: number;
  action: 'LONG' | 'SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  confidence: number;
  pnl?: number;
  pnlPercent?: number;
  reasoning: string;
  confirmations: {
    price: string;
    volume: string;
    indicators: string;
    sentiment: string;
    macro: string;
  };
  indicators: Record<string, number>;
  sources: Array<{ type: string; content: string }>;
  thinkingSteps?: Array<{
    title: string;
    content: string;
    status: 'completed' | 'failed';
  }>;
}

const DEFAULT_SETTINGS: ChartSettings = {
  // Candle colors
  upColor: '#22c55e',
  downColor: '#ef4444',
  upBorderColor: '#22c55e',
  downBorderColor: '#ef4444',
  upWickColor: '#22c55e',
  downWickColor: '#ef4444',
  // Background & Grid
  backgroundColor: '#0a0a0a',
  gridColor: '#1a1a1a',
  gridHorizontalShow: true,
  gridVerticalShow: true,
  // Axis
  axisColor: '#333333',
  axisTextColor: '#888888',
  // Crosshair
  crosshairColor: '#888888',
  crosshairTextColor: '#ffffff',
  crosshairTextBgColor: '#333333',
  // Price line
  priceLineColor: '#3b82f6',
  priceLineShow: true,
  // Volume
  volumeUpColor: '#22c55e80',
  volumeDownColor: '#ef444480',
  // Display options
  showOHLC: true,
  showVolume: true,
  showChange: true,
  showHighLow: true,
};

// Drawing tool categories - using correct KlineCharts overlay names
const DRAWING_CATEGORIES = [
  {
    id: 'lines',
    name: 'Lines',
    icon: Minus,
    tools: [
      { id: 'horizontalStraightLine', name: 'Horizontal Line' },
      { id: 'horizontalRayLine', name: 'Horizontal Ray' },
      { id: 'horizontalSegment', name: 'Horizontal Segment' },
      { id: 'verticalStraightLine', name: 'Vertical Line' },
      { id: 'verticalRayLine', name: 'Vertical Ray' },
      { id: 'verticalSegment', name: 'Vertical Segment' },
      { id: 'straightLine', name: 'Trend Line' },
      { id: 'rayLine', name: 'Ray' },
      { id: 'segment', name: 'Segment' },
      { id: 'arrow', name: 'Arrow' },
      { id: 'priceLine', name: 'Price Line' },
    ]
  },
  {
    id: 'channels',
    name: 'Channels',
    icon: TrendingUp,
    tools: [
      { id: 'priceChannelLine', name: 'Price Channel' },
      { id: 'parallelStraightLine', name: 'Parallel Channel' },
    ]
  },
  {
    id: 'shapes',
    name: 'Shapes',
    icon: Square,
    tools: [
      { id: 'circle', name: 'Circle' },
      { id: 'rect', name: 'Rectangle' },
      { id: 'parallelogram', name: 'Parallelogram' },
      { id: 'triangle', name: 'Triangle' },
    ]
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci',
    icon: Ruler,
    tools: [
      { id: 'fibonacciLine', name: 'Fib Retracement' },
      { id: 'fibonacciSegment', name: 'Fib Segment' },
      { id: 'fibonacciCircle', name: 'Fib Circle' },
      { id: 'fibonacciExtension', name: 'Fib Extension' },
      { id: 'gannBox', name: 'Gann Box' },
    ]
  },
  {
    id: 'waves',
    name: 'Waves',
    icon: TrendingUp,
    tools: [
      { id: 'xabcd', name: 'XABCD Pattern' },
      { id: 'abcd', name: 'ABCD Pattern' },
      { id: 'threeWaves', name: 'Three Waves' },
      { id: 'fiveWaves', name: 'Five Waves' },
      { id: 'eightWaves', name: 'Eight Waves' },
      { id: 'anyWaves', name: 'Any Waves' },
    ]
  },
  {
    id: 'annotations',
    name: 'Annotations',
    icon: Type,
    tools: [
      { id: 'simpleAnnotation', name: 'Text' },
      { id: 'simpleTag', name: 'Tag' },
    ]
  },
];

const INDICATORS = {
  main: [
    { id: 'MA', name: 'MA (Moving Average)' },
    { id: 'EMA', name: 'EMA (Exponential MA)' },
    { id: 'SMA', name: 'SMA (Simple MA)' },
    { id: 'BOLL', name: 'Bollinger Bands' },
    { id: 'SAR', name: 'Parabolic SAR' },
    { id: 'BBI', name: 'BBI (Bull Bear Index)' },
    { id: 'AVP', name: 'AVP (Avg Price)' },
  ],
  sub: [
    { id: 'VOL', name: 'Volume' },
    { id: 'MACD', name: 'MACD' },
    { id: 'RSI', name: 'RSI (14)' },
    { id: 'KDJ', name: 'KDJ (Stochastic)' },
    { id: 'ATR', name: 'ATR (Volatility)' },
    { id: 'DMI', name: 'DMI/ADX' },
    { id: 'OBV', name: 'OBV (On Balance Vol)' },
    { id: 'CCI', name: 'CCI (Commodity Channel)' },
    { id: 'ROC', name: 'ROC (Rate of Change)' },
    { id: 'WR', name: 'Williams %R' },
    { id: 'MTM', name: 'MTM (Momentum)' },
    { id: 'EMV', name: 'EMV (Ease of Movement)' },
    { id: 'VR', name: 'VR (Volume Ratio)' },
    { id: 'TRIX', name: 'TRIX' },
    { id: 'CR', name: 'CR (Energy Index)' },
    { id: 'PSY', name: 'PSY (Psychology Line)' },
    { id: 'BIAS', name: 'BIAS (Deviation)' },
    { id: 'BRAR', name: 'BRAR (Sentiment)' },
    { id: 'DMA', name: 'DMA (Diff MA)' },
    { id: 'AO', name: 'AO (Awesome Osc)' },
  ]
};

const TIMEFRAMES = [
  { id: '1m', text: '1m', multiplier: 1, timespan: 'minute' },
  { id: '5m', text: '5m', multiplier: 5, timespan: 'minute' },
  { id: '15m', text: '15m', multiplier: 15, timespan: 'minute' },
  { id: '1h', text: '1H', multiplier: 1, timespan: 'hour' },
  { id: '4h', text: '4H', multiplier: 4, timespan: 'hour' },
  { id: '1d', text: '1D', multiplier: 1, timespan: 'day' },
  { id: '1w', text: '1W', multiplier: 1, timespan: 'week' },
];

interface TradingChartProProps {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  onTimeframeChange?: (tf: string) => void;
  wsConnected?: boolean;
  trades?: Array<{
    id: string;
    timestamp: number;
    price: number;
    side: 'buy' | 'sell';
    confidence: number;
    reasoning?: string;
    status?: string;
    quantity?: number;
    stopLoss?: number;
    takeProfit?: number;
    pnl?: number;
    symbol?: string;
  }>;
  onTradeClick?: (trade: any) => void;
}

export default function TradingChartPro({
  symbol,
  timeframe,
  candles,
  onTimeframeChange,
  wsConnected = true,
  trades = [],
  onTradeClick,
}: TradingChartProProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KLineChart | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  
  // UI State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [liveFollow, setLiveFollow] = useState(true);
  const [settings, setSettings] = useState<ChartSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chart-settings-pro');
      if (saved) {
        try { 
          const parsed = JSON.parse(saved);
          // Merge with defaults to handle new properties
          return { ...DEFAULT_SETTINGS, ...parsed };
        } catch {}
      }
    }
    return DEFAULT_SETTINGS;
  });
  
  // Drawing state
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<'normal' | 'weak_magnet' | 'strong_magnet'>('normal');
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  
  // Tooltip state for trade markers (Hyperliquid style)
  const [markerTooltip, setMarkerTooltip] = useState<{ show: boolean; text: string; x: number; y: number }>({ show: false, text: '', x: 0, y: 0 });
  
  // Indicators state with persistence
  const [mainIndicators, setMainIndicators] = useState<IndicatorConfig[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`chart-main-indicators-${symbol}`);
      if (saved) try { return JSON.parse(saved); } catch {}
    }
    return [{ id: 'MA', name: 'MA', paneId: 'candle_pane', visible: true, calcParams: [5, 10, 30, 60] }];
  });
  const [subIndicators, setSubIndicators] = useState<IndicatorConfig[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`chart-sub-indicators-${symbol}`);
      if (saved) try { return JSON.parse(saved); } catch {}
    }
    return [{ id: 'VOL', name: 'Volume', paneId: '', visible: true, calcParams: [5, 10, 20] }];
  });
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<IndicatorConfig | null>(null);
  
  // Drawings state with persistence
  const [savedDrawings, setSavedDrawings] = useState<SavedDrawing[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`chart-drawings-${symbol}`);
      if (saved) try { return JSON.parse(saved); } catch {}
    }
    return [];
  });
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  
  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean; overlayId?: string }>({ x: 0, y: 0, visible: false });
  
  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  
  // Screenshot
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  // Trade markers state
  const [tradeMarkers, setTradeMarkers] = useState<TradeMarker[]>([]);
  const [selectedTradeMarker, setSelectedTradeMarker] = useState<TradeMarker | null>(null);
  const [showTradeDetail, setShowTradeDetail] = useState(false);
  
  const userInteractedRef = useRef(false);
  const prevTimeframeRef = useRef(timeframe);
  const prevSymbolRef = useRef(symbol);

  // Save settings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chart-settings-pro', JSON.stringify(settings));
    }
  }, [settings]);

  // Get chart styles
  const getChartStyles = useCallback(() => ({
    grid: {
      show: settings.gridHorizontalShow || settings.gridVerticalShow,
      horizontal: { show: settings.gridHorizontalShow, color: settings.gridColor },
      vertical: { show: settings.gridVerticalShow, color: settings.gridColor },
    },
    candle: {
      type: 'candle_solid' as any,
      bar: {
        upColor: settings.upColor,
        downColor: settings.downColor,
        upBorderColor: settings.upBorderColor,
        downBorderColor: settings.downBorderColor,
        upWickColor: settings.upWickColor,
        downWickColor: settings.downWickColor,
      },
      tooltip: {
        showRule: 'always' as any,
        showType: 'standard' as any,
        custom: (data: any) => {
          const { current } = data;
          const c = current?.kLineData;
          if (!c) return [];
          return [
            { title: 'Open', value: Math.round(c.open).toLocaleString() },
            { title: 'High', value: Math.round(c.high).toLocaleString() },
            { title: 'Low', value: Math.round(c.low).toLocaleString() },
            { title: 'Close', value: Math.round(c.close).toLocaleString() },
            { title: 'Vol', value: c.volume?.toFixed(2) || '0' },
          ];
        },
      },
      priceMark: {
        show: true,
        high: { show: settings.showHighLow, color: settings.axisTextColor, textFormatter: (price: number) => Math.round(price).toLocaleString() },
        low: { show: settings.showHighLow, color: settings.axisTextColor, textFormatter: (price: number) => Math.round(price).toLocaleString() },
        last: {
          show: settings.priceLineShow,
          upColor: settings.upColor,
          downColor: settings.downColor,
          line: { show: settings.priceLineShow, style: 2 as any, dashedValue: [4, 4], color: settings.priceLineColor },
          text: { show: true, formatter: (price: number) => Math.round(price).toLocaleString() },
        },
      },
    },
    indicator: {
      lineColors: ['#2563eb', '#7c3aed', '#db2777', '#ea580c'],
    },
    xAxis: {
      axisLine: { color: settings.axisColor },
      tickLine: { color: settings.axisColor },
      tickText: { color: settings.axisTextColor, size: 10 },
    },
    yAxis: {
      axisLine: { color: settings.axisColor },
      tickLine: { color: settings.axisColor },
      tickText: { color: settings.axisTextColor, size: 10 },
      // Format price without decimals for BTC
      text: {
        formatter: (value: number) => Math.round(value).toLocaleString(),
      },
    },
    crosshair: {
      show: true,
      horizontal: { 
        show: true,
        line: { color: settings.crosshairColor, style: 2 as any, size: 1 },
        text: { 
          color: settings.crosshairTextColor, 
          backgroundColor: settings.crosshairTextBgColor,
          formatter: (value: number) => Math.round(value).toLocaleString(),
        },
      },
      vertical: { 
        show: true,
        line: { color: settings.crosshairColor, style: 2 as any, size: 1 },
        text: { color: settings.crosshairTextColor, backgroundColor: settings.crosshairTextBgColor },
      },
    },
    separator: { color: settings.axisColor },
    overlay: {
      point: {
        color: 'transparent',
        borderColor: 'transparent',
        borderSize: 0,
        radius: 0,
        activeColor: 'transparent',
        activeBorderColor: 'transparent',
        activeBorderSize: 0,
        activeRadius: 0,
      },
    },
  }), [settings]);

  // Register custom overlays on mount
  useEffect(() => {
    registerCustomOverlays();
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = init(containerRef.current, {
      styles: getChartStyles(),
      thousandsSeparator: ',',
      decimalFold: { threshold: 0 },
    } as any);
    
    chartRef.current = chart;

    if (chart) {
      // Set price precision to 0 decimals for BTC
      chart.setPriceVolumePrecision(0, 2);
      // Subscribe to scroll/zoom to disable live follow
      chart.subscribeAction(ActionType.OnScroll as any, () => {
        if (!userInteractedRef.current) {
          userInteractedRef.current = true;
          setLiveFollow(false);
        }
      });

      chart.subscribeAction(ActionType.OnZoom as any, () => {
        if (!userInteractedRef.current) {
          userInteractedRef.current = true;
          setLiveFollow(false);
        }
      });

      // Add initial indicators from saved state
      mainIndicators.forEach(ind => {
        if (ind.visible) {
          chart.createIndicator({ name: ind.id, calcParams: ind.calcParams }, false, { id: 'candle_pane' });
        }
      });
      
      subIndicators.forEach(ind => {
        if (ind.visible) {
          const paneId = chart.createIndicator({ name: ind.id, calcParams: ind.calcParams }, true);
          if (paneId && !ind.paneId) {
            setSubIndicators(prev => prev.map(i => i.id === ind.id ? { ...i, paneId } : i));
          }
        }
      });

      // Subscribe to overlay click events for selection
      chart.subscribeAction(ActionType.OnCrosshairChange as any, () => {
        // Reset selection when crosshair moves
      });
    }

    return () => {
      if (containerRef.current) {
        dispose(containerRef.current);
      }
    };
  }, []);

  // Update styles when settings change
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setStyles(getChartStyles());
    }
  }, [settings, getChartStyles]);

  // Load trade markers from API
  useEffect(() => {
    const loadTradeMarkers = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        
        // Fetch from trade history - filter by current symbol
        const tradeResponse = await fetch(`${apiUrl}/trading/trade-history?limit=50`);
        if (tradeResponse.ok) {
          const tradeData = await tradeResponse.json();
          const allTrades = tradeData.trades || [];
          
          // Filter trades for current symbol OR show all if no symbol filter
          const trades = allTrades.filter((t: any) => 
            !symbol || t.symbol === symbol || t.symbol === symbol.replace('-PERP', '')
          );
          
          const tradeMarkersFromHistory: TradeMarker[] = trades.map((t: any) => ({
            id: t.id,
            timestamp: t.timestamp,
            price: t.price,
            action: t.side === 'buy' ? 'LONG' : 'SHORT',
            confidence: t.confidence,
            reasoning: t.reasoning || 'Trade executed',
            confirmations: {
              stopLoss: t.stopLoss ? `$${t.stopLoss.toLocaleString()}` : 'N/A',
              takeProfit: t.takeProfit ? `$${t.takeProfit.toLocaleString()}` : 'N/A',
              status: t.status,
            },
            indicators: {},
            sources: [],
            thinkingSteps: [],
          }));
          
          // Also fetch analysis history for additional markers
          const analysisResponse = await fetch(`${apiUrl}/trading/analysis-history?limit=20`);
          let analysisMarkers: TradeMarker[] = [];
          if (analysisResponse.ok) {
            const analysisData = await analysisResponse.json();
            const analyses = analysisData.analyses || [];
            analysisMarkers = analyses
              .filter((a: any) => a.action !== 'HOLD' && a.action !== 'NO_TRADE')
              .map((a: any) => ({
                id: a.id,
                timestamp: a.timestamp,
                price: a.price,
                action: a.action,
                confidence: a.confidence,
                reasoning: a.reasoning || 'Analysis signal',
                confirmations: {},
                indicators: {},
                sources: a.sources || [],
                thinkingSteps: [],
              }));
          }
          
          // Combine and deduplicate by timestamp (prefer trades over analyses)
          const allMarkers = [...tradeMarkersFromHistory, ...analysisMarkers];
          const uniqueMarkers = allMarkers.reduce((acc: TradeMarker[], marker) => {
            const exists = acc.find(m => Math.abs(m.timestamp - marker.timestamp) < 60000);
            if (!exists) acc.push(marker);
            return acc;
          }, []);
          
          setTradeMarkers(uniqueMarkers.sort((a, b) => b.timestamp - a.timestamp));
        }
      } catch (error) {
        console.error('Failed to load trade markers:', error);
      }
    };

    loadTradeMarkers();
    // Refresh every 10 seconds for more responsive updates
    const interval = setInterval(loadTradeMarkers, 10000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Listen for trade marker clicks from the overlay
  useEffect(() => {
    const handleTradeMarkerClick = (event: CustomEvent) => {
      const trade = event.detail;
      if (trade) {
        // Convert to TradeMarker format for the modal
        const marker: TradeMarker = {
          id: trade.id,
          timestamp: trade.timestamp,
          price: trade.price,
          action: trade.side === 'buy' ? 'LONG' : 'SHORT',
          confidence: trade.confidence || 0,
          reasoning: trade.reasoning || `${trade.side?.toUpperCase()} @ $${trade.price?.toLocaleString()} | SL: $${trade.stopLoss?.toFixed(2)} | TP: $${trade.takeProfit?.toFixed(2)} | Leverage: ${trade.leverage}x`,
          confirmations: {
            price: trade.stopLoss ? `SL: $${trade.stopLoss.toFixed(2)}` : '',
            volume: trade.takeProfit ? `TP: $${trade.takeProfit.toFixed(2)}` : '',
            indicators: trade.leverage ? `Leverage: ${trade.leverage}x` : '',
            sentiment: trade.status || 'open',
            macro: trade.symbol || '',
          },
          indicators: {},
          sources: [],
        };
        setSelectedTradeMarker(marker);
        setShowTradeDetail(true);
      }
    };

    window.addEventListener('tradeMarkerClick', handleTradeMarkerClick as EventListener);
    return () => window.removeEventListener('tradeMarkerClick', handleTradeMarkerClick as EventListener);
  }, []);

  // Listen for trade marker hover events (Hyperliquid style tooltip)
  useEffect(() => {
    const handleTradeMarkerHover = (event: CustomEvent) => {
      const { show, tooltipText } = event.detail;
      if (show && tooltipText) {
        // Get mouse position for tooltip
        const mouseX = (event as any).clientX || window.innerWidth / 2;
        const mouseY = (event as any).clientY || 100;
        setMarkerTooltip({ show: true, text: tooltipText, x: mouseX, y: mouseY });
      } else {
        setMarkerTooltip(prev => ({ ...prev, show: false }));
      }
    };

    window.addEventListener('tradeMarkerHover', handleTradeMarkerHover as EventListener);
    return () => window.removeEventListener('tradeMarkerHover', handleTradeMarkerHover as EventListener);
  }, []);

  // Track the last applied data key to detect changes
  const lastDataKeyRef = useRef<string>('');
  
  // Helper to calculate price precision based on price value
  const getPricePrecision = (price: number): number => {
    if (price >= 1000) return 1;      // BTC, ETH: 87000.0
    if (price >= 100) return 2;       // SOL, BNB: 150.00
    if (price >= 10) return 3;        // LINK, etc: 15.000
    if (price >= 1) return 4;         // XRP, etc: 2.0000
    if (price >= 0.1) return 5;       // DOGE, etc: 0.30000
    if (price >= 0.01) return 6;      // Low price tokens: 0.050000
    return 8;                         // Very low price tokens
  };
  
  // Single effect to handle all candle updates
  useEffect(() => {
    if (!chartRef.current) return;
    
    const currentDataKey = `${symbol}:${timeframe}`;
    const dataKeyChanged = currentDataKey !== lastDataKeyRef.current;
    
    // If symbol/timeframe changed, clear chart and reset state
    if (dataKeyChanged) {
      chartRef.current.clearData();
      lastCandleRef.current = null;
      lastDataKeyRef.current = currentDataKey;
      prevSymbolRef.current = symbol;
      prevTimeframeRef.current = timeframe;
    }
    
    // If no candles, nothing to do
    if (candles.length === 0) return;
    
    const lastCandle = candles[candles.length - 1];
    const prevLastCandle = lastCandleRef.current;
    
    // If data key changed or no previous data, apply all candles fresh
    if (dataKeyChanged || !prevLastCandle) {
      // Set price precision based on the price of this token
      const pricePrecision = getPricePrecision(lastCandle.close);
      chartRef.current.setPriceVolumePrecision(pricePrecision, 2);
      
      const formattedData = candles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
      
      chartRef.current.applyNewData(formattedData);
      lastCandleRef.current = lastCandle || null;
      
      if (liveFollow) {
        setTimeout(() => chartRef.current?.scrollToRealTime(), 100);
      }
      return;
    }
    
    // Otherwise, just update the last candle for live updates
    if (lastCandle) {
      chartRef.current.updateData({
        timestamp: lastCandle.timestamp,
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
        volume: lastCandle.volume,
      });
      
      // If new candle appeared, scroll to it
      if (lastCandle.timestamp > prevLastCandle.timestamp && liveFollow) {
        chartRef.current.scrollToRealTime();
      }
      
      lastCandleRef.current = lastCandle;
    }
  }, [symbol, timeframe, candles, liveFollow]);

  // State for selected trade for modal
  const [selectedTradeForModal, setSelectedTradeForModal] = useState<typeof trades[0] | null>(null);

  // Combine trades from props and API-loaded tradeMarkers
  const allTrades = useMemo(() => {
    // Convert tradeMarkers to trade format
    const markersAsTrades = tradeMarkers.map(m => {
      const confirmations = m.confirmations as any;
      return {
        id: m.id,
        timestamp: m.timestamp,
        price: m.price,
        side: (m.action === 'LONG' ? 'buy' : 'sell') as 'buy' | 'sell',
        confidence: m.confidence,
        reasoning: m.reasoning,
        status: confirmations?.status,
        stopLoss: confirmations?.stopLoss ? parseFloat(String(confirmations.stopLoss).replace('$', '').replace(',', '')) : undefined,
        takeProfit: confirmations?.takeProfit ? parseFloat(String(confirmations.takeProfit).replace('$', '').replace(',', '')) : undefined,
      };
    });
    
    // Combine with props trades, deduplicate by id AND timestamp+price (to catch duplicates with different ids)
    const combined = [...trades, ...markersAsTrades];
    const unique = combined.reduce((acc, trade) => {
      // Check for duplicate by id OR by timestamp+price combination
      const isDuplicate = acc.find(t => 
        t.id === trade.id || 
        (Math.abs(t.timestamp - trade.timestamp) < 60000 && Math.abs(t.price - trade.price) < 1)
      );
      if (!isDuplicate) {
        acc.push(trade);
      }
      return acc;
    }, [] as typeof trades);
    
    return unique;
  }, [trades, tradeMarkers]);

  // State for DOM-based trade markers positions
  const [markerPositions, setMarkerPositions] = useState<Array<{
    id: string;
    x: number;
    y: number;
    isBuy: boolean;
    trade: any;
  }>>([]);

  // Calculate marker positions based on chart coordinates
  useEffect(() => {
    if (!chartRef.current || !containerRef.current) return;
    if (allTrades.length === 0) {
      setMarkerPositions([]);
      return;
    }

    const chart = chartRef.current;
    
    // Helper to get timeframe in milliseconds
    const getTimeframeMs = (tf: string): number => {
      const map: Record<string, number> = {
        '1m': 60000,
        '5m': 300000,
        '15m': 900000,
        '1h': 3600000,
        '4h': 14400000,
        '1d': 86400000,
      };
      return map[tf] || 3600000;
    };

    const updatePositions = () => {
      const positions: typeof markerPositions = [];
      
      // Debug: log trades being processed
      if (allTrades.length > 0) {
        console.log('[TradeMarkers] Processing', allTrades.length, 'trades, candles:', candles.length);
      }
      
      // Group trades by candle to stack markers vertically
      const tradesByCandle = new Map<number, typeof allTrades>();
      
      allTrades.forEach((trade) => {
        // Find the candle that contains this trade's timestamp
        const tradeCandle = candles.find(c => {
          const candleTime = c.timestamp;
          const nextCandleTime = candleTime + getTimeframeMs(timeframe);
          return trade.timestamp >= candleTime && trade.timestamp < nextCandleTime;
        });
        
        // If no matching candle found, use the last candle (for recent trades)
        const candleTime = tradeCandle?.timestamp || (candles.length > 0 ? candles[candles.length - 1].timestamp : trade.timestamp);
        
        if (!tradesByCandle.has(candleTime)) {
          tradesByCandle.set(candleTime, []);
        }
        tradesByCandle.get(candleTime)!.push(trade);
      });
      
      // Process each candle's trades with vertical stacking
      tradesByCandle.forEach((candleTrades, candleTime) => {
        const tradeCandle = candles.find(c => c.timestamp === candleTime);
        
        // Stack markers vertically - each marker gets additional offset
        candleTrades.forEach((trade, index) => {
          const isBuy = trade.side === 'buy';
          
          // Position marker above candle for BUY, below candle for SELL
          const basePrice = tradeCandle 
            ? (isBuy ? tradeCandle.high : tradeCandle.low)
            : trade.price;
          
          // Base offset + additional offset for each stacked marker
          const baseOffset = basePrice * (isBuy ? 0.005 : -0.005);
          const stackOffset = basePrice * (isBuy ? 0.003 : -0.003) * index;
          const markerPrice = basePrice + baseOffset + stackOffset;
          
          // Use the candle timestamp for x-coordinate (more reliable)
          const coordTimestamp = tradeCandle?.timestamp || trade.timestamp;
          const coord = chart.convertToPixel({ timestamp: coordTimestamp, value: markerPrice }, { paneId: 'candle_pane' }) as { x?: number; y?: number } | null;
          
          if (coord && typeof coord.x === 'number' && typeof coord.y === 'number') {
            // Only filter out if completely off-screen (negative or way too large)
            const containerWidth = containerRef.current?.clientWidth || 1000;
            const containerHeight = containerRef.current?.clientHeight || 500;
            
            if (coord.x >= -50 && coord.x <= containerWidth + 50 && coord.y >= -50 && coord.y <= containerHeight + 50) {
              // Apply pixel-based stacking offset (25px per marker)
              const pixelOffset = index * 25;
              positions.push({
                id: trade.id,
                x: Math.max(10, Math.min(coord.x, containerWidth - 10)),
                y: Math.max(10, Math.min(coord.y - pixelOffset, containerHeight - 10)),
                isBuy,
                trade,
              });
            }
          }
        });
      });
      
      console.log('[TradeMarkers] Calculated', positions.length, 'marker positions');
      setMarkerPositions(positions);
    };

    updatePositions();
    
    // Update positions on scroll/zoom
    const unsubScroll = chart.subscribeAction(ActionType.OnScroll as any, updatePositions);
    const unsubZoom = chart.subscribeAction(ActionType.OnZoom as any, updatePositions);
    
    return () => {
      chart.unsubscribeAction(ActionType.OnScroll as any);
      chart.unsubscribeAction(ActionType.OnZoom as any);
    };
  }, [allTrades, candles, timeframe]);

  // Handle drawing tool selection
  const handleDrawingTool = useCallback((toolId: string) => {
    if (!chartRef.current) return;
    
    setActiveTool(toolId);
    setActiveCategory(null);
    
    // For text annotations, prompt for text input
    if (toolId === 'simpleAnnotation' || toolId === 'simpleTag') {
      const text = window.prompt(toolId === 'simpleAnnotation' ? 'Enter text:' : 'Enter tag label:', '');
      if (!text) return; // User cancelled
      
      chartRef.current.createOverlay({
        name: toolId,
        lock: drawingsLocked,
        visible: drawingsVisible,
        mode: drawingMode as OverlayMode,
        extendData: { text },
      });
    } else {
      chartRef.current.createOverlay({
        name: toolId,
        lock: drawingsLocked,
        visible: drawingsVisible,
        mode: drawingMode as OverlayMode,
      });
    }
  }, [drawingsLocked, drawingsVisible, drawingMode]);

  // Clear all drawings
  const clearDrawings = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.removeOverlay();
      setActiveTool(null);
    }
  }, []);

  // Save indicators to localStorage and sync to API
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`chart-main-indicators-${symbol}`, JSON.stringify(mainIndicators));
    }
    // Sync all indicators to API for Grok analysis
    const allIndicators = [...mainIndicators, ...subIndicators];
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/indicators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ indicators: allIndicators }),
    }).catch(() => {}); // Silently fail
  }, [mainIndicators, subIndicators, symbol]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`chart-sub-indicators-${symbol}`, JSON.stringify(subIndicators));
    }
  }, [subIndicators, symbol]);

  // Toggle main indicator
  const toggleMainIndicator = useCallback((indicatorId: string, indicatorName: string) => {
    if (!chartRef.current) return;
    
    const existing = mainIndicators.find(i => i.id === indicatorId);
    if (existing) {
      chartRef.current.removeIndicator('candle_pane', indicatorId);
      setMainIndicators(prev => prev.filter(i => i.id !== indicatorId));
    } else {
      const defaultParams = indicatorId === 'MA' ? [5, 10, 30, 60] : 
                           indicatorId === 'EMA' ? [12, 26] :
                           indicatorId === 'BOLL' ? [20, 2] : [14];
      chartRef.current.createIndicator({ name: indicatorId, calcParams: defaultParams }, false, { id: 'candle_pane' });
      setMainIndicators(prev => [...prev, { 
        id: indicatorId, 
        name: indicatorName, 
        paneId: 'candle_pane', 
        visible: true, 
        calcParams: defaultParams 
      }]);
    }
  }, [mainIndicators]);

  // Toggle sub indicator
  const toggleSubIndicator = useCallback((indicatorId: string, indicatorName: string) => {
    if (!chartRef.current) return;
    
    const existing = subIndicators.find(i => i.id === indicatorId);
    if (existing) {
      // Try to remove by paneId first, if empty try by indicator name
      if (existing.paneId) {
        chartRef.current.removeIndicator(existing.paneId, indicatorId);
      } else {
        // Remove all instances of this indicator
        chartRef.current.removeIndicator(indicatorId);
      }
      setSubIndicators(prev => prev.filter(i => i.id !== indicatorId));
    } else {
      const defaultParams = indicatorId === 'MACD' ? [12, 26, 9] :
                           indicatorId === 'RSI' ? [14] :
                           indicatorId === 'VOL' ? [5, 10, 20] : [14];
      const paneId = chartRef.current.createIndicator({ name: indicatorId, calcParams: defaultParams }, true);
      if (paneId) {
        setSubIndicators(prev => [...prev, { 
          id: indicatorId, 
          name: indicatorName, 
          paneId: String(paneId), 
          visible: true, 
          calcParams: defaultParams 
        }]);
      }
    }
  }, [subIndicators]);

  // Update indicator params
  const updateIndicatorParams = useCallback((indicator: IndicatorConfig, newParams: number[]) => {
    if (!chartRef.current) return;
    
    // Remove old indicator
    chartRef.current.removeIndicator(indicator.paneId, indicator.id);
    
    // Create with new params
    if (indicator.paneId === 'candle_pane') {
      chartRef.current.createIndicator({ name: indicator.id, calcParams: newParams }, false, { id: 'candle_pane' });
      setMainIndicators(prev => prev.map(i => i.id === indicator.id ? { ...i, calcParams: newParams } : i));
    } else {
      const paneId = chartRef.current.createIndicator({ name: indicator.id, calcParams: newParams }, true);
      if (paneId) {
        setSubIndicators(prev => prev.map(i => i.id === indicator.id ? { ...i, calcParams: newParams, paneId } : i));
      }
    }
    setEditingIndicator(null);
  }, []);

  // Toggle indicator visibility
  const toggleIndicatorVisibility = useCallback((indicator: IndicatorConfig) => {
    if (!chartRef.current) return;
    
    if (indicator.visible) {
      chartRef.current.removeIndicator(indicator.paneId, indicator.id);
    } else {
      if (indicator.paneId === 'candle_pane') {
        chartRef.current.createIndicator({ name: indicator.id, calcParams: indicator.calcParams }, false, { id: 'candle_pane' });
      } else {
        chartRef.current.createIndicator({ name: indicator.id, calcParams: indicator.calcParams }, true);
      }
    }
    
    if (indicator.paneId === 'candle_pane') {
      setMainIndicators(prev => prev.map(i => i.id === indicator.id ? { ...i, visible: !i.visible } : i));
    } else {
      setSubIndicators(prev => prev.map(i => i.id === indicator.id ? { ...i, visible: !i.visible } : i));
    }
  }, []);

  // Remove single overlay/drawing
  const removeOverlay = useCallback((overlayId?: string) => {
    if (!chartRef.current) return;
    if (overlayId) {
      chartRef.current.removeOverlay({ id: overlayId });
    } else if (selectedOverlayId) {
      chartRef.current.removeOverlay({ id: selectedOverlayId });
      setSelectedOverlayId(null);
    }
  }, [selectedOverlayId]);

  // Close context menu and drawing submenus when clicking anywhere
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Close context menu
      if (contextMenu.visible) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
      // Close drawing category submenu
      if (activeCategory) {
        setActiveCategory(null);
      }
    };

    const handleKeyboard = (e: KeyboardEvent) => {
      // Escape - close menus and deselect tools
      if (e.key === 'Escape') {
        setContextMenu(prev => ({ ...prev, visible: false }));
        setActiveCategory(null);
        setActiveTool(null);
        setShowSettings(false);
        setShowIndicatorModal(false);
      }
      
      // Don't trigger shortcuts if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // Keyboard shortcuts for chart navigation
      switch (e.key) {
        case '+':
        case '=':
          chartRef.current?.zoomAtCoordinate(1.2);
          break;
        case '-':
          chartRef.current?.zoomAtCoordinate(0.8);
          break;
        case 'ArrowLeft':
          chartRef.current?.scrollByDistance(-50);
          break;
        case 'ArrowRight':
          chartRef.current?.scrollByDistance(50);
          break;
        case 'Home':
          chartRef.current?.scrollToRealTime();
          break;
        case 'l':
        case 'L':
          if (!e.ctrlKey && !e.metaKey) {
            handleGoLive();
          }
          break;
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            takeScreenshot();
          }
          break;
        case 'i':
        case 'I':
          if (!e.ctrlKey && !e.metaKey) {
            setShowIndicatorModal(prev => !prev);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedOverlayId) {
            removeOverlay(selectedOverlayId);
          }
          break;
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyboard);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyboard);
    };
  }, [contextMenu.visible, activeCategory, selectedOverlayId]);

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
  }, []);

  // Screenshot
  const takeScreenshot = useCallback(() => {
    if (chartRef.current) {
      const url = chartRef.current.getConvertPictureUrl(true, 'png', '#0a0a0a');
      setScreenshotUrl(url);
    }
  }, []);

  // Go Live
  const handleGoLive = useCallback(() => {
    userInteractedRef.current = false;
    setLiveFollow(true);
    if (chartRef.current) {
      chartRef.current.scrollToRealTime();
    }
  }, []);

  // Zoom controls
  const zoomIn = useCallback(() => {
    chartRef.current?.zoomAtCoordinate(1.2);
  }, []);

  const zoomOut = useCallback(() => {
    chartRef.current?.zoomAtCoordinate(0.8);
  }, []);

  const fitContent = useCallback(() => {
    chartRef.current?.scrollToRealTime();
  }, []);

  // Price info
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0;
  const priceChangePct = prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  // Timeframe dropdown state
  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
  
  // Favorite timeframes - persisted in localStorage
  const [favoriteTimeframes, setFavoriteTimeframes] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('favorite-timeframes');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return ['1m', '5m', '15m', '1h', '4h', '1d']; // Default favorites
  });
  
  // Save favorites to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('favorite-timeframes', JSON.stringify(favoriteTimeframes));
    }
  }, [favoriteTimeframes]);
  
  // Toggle favorite
  const toggleFavorite = (tf: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteTimeframes(prev => {
      if (prev.includes(tf)) {
        // Don't allow removing all favorites
        if (prev.length <= 1) return prev;
        return prev.filter(t => t !== tf);
      } else {
        return [...prev, tf];
      }
    });
  };
  
  // Timeframe groups and labels
  const TIMEFRAME_GROUPS = {
    MINUTES: ['1m', '3m', '5m', '15m', '30m'],
    HOURS: ['1h', '2h', '4h', '8h', '12h'],
    DAYS: ['1d', '3d', '1w', '1M'],
  };
  
  const TIMEFRAME_LABELS: Record<string, string> = {
    '1m': '1 minute', '3m': '3 minutes', '5m': '5 minutes', '15m': '15 minutes', '30m': '30 minutes',
    '1h': '1 heure', '2h': '2 heures', '4h': '4 heures', '8h': '8 heures', '12h': '12 heures',
    '1d': '1 jour', '3d': '3 jours', '1w': '1 semaine', '1M': '1 mois',
  };
  
  // All timeframes in order for sorting favorites
  const ALL_TIMEFRAMES_ORDER = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1d', '3d', '1w', '1M'];
  
  // Sorted favorite timeframes
  const sortedFavorites = ALL_TIMEFRAMES_ORDER.filter(tf => favoriteTimeframes.includes(tf));

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#1a1a1a] bg-[#0f0f0f]">
        {/* Left: Timeframes with dropdown */}
        <div className="flex items-center gap-1 relative">
          {/* Favorite timeframe buttons */}
          {sortedFavorites.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange?.(tf)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                timeframe === tf
                  ? 'bg-primary text-white'
                  : 'bg-[#1a1a1a] hover:bg-[#2a2a2a] text-gray-400'
              }`}
            >
              {tf}
            </button>
          ))}
          
          {/* Dropdown for all timeframes */}
          <button
            onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
              !sortedFavorites.includes(timeframe)
                ? 'bg-primary text-white'
                : 'bg-[#1a1a1a] hover:bg-[#2a2a2a] text-gray-400'
            }`}
          >
            {!sortedFavorites.includes(timeframe) ? timeframe : ''}
            <ChevronDown className="w-3 h-3" />
          </button>
          
          {/* Timeframe Dropdown */}
          {showTimeframeDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-2xl z-[100] min-w-[180px] py-2 max-h-[400px] overflow-y-auto">
              {/* Minutes */}
              <div className="px-3 py-1 text-[10px] uppercase text-gray-500 font-semibold">Minutes</div>
              {TIMEFRAME_GROUPS.MINUTES.map((tf) => (
                <div
                  key={tf}
                  className={`w-full px-3 py-1.5 text-sm flex items-center justify-between hover:bg-[#2a2a2a] cursor-pointer ${
                    timeframe === tf ? 'text-primary' : 'text-gray-300'
                  }`}
                  onClick={() => { onTimeframeChange?.(tf); setShowTimeframeDropdown(false); }}
                >
                  <span>{TIMEFRAME_LABELS[tf]}</span>
                  <button
                    onClick={(e) => toggleFavorite(tf, e)}
                    className={`ml-2 hover:scale-110 transition-transform ${
                      favoriteTimeframes.includes(tf) ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'
                    }`}
                  >
                    {favoriteTimeframes.includes(tf) ? '★' : '☆'}
                  </button>
                </div>
              ))}
              
              {/* Hours */}
              <div className="px-3 py-1 mt-2 text-[10px] uppercase text-gray-500 font-semibold border-t border-[#2a2a2a] pt-2">Heures</div>
              {TIMEFRAME_GROUPS.HOURS.map((tf) => (
                <div
                  key={tf}
                  className={`w-full px-3 py-1.5 text-sm flex items-center justify-between hover:bg-[#2a2a2a] cursor-pointer ${
                    timeframe === tf ? 'text-primary' : 'text-gray-300'
                  }`}
                  onClick={() => { onTimeframeChange?.(tf); setShowTimeframeDropdown(false); }}
                >
                  <span>{TIMEFRAME_LABELS[tf]}</span>
                  <button
                    onClick={(e) => toggleFavorite(tf, e)}
                    className={`ml-2 hover:scale-110 transition-transform ${
                      favoriteTimeframes.includes(tf) ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'
                    }`}
                  >
                    {favoriteTimeframes.includes(tf) ? '★' : '☆'}
                  </button>
                </div>
              ))}
              
              {/* Days */}
              <div className="px-3 py-1 mt-2 text-[10px] uppercase text-gray-500 font-semibold border-t border-[#2a2a2a] pt-2">Jours</div>
              {TIMEFRAME_GROUPS.DAYS.map((tf) => (
                <div
                  key={tf}
                  className={`w-full px-3 py-1.5 text-sm flex items-center justify-between hover:bg-[#2a2a2a] cursor-pointer ${
                    timeframe === tf ? 'text-primary' : 'text-gray-300'
                  }`}
                  onClick={() => { onTimeframeChange?.(tf); setShowTimeframeDropdown(false); }}
                >
                  <span>{TIMEFRAME_LABELS[tf]}</span>
                  <button
                    onClick={(e) => toggleFavorite(tf, e)}
                    className={`ml-2 hover:scale-110 transition-transform ${
                      favoriteTimeframes.includes(tf) ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'
                    }`}
                  >
                    {favoriteTimeframes.includes(tf) ? '★' : '☆'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Indicators */}
          <button
            onClick={() => setShowIndicatorModal(!showIndicatorModal)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[#1a1a1a] hover:bg-[#2a2a2a] text-gray-300"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Indicators
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded bg-[#1a1a1a] hover:bg-[#2a2a2a] text-gray-300"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Screenshot */}
          <button
            onClick={takeScreenshot}
            className="p-1.5 rounded bg-[#1a1a1a] hover:bg-[#2a2a2a] text-gray-300"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Zoom */}
          <div className="flex items-center gap-0.5 bg-[#1a1a1a] rounded">
            <button onClick={zoomOut} className="p-1.5 hover:bg-[#2a2a2a] text-gray-300 rounded-l">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={zoomIn} className="p-1.5 hover:bg-[#2a2a2a] text-gray-300">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={fitContent} className="p-1.5 hover:bg-[#2a2a2a] text-gray-300 rounded-r">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Live */}
          <button
            onClick={liveFollow ? () => setLiveFollow(false) : handleGoLive}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
              liveFollow ? 'bg-green-600 text-white' : 'bg-[#1a1a1a] text-gray-300 hover:bg-[#2a2a2a]'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${liveFollow ? 'bg-white animate-pulse' : 'bg-gray-500'}`} />
            {liveFollow ? 'Live' : 'Go Live'}
          </button>

          {/* Connection */}
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
      </div>

      {/* Active Indicators Bar - TradingView Style */}
      {(mainIndicators.length > 0 || subIndicators.length > 0) && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#0f0f0f] overflow-x-auto">
          {mainIndicators.map(ind => (
            <div key={ind.id} className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1a1a1a] text-xs group">
              <span className={`font-medium ${ind.visible ? 'text-blue-400' : 'text-gray-500'}`}>
                {ind.name} ({ind.calcParams.join(', ')})
              </span>
              <button
                onClick={() => toggleIndicatorVisibility(ind)}
                className="p-0.5 hover:bg-[#2a2a2a] rounded opacity-60 hover:opacity-100"
                title={ind.visible ? 'Hide' : 'Show'}
              >
                {ind.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setEditingIndicator(ind)}
                className="p-0.5 hover:bg-[#2a2a2a] rounded opacity-60 hover:opacity-100"
                title="Settings"
              >
                <Settings className="w-3 h-3" />
              </button>
              <button
                onClick={() => toggleMainIndicator(ind.id, ind.name)}
                className="p-0.5 hover:bg-[#2a2a2a] rounded opacity-60 hover:opacity-100 text-red-400"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {subIndicators.map(ind => (
            <div key={ind.id} className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1a1a1a] text-xs group">
              <span className={`font-medium ${ind.visible ? 'text-purple-400' : 'text-gray-500'}`}>
                {ind.name} ({ind.calcParams.join(', ')})
              </span>
              <button
                onClick={() => toggleIndicatorVisibility(ind)}
                className="p-0.5 hover:bg-[#2a2a2a] rounded opacity-60 hover:opacity-100"
                title={ind.visible ? 'Hide' : 'Show'}
              >
                {ind.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setEditingIndicator(ind)}
                className="p-0.5 hover:bg-[#2a2a2a] rounded opacity-60 hover:opacity-100"
                title="Settings"
              >
                <Settings className="w-3 h-3" />
              </button>
              <button
                onClick={() => toggleSubIndicator(ind.id, ind.name)}
                className="p-0.5 hover:bg-[#2a2a2a] rounded opacity-60 hover:opacity-100 text-red-400"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Drawing Bar (Left) */}
        <div className="w-10 bg-[#0f0f0f] border-r border-[#1a1a1a] flex flex-col py-2">
          {/* Cursor */}
          <button
            onClick={() => { setActiveTool(null); setActiveCategory(null); }}
            className={`p-2 mx-1 rounded hover:bg-[#1a1a1a] ${!activeTool ? 'bg-[#1a1a1a] text-white' : 'text-gray-400'}`}
            title="Select"
          >
            <MousePointer className="w-4 h-4" />
          </button>

          <div className="h-px bg-[#1a1a1a] my-2 mx-2" />

          {/* Drawing Categories */}
          {DRAWING_CATEGORIES.map(cat => (
            <div key={cat.id} className="relative">
              <button
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={`p-2 mx-1 rounded hover:bg-[#1a1a1a] ${activeCategory === cat.id ? 'bg-[#1a1a1a] text-white' : 'text-gray-400'}`}
                title={cat.name}
              >
                <cat.icon className="w-4 h-4" />
              </button>
              
              {/* Submenu */}
              {activeCategory === cat.id && (
                <div className="absolute left-full top-0 ml-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl py-1 min-w-[160px] z-50">
                  <div className="px-3 py-1 text-xs text-gray-500 font-medium">{cat.name}</div>
                  {cat.tools.map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => handleDrawingTool(tool.id)}
                      className="w-full px-3 py-1.5 text-sm text-left text-gray-300 hover:bg-[#2a2a2a]"
                    >
                      {tool.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="h-px bg-[#1a1a1a] my-2 mx-2" />

          {/* Magnet Mode */}
          <button
            onClick={() => {
              const modes: Array<'normal' | 'weak_magnet' | 'strong_magnet'> = ['normal', 'weak_magnet', 'strong_magnet'];
              const currentIndex = modes.indexOf(drawingMode);
              setDrawingMode(modes[(currentIndex + 1) % modes.length]);
            }}
            className={`p-2 mx-1 rounded hover:bg-[#1a1a1a] ${drawingMode !== 'normal' ? 'text-blue-400' : 'text-gray-400'}`}
            title={`Magnet: ${drawingMode}`}
          >
            <Magnet className="w-4 h-4" />
          </button>

          {/* Lock */}
          <button
            onClick={() => setDrawingsLocked(!drawingsLocked)}
            className={`p-2 mx-1 rounded hover:bg-[#1a1a1a] ${drawingsLocked ? 'text-yellow-400' : 'text-gray-400'}`}
            title={drawingsLocked ? 'Unlock Drawings' : 'Lock Drawings'}
          >
            {drawingsLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>

          {/* Visibility */}
          <button
            onClick={() => setDrawingsVisible(!drawingsVisible)}
            className={`p-2 mx-1 rounded hover:bg-[#1a1a1a] ${!drawingsVisible ? 'text-gray-600' : 'text-gray-400'}`}
            title={drawingsVisible ? 'Hide Drawings' : 'Show Drawings'}
          >
            {drawingsVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          <div className="flex-1" />

          {/* Clear */}
          <button
            onClick={clearDrawings}
            className="p-2 mx-1 rounded hover:bg-[#1a1a1a] text-red-400"
            title="Clear All Drawings"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Chart Container */}
        <div className="flex-1 min-h-0 min-w-0 relative overflow-visible">
          {/* Chart */}
          <div 
            ref={containerRef} 
            className="w-full h-full"
            onContextMenu={handleContextMenu}
            style={{ backgroundColor: settings.backgroundColor }}
          />
          
          {/* DOM-based trade markers (Hyperliquid style) */}
          {markerPositions.length > 0 && markerPositions.map((marker) => (
            <div
              key={marker.id}
              className="absolute pointer-events-auto cursor-pointer z-10"
              style={{
                left: marker.x - 10,
                top: marker.y - 10,
                width: 20,
                height: 20,
              }}
              onClick={() => {
                const trade = marker.trade;
                const tradeMarker: TradeMarker = {
                  id: trade.id,
                  timestamp: trade.timestamp,
                  price: trade.price,
                  action: trade.side === 'buy' ? 'LONG' : 'SHORT',
                  confidence: trade.confidence || 0,
                  reasoning: trade.reasoning || `${trade.side?.toUpperCase()} @ $${trade.price?.toLocaleString()}`,
                  confirmations: {
                    price: trade.stopLoss ? `SL: $${trade.stopLoss.toFixed(2)}` : '',
                    volume: trade.takeProfit ? `TP: $${trade.takeProfit.toFixed(2)}` : '',
                    indicators: trade.leverage ? `Leverage: ${trade.leverage}x` : '',
                    sentiment: trade.status || 'open',
                    macro: trade.symbol || '',
                  },
                  indicators: {},
                  sources: [],
                };
                setSelectedTradeMarker(tradeMarker);
                setShowTradeDetail(true);
              }}
              title={`${marker.isBuy ? 'Long' : 'Short'} @ $${marker.trade.price?.toLocaleString()}`}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-black"
                style={{
                  backgroundColor: marker.isBuy ? '#2dd4bf' : '#f87171',
                }}
              >
                {marker.isBuy ? 'B' : 'S'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trade Detail Modal */}
      {showTradeDetail && selectedTradeMarker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowTradeDetail(false)}>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl w-[600px] max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded font-bold ${
                  selectedTradeMarker.action === 'LONG' || selectedTradeMarker.action === 'CLOSE_SHORT'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {selectedTradeMarker.action}
                </div>
                <span className="text-white font-semibold">${selectedTradeMarker.price.toLocaleString()}</span>
                <span className="text-gray-400 text-sm">
                  {new Date(selectedTradeMarker.timestamp).toLocaleString()}
                </span>
              </div>
              <button onClick={() => setShowTradeDetail(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[70vh] space-y-4">
              {/* Confidence */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-400">Confidence</span>
                    <span className="text-sm font-bold text-white">{selectedTradeMarker.confidence}%</span>
                  </div>
                  <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        selectedTradeMarker.confidence >= 70 ? 'bg-green-500' :
                        selectedTradeMarker.confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${selectedTradeMarker.confidence}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div>
                <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  AI Reasoning
                </h4>
                <div className="bg-[#0f0f0f] rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap">
                  {selectedTradeMarker.reasoning}
                </div>
              </div>

              {/* Confirmations */}
              {selectedTradeMarker.confirmations && Object.keys(selectedTradeMarker.confirmations).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    Confirmations
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(selectedTradeMarker.confirmations).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 bg-[#0f0f0f] rounded p-2">
                        <span className="text-xs font-medium text-gray-400 uppercase w-20">{key}:</span>
                        <span className="text-xs text-gray-300 flex-1">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Indicators */}
              {selectedTradeMarker.indicators && Object.keys(selectedTradeMarker.indicators).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                    Indicators at Entry
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(selectedTradeMarker.indicators).map(([key, value]) => (
                      <div key={key} className="bg-[#0f0f0f] rounded p-2 text-center">
                        <div className="text-xs text-gray-400">{key}</div>
                        <div className="text-sm font-mono text-white">{typeof value === 'number' ? value.toFixed(2) : value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Thinking Steps */}
              {selectedTradeMarker.thinkingSteps && selectedTradeMarker.thinkingSteps.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    Thinking Process
                  </h4>
                  <div className="space-y-2">
                    {selectedTradeMarker.thinkingSteps.map((step, idx) => (
                      <div key={idx} className="bg-[#0f0f0f] rounded p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-5 h-5 rounded-full bg-[#2a2a2a] flex items-center justify-center text-xs text-gray-400">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-medium text-white">{step.title}</span>
                          {step.status === 'completed' ? (
                            <CheckCircle2 className="w-3 h-3 text-green-400 ml-auto" />
                          ) : (
                            <X className="w-3 h-3 text-red-400 ml-auto" />
                          )}
                        </div>
                        <div className="text-xs text-gray-400 ml-7 whitespace-pre-wrap">{step.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sources */}
              {selectedTradeMarker.sources && selectedTradeMarker.sources.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-yellow-400" />
                    Data Sources
                  </h4>
                  <div className="space-y-1">
                    {selectedTradeMarker.sources.map((source, idx) => (
                      <div key={idx} className="bg-[#0f0f0f] rounded p-2 text-xs text-gray-300">
                        <span className="text-gray-500">[{source.type}]</span> {source.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Indicator Modal */}
      {showIndicatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl w-96 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
              <h3 className="font-semibold text-white">Indicators</h3>
              <button onClick={() => setShowIndicatorModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="mb-4">
                <h4 className="text-sm text-gray-400 mb-2">Main Chart</h4>
                <div className="space-y-1">
                  {INDICATORS.main.map(ind => {
                    const isActive = mainIndicators.some(i => i.id === ind.id);
                    return (
                      <button
                        key={ind.id}
                        onClick={() => toggleMainIndicator(ind.id, ind.name)}
                        className={`w-full px-3 py-2 text-sm text-left rounded flex items-center justify-between ${
                          isActive ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-[#2a2a2a] text-gray-300'
                        }`}
                      >
                        {ind.name}
                        {isActive && <span className="w-2 h-2 rounded-full bg-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <h4 className="text-sm text-gray-400 mb-2">Sub Panels</h4>
                <div className="space-y-1">
                  {INDICATORS.sub.map(ind => {
                    const isActive = subIndicators.some(i => i.id === ind.id);
                    return (
                      <button
                        key={ind.id}
                        onClick={() => toggleSubIndicator(ind.id, ind.name)}
                        className={`w-full px-3 py-2 text-sm text-left rounded flex items-center justify-between ${
                          isActive ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-[#2a2a2a] text-gray-300'
                        }`}
                      >
                        {ind.name}
                        {isActive && <span className="w-2 h-2 rounded-full bg-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal - Complete Customization */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSettings(false)}>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl w-[480px] max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
              <h3 className="font-semibold text-white">Chart Customization</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh] space-y-6">
              {/* Candle Colors */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-green-500" />
                  Candle Colors
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Up Body</span>
                    <input type="color" value={settings.upColor} onChange={(e) => setSettings(s => ({ ...s, upColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Down Body</span>
                    <input type="color" value={settings.downColor} onChange={(e) => setSettings(s => ({ ...s, downColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Up Border</span>
                    <input type="color" value={settings.upBorderColor} onChange={(e) => setSettings(s => ({ ...s, upBorderColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Down Border</span>
                    <input type="color" value={settings.downBorderColor} onChange={(e) => setSettings(s => ({ ...s, downBorderColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Up Wick</span>
                    <input type="color" value={settings.upWickColor} onChange={(e) => setSettings(s => ({ ...s, upWickColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Down Wick</span>
                    <input type="color" value={settings.downWickColor} onChange={(e) => setSettings(s => ({ ...s, downWickColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                </div>
              </div>

              {/* Background & Grid */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <Grid3X3 className="w-3 h-3" />
                  Background & Grid
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Background</span>
                    <input type="color" value={settings.backgroundColor} onChange={(e) => setSettings(s => ({ ...s, backgroundColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Grid Color</span>
                    <input type="color" value={settings.gridColor} onChange={(e) => setSettings(s => ({ ...s, gridColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded col-span-2">
                    <span className="text-xs text-gray-400">Show Horizontal Grid</span>
                    <button onClick={() => setSettings(s => ({ ...s, gridHorizontalShow: !s.gridHorizontalShow }))} className={`w-10 h-5 rounded-full transition-colors ${settings.gridHorizontalShow ? 'bg-blue-600' : 'bg-gray-600'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.gridHorizontalShow ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded col-span-2">
                    <span className="text-xs text-gray-400">Show Vertical Grid</span>
                    <button onClick={() => setSettings(s => ({ ...s, gridVerticalShow: !s.gridVerticalShow }))} className={`w-10 h-5 rounded-full transition-colors ${settings.gridVerticalShow ? 'bg-blue-600' : 'bg-gray-600'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.gridVerticalShow ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Axis & Text */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <Type className="w-3 h-3" />
                  Axis & Text
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Axis Lines</span>
                    <input type="color" value={settings.axisColor} onChange={(e) => setSettings(s => ({ ...s, axisColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Axis Text</span>
                    <input type="color" value={settings.axisTextColor} onChange={(e) => setSettings(s => ({ ...s, axisTextColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                </div>
              </div>

              {/* Crosshair */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <Crosshair className="w-3 h-3" />
                  Crosshair
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Line Color</span>
                    <input type="color" value={settings.crosshairColor} onChange={(e) => setSettings(s => ({ ...s, crosshairColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Text Color</span>
                    <input type="color" value={settings.crosshairTextColor} onChange={(e) => setSettings(s => ({ ...s, crosshairTextColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded col-span-2">
                    <span className="text-xs text-gray-400">Text Background</span>
                    <input type="color" value={settings.crosshairTextBgColor} onChange={(e) => setSettings(s => ({ ...s, crosshairTextBgColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                </div>
              </div>

              {/* Price Line */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" />
                  Price Line
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Line Color</span>
                    <input type="color" value={settings.priceLineColor} onChange={(e) => setSettings(s => ({ ...s, priceLineColor: e.target.value }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Show Price Line</span>
                    <button onClick={() => setSettings(s => ({ ...s, priceLineShow: !s.priceLineShow }))} className={`w-10 h-5 rounded-full transition-colors ${settings.priceLineShow ? 'bg-blue-600' : 'bg-gray-600'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.priceLineShow ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Volume Colors */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <BarChart3 className="w-3 h-3" />
                  Volume Colors
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Up Volume</span>
                    <input type="color" value={settings.volumeUpColor.slice(0, 7)} onChange={(e) => setSettings(s => ({ ...s, volumeUpColor: e.target.value + '80' }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Down Volume</span>
                    <input type="color" value={settings.volumeDownColor.slice(0, 7)} onChange={(e) => setSettings(s => ({ ...s, volumeDownColor: e.target.value + '80' }))} className="w-8 h-6 rounded cursor-pointer bg-transparent" />
                  </div>
                </div>
              </div>

              {/* Display Options */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <Eye className="w-3 h-3" />
                  Display Options
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Show OHLC</span>
                    <button onClick={() => setSettings(s => ({ ...s, showOHLC: !s.showOHLC }))} className={`w-10 h-5 rounded-full transition-colors ${settings.showOHLC ? 'bg-blue-600' : 'bg-gray-600'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.showOHLC ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Show Volume</span>
                    <button onClick={() => setSettings(s => ({ ...s, showVolume: !s.showVolume }))} className={`w-10 h-5 rounded-full transition-colors ${settings.showVolume ? 'bg-blue-600' : 'bg-gray-600'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.showVolume ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Show Change %</span>
                    <button onClick={() => setSettings(s => ({ ...s, showChange: !s.showChange }))} className={`w-10 h-5 rounded-full transition-colors ${settings.showChange ? 'bg-blue-600' : 'bg-gray-600'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.showChange ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-[#0f0f0f] p-2 rounded">
                    <span className="text-xs text-gray-400">Show High/Low</span>
                    <button onClick={() => setSettings(s => ({ ...s, showHighLow: !s.showHighLow }))} className={`w-10 h-5 rounded-full transition-colors ${settings.showHighLow ? 'bg-blue-600' : 'bg-gray-600'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.showHighLow ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Reset Button */}
              <div className="pt-2 border-t border-[#2a2a2a]">
                <button
                  onClick={() => setSettings(DEFAULT_SETTINGS)}
                  className="w-full py-2 text-sm rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset to Default
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Modal */}
      {screenshotUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
              <h3 className="font-semibold text-white">Screenshot</h3>
              <button onClick={() => setScreenshotUrl(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <img src={screenshotUrl} alt="Chart Screenshot" className="max-w-full rounded" />
              <div className="flex gap-2 mt-4">
                <a
                  href={screenshotUrl}
                  download={`${symbol}_${timeframe}_${Date.now()}.png`}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(screenshotUrl);
                  }}
                  className="flex-1 py-2 rounded bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300"
                >
                  Copy URL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Indicator Settings Modal */}
      {editingIndicator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl w-80">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
              <h3 className="font-semibold text-white">{editingIndicator.name} Settings</h3>
              <button onClick={() => setEditingIndicator(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Parameters</label>
                <div className="flex flex-wrap gap-2">
                  {editingIndicator.calcParams.map((param, idx) => (
                    <input
                      key={idx}
                      type="number"
                      value={param}
                      onChange={(e) => {
                        const newParams = [...editingIndicator.calcParams];
                        newParams[idx] = parseInt(e.target.value) || 0;
                        setEditingIndicator({ ...editingIndicator, calcParams: newParams });
                      }}
                      className="w-16 px-2 py-1 text-sm rounded bg-[#2a2a2a] border border-[#3a3a3a] text-white"
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateIndicatorParams(editingIndicator, editingIndicator.calcParams)}
                  className="flex-1 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Apply
                </button>
                <button
                  onClick={() => setEditingIndicator(null)}
                  className="flex-1 py-2 text-sm rounded bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => {
            e.stopPropagation();
            setContextMenu(prev => ({ ...prev, visible: false }));
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* Remove Overlay option - shown when right-clicking on a drawing */}
          {selectedOverlayId && (
            <>
              <button
                onClick={() => removeOverlay(selectedOverlayId)}
                className="w-full px-3 py-2 text-sm text-left text-red-400 hover:bg-[#2a2a2a] flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Remove Drawing
              </button>
              <div className="h-px bg-[#2a2a2a] my-1" />
            </>
          )}
          <button
            onClick={() => setShowIndicatorModal(true)}
            className="w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-[#2a2a2a] flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            Add Indicator
          </button>
          <button
            onClick={takeScreenshot}
            className="w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-[#2a2a2a] flex items-center gap-2"
          >
            <Camera className="w-4 h-4" />
            Screenshot
          </button>
          <div className="h-px bg-[#2a2a2a] my-1" />
          <button
            onClick={zoomIn}
            className="w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-[#2a2a2a] flex items-center gap-2"
          >
            <ZoomIn className="w-4 h-4" />
            Zoom In
          </button>
          <button
            onClick={zoomOut}
            className="w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-[#2a2a2a] flex items-center gap-2"
          >
            <ZoomOut className="w-4 h-4" />
            Zoom Out
          </button>
          <button
            onClick={fitContent}
            className="w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-[#2a2a2a] flex items-center gap-2"
          >
            <Maximize2 className="w-4 h-4" />
            Fit to Screen
          </button>
          <div className="h-px bg-[#2a2a2a] my-1" />
          <button
            onClick={() => setShowSettings(true)}
            className="w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-[#2a2a2a] flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={clearDrawings}
            className="w-full px-3 py-2 text-sm text-left text-red-400 hover:bg-[#2a2a2a] flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear All Drawings
          </button>
        </div>
      )}
      
      {/* Hyperliquid-style tooltip for trade markers */}
      {markerTooltip.show && (
        <div 
          className="fixed z-50 px-3 py-2 text-sm bg-[#1e1e1e] border border-[#333] rounded-lg shadow-lg pointer-events-none"
          style={{ 
            left: Math.min(markerTooltip.x + 10, window.innerWidth - 200),
            top: markerTooltip.y - 40,
          }}
        >
          <span className="text-gray-200">{markerTooltip.text}</span>
        </div>
      )}
    </div>
  );
}
