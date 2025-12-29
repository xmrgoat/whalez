'use client';

import { Check } from 'lucide-react';
import { BuilderStep } from './types';

interface Step {
  id: BuilderStep;
  label: string;
  icon: React.ReactNode;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: BuilderStep;
  completedSteps: BuilderStep[];
  onStepClick: (step: BuilderStep) => void;
}

export function StepIndicator({ steps, currentStep, completedSteps, onStepClick }: StepIndicatorProps) {
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="flex items-center justify-between w-full max-w-4xl mx-auto">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = step.id === currentStep;
        const isClickable = isCompleted || index <= currentIndex;

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              className={`
                flex flex-col items-center gap-2 group transition-all
                ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
              `}
            >
              <div
                className={`
                  w-12 h-12 rounded-xl flex items-center justify-center transition-all
                  ${isCurrent 
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30' 
                    : isCompleted 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-white/5 text-white/40 border border-white/10'
                  }
                  ${isClickable && !isCurrent ? 'group-hover:bg-white/10 group-hover:border-white/20' : ''}
                `}
              >
                {isCompleted && !isCurrent ? (
                  <Check className="w-5 h-5" />
                ) : (
                  step.icon
                )}
              </div>
              <span
                className={`
                  text-xs font-medium transition-colors
                  ${isCurrent ? 'text-white' : isCompleted ? 'text-emerald-400' : 'text-white/40'}
                `}
              >
                {step.label}
              </span>
            </button>

            {index < steps.length - 1 && (
              <div className="flex-1 h-px mx-4 relative">
                <div className="absolute inset-0 bg-white/10" />
                <div
                  className={`
                    absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500
                    ${isCompleted ? 'w-full' : 'w-0'}
                  `}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
