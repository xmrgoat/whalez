'use client';

import { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Settings2, 
  ChevronDown,
  ChevronUp,
  GripVertical,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  Activity,
  BarChart3,
  Volume2
} from 'lucide-react';
import { IndicatorConfig as IndicatorConfigType, Indicator } from './types';
import { AVAILABLE_INDICATORS } from './templates';

const TYPE_ICONS: Record<string, any> = {
  trend: TrendingUp,
  momentum: Activity,
  volatility: BarChart3,
  volume: Volume2,
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  trend: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  momentum: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
  volatility: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  volume: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
};

interface IndicatorConfigProps {
  indicators: IndicatorConfigType[];
  onChange: (indicators: IndicatorConfigType[]) => void;
}

export function IndicatorConfig({ indicators, onChange }: IndicatorConfigProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const addIndicator = (indicator: Indicator) => {
    const defaultParams: Record<string, any> = {};
    indicator.params.forEach(p => {
      defaultParams[p.name] = p.default;
    });

    const newIndicator: IndicatorConfigType = {
      id: `${indicator.id}_${Date.now()}`,
      indicatorId: indicator.id,
      params: defaultParams,
      enabled: true,
    };

    onChange([...indicators, newIndicator]);
    setShowAddModal(false);
    setExpandedId(newIndicator.id);
  };

  const removeIndicator = (id: string) => {
    onChange(indicators.filter(i => i.id !== id));
  };

  const updateIndicator = (id: string, updates: Partial<IndicatorConfigType>) => {
    onChange(indicators.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const updateParam = (id: string, paramName: string, value: any) => {
    onChange(indicators.map(i => {
      if (i.id !== id) return i;
      return { ...i, params: { ...i.params, [paramName]: value } };
    }));
  };

  const getIndicatorDef = (indicatorId: string) => {
    return AVAILABLE_INDICATORS.find(i => i.id === indicatorId);
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Technical Indicators</h2>
        <p className="text-white/50">Add and configure the indicators for your strategy</p>
      </div>

      <div className="max-w-3xl mx-auto space-y-4">
        {/* Indicator List */}
        {indicators.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border-2 border-dashed border-white/10">
            <BarChart3 className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/40 mb-4">No indicators added yet</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Indicator
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {indicators.map((indicator, index) => {
              const def = getIndicatorDef(indicator.indicatorId);
              if (!def) return null;

              const TypeIcon = TYPE_ICONS[def.type] || BarChart3;
              const colors = TYPE_COLORS[def.type] || TYPE_COLORS.trend;
              const isExpanded = expandedId === indicator.id;

              return (
                <div
                  key={indicator.id}
                  className={`rounded-xl border transition-all ${
                    indicator.enabled 
                      ? 'bg-white/5 border-white/10' 
                      : 'bg-white/[0.02] border-white/5 opacity-60'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 p-4">
                    <div className="cursor-grab text-white/20 hover:text-white/40">
                      <GripVertical className="w-4 h-4" />
                    </div>

                    <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center`}>
                      <TypeIcon className={`w-5 h-5 ${colors.text}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-white">{def.name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                          {def.type}
                        </span>
                      </div>
                      <p className="text-xs text-white/40 truncate">{def.description}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateIndicator(indicator.id, { enabled: !indicator.enabled })}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        {indicator.enabled ? (
                          <ToggleRight className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-white/40" />
                        )}
                      </button>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : indicator.id)}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-white/60" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-white/60" />
                        )}
                      </button>

                      <button
                        onClick={() => removeIndicator(indicator.id)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Params */}
                  {isExpanded && def.params.length > 0 && (
                    <div className="px-4 pb-4 pt-2 border-t border-white/5">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {def.params.map(param => (
                          <div key={param.name} className="space-y-1.5">
                            <label className="text-xs text-white/50 capitalize">
                              {param.name.replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                            
                            {param.type === 'number' ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={indicator.params[param.name] as number}
                                  onChange={(e) => updateParam(indicator.id, param.name, parseFloat(e.target.value))}
                                  min={param.min}
                                  max={param.max}
                                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                                />
                              </div>
                            ) : param.type === 'select' ? (
                              <select
                                value={indicator.params[param.name] as string}
                                onChange={(e) => updateParam(indicator.id, param.name, e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                              >
                                {param.options?.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => updateParam(indicator.id, param.name, !indicator.params[param.name])}
                                className={`px-3 py-2 rounded-lg text-sm ${
                                  indicator.params[param.name] 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'bg-white/5 text-white/60'
                                }`}
                              >
                                {indicator.params[param.name] ? 'Enabled' : 'Disabled'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add Button */}
        {indicators.length > 0 && (
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full py-3 rounded-xl border-2 border-dashed border-white/10 text-white/40 hover:border-emerald-500/30 hover:text-emerald-400 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Indicator
          </button>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-2xl">
            <div className="p-6 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Add Indicator</h3>
              <p className="text-sm text-white/40">Choose an indicator to add to your strategy</p>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {Object.entries(TYPE_COLORS).map(([type, colors]) => {
                const typeIndicators = AVAILABLE_INDICATORS.filter(i => i.type === type);
                if (typeIndicators.length === 0) return null;

                const TypeIcon = TYPE_ICONS[type] || BarChart3;

                return (
                  <div key={type} className="mb-6 last:mb-0">
                    <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${colors.text}`}>
                      {type}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {typeIndicators.map(indicator => (
                        <button
                          key={indicator.id}
                          onClick={() => addIndicator(indicator)}
                          className={`p-3 rounded-xl ${colors.bg} border border-transparent hover:border-white/20 text-left transition-all group`}
                        >
                          <div className="flex items-center gap-3">
                            <TypeIcon className={`w-5 h-5 ${colors.text}`} />
                            <div>
                              <div className="font-medium text-white">{indicator.name}</div>
                              <div className="text-xs text-white/40">{indicator.description}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-white/10">
              <button
                onClick={() => setShowAddModal(false)}
                className="w-full py-2 rounded-xl bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
