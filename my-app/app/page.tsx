'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import MathCanvas, { MathCanvasRef } from '@/components/MathCanvas';
import { StrokeGroup } from '@/lib/types';
import { useRecognition } from '@/hooks/useRecognition';
import { solve, clearScope } from '@/lib/math-solver';

export default function Home() {
  const canvasRef = useRef<MathCanvasRef>(null);
  const [status, setStatus] = useState<string>('Draw a math expression...');
  const [showDebug, setShowDebug] = useState(true);
  
  // Recognition engine (smart pattern or ML model)
  const { recognize, mode, setMode, isLoading, error } = useRecognition('smart');

  // Handle when a group is ready for recognition
  const handleGroupReady = useCallback(async (group: StrokeGroup) => {
    setStatus(`Processing group ${group.id.slice(0, 8)}...`);

    try {
      // Use the recognition engine
      const expression = await recognize(group);
      setStatus(`Recognized: "${expression}"`);

      // Solve the expression
      const { result, error: solveError } = solve(expression);

      if (solveError) {
        setStatus(`Error: ${solveError}`);
        canvasRef.current?.updateGroupResult(group.id, expression, '?');
      } else {
        setStatus(`${expression} ${result}`);
        canvasRef.current?.updateGroupResult(group.id, expression, result);
      }
    } catch (err) {
      console.error('Recognition error:', err);
      setStatus('Recognition failed');
      canvasRef.current?.updateGroupResult(group.id, '', '?');
    }
  }, [recognize]);

  // Clear canvas handler
  const handleClear = useCallback(() => {
    canvasRef.current?.clearCanvas();
    clearScope();
    setStatus('Canvas cleared. Draw a math expression...');
  }, []);

  // Toggle recognition mode
  const toggleMode = useCallback(() => {
    setMode(mode === 'smart' ? 'model' : 'smart');
  }, [mode, setMode]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-zinc-900">
      {/* Canvas - smaller threshold (30px) to avoid merging close but separate characters */}
      <MathCanvas
        ref={canvasRef}
        onGroupReady={handleGroupReady}
        debounceMs={1200}
        clusterThreshold={30}
      />

      {/* Header UI */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-xl font-bold text-white mb-1">
            Spatial Math Notes
          </h1>
          <p className="text-sm text-zinc-400">
            Draw equations anywhere • They&apos;ll be grouped and solved automatically
          </p>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <a
            href="/v2"
            className="px-3 py-1.5 rounded bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            Try V2 (Per-Char)
          </a>
          <button
            onClick={toggleMode}
            disabled={isLoading}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              mode === 'model'
                ? 'bg-purple-600 text-white'
                : 'bg-blue-600 text-white'
            } ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {isLoading ? 'Loading...' : mode === 'model' ? '🧠 ML Model' : '✨ Smart'}
          </button>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              showDebug
                ? 'bg-green-600 text-white'
                : 'bg-zinc-700 text-zinc-300'
            }`}
          >
            Debug: {showDebug ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
        <div className="bg-zinc-800/80 backdrop-blur rounded-lg px-4 py-2 inline-block">
          <p className="text-sm text-zinc-300 font-mono">
            {error ? `⚠️ ${error}` : status}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Mode: {mode === 'model' ? 'ML Model' : 'Smart Pattern Recognition'}
          </p>
        </div>
      </div>

      {/* Instructions overlay (shows briefly on load) */}
      <Instructions />
    </main>
  );
}

function Instructions() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ animation: 'fadeOut 1s ease-out 4s forwards' }}
    >
      <div className="bg-zinc-800/90 backdrop-blur-sm rounded-xl p-6 max-w-md text-center">
        <h2 className="text-lg font-semibold text-white mb-3">How to Use</h2>
        <ul className="text-sm text-zinc-300 space-y-2 text-left">
          <li>✏️ Draw math expressions anywhere on the canvas</li>
          <li>📦 Nearby strokes are automatically grouped together</li>
          <li>⏱️ Wait 1 second after drawing for recognition</li>
          <li>✨ Results appear in gold next to your equation</li>
          <li>🔢 Try: <code className="bg-zinc-700 px-1 rounded">2+2=</code> or <code className="bg-zinc-700 px-1 rounded">x=5</code></li>
        </ul>
        <p className="text-xs text-zinc-500 mt-4">
          (This message will disappear in a few seconds)
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
