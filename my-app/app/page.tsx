'use client';

import { MathCanvas } from '@/components/MathCanvas';
import { Button } from '@/components/ui/button';
import { Info, Github, Pencil, Calculator, Sparkles, Zap, Brain, X } from 'lucide-react';
import { useState } from 'react';

export default function Home() {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Gradient background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 backdrop-blur-sm bg-black/20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl blur group-hover:blur-md transition-all" />
              <div className="relative w-11 h-11 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Calculator className="w-6 h-6" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Spatial Math Notes
              </h1>
              <p className="text-xs text-gray-500">Draw • Recognize • Calculate</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowInfo(!showInfo)}
              className={`text-gray-400 hover:text-white hover:bg-white/10 ${showInfo ? 'bg-white/10 text-white' : ''}`}
            >
              {showInfo ? <X className="w-5 h-5" /> : <Info className="w-5 h-5" />}
            </Button>
            <a
              href="https://github.com/jhaanurag/AI-Math-Notes"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/10">
                <Github className="w-5 h-5" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* Info Panel */}
      <div className={`relative z-10 overflow-hidden transition-all duration-300 ease-out ${showInfo ? 'max-h-64' : 'max-h-0'}`}>
        <div className="bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 border-b border-white/5">
          <div className="container mx-auto px-4 py-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <Pencil className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-sm text-gray-300 space-y-3">
                <p className="font-medium text-white">How to use:</p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-gray-400">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Draw math expressions anywhere on the canvas
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Recognizes digits (0-9) and symbols (+, -, *, /, =, ^)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Draw = to see the result appear automatically
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Multi-stroke characters (like +) are auto-grouped
                  </li>
                </ul>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Tip: Draw clearly with some space between characters
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative z-10 container mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col items-center">
          {/* Canvas Card */}
          <div className="relative w-full max-w-5xl">
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 rounded-2xl blur-xl opacity-50" />
            
            <div className="relative bg-[#12121a] rounded-2xl p-4 md:p-6 border border-white/10 shadow-2xl">
              <MathCanvas width={1000} height={550} />
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 w-full max-w-5xl">
            <FeatureCard
              icon={<Pencil className="w-5 h-5" />}
              title="Natural Drawing"
              description="Write math expressions just like on paper"
              gradient="from-green-500 to-emerald-500"
            />
            <FeatureCard
              icon={<Brain className="w-5 h-5" />}
              title="AI Recognition"
              description="TensorFlow.js recognizes handwriting in real-time"
              gradient="from-blue-500 to-cyan-500"
            />
            <FeatureCard
              icon={<Zap className="w-5 h-5" />}
              title="Instant Results"
              description="Results appear magically next to equals sign"
              gradient="from-purple-500 to-pink-500"
            />
          </div>

          {/* Supported Symbols */}
          <div className="mt-8 text-center">
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Supported Symbols</h3>
            <div className="flex flex-wrap justify-center gap-2">
              {['0-9', '+', '−', '×', '÷', '=', '^', '(', ')', '.'].map(symbol => (
                <span
                  key={symbol}
                  className="px-3 py-1.5 bg-white/5 rounded-lg text-sm text-gray-300 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors"
                >
                  {symbol}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 mt-auto">
        <div className="container mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between text-xs text-gray-500 gap-2">
          <span>Built with Next.js, TensorFlow.js, and Math.js</span>
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            iOS Math Notes Clone
          </span>
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
      <div className={`absolute inset-0 bg-gradient-to-r ${gradient} rounded-xl blur-xl opacity-0 group-hover:opacity-20 transition-opacity`} />
      <div className="relative bg-white/5 rounded-xl p-5 border border-white/10 hover:border-white/20 transition-all">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${gradient} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        <h3 className="font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </div>
  );
}
