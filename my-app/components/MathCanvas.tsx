'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Point, Stroke, Character, Expression } from '@/lib/types';
import { calculateBoundingBox, generateId } from '@/lib/geometry';
import { addStrokeToCharacters } from '@/lib/stroke-grouping';
import { recognizeCharacter, initializeModel, isModelReady, isUsingMLModel } from '@/lib/recognizer';
import { buildExpressions, getResultPosition } from '@/lib/expression-parser';

interface MathCanvasProps {
  width?: number;
  height?: number;
}

export function MathCanvas({ width = 800, height = 600 }: MathCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [expressions, setExpressions] = useState<Expression[]>([]);
  const [modelReady, setModelReady] = useState(false);
  const [usingML, setUsingML] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Recognition debounce timer
  const recognitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize model on mount
  useEffect(() => {
    initializeModel().then(() => {
      setModelReady(true);
      setUsingML(isUsingMLModel());
    });
  }, []);

  // Redraw canvas whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with dark background
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw subtle dot grid pattern
    ctx.fillStyle = '#1a1a2e';
    const gridSize = 25;
    for (let x = gridSize; x < canvas.width; x += gridSize) {
      for (let y = gridSize; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw all strokes with smooth lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      
      // Add subtle glow effect
      ctx.shadowColor = 'rgba(96, 165, 250, 0.3)';
      ctx.shadowBlur = 8;
      
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      
      // Reset shadow
      ctx.shadowBlur = 0;
    }

    // Draw current stroke with glow
    if (currentStroke.length > 1) {
      ctx.shadowColor = 'rgba(96, 165, 250, 0.5)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = '#60a5fa';
      
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw recognized characters (subtle label)
    ctx.font = '11px system-ui';
    ctx.fillStyle = 'rgba(74, 222, 128, 0.7)';
    for (const char of characters) {
      if (char.recognized) {
        ctx.fillText(
          char.recognized,
          char.boundingBox.minX,
          char.boundingBox.minY - 6
        );
      }
    }

    // Draw expression results with style
    ctx.font = 'bold 36px system-ui';
    for (const expr of expressions) {
      if (expr.result) {
        const pos = getResultPosition(expr);
        if (pos) {
          // Glow effect for results
          ctx.shadowColor = 'rgba(96, 165, 250, 0.6)';
          ctx.shadowBlur = 15;
          ctx.fillStyle = '#60a5fa';
          ctx.fillText(expr.result, pos.x, pos.y + 12);
          ctx.shadowBlur = 0;
        }
      }
    }

  }, [strokes, currentStroke, characters, expressions]);

  // Process new stroke and trigger recognition
  const processStroke = useCallback(async (newStroke: Stroke) => {
    // Update characters with new stroke
    setCharacters(prev => {
      const updated = addStrokeToCharacters(prev, newStroke);
      return updated;
    });
  }, []);

  // Trigger recognition after a delay
  const scheduleRecognition = useCallback(() => {
    if (recognitionTimerRef.current) {
      clearTimeout(recognitionTimerRef.current);
    }

    recognitionTimerRef.current = setTimeout(async () => {
      if (!isModelReady()) return;
      
      setIsProcessing(true);
      
      // Recognize unrecognized characters
      setCharacters(prev => {
        const needsRecognition = prev.filter(c => c.recognized === null);
        if (needsRecognition.length === 0) return prev;

        // Process recognition asynchronously
        Promise.all(
          needsRecognition.map(async char => {
            const result = await recognizeCharacter(char);
            return { ...char, recognized: result.label, confidence: result.confidence };
          })
        ).then(recognizedChars => {
          setCharacters(current => {
            const recognized = new Map(recognizedChars.map(c => [c.id, c]));
            return current.map(c => recognized.get(c.id) || c);
          });
          
          // Update expressions after recognition
          setCharacters(current => {
            const exprs = buildExpressions(current);
            setExpressions(exprs);
            return current;
          });
          
          setIsProcessing(false);
        });

        return prev;
      });
    }, 300); // 300ms debounce
  }, []);

  // Mouse event handlers
  const getCanvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, timestamp: Date.now() };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      timestamp: Date.now(),
    };
  }, []);

  const getTouchPoint = useCallback((e: React.TouchEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, timestamp: Date.now() };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touch = e.touches[0];

    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
      timestamp: Date.now(),
    };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const point = getCanvasPoint(e);
    setCurrentStroke([point]);
  }, [getCanvasPoint]);

  const handlePointerMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const point = getCanvasPoint(e);
    setCurrentStroke(prev => [...prev, point]);
  }, [isDrawing, getCanvasPoint]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawing || currentStroke.length < 2) {
      setIsDrawing(false);
      setCurrentStroke([]);
      return;
    }

    // Create stroke object
    const newStroke: Stroke = {
      id: generateId(),
      points: currentStroke,
      boundingBox: calculateBoundingBox(currentStroke),
    };

    setStrokes(prev => [...prev, newStroke]);
    setIsDrawing(false);
    setCurrentStroke([]);

    // Process the new stroke
    processStroke(newStroke);
    scheduleRecognition();
  }, [isDrawing, currentStroke, processStroke, scheduleRecognition]);

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const point = getTouchPoint(e);
    setCurrentStroke([point]);
  }, [getTouchPoint]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const point = getTouchPoint(e);
    setCurrentStroke(prev => [...prev, point]);
  }, [isDrawing, getTouchPoint]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    handlePointerUp();
  }, [handlePointerUp]);

  // Clear canvas
  const handleClear = useCallback(() => {
    setStrokes([]);
    setCharacters([]);
    setExpressions([]);
    setCurrentStroke([]);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative group">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="rounded-xl cursor-crosshair touch-none w-full"
          style={{ maxWidth: width, aspectRatio: `${width}/${height}` }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        
        {/* Status indicators */}
        <div className="absolute top-3 right-3 flex gap-2">
          {!modelReady && (
            <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm border border-yellow-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Initializing...
            </span>
          )}
          {modelReady && usingML && (
            <span className="bg-green-500/20 text-green-400 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm border border-green-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              ML Model Active
            </span>
          )}
          {modelReady && !usingML && (
            <span className="bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm border border-orange-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              Rule-based
            </span>
          )}
          {isProcessing && (
            <span className="bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm border border-blue-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Recognizing...
            </span>
          )}
        </div>

        {/* Canvas hint */}
        {strokes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-500">
              <p className="text-lg font-medium">Draw here</p>
              <p className="text-sm">Write a math expression like 2+2=</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all border border-red-500/20 hover:border-red-500/30 text-sm font-medium"
        >
          Clear Canvas
        </button>
        
        {/* Expression display */}
        <div className="flex-1 flex flex-wrap gap-2 justify-end">
          {expressions.map(expr => (
            <span key={expr.id} className="px-3 py-1.5 bg-white/5 rounded-lg text-sm border border-white/10">
              <span className="text-gray-300">{expr.text}</span>
              {expr.result && <span className="text-blue-400 font-medium"> = {expr.result}</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-600" />
            {strokes.length} strokes
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-600" />
            {characters.length} characters
          </span>
        </div>
        {!usingML && modelReady && (
          <span className="text-orange-400/80">
            Train ML model for better recognition →
          </span>
        )}
      </div>
    </div>
  );
}
