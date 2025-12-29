'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Settings2,
  BarChart3,
  Zap,
  Shield,
  Play,
  Rocket,
  Sparkles,
} from 'lucide-react';
import {
  BotConfig,
  BuilderStep,
  BacktestResult,
  DEFAULT_BOT_CONFIG,
  StrategyTemplate,
  StepIndicator,
  TemplateSelector,
  BasicConfig,
  IndicatorConfig,
  ConditionsConfig,
  RiskConfig,
  BacktestPanel,
  DeployPanel,
  GrokAIPanel,
  STRATEGY_TEMPLATES,
  RiskManagement,
} from '@/components/bot-builder';
import { Brain } from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

const STEPS: { id: BuilderStep; label: string; icon: React.ReactNode }[] = [
  { id: 'template', label: 'Template', icon: <Sparkles className="w-5 h-5" /> },
  { id: 'ai', label: 'AI Builder', icon: <Brain className="w-5 h-5" /> },
  { id: 'config', label: 'Config', icon: <Settings2 className="w-5 h-5" /> },
  { id: 'indicators', label: 'Indicators', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'conditions', label: 'Conditions', icon: <Zap className="w-5 h-5" /> },
  { id: 'risk', label: 'Risk', icon: <Shield className="w-5 h-5" /> },
  { id: 'backtest', label: 'Backtest', icon: <Play className="w-5 h-5" /> },
  { id: 'deploy', label: 'Deploy', icon: <Rocket className="w-5 h-5" /> },
];

export default function CreateBotPage() {
  const router = useRouter();
  const { wallet } = useWallet();
  const [currentStep, setCurrentStep] = useState<BuilderStep>('template');
  const [completedSteps, setCompletedSteps] = useState<BuilderStep[]>([]);
  const [config, setConfig] = useState<BotConfig>(DEFAULT_BOT_CONFIG);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  useEffect(() => {
    if (!wallet.isConnected) {
      router.push('/');
    }
  }, [wallet.isConnected, router]);

  const updateConfig = (updates: Partial<BotConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const handleTemplateSelect = (template: StrategyTemplate) => {
    setSelectedTemplate(template.id);
    updateConfig({
      strategyType: template.defaultConfig.strategyType || 'custom',
      templateId: template.id,
      indicators: template.defaultConfig.indicators || [],
      timeframe: template.defaultConfig.timeframe || config.timeframe,
    });
  };

  const goToStep = (step: BuilderStep) => {
    setCurrentStep(step);
  };

  const nextStep = () => {
    const currentIndex = STEPS.findIndex(s => s.id === currentStep);
    if (currentIndex < STEPS.length - 1) {
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps([...completedSteps, currentStep]);
      }
      setCurrentStep(STEPS[currentIndex + 1].id);
    }
  };

  const prevStep = () => {
    const currentIndex = STEPS.findIndex(s => s.id === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'template':
        return selectedTemplate !== null;
      case 'config':
        return config.name.trim().length > 0;
      case 'indicators':
        return config.indicators.filter(i => i.enabled).length > 0;
      case 'conditions':
        return true;
      case 'risk':
        return true;
      case 'backtest':
        return true;
      default:
        return true;
    }
  };

  const handleDeploy = async () => {
    try {
      const res = await fetch(`${API_URL}/api/user-bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: wallet.address,
          name: config.name,
          description: config.description,
          symbol: config.symbol,
          timeframe: config.timeframe,
          strategyType: config.strategyType,
          config: {
            indicators: config.indicators,
            entryConditions: config.entryConditions,
            exitConditions: config.exitConditions,
            riskManagement: config.riskManagement,
            leverage: config.leverage,
            marginType: config.marginType,
            orderType: config.orderType,
            slippage: config.slippage,
          },
        }),
      });

      const data = await res.json();
      return { success: data.success, botId: data.bot?.id, error: data.error };
    } catch (error) {
      console.error('Deploy error:', error);
      return { success: false, error: 'Failed to deploy bot' };
    }
  };

  const currentIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/bots')}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Bot Builder</h1>
                <p className="text-xs text-white/40">Create your trading bot</p>
              </div>
            </div>
          </div>

          <div className="text-sm text-white/40">
            Step {currentIndex + 1} of {STEPS.length}
          </div>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="border-b border-white/5 py-6 px-6">
        <StepIndicator
          steps={STEPS}
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={goToStep}
        />
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="min-h-[60vh]">
          {currentStep === 'template' && (
            <TemplateSelector
              selectedTemplate={selectedTemplate}
              onSelect={handleTemplateSelect}
            />
          )}

          {currentStep === 'ai' && (
            <GrokAIPanel
              config={config}
              onConfigUpdate={updateConfig}
              onIndicatorsUpdate={(indicators) => updateConfig({ indicators })}
              onEntryConditionsUpdate={(entryConditions) => updateConfig({ entryConditions })}
              onExitConditionsUpdate={(exitConditions) => updateConfig({ exitConditions })}
              onRiskUpdate={(updates) => updateConfig({ 
                riskManagement: { ...config.riskManagement, ...updates } as RiskManagement
              })}
            />
          )}

          {currentStep === 'config' && (
            <BasicConfig
              config={config}
              onChange={updateConfig}
            />
          )}

          {currentStep === 'indicators' && (
            <IndicatorConfig
              indicators={config.indicators}
              onChange={(indicators) => updateConfig({ indicators })}
            />
          )}

          {currentStep === 'conditions' && (
            <ConditionsConfig
              indicators={config.indicators}
              entryConditions={config.entryConditions}
              exitConditions={config.exitConditions}
              onEntryChange={(entryConditions) => updateConfig({ entryConditions })}
              onExitChange={(exitConditions) => updateConfig({ exitConditions })}
            />
          )}

          {currentStep === 'risk' && (
            <RiskConfig
              config={config.riskManagement}
              onChange={(updates) => updateConfig({ 
                riskManagement: { ...config.riskManagement, ...updates } 
              })}
            />
          )}

          {currentStep === 'backtest' && (
            <BacktestPanel
              config={config}
              onBacktestComplete={setBacktestResult}
            />
          )}

          {currentStep === 'deploy' && (
            <DeployPanel
              config={config}
              backtestResult={backtestResult}
              walletAddress={wallet.address || ''}
              onDeploy={handleDeploy}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-8 border-t border-white/10 mt-8">
          <button
            onClick={prevStep}
            disabled={currentIndex === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </button>

          {currentStep !== 'deploy' && (
            <button
              onClick={nextStep}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
