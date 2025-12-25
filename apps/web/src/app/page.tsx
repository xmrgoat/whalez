'use client';

import dynamic from 'next/dynamic';
import BionicText from '@/components/BionicText';

const SplineHero = dynamic(() => import('@/components/SplineScene'), { 
  ssr: false,
  loading: () => <div className="h-[100svh] w-full bg-gray-100 animate-pulse" />
});

export default function Home() {
  return (
    <main className="bg-[#F3F3F3]">
      {/* HERO = fullscreen Spline with mouse interaction */}
      <SplineHero sceneUrl="/spline/scene.splinecode" />

      {/* CONTENT = below the hero */}
      <section id="home-content" className="min-h-screen px-6 py-24">
        <div className="mx-auto max-w-5xl">
          {/* Hero text */}
          <div className="text-center mb-20">
            <h1 className="font-pixel text-3xl tracking-tight mb-6">
              WHAL<span className="text-neutral-400">EZ</span>
            </h1>
            
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto leading-relaxed">
              <BionicText>
                Autonomous swing trading with self-critique and adaptive learning.
              </BionicText>
            </p>
            <p className="text-sm text-neutral-500 mt-2">
              <BionicText>Powered by Hyperliquid. Ready for MegaETH.</BionicText>
            </p>

            <div className="mt-10 flex items-center justify-center gap-4">
              <a 
                href="/dashboard" 
                className="px-6 py-3 bg-black text-white font-mono text-sm tracking-wide hover:bg-neutral-800 transition-all duration-200 rounded-sm"
              >
                <BionicText>Launch Dashboard</BionicText>
              </a>
              <a 
                href="/docs" 
                className="px-6 py-3 border-2 border-black text-black font-mono text-sm tracking-wide hover:bg-black hover:text-white transition-all duration-200 rounded-sm"
              >
                <BionicText>API Docs</BionicText>
              </a>
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            <div className="group p-8 border border-neutral-200 bg-white/50 hover:bg-white hover:border-neutral-300 transition-all duration-200 rounded-sm">
              <div className="font-pixel text-xs text-neutral-400 mb-4 tracking-widest">01</div>
              <h3 className="font-pixel text-sm mb-4">STRATEGY</h3>
              <p className="text-neutral-600 text-sm leading-relaxed">
                <BionicText>
                  EMA + RSI + ATR swing trading optimized for 4h and 1d timeframes with dynamic position sizing.
                </BionicText>
              </p>
            </div>

            <div className="group p-8 border border-neutral-200 bg-white/50 hover:bg-white hover:border-neutral-300 transition-all duration-200 rounded-sm">
              <div className="font-pixel text-xs text-neutral-400 mb-4 tracking-widest">02</div>
              <h3 className="font-pixel text-sm mb-4">SELF-CRITIQUE</h3>
              <p className="text-neutral-600 text-sm leading-relaxed">
                <BionicText>
                  Automatic performance analysis every 5 trades with safe, bounded parameter adjustments.
                </BionicText>
              </p>
            </div>

            <div className="group p-8 border border-neutral-200 bg-white/50 hover:bg-white hover:border-neutral-300 transition-all duration-200 rounded-sm">
              <div className="font-pixel text-xs text-neutral-400 mb-4 tracking-widest">03</div>
              <h3 className="font-pixel text-sm mb-4">MULTI-TENANT</h3>
              <p className="text-neutral-600 text-sm leading-relaxed">
                <BionicText>
                  Create and manage your own trading bots via REST API with scoped access control.
                </BionicText>
              </p>
            </div>
          </div>

          {/* Footer disclaimer */}
          <div className="text-center pt-12 border-t border-neutral-200">
            <p className="text-xs text-neutral-400 tracking-wide">
              <BionicText>
                ⚠️ Not financial advice. Use at your own risk. Paper trading recommended.
              </BionicText>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
