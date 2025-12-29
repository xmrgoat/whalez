/**
 * Custom Chart Overlays for KLineChart
 * Based on KLineChart Pro extensions
 */

import { OverlayTemplate, registerOverlay } from 'klinecharts';

// Utility function for distance calculation
function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// Circle overlay
const circle: OverlayTemplate = {
  name: 'circle',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  styles: {
    circle: {
      color: 'rgba(22, 119, 255, 0.15)'
    }
  },
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const radius = getDistance(coordinates[0], coordinates[1]);
      return {
        type: 'circle',
        attrs: {
          ...coordinates[0],
          r: radius
        },
        styles: { style: 'stroke_fill' }
      };
    }
    return [];
  }
};

// Rectangle overlay
const rect: OverlayTemplate = {
  name: 'rect',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  styles: {
    polygon: {
      color: 'rgba(22, 119, 255, 0.15)'
    }
  },
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      return [
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              coordinates[0],
              { x: coordinates[1].x, y: coordinates[0].y },
              coordinates[1],
              { x: coordinates[0].x, y: coordinates[1].y }
            ]
          },
          styles: { style: 'stroke_fill' }
        }
      ];
    }
    return [];
  }
};

// Triangle overlay
const triangle: OverlayTemplate = {
  name: 'triangle',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  styles: {
    polygon: {
      color: 'rgba(22, 119, 255, 0.15)'
    }
  },
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 2) {
      return [
        {
          type: 'polygon',
          attrs: { coordinates },
          styles: { style: 'stroke_fill' }
        }
      ];
    }
    return [];
  }
};

// Parallelogram overlay
const parallelogram: OverlayTemplate = {
  name: 'parallelogram',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  styles: {
    polygon: {
      color: 'rgba(22, 119, 255, 0.15)'
    }
  },
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 2) {
      const xDis = coordinates[1].x - coordinates[0].x;
      const yDis = coordinates[1].y - coordinates[0].y;
      return [
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              coordinates[0],
              coordinates[1],
              coordinates[2],
              { x: coordinates[2].x - xDis, y: coordinates[2].y - yDis }
            ]
          },
          styles: { style: 'stroke_fill' }
        }
      ];
    }
    return [];
  }
};

// Arrow overlay
const arrow: OverlayTemplate = {
  name: 'arrow',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const x1 = coordinates[0].x;
      const y1 = coordinates[0].y;
      const x2 = coordinates[1].x;
      const y2 = coordinates[1].y;
      
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const arrowLength = 10;
      const arrowAngle = Math.PI / 6;
      
      const arrowX1 = x2 - arrowLength * Math.cos(angle - arrowAngle);
      const arrowY1 = y2 - arrowLength * Math.sin(angle - arrowAngle);
      const arrowX2 = x2 - arrowLength * Math.cos(angle + arrowAngle);
      const arrowY2 = y2 - arrowLength * Math.sin(angle + arrowAngle);
      
      return [
        {
          type: 'line',
          attrs: { coordinates }
        },
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: arrowX1, y: arrowY1 },
              { x: x2, y: y2 }
            ]
          }
        },
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: arrowX2, y: arrowY2 },
              { x: x2, y: y2 }
            ]
          }
        }
      ];
    }
    return [];
  }
};

// Fibonacci Circle
const fibonacciCircle: OverlayTemplate = {
  name: 'fibonacciCircle',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const radius = getDistance(coordinates[0], coordinates[1]);
      const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786, 1];
      return fibLevels.map(level => ({
        type: 'circle',
        attrs: {
          ...coordinates[0],
          r: radius * level
        }
      }));
    }
    return [];
  }
};

// Fibonacci Segment
const fibonacciSegment: OverlayTemplate = {
  name: 'fibonacciSegment',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const x1 = coordinates[0].x;
      const y1 = coordinates[0].y;
      const x2 = coordinates[1].x;
      const y2 = coordinates[1].y;
      
      return fibLevels.map(level => {
        const y = y1 + (y2 - y1) * level;
        return {
          type: 'line',
          attrs: {
            coordinates: [
              { x: x1, y },
              { x: x2, y }
            ]
          }
        };
      });
    }
    return [];
  }
};

// Fibonacci Extension
const fibonacciExtension: OverlayTemplate = {
  name: 'fibonacciExtension',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 2) {
      const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618];
      const yDiff = coordinates[1].y - coordinates[0].y;
      
      return fibLevels.map(level => {
        const y = coordinates[2].y - yDiff * level;
        return {
          type: 'line',
          attrs: {
            coordinates: [
              { x: coordinates[0].x, y },
              { x: coordinates[2].x + 100, y }
            ]
          }
        };
      });
    }
    return [];
  }
};

// Gann Box
const gannBox: OverlayTemplate = {
  name: 'gannBox',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const x1 = coordinates[0].x;
      const y1 = coordinates[0].y;
      const x2 = coordinates[1].x;
      const y2 = coordinates[1].y;
      
      const figures: any[] = [];
      const levels = [0, 0.25, 0.5, 0.75, 1];
      
      // Horizontal lines
      levels.forEach(level => {
        const y = y1 + (y2 - y1) * level;
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [{ x: x1, y }, { x: x2, y }]
          }
        });
      });
      
      // Vertical lines
      levels.forEach(level => {
        const x = x1 + (x2 - x1) * level;
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [{ x, y: y1 }, { x, y: y2 }]
          }
        });
      });
      
      // Diagonal lines
      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x: x1, y: y1 }, { x: x2, y: y2 }] }
      });
      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x: x1, y: y2 }, { x: x2, y: y1 }] }
      });
      
      return figures;
    }
    return [];
  }
};

// XABCD Pattern
const xabcd: OverlayTemplate = {
  name: 'xabcd',
  totalStep: 6,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const figures: any[] = [];
      for (let i = 0; i < coordinates.length - 1; i++) {
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [coordinates[i], coordinates[i + 1]]
          }
        });
      }
      return figures;
    }
    return [];
  }
};

// ABCD Pattern
const abcd: OverlayTemplate = {
  name: 'abcd',
  totalStep: 5,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const figures: any[] = [];
      for (let i = 0; i < coordinates.length - 1; i++) {
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [coordinates[i], coordinates[i + 1]]
          }
        });
      }
      return figures;
    }
    return [];
  }
};

// Three Waves
const threeWaves: OverlayTemplate = {
  name: 'threeWaves',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const figures: any[] = [];
      for (let i = 0; i < coordinates.length - 1; i++) {
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [coordinates[i], coordinates[i + 1]]
          }
        });
      }
      return figures;
    }
    return [];
  }
};

// Five Waves
const fiveWaves: OverlayTemplate = {
  name: 'fiveWaves',
  totalStep: 6,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const figures: any[] = [];
      for (let i = 0; i < coordinates.length - 1; i++) {
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [coordinates[i], coordinates[i + 1]]
          }
        });
      }
      return figures;
    }
    return [];
  }
};

// Eight Waves
const eightWaves: OverlayTemplate = {
  name: 'eightWaves',
  totalStep: 9,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const figures: any[] = [];
      for (let i = 0; i < coordinates.length - 1; i++) {
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [coordinates[i], coordinates[i + 1]]
          }
        });
      }
      return figures;
    }
    return [];
  }
};

// Any Waves
const anyWaves: OverlayTemplate = {
  name: 'anyWaves',
  totalStep: 0, // Infinite points
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const figures: any[] = [];
      for (let i = 0; i < coordinates.length - 1; i++) {
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [coordinates[i], coordinates[i + 1]]
          }
        });
      }
      return figures;
    }
    return [];
  }
};

// Simple Annotation (Text)
const simpleAnnotation: OverlayTemplate = {
  name: 'simpleAnnotation',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    text: {
      color: '#ffffff',
      size: 12,
      family: 'Arial',
      weight: 'normal'
    }
  },
  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length > 0) {
      const text = overlay.extendData?.text || 'Text';
      return [
        {
          type: 'text',
          attrs: {
            x: coordinates[0].x,
            y: coordinates[0].y,
            text: text,
            align: 'left',
            baseline: 'middle'
          },
          styles: {
            color: '#ffffff',
            size: 12,
            family: 'Arial'
          }
        }
      ];
    }
    return [];
  }
};

// Simple Tag (Label with background)
const simpleTag: OverlayTemplate = {
  name: 'simpleTag',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length > 0) {
      const text = overlay.extendData?.text || 'Tag';
      const padding = 6;
      const textWidth = text.length * 7 + padding * 2;
      const textHeight = 20;
      
      return [
        {
          type: 'rect',
          attrs: {
            x: coordinates[0].x - padding,
            y: coordinates[0].y - textHeight / 2,
            width: textWidth,
            height: textHeight
          },
          styles: {
            color: 'rgba(59, 130, 246, 0.8)'
          }
        },
        {
          type: 'text',
          attrs: {
            x: coordinates[0].x,
            y: coordinates[0].y,
            text: text,
            align: 'left',
            baseline: 'middle'
          },
          styles: {
            color: '#ffffff',
            size: 11,
            family: 'Arial'
          }
        }
      ];
    }
    return [];
  }
};

// Trade marker overlay - Hyperliquid style: circle with B/S letter, always above candle
const tradeMarker: OverlayTemplate = {
  name: 'tradeMarker',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    
    const { x, y } = coordinates[0];
    const data = overlay.extendData as { isBuy: boolean; price: number; trade?: any } | undefined;
    const isBuy = data?.isBuy ?? true;
    const price = data?.price ?? 0;
    const trade = data?.trade;
    
    // Hyperliquid colors
    const color = isBuy ? '#2dd4bf' : '#f87171'; // Teal for buy, coral red for sell
    const letter = isBuy ? 'B' : 'S';
    const radius = 10;
    
    return [
      // Circle background
      {
        type: 'circle',
        attrs: {
          x: x,
          y: y,
          r: radius,
        },
        styles: {
          style: 'fill',
          color: color,
          borderColor: 'transparent',
          borderSize: 0,
        },
        ignoreEvent: false,
      },
      // Letter (B or S)
      {
        type: 'text',
        attrs: {
          x: x,
          y: y,
          text: letter,
          align: 'center',
          baseline: 'middle',
        },
        styles: {
          style: 'fill',
          color: '#000000',
          borderColor: 'transparent',
          borderSize: 0,
          size: 11,
          family: 'Arial, sans-serif',
          weight: 'bold',
        },
        ignoreEvent: false,
      },
    ];
  },
  onMouseEnter: ({ overlay }) => {
    const data = overlay.extendData as { isBuy: boolean; price: number; trade?: any } | undefined;
    if (data?.trade && typeof window !== 'undefined') {
      const trade = data.trade;
      const side = data.isBuy ? 'Long' : 'Short';
      const tooltipText = `Open ${side} at ${data.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      window.dispatchEvent(new CustomEvent('tradeMarkerHover', { 
        detail: { trade, tooltipText, show: true } 
      }));
    }
    return true;
  },
  onMouseLeave: () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tradeMarkerHover', { 
        detail: { show: false } 
      }));
    }
    return true;
  },
  onClick: ({ overlay }) => {
    const data = overlay.extendData as { trade?: any } | undefined;
    if (data?.trade && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tradeMarkerClick', { detail: data.trade }));
    }
    return true;
  },
};

// All custom overlays
const customOverlays: OverlayTemplate[] = [
  circle,
  rect,
  triangle,
  parallelogram,
  arrow,
  fibonacciCircle,
  fibonacciSegment,
  fibonacciExtension,
  gannBox,
  xabcd,
  abcd,
  threeWaves,
  fiveWaves,
  eightWaves,
  anyWaves,
  simpleAnnotation,
  simpleTag,
  tradeMarker,
];

// Register all custom overlays
export function registerCustomOverlays(): void {
  customOverlays.forEach(overlay => {
    try {
      registerOverlay(overlay);
    } catch (e) {
      // Overlay might already be registered
    }
  });
}

// Built-in overlays from KlineCharts
export const BUILTIN_OVERLAYS = [
  'horizontalRayLine',
  'horizontalSegment',
  'horizontalStraightLine',
  'verticalRayLine',
  'verticalSegment',
  'verticalStraightLine',
  'rayLine',
  'segment',
  'straightLine',
  'priceLine',
  'priceChannelLine',
  'parallelStraightLine',
  'fibonacciLine',
];

// Custom overlays names
export const CUSTOM_OVERLAYS = [
  'circle',
  'rect',
  'triangle',
  'parallelogram',
  'arrow',
  'fibonacciCircle',
  'fibonacciSegment',
  'fibonacciExtension',
  'gannBox',
  'xabcd',
  'abcd',
  'threeWaves',
  'fiveWaves',
  'eightWaves',
  'anyWaves',
  'simpleAnnotation',
  'simpleTag',
  'tradeMarker',
];

export default customOverlays;
