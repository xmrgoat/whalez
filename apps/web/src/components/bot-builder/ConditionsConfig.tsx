'use client';

import { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Zap,
  ArrowRight,
  Target,
  Shield,
  Clock,
  Percent,
  Activity,
  AlertCircle,
  CheckCircle2,
  Info
} from 'lucide-react';
import { EntryCondition, ExitCondition, IndicatorConfig } from './types';
import { AVAILABLE_INDICATORS, CONDITION_OPERATORS } from './templates';

interface ConditionsConfigProps {
  indicators: IndicatorConfig[];
  entryConditions: EntryCondition[];
  exitConditions: ExitCondition[];
  onEntryChange: (conditions: EntryCondition[]) => void;
  onExitChange: (conditions: ExitCondition[]) => void;
}

export function ConditionsConfig({ 
  indicators, 
  entryConditions, 
  exitConditions, 
  onEntryChange, 
  onExitChange 
}: ConditionsConfigProps) {
  const [activeTab, setActiveTab] = useState<'entry' | 'exit'>('entry');

  const getIndicatorOptions = () => {
    const options: { value: string; label: string }[] = [
      { value: 'price', label: 'Price' },
    ];

    indicators.filter(i => i.enabled).forEach(ind => {
      const def = AVAILABLE_INDICATORS.find(a => a.id === ind.indicatorId);
      if (def) {
        options.push({ value: ind.id, label: `${def.name} (${Object.values(ind.params).join(', ')})` });
      }
    });

    return options;
  };

  const addEntryCondition = () => {
    const newCondition: EntryCondition = {
      id: `entry_${Date.now()}`,
      indicator1: 'price',
      operator: 'crosses_above',
      indicator2: indicators[0]?.id || 'price',
      logic: 'AND',
    };
    onEntryChange([...entryConditions, newCondition]);
  };

  const updateEntryCondition = (id: string, updates: Partial<EntryCondition>) => {
    onEntryChange(entryConditions.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeEntryCondition = (id: string) => {
    onEntryChange(entryConditions.filter(c => c.id !== id));
  };

  const addExitCondition = () => {
    const newCondition: ExitCondition = {
      id: `exit_${Date.now()}`,
      type: 'take_profit',
      value: 3,
    };
    onExitChange([...exitConditions, newCondition]);
  };

  const updateExitCondition = (id: string, updates: Partial<ExitCondition>) => {
    onExitChange(exitConditions.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeExitCondition = (id: string) => {
    onExitChange(exitConditions.filter(c => c.id !== id));
  };

  const indicatorOptions = getIndicatorOptions();

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Entry & Exit Conditions</h2>
        <p className="text-white/50">Define when your bot should enter and exit trades</p>
      </div>

      <div className="max-w-3xl mx-auto">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('entry')}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'entry'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/20'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Entry Conditions
            <span className="ml-1 px-2 py-0.5 rounded-full bg-white/10 text-xs">
              {entryConditions.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('exit')}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'exit'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-white/5 text-white/60 border border-white/10 hover:border-white/20'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Exit Conditions
            <span className="ml-1 px-2 py-0.5 rounded-full bg-white/10 text-xs">
              {exitConditions.length}
            </span>
          </button>
        </div>

        {/* Entry Conditions */}
        {activeTab === 'entry' && (
          <div className="space-y-4">
            {entryConditions.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border-2 border-dashed border-white/10">
                <Zap className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/40 mb-4">No entry conditions defined</p>
                <button
                  onClick={addEntryCondition}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Entry Condition
                </button>
              </div>
            ) : (
              <>
                {entryConditions.map((condition, index) => (
                  <div key={condition.id} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
                    {index > 0 && (
                      <div className="flex items-center gap-2 mb-2">
                        <select
                          value={condition.logic}
                          onChange={(e) => updateEntryCondition(condition.id, { logic: e.target.value as 'AND' | 'OR' })}
                          className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium"
                        >
                          <option value="AND">AND</option>
                          <option value="OR">OR</option>
                        </select>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      {/* Indicator 1 */}
                      <div className="flex-1">
                        <select
                          value={condition.indicator1}
                          onChange={(e) => updateEntryCondition(condition.id, { indicator1: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                        >
                          {indicatorOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Operator */}
                      <div className="w-40">
                        <select
                          value={condition.operator}
                          onChange={(e) => updateEntryCondition(condition.id, { operator: e.target.value as any })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                        >
                          {CONDITION_OPERATORS.map(op => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Indicator 2 or Value */}
                      <div className="flex-1">
                        {condition.operator === 'greater_than' || condition.operator === 'less_than' || condition.operator === 'equals' ? (
                          <input
                            type="number"
                            value={condition.value || 0}
                            onChange={(e) => updateEntryCondition(condition.id, { value: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                            placeholder="Value"
                          />
                        ) : (
                          <select
                            value={condition.indicator2}
                            onChange={(e) => updateEntryCondition(condition.id, { indicator2: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                          >
                            {indicatorOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => removeEntryCondition(condition.id)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addEntryCondition}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-white/10 text-white/40 hover:border-emerald-500/30 hover:text-emerald-400 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Entry Condition
                </button>
              </>
            )}
          </div>
        )}

        {/* Exit Conditions */}
        {activeTab === 'exit' && (
          <div className="space-y-4">
            {exitConditions.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border-2 border-dashed border-white/10">
                <TrendingDown className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/40 mb-4">No exit conditions defined</p>
                <button
                  onClick={addExitCondition}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Exit Condition
                </button>
              </div>
            ) : (
              <>
                {exitConditions.map((condition) => (
                  <div key={condition.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      {/* Type */}
                      <div className="w-40">
                        <select
                          value={condition.type}
                          onChange={(e) => updateExitCondition(condition.id, { type: e.target.value as any })}
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                        >
                          <option value="take_profit">Take Profit</option>
                          <option value="stop_loss">Stop Loss</option>
                          <option value="trailing_stop">Trailing Stop</option>
                          <option value="indicator">Indicator</option>
                          <option value="time">Time Based</option>
                        </select>
                      </div>

                      {/* Value */}
                      {condition.type !== 'indicator' && (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="number"
                            value={condition.value}
                            onChange={(e) => updateExitCondition(condition.id, { value: parseFloat(e.target.value) })}
                            className="w-24 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                            step="0.1"
                          />
                          <span className="text-white/40 text-sm">
                            {condition.type === 'time' ? 'hours' : '%'}
                          </span>
                        </div>
                      )}

                      {/* Indicator selector for indicator type */}
                      {condition.type === 'indicator' && (
                        <>
                          <select
                            value={condition.indicator || ''}
                            onChange={(e) => updateExitCondition(condition.id, { indicator: e.target.value })}
                            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                          >
                            <option value="">Select indicator...</option>
                            {indicatorOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <select
                            value={condition.operator || 'crosses_below'}
                            onChange={(e) => updateExitCondition(condition.id, { operator: e.target.value })}
                            className="w-36 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                          >
                            {CONDITION_OPERATORS.map(op => (
                              <option key={op.value} value={op.value}>{op.label}</option>
                            ))}
                          </select>
                        </>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => removeExitCondition(condition.id)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addExitCondition}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-white/10 text-white/40 hover:border-red-500/30 hover:text-red-400 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Exit Condition
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
