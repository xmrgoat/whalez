'use client';

/**
 * LivePrice Component
 * 
 * Displays a live updating price with animated digits.
 * Shows price changes in real-time with color coding.
 * Example: 98,221.45 → 98,221.67 (green flash on increase)
 */

import { useState, useEffect, useRef, memo } from 'react';

interface LivePriceProps {
  price: number;
  previousPrice?: number;
  precision?: number;
  showChange?: boolean;
  showPips?: boolean;
  pipSize?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

function LivePriceComponent({
  price,
  previousPrice,
  precision = 2,
  showChange = true,
  showPips = true,
  pipSize = 0.01,
  size = 'md',
  className = '',
}: LivePriceProps) {
  const [displayPrice, setDisplayPrice] = useState(price);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'none'>('none');
  const [flashClass, setFlashClass] = useState('');
  const prevPriceRef = useRef(price);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  // Size classes
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-4xl',
  };

  // Update price with animation
  useEffect(() => {
    const prev = prevPriceRef.current;
    
    if (price !== prev) {
      // Determine direction
      const direction = price > prev ? 'up' : price < prev ? 'down' : 'none';
      setPriceDirection(direction);
      
      // Flash effect
      setFlashClass(direction === 'up' ? 'bg-green-100' : direction === 'down' ? 'bg-red-100' : '');
      
      // Clear flash after animation
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
      animationRef.current = setTimeout(() => {
        setFlashClass('');
      }, 300);
      
      // Smooth price transition (optional - for very fast updates)
      setDisplayPrice(price);
      prevPriceRef.current = price;
    }
  }, [price]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);

  // Format price with thousands separator
  const formatPrice = (p: number): string => {
    const parts = p.toFixed(precision).split('.');
    const intPart = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts[1] ? `${intPart}.${parts[1]}` : intPart;
  };

  // Calculate change
  const change = previousPrice !== undefined ? price - previousPrice : 0;
  const changePercent = previousPrice && previousPrice !== 0 
    ? ((price - previousPrice) / previousPrice) * 100 
    : 0;
  const pips = Math.abs(change / pipSize);

  // Split price into parts for animation
  const formattedPrice = formatPrice(displayPrice);
  const [integerPart, decimalPart] = formattedPrice.split('.');

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Main Price */}
      <div 
        className={`
          font-mono font-bold transition-colors duration-150 rounded px-1
          ${sizeClasses[size]}
          ${flashClass}
          ${priceDirection === 'up' ? 'text-green-600' : priceDirection === 'down' ? 'text-red-600' : 'text-black'}
        `}
      >
        <span className="tabular-nums">{integerPart}</span>
        {decimalPart && (
          <>
            <span className="text-gray-400">.</span>
            <span className="tabular-nums opacity-80">{decimalPart}</span>
          </>
        )}
      </div>

      {/* Change indicator */}
      {showChange && change !== 0 && (
        <div className={`text-xs font-mono ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          <span>{change >= 0 ? '▲' : '▼'}</span>
          <span className="ml-0.5">{Math.abs(change).toFixed(precision)}</span>
          <span className="ml-1 opacity-70">({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)</span>
        </div>
      )}

      {/* Pips display */}
      {showPips && pips > 0 && (
        <div className="text-xs text-muted-foreground font-mono">
          {pips.toFixed(0)} pips
        </div>
      )}
    </div>
  );
}

export const LivePrice = memo(LivePriceComponent);

/**
 * Compact version for headers/toolbars
 */
interface CompactLivePriceProps {
  price: number;
  previousPrice?: number;
  precision?: number;
  symbol?: string;
}

function CompactLivePriceComponent({
  price,
  previousPrice,
  precision = 2,
  symbol,
}: CompactLivePriceProps) {
  const [direction, setDirection] = useState<'up' | 'down' | 'none'>('none');
  const prevRef = useRef(price);

  useEffect(() => {
    if (price !== prevRef.current) {
      setDirection(price > prevRef.current ? 'up' : 'down');
      prevRef.current = price;
      
      // Reset direction after animation
      const timer = setTimeout(() => setDirection('none'), 1000);
      return () => clearTimeout(timer);
    }
  }, [price]);

  const change = previousPrice !== undefined ? price - previousPrice : 0;
  const changePercent = previousPrice && previousPrice !== 0 
    ? ((price - previousPrice) / previousPrice) * 100 
    : 0;

  return (
    <div className="flex items-center gap-2">
      {symbol && <span className="font-pixel text-xs text-muted-foreground">{symbol}</span>}
      <span 
        className={`
          font-mono font-bold tabular-nums transition-colors duration-200
          ${direction === 'up' ? 'text-green-600' : direction === 'down' ? 'text-red-600' : 'text-black'}
        `}
      >
        ${price.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}
      </span>
      {change !== 0 && (
        <span className={`text-xs font-mono ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

export const CompactLivePrice = memo(CompactLivePriceComponent);

export default LivePrice;
