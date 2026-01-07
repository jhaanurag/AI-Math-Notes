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

    // Clear canvas with darker background
    ctx.fillStyle = '#09090d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw subtle dot grid pattern
    ctx.fillStyle = '#15151f';
    const gridSize = 20;
    for (let x = gridSize; x < canvas.width; x += gridSize) {
      for (let y = gridSize; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw all strokes with smooth lines
    ctx.strokeStyle = '#e4e4e7';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      
      // Subtle glow for strokes
      ctx.shadowColor = 'rgba(139, 92, 246, 0.2)';
      ctx.shadowBlur = 6;
      
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      
      // Reset shadow
      ctx.shadowBlur = 0;
    }

    // Draw current stroke with active glow
    if (currentStroke.length > 1) {
      ctx.shadowColor = 'rgba(139, 92, 246, 0.4)';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#a78bfa';
      
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw recognized characters with bounding boxes
    for (const char of characters) {
      const bb = char.boundingBox;
      
      // Draw bounding box - subtle dashed line
      ctx.strokeStyle = char.recognized 
        ? 'rgba(34, 197, 94, 0.4)' // Green if recognized
        : 'rgba(234, 179, 8, 0.4)'; // Yellow if not recognized yet
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(bb.minX - 3, bb.minY - 3, bb.width + 6, bb.height + 6);
      ctx.setLineDash([]);
      
      // Draw label above the bounding box
      if (char.recognized) {
        ctx.font = '600 11px ui-monospace, monospace';
        // Background for label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const labelText = `${char.recognized} ${Math.round(char.confidence * 100)}%`;
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillRect(bb.minX - 2, bb.minY - 18, textWidth + 6, 14);
        
        // Label text
        ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
        ctx.fillText(
          labelText,
          bb.minX + 1,
          bb.minY - 7
        );
      }
    }

    // Draw expression results in handwriting style
    ctx.font = '500 42px Caveat, cursive';
    for (const expr of expressions) {
      if (expr.result) {
        const pos = getResultPosition(expr);
        if (pos) {
          // Glow effect for results - no extra equals sign!
          ctx.shadowColor = 'rgba(139, 92, 246, 0.4)';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#c4b5fd';
          ctx.fillText(expr.result, pos.x, pos.y + 14);
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
            <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider backdrop-blur-sm border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              ML Active
            </span>
          )}
          {modelReady && !usingML && (
            <span className="bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider backdrop-blur-sm border border-amber-500/20 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-amber-400" />
              Rules
            </span>
          )}
          {isProcessing && (
            <span className="bg-violet-500/10 text-violet-400 px-2.5 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider backdrop-blur-sm border border-violet-500/20 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" />
              Processing
            </span>
          )}
        </div>

        {/* Canvas hint */}
        {strokes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-600">
              <p className="text-sm font-medium tracking-wide">Draw here</p>
              <p className="text-xs text-gray-700 mt-1 font-mono">Try: 2+3=</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <button
          onClick={handleClear}
          className="px-3 py-1.5 bg-red-500/5 hover:bg-red-500/10 text-red-400 rounded-md transition-all border border-red-500/10 hover:border-red-500/20 text-xs font-medium uppercase tracking-wider"
        >
          Clear
        </button>
        
        {/* Expression display */}
        <div className="flex-1 flex flex-wrap gap-1.5 justify-end">
          {expressions.map(expr => (
            <span key={expr.id} className="px-2.5 py-1 bg-white/[0.03] rounded-md text-xs border border-white/[0.06] font-mono">
              <span className="text-gray-400">{expr.text}</span>
              {expr.result && <span className="text-violet-400 font-medium"> {expr.result}</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between text-[10px] text-gray-600 px-0.5 uppercase tracking-wider">
        <div className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
            {strokes.length} strokes
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
            {characters.length} chars
          </span>
        </div>
        {!usingML && modelReady && (
          <span className="text-amber-500/60 normal-case tracking-normal">
            Add ML model for better accuracy
          </span>
        )}
      </div>
    </div>
  );
}
