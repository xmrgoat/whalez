'use client';

/**
 * ConfidenceBadge Component
 * 
 * Displays confidence score (0-100) with breakdown bars
 * Monochrome pixel style
 */

interface ConfidenceBreakdown {
  dataQuality: number;    // 0-20
  signalAgreement: number; // 0-30
  riskFit: number;        // 0-25
  regimeMatch: number;    // 0-15
  newsBonus: number;      // 0-10
}

interface ConfidenceBadgeProps {
  score: number;
  breakdown?: ConfidenceBreakdown;
  size?: 'sm' | 'md' | 'lg';
  showBreakdown?: boolean;
}

const BREAKDOWN_CONFIG = [
  { key: 'dataQuality', label: 'Data', max: 20, color: 'bg-black' },
  { key: 'signalAgreement', label: 'Signal', max: 30, color: 'bg-black' },
  { key: 'riskFit', label: 'Risk', max: 25, color: 'bg-black' },
  { key: 'regimeMatch', label: 'Regime', max: 15, color: 'bg-gray-600' },
  { key: 'newsBonus', label: 'News', max: 10, color: 'bg-gray-400' },
] as const;

export default function ConfidenceBadge({
  score,
  breakdown,
  size = 'md',
  showBreakdown = false,
}: ConfidenceBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const getScoreColor = (s: number) => {
    if (s >= 70) return 'bg-black text-white';
    if (s >= 50) return 'bg-gray-700 text-white';
    if (s >= 30) return 'bg-gray-400 text-black';
    return 'bg-gray-200 text-black';
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return 'Strong';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Weak';
    if (s >= 20) return 'Poor';
    return 'Blocked';
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Main badge */}
      <div className="flex items-center gap-2">
        <span className={`font-mono font-bold rounded ${sizeClasses[size]} ${getScoreColor(score)}`}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">
          {getScoreLabel(score)}
        </span>
      </div>

      {/* Breakdown bars */}
      {showBreakdown && breakdown && (
        <div className="flex flex-col gap-1 mt-1">
          {BREAKDOWN_CONFIG.map(({ key, label, max, color }) => {
            const value = breakdown[key as keyof ConfidenceBreakdown];
            const pct = (value / max) * 100;
            
            return (
              <div key={key} className="flex items-center gap-2 text-[10px]">
                <span className="w-12 text-muted-foreground">{label}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                  <div 
                    className={`h-full ${color} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono">{value}/{max}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Mini confidence indicator for timeline
 */
export function ConfidenceMini({ score }: { score: number }) {
  const width = Math.max(score, 5);
  
  return (
    <div className="flex items-center gap-1">
      <div className="w-12 h-1.5 bg-gray-100 rounded overflow-hidden">
        <div 
          className="h-full bg-black transition-all"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-[10px] font-mono w-6">{score}</span>
    </div>
  );
}
