'use client';

import Script from 'next/script';

interface SplineHeroProps {
  sceneUrl: string;
}

export default function SplineHero({ sceneUrl }: SplineHeroProps) {
  const scrollToContent = () => {
    const el = document.getElementById('home-content');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="relative h-[100svh] w-full overflow-hidden bg-[#F3F3F3]">
      {/* Load spline-viewer web component */}
      <Script
        type="module"
        src="https://unpkg.com/@splinetool/viewer@1.12.28/build/spline-viewer.js"
        strategy="afterInteractive"
      />

      {/* Spline animation (interactive mouse) */}
      <div className="absolute inset-0">
        {/* @ts-ignore - web component */}
        <spline-viewer url={sceneUrl}></spline-viewer>
      </div>

      {/* Scroll button */}
      <button
        onClick={scrollToContent}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md border border-black bg-white/80 px-4 py-2 font-mono text-xs tracking-wider hover:bg-white transition-colors z-10"
      >
        SCROLL ↓
      </button>
    </section>
  );
}
