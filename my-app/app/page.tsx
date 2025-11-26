'use client';

import { Button } from '@/components/ui/button';
import { Github, Pencil, Calculator, Sparkles, Zap, Brain, ArrowRight, Smartphone, Monitor } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <main className="min-h-[100dvh] bg-[#08080c] text-white overflow-hidden font-mono flex flex-col">
      {/* Gradient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[150px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.04] backdrop-blur-md bg-black/20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-6xl">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg blur-sm opacity-60 group-hover:opacity-80 transition-opacity" />
              <div className="relative w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
                <Calculator className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold tracking-tight">Spatial Math Notes</h1>
              <p className="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest hidden sm:block">Draw • Recognize • Calculate</p>
            </div>
          </div>
          
          <a
            href="https://github.com/jhaanurag/AI-Math-Notes"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="icon" className="text-gray-500 hover:text-white hover:bg-white/5 rounded-lg h-9 w-9">
              <Github className="w-4 h-4" />
            </Button>
          </a>
        </div>
      </header>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 md:py-16">
        <div className="text-center max-w-2xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] rounded-full border border-white/[0.06] mb-6 md:mb-8">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] text-gray-400 uppercase tracking-wider">iOS Math Notes Clone</span>
          </div>

          {/* Title */}
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 md:mb-6">
            <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Draw Math,
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              Get Answers
            </span>
          </h2>

          {/* Subtitle */}
          <p className="text-sm md:text-base text-gray-400 mb-8 md:mb-10 max-w-md mx-auto leading-relaxed">
            Write mathematical expressions naturally with your finger or stylus. 
            AI recognizes your handwriting and calculates results instantly.
          </p>

          {/* CTA */}
          <Link href="/canvas">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-blue-500 to-violet-600 hover:from-blue-600 hover:to-violet-700 text-white border-0 px-6 md:px-8 py-5 md:py-6 text-sm md:text-base font-semibold rounded-xl shadow-lg shadow-violet-500/20 group"
            >
              {isMobile ? (
                <>
                  <Smartphone className="w-4 h-4 mr-2" />
                  Start Drawing
                </>
              ) : (
                <>
                  <Monitor className="w-4 h-4 mr-2" />
                  Open Canvas
                </>
              )}
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>

          {/* Demo hint */}
          <p className="text-[10px] text-gray-600 mt-4 uppercase tracking-wider">
            No account needed • Works offline
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mt-12 md:mt-16 w-full max-w-3xl px-4">
          <FeatureCard
            icon={<Pencil className="w-4 h-4" />}
            title="Natural Drawing"
            description="Write math like on paper with touch or stylus"
            gradient="from-emerald-500 to-green-600"
          />
          <FeatureCard
            icon={<Brain className="w-4 h-4" />}
            title="AI Recognition"
            description="TensorFlow.js ML model runs in your browser"
            gradient="from-blue-500 to-cyan-600"
          />
          <FeatureCard
            icon={<Zap className="w-4 h-4" />}
            title="Instant Results"
            description="Answers appear magically next to ="
            gradient="from-violet-500 to-purple-600"
          />
        </div>

        {/* Supported symbols */}
        <div className="mt-10 md:mt-12 text-center">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-600 mb-3">Supported Symbols</h3>
          <div className="flex flex-wrap justify-center gap-1.5 max-w-md">
            {['0-9', '+', '−', '×', '÷', '/', '=', '(', ')'].map(symbol => (
              <span
                key={symbol}
                className="px-2 md:px-2.5 py-1 bg-white/[0.02] rounded-md text-[11px] md:text-xs text-gray-500 border border-white/[0.04]"
              >
                {symbol}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04]">
        <div className="container mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between text-[10px] text-gray-600 gap-2 uppercase tracking-wider max-w-6xl">
          <span>Next.js + TensorFlow.js + Math.js</span>
          <span>Built by Anurag Jha</span>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description, 
  gradient 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
  gradient: string;
}) {
  return (
    <div className="group relative">
      <div className={`absolute inset-0 bg-gradient-to-r ${gradient} rounded-xl blur-xl opacity-0 group-hover:opacity-10 transition-opacity`} />
      <div className="relative bg-white/[0.02] rounded-xl p-4 border border-white/[0.04] hover:border-white/[0.08] transition-all h-full">
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-r ${gradient} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
          {icon}
        </div>
        <h3 className="font-semibold text-sm text-white mb-1">{title}</h3>
        <p className="text-[11px] text-gray-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
