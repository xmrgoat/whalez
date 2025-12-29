'use client';

/**
 * BotCustomizer Component
 * 
 * Allows users to customize their bot with AI prompts
 * Prompts are limited and validated to prevent abuse
 */

import { useState, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  Shield, 
  AlertTriangle, 
  Check, 
  X,
  Save,
  RotateCcw,
  Info
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

// Predefined safe prompt templates
const PROMPT_TEMPLATES = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Focus on high-probability setups with strong confirmations',
    prompt: 'Only take trades with at least 4 confirmations. Prefer lower leverage (max 3x). Wait for clear trend direction.',
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'More frequent trades with moderate risk',
    prompt: 'Take trades with 3+ confirmations. Use up to 5x leverage on high-confidence setups. React quickly to momentum.',
  },
  {
    id: 'scalper',
    name: 'Scalper',
    description: 'Quick trades on short timeframes',
    prompt: 'Focus on 1m and 5m timeframes. Take quick profits (1-2%). Use tight stop losses. Volume confirmation is critical.',
  },
  {
    id: 'swing',
    name: 'Swing Trader',
    description: 'Hold positions for hours to days',
    prompt: 'Focus on 1h and 4h timeframes. Look for major support/resistance levels. Be patient for optimal entries.',
  },
  {
    id: 'sentiment',
    name: 'Sentiment Focus',
    description: 'Prioritize social sentiment analysis',
    prompt: 'Weight X/Twitter sentiment heavily. React to breaking news. Monitor whale activity and large transactions.',
  },
];

// Forbidden words/patterns in custom prompts
const FORBIDDEN_PATTERNS = [
  /ignore.*guardrail/i,
  /bypass.*limit/i,
  /override.*safety/i,
  /max.*leverage.*\d{2,}/i, // Trying to set very high leverage
  /100%.*position/i,
  /all.*in/i,
  /yolo/i,
  /no.*stop.*loss/i,
  /infinite/i,
  /hack/i,
  /exploit/i,
];

const MAX_PROMPT_LENGTH = 500;

interface BotCustomizerProps {
  botId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (customPrompt: string) => void;
}

export default function BotCustomizer({ botId, isOpen, onClose, onSave }: BotCustomizerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load saved prompt from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`bot-prompt-${botId}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.templateId) {
          setSelectedTemplate(data.templateId);
          setIsCustom(false);
        } else if (data.customPrompt) {
          setCustomPrompt(data.customPrompt);
          setIsCustom(true);
        }
      }
    }
  }, [botId]);

  // Validate custom prompt
  const validatePrompt = (prompt: string): { valid: boolean; error?: string } => {
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return { valid: false, error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` };
    }

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(prompt)) {
        return { valid: false, error: 'Prompt contains forbidden patterns that could bypass safety limits' };
      }
    }

    return { valid: true };
  };

  const handleCustomPromptChange = (value: string) => {
    setCustomPrompt(value);
    setError(null);
    
    if (value.length > 0) {
      const validation = validatePrompt(value);
      if (!validation.valid) {
        setError(validation.error || 'Invalid prompt');
      }
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    setIsCustom(false);
    setError(null);
    
    const template = PROMPT_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setCustomPrompt(template.prompt);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      let promptToSave = '';
      
      if (isCustom) {
        const validation = validatePrompt(customPrompt);
        if (!validation.valid) {
          setError(validation.error || 'Invalid prompt');
          setSaving(false);
          return;
        }
        promptToSave = customPrompt;
      } else if (selectedTemplate) {
        const template = PROMPT_TEMPLATES.find(t => t.id === selectedTemplate);
        promptToSave = template?.prompt || '';
      }

      // Save to localStorage
      localStorage.setItem(`bot-prompt-${botId}`, JSON.stringify({
        templateId: isCustom ? null : selectedTemplate,
        customPrompt: isCustom ? customPrompt : null,
        prompt: promptToSave,
        updatedAt: Date.now(),
      }));

      // Call onSave callback
      if (onSave) {
        onSave(promptToSave);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError('Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedTemplate(null);
    setCustomPrompt('');
    setIsCustom(false);
    setError(null);
    localStorage.removeItem(`bot-prompt-${botId}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-semibold">Customize Bot AI</h2>
              <p className="text-xs text-muted-foreground">Personalize how your bot analyzes and trades</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Safety Notice */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-6">
            <Shield className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-600">Safety Limits Active</p>
              <p className="text-muted-foreground mt-1">
                Your prompts cannot override safety guardrails. Max leverage, position size, and stop loss limits are enforced by the system.
              </p>
            </div>
          </div>

          {/* Template Selection */}
          <div className="mb-6">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Strategy Templates
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {PROMPT_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template.id)}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    selectedTemplate === template.id && !isCustom
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="font-medium text-sm">{template.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{template.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                Custom Instructions
              </h3>
              <button
                onClick={() => setIsCustom(!isCustom)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  isCustom 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {isCustom ? 'Using Custom' : 'Use Custom'}
              </button>
            </div>
            
            <div className="relative">
              <textarea
                value={customPrompt}
                onChange={(e) => handleCustomPromptChange(e.target.value)}
                placeholder="Enter custom instructions for your bot... (e.g., 'Focus on BTC momentum trades during US market hours')"
                className={`w-full h-32 p-4 rounded-lg border bg-background resize-none text-sm ${
                  error ? 'border-red-500' : 'border-border'
                } ${!isCustom ? 'opacity-50' : ''}`}
                disabled={!isCustom}
                maxLength={MAX_PROMPT_LENGTH}
              />
              <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                {customPrompt.length}/{MAX_PROMPT_LENGTH}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 mt-2 text-red-500 text-sm">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* Tips */}
            <div className="mt-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-xs font-medium mb-2">
                <Info className="w-3 h-3" />
                Tips for effective prompts
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Be specific about timeframes and conditions</li>
                <li>• Mention which indicators to prioritize</li>
                <li>• Describe your risk tolerance</li>
                <li>• Specify market hours or conditions to focus on</li>
              </ul>
            </div>
          </div>

          {/* Preview */}
          {(selectedTemplate || (isCustom && customPrompt)) && (
            <div className="mb-6">
              <h3 className="font-medium mb-3">Active Prompt Preview</h3>
              <div className="p-4 rounded-lg bg-muted/30 border border-border">
                <p className="text-sm text-muted-foreground">
                  {isCustom ? customPrompt : PROMPT_TEMPLATES.find(t => t.id === selectedTemplate)?.prompt}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg hover:bg-muted"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (!selectedTemplate && !customPrompt)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <>Saving...</>
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
