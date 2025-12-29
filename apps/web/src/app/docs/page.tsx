'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  TrendingUp, ChevronRight, ChevronDown, Book, Zap, Shield, Brain, Settings, BarChart3,
  Target, Activity, Clock, AlertTriangle, CheckCircle2, Code, Wallet, ArrowLeft, Search,
  Menu, X, Play, Sliders, LineChart, DollarSign, Lock, RefreshCw, Eye, Layers, Globe, Cpu, Sparkles
} from 'lucide-react';

const SECTIONS = [
  { id: 'getting-started', title: 'Getting Started', icon: Book, subsections: [
    { id: 'overview', title: 'Overview' },
    { id: 'requirements', title: 'Requirements' },
    { id: 'quick-start', title: 'Quick Start' },
  ]},
  { id: 'trading-bot', title: 'Trading Bot', icon: Cpu, subsections: [
    { id: 'how-it-works', title: 'How It Works' },
    { id: 'trading-modes', title: 'Trading Modes' },
    { id: 'analysis-loop', title: 'Analysis Loop' },
  ]},
  { id: 'ai-integration', title: 'AI Integration', icon: Brain, subsections: [
    { id: 'grok-ai', title: 'Grok AI' },
    { id: 'sentiment', title: 'Sentiment Analysis' },
    { id: 'self-critique', title: 'Self-Critique' },
  ]},
  { id: 'risk-management', title: 'Risk Management', icon: Shield, subsections: [
    { id: 'position-sizing', title: 'Position Sizing' },
    { id: 'stop-loss', title: 'Stop Loss & Take Profit' },
    { id: 'kelly', title: 'Kelly Criterion' },
  ]},
  { id: 'indicators', title: 'Technical Indicators', icon: Activity, subsections: [
    { id: 'main-indicators', title: 'Main Indicators' },
    { id: 'sub-indicators', title: 'Sub Indicators' },
  ]},
  { id: 'chart-system', title: 'Chart System', icon: LineChart, subsections: [
    { id: 'klinecharts', title: 'KLineCharts Pro' },
    { id: 'drawing-tools', title: 'Drawing Tools' },
  ]},
  { id: 'hyperliquid', title: 'Hyperliquid', icon: Globe, subsections: [
    { id: 'connection', title: 'Connection' },
    { id: 'agent-wallet', title: 'Agent Wallet' },
  ]},
  { id: 'configuration', title: 'Configuration', icon: Settings, subsections: [
    { id: 'bot-settings', title: 'Bot Settings' },
    { id: 'advanced', title: 'Advanced Settings' },
  ]},
];

export default function DocsPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState('overview');
  const [expandedSections, setExpandedSections] = useState<string[]>(['getting-started']);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSection = (id: string) => {
    setExpandedSections(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} shrink-0 border-r border-white/10 bg-[#0f0f0f] transition-all duration-300 overflow-hidden`}>
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center gap-3 px-4 border-b border-white/10">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">Whalez Docs</span>
          </div>

          {/* Search */}
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search docs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-2 pb-4">
            {SECTIONS.map((section) => (
              <div key={section.id} className="mb-1">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <section.icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{section.title}</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ${expandedSections.includes(section.id) ? 'rotate-90' : ''}`} />
                </button>
                {expandedSections.includes(section.id) && (
                  <div className="ml-6 mt-1 space-y-1">
                    {section.subsections.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => setActiveSection(sub.id)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          activeSection === sub.id
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'text-white/50 hover:text-white/70 hover:bg-white/5'
                        }`}
                      >
                        {sub.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* Back to App */}
          <div className="p-4 border-t border-white/10">
            <button
              onClick={() => router.push('/')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to App
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen">
        {/* Top Bar */}
        <header className="h-16 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl flex items-center px-6 sticky top-0 z-10">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-white/10 text-white/70 mr-4">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-white">Documentation</h1>
        </header>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-6 py-12">
          <DocContent section={activeSection} />
        </div>
      </main>
    </div>
  );
}

function DocContent({ section }: { section: string }) {
  const content: Record<string, React.ReactNode> = {
    'overview': <OverviewContent />,
    'requirements': <RequirementsContent />,
    'quick-start': <QuickStartContent />,
    'how-it-works': <HowItWorksContent />,
    'trading-modes': <TradingModesContent />,
    'analysis-loop': <AnalysisLoopContent />,
    'grok-ai': <GrokAIContent />,
    'sentiment': <SentimentContent />,
    'self-critique': <SelfCritiqueContent />,
    'position-sizing': <PositionSizingContent />,
    'stop-loss': <StopLossContent />,
    'kelly': <KellyContent />,
    'main-indicators': <MainIndicatorsContent />,
    'sub-indicators': <SubIndicatorsContent />,
    'klinecharts': <KLineChartsContent />,
    'drawing-tools': <DrawingToolsContent />,
    'connection': <ConnectionContent />,
    'agent-wallet': <AgentWalletContent />,
    'bot-settings': <BotSettingsContent />,
    'advanced': <AdvancedSettingsContent />,
  };
  return content[section] || <OverviewContent />;
}

function OverviewContent() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <TrendingUp className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">Whalez Trading Bot</h1>
          <p className="text-white/50">Autonomous AI-Powered Trading on Hyperliquid</p>
        </div>
      </div>
      <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <h3 className="font-semibold text-emerald-400 mb-2 flex items-center gap-2"><Sparkles className="w-5 h-5" />What is Whalez?</h3>
        <p className="text-white/70 leading-relaxed">Whalez is a fully autonomous trading bot that combines advanced technical analysis, quantitative algorithms, and AI-powered decision making to trade perpetual futures on Hyperliquid. It operates 24/7, continuously analyzing markets and executing trades.</p>
      </div>
      <h2 className="text-xl font-bold text-white mt-8 mb-4">Key Features</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { icon: Zap, title: 'Lightning Fast', desc: 'Sub-5ms execution on Hyperliquid L1' },
          { icon: Brain, title: 'AI-Powered', desc: 'Grok AI for sentiment analysis' },
          { icon: Shield, title: 'Risk Management', desc: 'Auto SL/TP, position sizing' },
          { icon: Activity, title: '27+ Indicators', desc: 'Full technical analysis suite' },
          { icon: Target, title: 'Quant Engine', desc: 'Kelly Criterion, VWAP, Order Flow' },
          { icon: RefreshCw, title: 'Self-Learning', desc: 'Continuous optimization' },
        ].map((f, i) => (
          <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
            <f.icon className="w-5 h-5 text-emerald-400 mt-0.5" />
            <div><h4 className="font-medium text-white">{f.title}</h4><p className="text-sm text-white/50">{f.desc}</p></div>
          </div>
        ))}
      </div>
      <h2 className="text-xl font-bold text-white mt-8 mb-4">Architecture</h2>
      <div className="p-6 rounded-xl bg-white/5 border border-white/10">
        <pre className="text-xs text-emerald-400 overflow-x-auto">{`┌─────────────────────────────────────────────────┐
│              WHALEZ TRADING BOT                 │
├─────────────────────────────────────────────────┤
│  Frontend (Next.js) ◄──► Backend (Express)      │
│         │                      │                │
│    ┌────┴────┐          ┌──────┴──────┐        │
│    │ Charts  │          │  Trading    │        │
│    │KLineCharts│        │   Engine    │        │
│    └─────────┘          └──────┬──────┘        │
│                                │                │
│              ┌─────────────────┼────────┐      │
│              │                 │        │      │
│         ┌────▼────┐    ┌──────▼──┐ ┌───▼───┐  │
│         │  Quant  │    │  Grok   │ │Hyper- │  │
│         │ Engine  │    │   AI    │ │liquid │  │
│         └─────────┘    └─────────┘ └───────┘  │
└─────────────────────────────────────────────────┘`}</pre>
      </div>
    </div>
  );
}

function RequirementsContent() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-6">Requirements</h1>
      <div className="p-6 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <h3 className="font-semibold text-amber-400 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Important</h3>
        <p className="text-white/70">Trading involves significant risk. Only trade with funds you can afford to lose.</p>
      </div>
      <h2 className="text-xl font-bold text-white mt-8 mb-4">Prerequisites</h2>
      <ul className="space-y-3">
        {['MetaMask, Rabby, or EIP-1193 wallet', 'Hyperliquid account with USDC', 'Modern web browser', 'Stable internet'].map((r, i) => (
          <li key={i} className="flex items-center gap-3 text-white/70"><CheckCircle2 className="w-5 h-5 text-emerald-400" />{r}</li>
        ))}
      </ul>
      <h2 className="text-xl font-bold text-white mt-8 mb-4">Recommended Capital</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {[{ mode: 'Conservative', min: '$500', rec: '$2,000+' }, { mode: 'Moderate', min: '$1,000', rec: '$5,000+' }, { mode: 'Aggressive', min: '$2,000', rec: '$10,000+' }].map((c, i) => (
          <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <h4 className="font-medium text-white mb-2">{c.mode}</h4>
            <p className="text-sm text-white/50">Min: {c.min}</p>
            <p className="text-sm text-emerald-400">Rec: {c.rec}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickStartContent() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-6">Quick Start Guide</h1>
      <div className="space-y-4">
        {[
          { step: 1, title: 'Connect Wallet', desc: 'Click "Connect Wallet" and approve in your extension', icon: Wallet },
          { step: 2, title: 'Authorize Agent', desc: 'Create a trading agent wallet (one-time setup)', icon: Lock },
          { step: 3, title: 'Configure Settings', desc: 'Set trading mode, leverage, position size', icon: Settings },
          { step: 4, title: 'Start Bot', desc: 'Click "Start" to begin autonomous trading', icon: Play },
          { step: 5, title: 'Monitor', desc: 'Watch positions and AI analysis in real-time', icon: Eye },
        ].map((s, i) => (
          <div key={i} className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <span className="text-emerald-400 font-bold">{s.step}</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white flex items-center gap-2"><s.icon className="w-4 h-4 text-emerald-400" />{s.title}</h3>
              <p className="text-sm text-white/50 mt-1">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HowItWorksContent() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-6">How the Bot Works</h1>
      <p className="text-white/70">The bot runs a continuous analysis loop combining multiple data sources.</p>
      <h2 className="text-xl font-bold text-white mt-8 mb-4">Trading Flow</h2>
      <div className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-3">
        {['Data Collection → Fetch prices, order book', 'Technical Analysis → Calculate 27+ indicators', 'Quant Analysis → Kelly, Z-Score, VWAP', 'AI Analysis → Grok sentiment (optional)', 'Signal Generation → LONG/SHORT/HOLD', 'Risk Check → Validate position size', 'Execution → Place order with SL/TP', 'Management → Monitor, trailing stop'].map((p, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">{i + 1}</div>
            <span className="text-white/70 text-sm">{p}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradingModesContent() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-6">Trading Modes</h1>
      <div className="space-y-4">
        <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20">
          <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Zap className="w-5 h-5 text-red-400" />Aggressive (Scalping)</h3>
          <div className="grid grid-cols-2 gap-2 text-sm mt-4">
            <div><span className="text-white/50">Interval:</span> <span className="text-white">8s</span></div>
            <div><span className="text-white/50">Target:</span> <span className="text-emerald-400">0.4%</span></div>
            <div><span className="text-white/50">Stop:</span> <span className="text-red-400">0.25%</span></div>
            <div><span className="text-white/50">Max/Day:</span> <span className="text-white">25</span></div>
          </div>
        </div>
        <div className="p-6 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Activity className="w-5 h-5 text-amber-400" />Moderate (Swing)</h3>
          <div className="grid grid-cols-2 gap-2 text-sm mt-4">
            <div><span className="text-white/50">Interval:</span> <span className="text-white">30s</span></div>
            <div><span className="text-white/50">Target:</span> <span className="text-emerald-400">1.5%</span></div>
            <div><span className="text-white/50">Stop:</span> <span className="text-red-400">0.75%</span></div>
            <div><span className="text-white/50">Max/Day:</span> <span className="text-white">10</span></div>
          </div>
        </div>
        <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-400" />Conservative (Position)</h3>
          <div className="grid grid-cols-2 gap-2 text-sm mt-4">
            <div><span className="text-white/50">Interval:</span> <span className="text-white">5m</span></div>
            <div><span className="text-white/50">Target:</span> <span className="text-emerald-400">3%</span></div>
            <div><span className="text-white/50">Stop:</span> <span className="text-red-400">1.5%</span></div>
            <div><span className="text-white/50">Max/Day:</span> <span className="text-white">5</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisLoopContent() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-6">Analysis Loop</h1>
      <div className="p-6 rounded-xl bg-white/5 border border-white/10">
        <pre className="text-xs text-emerald-400 overflow-x-auto">{`while (botRunning) {
  candles = fetchCandles(symbol, timeframe);
  indicators = calculateIndicators(candles);
  quantSignals = quantEngine.analyze();
  confluence = checkConfluence(indicators, quantSignals);
  
  if (confluence.score >= threshold) {
    aiAnalysis = await grokAI.analyze(); // optional
    signal = generateSignal(confluence, aiAnalysis);
    if (signal !== 'HOLD') executeOrder(signal);
  }
  await sleep(loopInterval);
}`}</pre>
      </div>
      <h2 className="text-xl font-bold text-white mt-8 mb-4">Confluence Signals</h2>
      <div className="grid grid-cols-2 gap-2">
        {[{ s: 'RSI', w: 15 }, { s: 'MACD', w: 20 }, { s: 'Bollinger', w: 15 }, { s: 'Volume', w: 10 }, { s: 'Order Flow', w: 20 }, { s: 'VWAP', w: 10 }, { s: 'Trend', w: 10 }].map((x, i) => (
          <div key={i} className="flex justify-between p-2 rounded bg-white/5 text-sm">
            <span className="text-white/70">{x.s}</span><span className="text-emerald-400">{x.w}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrokAIContent() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-6">Grok AI Integration</h1>
      <div className="p-6 rounded-xl bg-purple-500/10 border border-purple-500/20">
        <div className="flex items-center gap-3 mb-4"><Brain className="w-8 h-8 text-purple-400" /><div><h3 className="font-semibold text-white">Powered by Grok</h3><p className="text-sm text-white/50">xAI's advanced language model</p></div></div>
        <p className="text-white/70">Grok provides supplementary analysis for high-conviction trades, analyzing sentiment, news, and macro factors.</p>
      </div>
      <h2 className="text-xl font-bold text-white mt-8 mb-4">What Grok Analyzes</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {[{ t: 'Market Sentiment', d: 'Social media, news, fear/greed' }, { t: 'Macro Events', d: 'Fed, CPI, geopolitics' }, { t: 'On-Chain', d: 'Whale moves, funding rates' }, { t: 'Technical', d: 'Key levels, patterns' }].map((a, i) => (
          <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10"><h4 className="font-medium text-white mb-1">{a.t}</h4><p className="text-sm text-white/50">{a.d}</p></div>
        ))}
      </div>
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mt-6">
        <p className="text-white/70 text-sm"><strong className="text-amber-400">Note:</strong> Grok is supplementary. Trading continues without it if unavailable.</p>
      </div>
    </div>
  );
}

function SentimentContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Sentiment Analysis</h1><p className="text-white/70">Uses funding rates, open interest, and long/short ratios as contrarian indicators.</p></div>; }
function SelfCritiqueContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Self-Critique System</h1><p className="text-white/70">After every 5 trades, the bot analyzes wins/losses and adjusts parameters automatically.</p></div>; }
function PositionSizingContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Position Sizing</h1><p className="text-white/70">Uses fixed percentage or Kelly Criterion. Max 10% of account per position.</p><pre className="p-4 rounded-xl bg-white/5 text-emerald-400 text-sm">Position = (Equity × Risk%) / StopLoss%</pre></div>; }
function StopLossContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Stop Loss & Take Profit</h1><p className="text-white/70">Fixed or ATR-based stops. Trailing stop activates at profit threshold.</p></div>; }
function KellyContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Kelly Criterion</h1><div className="p-6 rounded-xl bg-white/5 text-center"><span className="text-3xl font-mono text-emerald-400">f* = W - (1-W)/R</span></div><p className="text-white/70 mt-4">Optimal bet sizing. Use Half-Kelly for safety.</p></div>; }
function MainIndicatorsContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Main Indicators</h1><div className="space-y-2">{['MA', 'EMA', 'SMA', 'BOLL', 'SAR', 'BBI', 'AVP'].map((i, x) => <div key={x} className="p-3 rounded-lg bg-white/5 text-white/70">{i}</div>)}</div></div>; }
function SubIndicatorsContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Sub Indicators</h1><div className="grid grid-cols-3 gap-2">{['VOL', 'MACD', 'RSI', 'KDJ', 'ATR', 'DMI', 'OBV', 'CCI', 'ROC', 'WR', 'MTM', 'TRIX', 'AO'].map((i, x) => <div key={x} className="p-2 rounded bg-white/5 text-emerald-400 text-sm font-mono text-center">{i}</div>)}</div></div>; }
function KLineChartsContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">KLineCharts Pro</h1><p className="text-white/70">Professional charting with 27+ indicators, 18+ drawing tools, keyboard shortcuts.</p><div className="grid grid-cols-2 gap-2 mt-4">{['+/- Zoom', '←→ Scroll', 'L Live', 'S Screenshot', 'I Indicators', 'Esc Close'].map((k, i) => <div key={i} className="p-2 rounded bg-white/5 text-white/70 text-sm">{k}</div>)}</div></div>; }
function DrawingToolsContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Drawing Tools</h1><div className="grid grid-cols-2 gap-2">{['Lines', 'Rays', 'Channels', 'Fibonacci', 'Gann Box', 'Elliott Waves', 'Shapes', 'Text'].map((t, i) => <div key={i} className="p-3 rounded-lg bg-white/5 text-white/70">{t}</div>)}</div></div>; }
function ConnectionContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Hyperliquid Connection</h1><p className="text-white/70">Direct L1 connection for sub-5ms execution. No intermediaries.</p></div>; }
function AgentWalletContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Agent Wallet</h1><p className="text-white/70">A separate wallet authorized to trade on your behalf. Your main wallet stays secure.</p></div>; }
function BotSettingsContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Bot Settings</h1><div className="space-y-2">{['Trading Mode', 'Leverage (1-10x)', 'Position Size %', 'Stop Loss %', 'Take Profit %', 'Trading Bag (symbols)'].map((s, i) => <div key={i} className="p-3 rounded-lg bg-white/5 text-white/70 flex items-center gap-2"><Settings className="w-4 h-4 text-emerald-400" />{s}</div>)}</div></div>; }
function AdvancedSettingsContent() { return <div className="space-y-6"><h1 className="text-3xl font-bold text-white">Advanced Settings</h1><div className="space-y-2">{['Trailing Stop', 'Smart SL/TP (ATR)', 'Max Positions', 'Session Filter', 'Dynamic Leverage'].map((s, i) => <div key={i} className="p-3 rounded-lg bg-white/5 text-white/70 flex items-center gap-2"><Sliders className="w-4 h-4 text-purple-400" />{s}</div>)}</div></div>; }
