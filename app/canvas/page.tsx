'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Point, Stroke, Character, Expression } from '@/lib/types';
import { calculateBoundingBox, generateId } from '@/lib/geometry';
import { addStrokeToCharacters } from '@/lib/stroke-grouping';
import {
  recognizeCharacter,
  initializeModel,
  isModelReady,
  isUsingMLModel,
  setUseTesseract,
  setDebugCanvas,
  renderCharacterToDebugCanvas,
} from '@/lib/recognizer';
import { buildExpressions, getResultPosition } from '@/lib/expression-parser';
import {
  Undo2,
  Redo2,
  Trash2,
  Bug,
  BugOff,
  Keyboard,
  ScanText,
  X,
} from 'lucide-react';

const STROKE_COLORS = [
  { name: 'White', value: '#f0f0f0' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Lime', value: '#84cc16' },
];

/**
 * Draw a smooth stroke using midpoint quadratic Bézier curves
 */
function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  strokeWidth: number
) {
  if (!points || points.length === 0) return;

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }

  const lastPoint = points[points.length - 1];
  ctx.lineTo(lastPoint.x, lastPoint.y);
  ctx.stroke();
}

export default function CanvasPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Drawing state refs for 60/120Hz smooth interactive drawing without React lag
  const isDrawingRef = useRef(false);
  const activeStrokeRef = useRef<Point[]>([]);
  const rafIdRef = useRef<number | null>(null);

  // Epoch to cancel in-flight recognition on undo/clear
  const recognitionEpochRef = useRef(0);

  // Data refs to prevent transient disappearance during async state updates
  const strokesRef = useRef<Stroke[]>([]);
  const charactersRef = useRef<Character[]>([]);
  const expressionsRef = useRef<Expression[]>([]);

  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [expressions, setExpressions] = useState<Expression[]>([]);
  const [modelReady, setModelReady] = useState(false);
  const [usingML, setUsingML] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // UI state
  const [debugMode, setDebugMode] = useState(false);
  const [strokeColor, setStrokeColor] = useState(STROKE_COLORS[0].value);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [undoStack, setUndoStack] = useState<{ strokes: Stroke[]; characters: Character[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ strokes: Stroke[]; characters: Character[] }[]>([]);
  const [tesseractMode, setTesseractMode] = useState(false);

  // Debug info for bottom-left preview
  const [debugInfo, setDebugInfo] = useState<{
    label: string | null;
    confidence: number | null;
    width: number;
    height: number;
    strokeCount: number;
  } | null>(null);

  const recognitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Resize canvas to fill container accurately with DPR
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        setCanvasSize({
          width: Math.floor(rect.width * dpr),
          height: Math.floor(rect.height * dpr),
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);


  // Non-blocking model initialization
  useEffect(() => {
    let mounted = true;
    initializeModel()
      .then(() => {
        if (mounted) {
          setModelReady(true);
          setUsingML(isUsingMLModel());
        }
      })
      .catch(() => {
        if (mounted) {
          setModelReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Connect or disconnect debug canvas when debugMode changes
  useEffect(() => {
    if (debugMode && debugCanvasRef.current) {
      const lastChar = characters.length > 0 ? characters[characters.length - 1] : null;
      setDebugCanvas(debugCanvasRef.current, lastChar);
      if (lastChar) {
        setDebugInfo({
          label: lastChar.recognized,
          confidence: lastChar.confidence,
          width: Math.round(lastChar.boundingBox.width),
          height: Math.round(lastChar.boundingBox.height),
          strokeCount: lastChar.strokes.length,
        });
      } else {
        setDebugInfo(null);
      }
    } else {
      setDebugCanvas(null);
    }
  }, [debugMode, characters]);

  // Render main canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // 1. Fast background blit
    if (bgCanvasRef.current) {
      ctx.drawImage(bgCanvasRef.current, 0, 0);
    } else {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Draw completed strokes
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const strokeWidth = 2.8 * dpr;
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 3 * dpr;

    const currentStrokes = strokesRef.current.length > 0 ? strokesRef.current : strokes;
    for (const stroke of currentStrokes) {
      drawSmoothStroke(ctx, stroke.points, strokeWidth);
    }

    // 3. Draw active stroke (smooth real-time feedback)
    const activePoints = activeStrokeRef.current;
    if (activePoints.length > 0) {
      ctx.shadowBlur = 4 * dpr;
      drawSmoothStroke(ctx, activePoints, strokeWidth);
    }

    ctx.shadowBlur = 0;

    // 4. Debug bounding boxes and labels
    if (debugMode) {
      const currentChars = charactersRef.current.length > 0 ? charactersRef.current : characters;
      for (const char of currentChars) {
        // Only draw bounding box if character currently has strokes
        if (!char.strokes || char.strokes.length === 0) continue;
        const bb = char.boundingBox;
        ctx.strokeStyle = char.recognized
          ? 'rgba(34, 197, 94, 0.6)'
          : 'rgba(251, 191, 36, 0.6)';
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.strokeRect(bb.minX - 4, bb.minY - 4, bb.width + 8, bb.height + 8);
        ctx.setLineDash([]);

        if (char.recognized) {
          ctx.font = `600 ${12 * dpr}px ui-monospace, monospace`;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          const labelText = `${char.recognized} ${Math.round(char.confidence * 100)}%`;
          const textWidth = ctx.measureText(labelText).width;
          ctx.fillRect(bb.minX - 2, bb.minY - 20 * dpr, textWidth + 8, 16 * dpr);

          ctx.fillStyle = '#22c55e';
          ctx.fillText(labelText, bb.minX + 2, bb.minY - 6 * dpr);
        }
      }
    }

    // 5. Draw handwriting expression results
    ctx.font = `600 ${52 * dpr}px Caveat, cursive`;
    const currentExprs = expressionsRef.current.length > 0 ? expressionsRef.current : expressions;
    for (const expr of currentExprs) {
      if (expr.result) {
        const pos = getResultPosition(expr);
        if (pos) {
          ctx.shadowColor = 'rgba(249, 115, 22, 0.5)';
          ctx.shadowBlur = 10 * dpr;
          ctx.fillStyle = '#fb923c';
          ctx.fillText(expr.result, pos.x, pos.y + 18 * dpr);
          ctx.shadowBlur = 0;
        }
      }
    }
  }, [strokes, characters, expressions, debugMode, strokeColor]);

  // Request high-performance RAF render
  const requestFrame = useCallback(() => {
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        renderCanvas();
      });
    }
  }, [renderCanvas]);

  // Trigger render when state changes
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);
  // Pre-render background grid into an offscreen canvas (ultra-fast GPU blit on frame render)
  useEffect(() => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return;

    const bg = document.createElement('canvas');
    bg.width = canvasSize.width;
    bg.height = canvasSize.height;
    const ctx = bg.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Clean modern dark chalkboard background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, bg.width, bg.height);

    // Subtle, clean dot grid
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    const gridSize = 24 * dpr;
    const dotRadius = 0.8 * dpr;
    for (let x = gridSize; x < bg.width; x += gridSize) {
      for (let y = gridSize; y < bg.height; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    bgCanvasRef.current = bg;
    // Immediately render canvas after background is ready so resize never leaves canvas blank
    renderCanvas();
  }, [canvasSize, renderCanvas]);

  // Undo handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    // Cancel in-flight recognition and pending debouncer
    if (recognitionTimerRef.current) {
      clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }
    recognitionEpochRef.current += 1;
    setIsProcessing(false);

    const lastState = undoStack[undoStack.length - 1];
    strokesRef.current = lastState.strokes;
    charactersRef.current = lastState.characters;
    const nextExprs = buildExpressions(lastState.characters);
    expressionsRef.current = nextExprs;

    setRedoStack(prev => [...prev, { strokes: strokesRef.current, characters: charactersRef.current }]);
    setUndoStack(prev => prev.slice(0, -1));
    setStrokes(lastState.strokes);
    setCharacters(lastState.characters);
    setExpressions(nextExprs);
    renderCanvas();

    // Update debug preview if enabled
    const validChars = lastState.characters.filter(c => c.strokes && c.strokes.length > 0);
    if (validChars.length > 0) {
      const lastChar = validChars[validChars.length - 1];
      renderCharacterToDebugCanvas(lastChar);
      setDebugInfo({
        label: lastChar.recognized,
        confidence: lastChar.confidence,
        width: Math.round(lastChar.boundingBox.width),
        height: Math.round(lastChar.boundingBox.height),
        strokeCount: lastChar.strokes.length,
      });
    } else {
      setDebugInfo(null);
      if (debugCanvasRef.current) {
        const dCtx = debugCanvasRef.current.getContext('2d');
        if (dCtx) {
          dCtx.fillStyle = 'black';
          dCtx.fillRect(0, 0, 48, 48);
        }
      }
    }
  }, [undoStack, renderCanvas]);

  // Redo handler
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    // Cancel in-flight recognition and pending debouncer
    if (recognitionTimerRef.current) {
      clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }
    recognitionEpochRef.current += 1;
    setIsProcessing(false);

    const nextState = redoStack[redoStack.length - 1];
    strokesRef.current = nextState.strokes;
    charactersRef.current = nextState.characters;
    const nextExprs = buildExpressions(nextState.characters);
    expressionsRef.current = nextExprs;

    setUndoStack(prev => [...prev, { strokes: strokesRef.current, characters: charactersRef.current }]);
    setRedoStack(prev => prev.slice(0, -1));
    setStrokes(nextState.strokes);
    setCharacters(nextState.characters);
    setExpressions(nextExprs);
    renderCanvas();

    const validChars = nextState.characters.filter(c => c.strokes && c.strokes.length > 0);
    if (validChars.length > 0) {
      const lastChar = validChars[validChars.length - 1];
      renderCharacterToDebugCanvas(lastChar);
      setDebugInfo({
        label: lastChar.recognized,
        confidence: lastChar.confidence,
        width: Math.round(lastChar.boundingBox.width),
        height: Math.round(lastChar.boundingBox.height),
        strokeCount: lastChar.strokes.length,
      });
    }
  }, [redoStack, renderCanvas]);
  // Clear handler
  const handleClear = useCallback(() => {
    // Cancel in-flight recognition and pending debouncer
    if (recognitionTimerRef.current) {
      clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }
    recognitionEpochRef.current += 1;
    setIsProcessing(false);

    if (strokesRef.current.length > 0) {
      setUndoStack(prev => [...prev, { strokes: strokesRef.current, characters: charactersRef.current }]);
      setRedoStack([]);
    }
    strokesRef.current = [];
    charactersRef.current = [];
    expressionsRef.current = [];
    activeStrokeRef.current = [];
    setStrokes([]);
    setCharacters([]);
    setExpressions([]);
    setDebugInfo(null);
    if (debugCanvasRef.current) {
      const dCtx = debugCanvasRef.current.getContext('2d');
      if (dCtx) {
        dCtx.fillStyle = 'black';
        dCtx.fillRect(0, 0, 48, 48);
      }
    }
    renderCanvas();
  }, [renderCanvas]);
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        handleClear();
      }
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey) {
        setDebugMode(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowColorPicker(false);
        setShowShortcuts(false);
      }
      if (e.key === '?') {
        setShowShortcuts(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleClear]);

  // Stroke processing
  const processStroke = useCallback(async (newStroke: Stroke) => {
    setCharacters(prev => {
      const updated = addStrokeToCharacters(prev, newStroke);
      charactersRef.current = updated;
      const lastChar = updated[updated.length - 1];
      if (lastChar) {
        renderCharacterToDebugCanvas(lastChar);
        setDebugInfo({
          label: lastChar.recognized,
          confidence: lastChar.confidence,
          width: Math.round(lastChar.boundingBox.width),
          height: Math.round(lastChar.boundingBox.height),
          strokeCount: lastChar.strokes.length,
        });
      }
      return updated;
    });
  }, []);

  // Recognition debouncing
  const scheduleRecognition = useCallback(() => {
    if (recognitionTimerRef.current) {
      clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }

    const currentEpoch = ++recognitionEpochRef.current;

    recognitionTimerRef.current = setTimeout(async () => {
      if (recognitionEpochRef.current !== currentEpoch) return;
      if (!isModelReady()) return;

      setIsProcessing(true);

      setCharacters(prev => {
        if (recognitionEpochRef.current !== currentEpoch) {
          setIsProcessing(false);
          return prev;
        }

        const needsRecognition = prev.filter(c => c.recognized === null && c.strokes && c.strokes.length > 0);
        if (needsRecognition.length === 0) {
          setIsProcessing(false);
          return prev;
        }

        Promise.all(
          needsRecognition.map(async char => {
            const result = await recognizeCharacter(char);
            return { ...char, recognized: result.label, confidence: result.confidence };
          })
        ).then(recognizedChars => {
          if (recognitionEpochRef.current !== currentEpoch) {
            setIsProcessing(false);
            return;
          }

          setCharacters(current => {
            if (recognitionEpochRef.current !== currentEpoch) return current;

            const recognized = new Map(recognizedChars.map(c => [c.id, c]));
            const updated = current.map(c => recognized.get(c.id) || c);
            const exprs = buildExpressions(updated);
            charactersRef.current = updated;
            expressionsRef.current = exprs;
            setExpressions(exprs);
            renderCanvas();

            // Update debug info for the most recently recognized character
            const validChars = updated.filter(c => c.strokes && c.strokes.length > 0);
            const lastChar = validChars[validChars.length - 1];
            if (lastChar) {
              renderCharacterToDebugCanvas(lastChar);
              setDebugInfo({
                label: lastChar.recognized,
                confidence: lastChar.confidence,
                width: Math.round(lastChar.boundingBox.width),
                height: Math.round(lastChar.boundingBox.height),
                strokeCount: lastChar.strokes.length,
              });
            }

            return updated;
          });
          setIsProcessing(false);
        });

        return prev;
      });
    }, 250);
  }, [renderCanvas]);

  // Precise canvas point calculation
  const getCanvasPoint = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, timestamp: Date.now() };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      timestamp: Date.now(),
    };
  }, []);

  // Smooth pointer events handlers with hardware coalescing
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {}

      isDrawingRef.current = true;
      const point = getCanvasPoint(e.clientX, e.clientY);
      activeStrokeRef.current = [point];
      requestFrame();
    },
    [getCanvasPoint, requestFrame]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();

      // Read coalesced events for ultra-high temporal fidelity
      type CoalescedEventProvider = { getCoalescedEvents?: () => PointerEvent[] };
      const provider = e.nativeEvent as unknown as CoalescedEventProvider;
      const events: Array<{ clientX: number; clientY: number }> =
        typeof provider.getCoalescedEvents === 'function'
          ? provider.getCoalescedEvents()
          : [e];

      for (const ev of events) {
        const point = getCanvasPoint(ev.clientX, ev.clientY);
        activeStrokeRef.current.push(point);
      }

      requestFrame();
    },
    [getCanvasPoint, requestFrame]
  );

  const handlePointerUp = useCallback(
    (e?: React.PointerEvent<HTMLCanvasElement>) => {
      if (e) {
        try {
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        } catch {}
      }

      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      const points = activeStrokeRef.current;
      if (points.length < 2) {
        activeStrokeRef.current = [];
        requestFrame();
        return;
      }

      const newStroke: Stroke = {
        id: generateId(),
        points: [...points],
        boundingBox: calculateBoundingBox(points),
      };

      // Immediately push to strokesRef and redraw canvas synchronously
      // so the drawn stroke never disappears while recognition runs
      const nextStrokes = [...strokesRef.current, newStroke];
      strokesRef.current = nextStrokes;
      activeStrokeRef.current = [];
      renderCanvas();

      // Save to undo stack
      setUndoStack(prev => [...prev, { strokes: strokesRef.current.slice(0, -1), characters: charactersRef.current }]);
      setRedoStack([]);

      setStrokes(nextStrokes);
      processStroke(newStroke);
      scheduleRecognition();
    },
    [processStroke, scheduleRecognition, renderCanvas, requestFrame]
  );

  return (
    <div className="relative h-dvh w-full bg-[#09090b] flex flex-col overflow-hidden select-none touch-none">
      {/* Sleek floating pill toolbar (Apple-style minimal glassmorphism) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-xl shadow-black/50">
        {/* Undo */}
        <button
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Redo */}
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        {/* Color picker */}
        <div className="relative">
          <button
            onClick={() => setShowColorPicker(prev => !prev)}
            className="p-1.5 rounded-full hover:bg-white/10 transition-all flex items-center justify-center"
            title="Stroke color"
          >
            <div
              className="w-4 h-4 rounded-full border border-white/30 transition-transform hover:scale-110"
              style={{
                backgroundColor: strokeColor,
                boxShadow: `0 0 8px ${strokeColor}66`,
              }}
            />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-white/10 flex gap-2 shadow-2xl z-40">
              {STROKE_COLORS.map(color => (
                <button
                  key={color.value}
                  onClick={() => {
                    setStrokeColor(color.value);
                    setShowColorPicker(false);
                  }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                    strokeColor === color.value ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                  }`}
                  style={{
                    backgroundColor: color.value,
                    boxShadow: strokeColor === color.value ? `0 0 10px ${color.value}` : 'none',
                  }}
                  title={color.name}
                />
              ))}
            </div>
          )}
        </div>

        {/* Clear */}
        <button
          onClick={handleClear}
          disabled={strokes.length === 0}
          className="p-1.5 rounded-full hover:bg-red-500/15 text-zinc-400 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
          title="Clear (Ctrl+Delete)"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 text-[11px] font-medium text-zinc-300">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isProcessing
                ? 'bg-amber-400 animate-pulse'
                : modelReady
                ? 'bg-emerald-400'
                : 'bg-yellow-400 animate-pulse'
            }`}
          />
          <span>{isProcessing ? 'Thinking...' : modelReady ? (usingML ? 'AI (ML)' : 'AI') : 'Loading...'}</span>
        </div>

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        {/* Tesseract OCR Toggle */}
        <button
          onClick={() => {
            const newState = !tesseractMode;
            setTesseractMode(newState);
            setUseTesseract(newState);
          }}
          className={`p-1.5 rounded-full hover:bg-white/10 transition-all ${
            tesseractMode ? 'text-cyan-400 bg-cyan-500/10' : 'text-zinc-400 hover:text-white'
          }`}
          title={tesseractMode ? 'Tesseract OCR active' : 'Enable Tesseract OCR'}
        >
          <ScanText className="w-4 h-4" />
        </button>

        {/* Debug mode toggle */}
        <button
          onClick={() => setDebugMode(prev => !prev)}
          className={`p-1.5 rounded-full hover:bg-white/10 transition-all ${
            debugMode ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-white'
          }`}
          title="Debug Mode (D)"
        >
          {debugMode ? <Bug className="w-4 h-4" /> : <BugOff className="w-4 h-4" />}
        </button>

        {/* Shortcuts toggle */}
        <button
          onClick={() => setShowShortcuts(prev => !prev)}
          className={`p-1.5 rounded-full hover:bg-white/10 transition-all ${
            showShortcuts ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400 hover:text-white'
          }`}
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="w-4 h-4" />
        </button>
      </div>

      {/* Keyboard shortcuts popup modal */}
      {showShortcuts && (
        <div className="absolute top-16 right-4 z-40 w-64 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-white/10 p-4 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Shortcuts</h3>
            <button
              onClick={() => setShowShortcuts(false)}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Undo</span>
              <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 text-zinc-300 font-mono text-[11px]">
                Ctrl+Z
              </kbd>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Redo</span>
              <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 text-zinc-300 font-mono text-[11px]">
                Ctrl+Y
              </kbd>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Clear</span>
              <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 text-zinc-300 font-mono text-[11px]">
                Ctrl+Del
              </kbd>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Debug Mode</span>
              <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 text-zinc-300 font-mono text-[11px]">
                D
              </kbd>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Close</span>
              <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 text-zinc-300 font-mono text-[11px]">
                Esc
              </kbd>
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas */}
      <div ref={containerRef} className="flex-1 relative w-full h-full">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none' }}
        />

        {/* Minimal, non-intrusive empty canvas guide */}
        {strokes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-400 tracking-wide">Write math anywhere</p>
              <p className="text-xs font-mono text-zinc-600 mt-1">e.g. 12 + 8 =</p>
            </div>
          </div>
        )}

        {/* Refined Debug Preview in bottom-left */}
        {debugMode && (
          <div className="absolute bottom-5 left-5 z-30 bg-zinc-950/90 backdrop-blur-xl rounded-2xl border border-white/10 p-3.5 shadow-2xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-zinc-200">Model Input</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-400">48×48</span>
            </div>

            <div className="relative w-[128px] h-[128px] bg-black rounded-xl border border-white/10 overflow-hidden flex items-center justify-center shadow-inner">
              {/* Centering crosshairs and bounding guideline */}
              <div className="absolute inset-0 pointer-events-none opacity-25">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white" />
                <div className="absolute inset-2 border border-dashed border-white/60 rounded" />
              </div>

              <canvas
                ref={debugCanvasRef}
                width={48}
                height={48}
                className="w-[128px] h-[128px]"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>

            <div className="flex flex-col gap-1 text-[11px] font-mono">
              <div className="flex justify-between items-center text-zinc-400">
                <span>Detected:</span>
                <span className="text-emerald-400 font-semibold">
                  {debugInfo?.label
                    ? `${debugInfo.label} ${debugInfo.confidence ? `(${Math.round(debugInfo.confidence * 100)}%)` : '(Rule)'}`
                    : isProcessing
                    ? 'Analyzing...'
                    : characters.length > 0
                    ? 'Pending'
                    : 'Draw symbol'}
                </span>
              </div>
              {debugInfo && (
                <div className="flex justify-between items-center text-[10px] text-zinc-500">
                  <span>Bounds:</span>
                  <span>
                    {debugInfo.width}×{debugInfo.height}px • {debugInfo.strokeCount} strk
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
