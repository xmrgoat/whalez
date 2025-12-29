'use client';

import { 
  TrendingUp, 
  Activity, 
  BarChart3, 
  Zap, 
  Rocket, 
  Timer, 
  Grid3x3, 
  Wrench,
  Star,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { StrategyTemplate } from './types';
import { STRATEGY_TEMPLATES } from './templates';

const ICON_MAP: Record<string, any> = {
  TrendingUp,
  Activity,
  BarChart3,
  Zap,
  Rocket,
  Timer,
  Grid3x3,
  Wrench,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  trend: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  momentum: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  'mean-reversion': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  breakout: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  scalping: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  custom: { bg: 'bg-white/5', text: 'text-white/60', border: 'border-white/10' },
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'text-emerald-400',
  intermediate: 'text-amber-400',
  advanced: 'text-red-400',
};

interface TemplateSelectorProps {
  selectedTemplate: string | null;
  onSelect: (template: StrategyTemplate) => void;
}

export function TemplateSelector({ selectedTemplate, onSelect }: TemplateSelectorProps) {
  const categories = ['trend', 'momentum', 'mean-reversion', 'breakout', 'scalping', 'custom'];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Choose Your Strategy</h2>
        <p className="text-white/50">Select a template to get started or build from scratch</p>
      </div>

      {categories.map(category => {
        const templates = STRATEGY_TEMPLATES.filter(t => t.category === category);
        if (templates.length === 0) return null;

        const categoryColors = CATEGORY_COLORS[category];

        return (
          <div key={category} className="space-y-4">
            <h3 className={`text-sm font-semibold uppercase tracking-wider ${categoryColors.text}`}>
              {category.replace('-', ' ')}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(template => {
                const Icon = ICON_MAP[template.icon] || Sparkles;
                const isSelected = selectedTemplate === template.id;
                const difficultyColor = DIFFICULTY_COLORS[template.difficulty];

                return (
                  <button
                    key={template.id}
                    onClick={() => onSelect(template)}
                    className={`
                      relative p-5 rounded-2xl text-left transition-all group
                      ${isSelected 
                        ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/10' 
                        : `${categoryColors.bg} border ${categoryColors.border} hover:border-white/20`
                      }
                    `}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3">
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Star className="w-3.5 h-3.5 text-white fill-white" />
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-4">
                      <div className={`
                        w-12 h-12 rounded-xl flex items-center justify-center
                        ${isSelected ? 'bg-emerald-500/30' : categoryColors.bg}
                      `}>
                        <Icon className={`w-6 h-6 ${isSelected ? 'text-emerald-400' : categoryColors.text}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-semibold mb-1">{template.name}</h4>
                        <p className="text-sm text-white/40 line-clamp-2 mb-3">{template.description}</p>

                        <div className="flex items-center gap-3 text-xs">
                          <span className={`capitalize ${difficultyColor}`}>
                            {template.difficulty}
                          </span>
                          
                          {template.winRate && (
                            <span className="text-white/40">
                              {template.winRate}% WR
                            </span>
                          )}
                          
                          {template.avgReturn && (
                            <span className="text-emerald-400">
                              +{template.avgReturn}% avg
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`
                      absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity
                      ${isSelected ? 'opacity-100' : ''}
                    `}>
                      <ChevronRight className="w-5 h-5 text-white/40" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
