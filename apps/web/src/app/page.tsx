'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import { TrendingUp, Shield, Zap, BarChart3, ArrowRight, Wallet, Brain, Target, Clock, Activity, Sparkles, Book, Bot, Library, Users } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { wallet, connect } = useWallet();
  const [livePrice, setLivePrice] = useState({ btc: 0, change: 0 });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  
  // Fetch live BTC price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`${API_URL}/api/market/ticker?symbol=BTC-PERP`);
        if (res.ok) {
          const data = await res.json();
          setLivePrice({ btc: data.price || 0, change: data.change24h || 0 });
        }
      } catch {}
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => clearInterval(interval);
  }, []);

  // Redirect to trade if already connected
  useEffect(() => {
    if (wallet.isConnected) {
      router.push('/trade');
    }
  }, [wallet.isConnected, router]);

  const handleConnect = async () => {
    const success = await connect();
    if (success) {
      router.push('/trade');
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[150px]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="font-display text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Whalez</span>
          </div>
          
          {/* Live Price Ticker */}
          {livePrice.btc > 0 && (
            <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-white/60 text-sm">BTC</span>
                <span className="font-mono font-bold text-white">
                  ${livePrice.btc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className={`font-mono text-sm font-medium px-2 py-0.5 rounded-md ${livePrice.change >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                  {livePrice.change >= 0 ? '+' : ''}{livePrice.change.toFixed(2)}%
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={wallet.isConnecting}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:shadow-emerald-500/40"
          >
            <Wallet className="w-4 h-4" />
            {wallet.isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-6 relative">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">Live on Hyperliquid Mainnet</span>
            <Sparkles className="w-4 h-4" />
          </div>
          
          {/* Main Heading */}
          <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight mb-6">
            <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">Autonomous Trading</span>
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">Powered by AI</span>
          </h1>
          
          {/* Subtitle */}
          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-12 leading-relaxed">
            Self-learning trading bot with real-time market analysis, 
            automatic position management, and continuous self-improvement.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleConnect}
              disabled={wallet.isConnecting}
              className="group px-8 py-4 rounded-2xl font-bold text-base flex items-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-2xl shadow-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/50 hover:scale-105 w-full sm:w-auto justify-center"
            >
              {wallet.isConnecting ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connecting...
                </>
              ) : (
                <>
                  Start Trading
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
            <a href="/docs" className="px-8 py-4 rounded-2xl font-semibold text-base flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 transition-all duration-200 w-full sm:w-auto justify-center">
              Documentation
              <Book className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 relative">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: '24/7', label: 'Monitoring', icon: Clock, color: 'emerald' },
              { value: '<5ms', label: 'Execution', icon: Zap, color: 'cyan' },
              { value: '27+', label: 'Indicators', icon: Activity, color: 'purple' },
              { value: 'Auto', label: 'Risk Management', icon: Shield, color: 'amber' },
            ].map((stat, i) => (
              <div key={i} className="group p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.07] transition-all duration-300 text-center backdrop-blur-sm">
                <stat.icon className={`w-6 h-6 mx-auto mb-3 ${
                  stat.color === 'emerald' ? 'text-emerald-400' :
                  stat.color === 'cyan' ? 'text-cyan-400' :
                  stat.color === 'purple' ? 'text-purple-400' :
                  'text-amber-400'
                }`} />
                <div className={`text-3xl md:text-4xl font-bold font-mono mb-1 ${
                  stat.color === 'emerald' ? 'text-emerald-400' :
                  stat.color === 'cyan' ? 'text-cyan-400' :
                  stat.color === 'purple' ? 'text-purple-400' :
                  'text-amber-400'
                }`}>{stat.value}</div>
                <div className="text-sm text-white/40 uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">Built for Serious Traders</h2>
            <p className="text-white/50 max-w-xl mx-auto text-lg">
              Professional-grade tools with institutional-level execution on Hyperliquid.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: 'Lightning Fast',
                description: 'Sub-millisecond order execution directly on Hyperliquid L1. No intermediaries, no delays.',
                gradient: 'from-amber-500 to-orange-600',
              },
              {
                icon: Shield,
                title: 'Risk Protected',
                description: 'Automatic stop-loss, position sizing, and max drawdown limits. Your capital is always protected.',
                gradient: 'from-emerald-500 to-teal-600',
              },
              {
                icon: Brain,
                title: 'AI-Powered',
                description: 'Grok AI integration for sentiment analysis and self-critique. Continuously optimizes strategy.',
                gradient: 'from-purple-500 to-pink-600',
              },
            ].map((feature, i) => (
              <div key={i} className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.07] transition-all duration-300 backdrop-blur-sm">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-display text-xl font-bold mb-3 text-white">{feature.title}</h3>
                <p className="text-white/50 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          {/* Additional Features Grid */}
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="p-8 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Target className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold mb-2 text-white">Quantitative Engine</h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Kelly Criterion position sizing, Z-Score mean reversion, VWAP execution, and Order Flow analysis for institutional-grade trading.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-8 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold mb-2 text-white">Advanced Charts</h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Professional trading charts with 27+ indicators, drawing tools, Fibonacci, Elliott Waves, and real-time trade markers.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* New Bot Builder & Community Features */}
          <div className="grid md:grid-cols-3 gap-6 mt-6">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 backdrop-blur-sm hover:border-indigo-500/40 transition-all cursor-pointer group" onClick={() => router.push('/bots')}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Bot className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold mb-2 text-white">Multi-Bot System</h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Create up to 5 custom bots with templates, no-code builder, or AI assistance.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border border-teal-500/20 backdrop-blur-sm hover:border-teal-500/40 transition-all cursor-pointer group" onClick={() => router.push('/library')}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Library className="w-6 h-6 text-teal-400" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold mb-2 text-white">Community Library</h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Browse, remix, and share strategies with on-chain verified performance.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 backdrop-blur-sm hover:border-amber-500/40 transition-all cursor-pointer group" onClick={() => router.push('/backtest')}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold mb-2 text-white">Backtesting</h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Test strategies on historical data with Grok AI simulation before going live.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="p-12 rounded-3xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-cyan-500/10 border border-emerald-500/20 backdrop-blur-sm text-center relative overflow-hidden">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-transparent opacity-50 blur-3xl" />
            
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4 bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">Ready to Start Trading?</h2>
              <p className="text-white/50 mb-8 text-lg max-w-lg mx-auto">
                Connect your wallet to access the trading dashboard and start your autonomous trading journey.
              </p>
              <button
                onClick={handleConnect}
                disabled={wallet.isConnecting}
                className="group px-8 py-4 rounded-2xl font-bold text-base flex items-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-2xl shadow-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/50 mx-auto"
              >
                <Wallet className="w-5 h-5" />
                {wallet.isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
              <p className="text-xs text-white/30 mt-6">
                Supports MetaMask, Rabby, Coinbase Wallet, and all EIP-1193 compatible wallets
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Whalez</span>
          </div>
          <p className="text-xs text-white/30 text-center">
            Trading involves significant risk. Not financial advice. Always do your own research.
          </p>
        </div>
      </footer>
    </main>
  );
}
