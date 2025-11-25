'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import MathCanvasV2, { MathCanvasV2Ref } from '@/components/MathCanvasV2';
import { CharacterCandidate } from '@/lib/character-grouper';
import { solve, clearScope } from '@/lib/math-solver';

export default function Home() {
  const canvasRef = useRef<MathCanvasV2Ref>(null);
  const [status, setStatus] = useState<string>('Draw characters one at a time...');
  const [expression, setExpression] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [charCount, setCharCount] = useState(0);

  // Handle individual character recognition
  const handleCharacterRecognized = useCallback((char: CharacterCandidate, charCanvas: HTMLCanvasElement) => {
    console.log('Character recognized:', char.recognizedAs, 'confidence:', char.confidence);
    setCharCount(prev => prev + 1);
    
    // Update expression display
    const currentExpr = canvasRef.current?.getExpression() || '';
    setExpression(currentExpr);
    setStatus(`Recognized: "${char.recognizedAs}" (${Math.round((char.confidence || 0) * 100)}% confidence)`);
    
    // TODO: Here we would send charCanvas to ML backend for better recognition
    // For now, using heuristic recognition from the grouper
  }, []);

  // Handle complete expression
  const handleExpressionComplete = useCallback((expr: string, chars: CharacterCandidate[]) => {
    console.log('Expression complete:', expr, 'chars:', chars.length);
    setExpression(expr);
    
    // Try to solve the expression
    const { result: solveResult, error } = solve(expr);
    
    if (error) {
      setStatus(`Expression: "${expr}" - Error: ${error}`);
      setResult('?');
    } else {
      setStatus(`Expression: "${expr}" = ${solveResult}`);
      setResult(solveResult);
    }
  }, []);

  // Clear canvas handler
  const handleClear = useCallback(() => {
    canvasRef.current?.clearCanvas();
    clearScope();
    setExpression('');
    setResult('');
    setCharCount(0);
    setStatus('Canvas cleared. Draw characters one at a time...');
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-zinc-900">
      {/* Canvas with per-character recognition */}
      <MathCanvasV2
        ref={canvasRef}
        onCharacterRecognized={handleCharacterRecognized}
        onExpressionComplete={handleExpressionComplete}
      />

      {/* Header UI */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-xl font-bold text-white mb-1">
            Spatial Math Notes <span className="text-sm font-normal text-purple-400">v2 - Per Character</span>
          </h1>
          <p className="text-sm text-zinc-400">
            Draw one character at a time • Each is recognized individually
          </p>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Expression display */}
      <div className="absolute top-20 left-4 pointer-events-none">
        <div className="bg-zinc-800/90 backdrop-blur rounded-lg px-4 py-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Expression</div>
          <div className="text-2xl font-mono text-white">
            {expression || '...'}
            {result && (
              <span className="text-yellow-400"> = {result}</span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-2">
            Characters detected: {charCount}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
        <div className="bg-zinc-800/80 backdrop-blur rounded-lg px-4 py-2 inline-block">
          <p className="text-sm text-zinc-300 font-mono">{status}</p>
          <p className="text-xs text-zinc-500 mt-1">
            Per-character recognition • 400ms timeout between characters
          </p>
        </div>
      </div>

      {/* Character detection info */}
      <div className="absolute bottom-20 right-4 pointer-events-none">
        <div className="bg-zinc-800/80 backdrop-blur rounded-lg px-4 py-3 text-xs text-zinc-400 max-w-xs">
          <div className="font-semibold text-zinc-300 mb-2">How characters are detected:</div>
          <ul className="space-y-1">
            <li>⏱️ <span className="text-blue-400">Time gap</span>: 400ms pause = new character</li>
            <li>📏 <span className="text-green-400">Distance</span>: 40px apart = new character</li>
            <li>📐 <span className="text-purple-400">Size</span>: Too wide/large = split</li>
          </ul>
        </div>
      </div>

      {/* Instructions overlay */}
      <Instructions />
    </main>
  );
}

function Instructions() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
      style={{ animation: 'fadeOut 1s ease-out 5s forwards' }}
    >
      <div className="bg-zinc-800/95 backdrop-blur-sm rounded-xl p-6 max-w-md text-center shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-3">Per-Character Recognition</h2>
        <ul className="text-sm text-zinc-300 space-y-2 text-left">
          <li>✏️ Draw one character, pause briefly (~400ms)</li>
          <li>📦 Each character is automatically detected and boxed</li>
          <li>🔍 Recognition happens per character, not per expression</li>
          <li>🎯 Multi-stroke characters (+ = 4) are grouped intelligently</li>
          <li>✨ Expression is assembled from all characters</li>
        </ul>
        <div className="mt-4 p-3 bg-zinc-700/50 rounded-lg">
          <p className="text-xs text-zinc-400">
            Try drawing: <code className="bg-zinc-600 px-2 py-0.5 rounded text-white">1 + 2</code>
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            (draw 1, pause, draw +, pause, draw 2)
          </p>
        </div>
        <p className="text-xs text-zinc-500 mt-4">
          (Click anywhere to dismiss)
        </p>
      </div>

      <style jsx>{`
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
