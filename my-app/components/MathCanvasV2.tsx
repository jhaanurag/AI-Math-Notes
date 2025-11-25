'use client';

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Point, Stroke, StrokeGroup, BoundingBox } from '@/lib/types';
import {
  generateId,
  calculateBoundingBox,
  padBoundingBox,
} from '@/lib/stroke-utils';
import {
  CharacterCandidate,
  CharacterGrouper,
  createCharacterCanvas,
  heuristicRecognize,
  CHARACTER_CONFIG,
} from '@/lib/character-grouper';

interface MathCanvasV2Props {
  onCharacterRecognized?: (char: CharacterCandidate, canvas: HTMLCanvasElement) => void;
  onExpressionComplete?: (expression: string, characters: CharacterCandidate[]) => void;
}

export interface MathCanvasV2Ref {
  getCharacters: () => CharacterCandidate[];
  getExpression: () => string;
  updateCharacterRecognition: (charId: string, recognized: string, confidence: number) => void;
  clearCanvas: () => void;
  getCanvas: () => HTMLCanvasElement | null;
  forceRecognize: () => void;
}

const MathCanvasV2 = forwardRef<MathCanvasV2Ref, MathCanvasV2Props>(
  ({ onCharacterRecognized, onExpressionComplete }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
    const [characters, setCharacters] = useState<CharacterCandidate[]>([]);
    const [currentChar, setCurrentChar] = useState<CharacterCandidate | null>(null);
    const grouperRef = useRef<CharacterGrouper | null>(null);
    const expressionTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize character grouper
    useEffect(() => {
      grouperRef.current = new CharacterGrouper((completedChar) => {
        console.log('Character complete:', completedChar.id, 'strokes:', completedChar.strokes.length);
        
        // Create canvas for this character
        const charCanvas = createCharacterCanvas(completedChar, 28, 2);
        
        // Get heuristic recognition as fallback
        const heuristic = heuristicRecognize(completedChar);
        completedChar.recognizedAs = heuristic.char;
        completedChar.confidence = heuristic.confidence;
        
        // Update state
        setCharacters(prev => [...prev, completedChar]);
        setCurrentChar(null);
        
        // Notify parent for ML recognition
        if (onCharacterRecognized) {
          onCharacterRecognized(completedChar, charCanvas);
        }
        
        // Reset expression completion timer
        if (expressionTimerRef.current) {
          clearTimeout(expressionTimerRef.current);
        }
        
        // After 1.5s of no new characters, consider expression complete
        expressionTimerRef.current = setTimeout(() => {
          if (onExpressionComplete && grouperRef.current) {
            const expr = grouperRef.current.getExpression();
            const chars = grouperRef.current.getCharacters();
            if (expr && chars.length > 0) {
              onExpressionComplete(expr, chars);
            }
          }
        }, 1500);
      });
      
      return () => {
        if (expressionTimerRef.current) {
          clearTimeout(expressionTimerRef.current);
        }
      };
    }, [onCharacterRecognized, onExpressionComplete]);

    // Initialize canvas
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const resizeCanvas = () => {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          contextRef.current = ctx;
        }

        redrawCanvas();
      };

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    // Redraw canvas whenever state changes
    useEffect(() => {
      redrawCanvas();
    }, [characters, currentChar, currentStroke]);

    const redrawCanvas = useCallback(() => {
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      const dpr = window.devicePixelRatio || 1;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      // Draw completed characters
      characters.forEach((char) => {
        drawCharacter(ctx, char, true);
      });

      // Draw current character in progress
      if (currentChar) {
        drawCharacter(ctx, currentChar, false);
      }

      // Draw current stroke being drawn
      if (currentStroke.length > 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(currentStroke[0].x, currentStroke[0].y);

        for (let i = 1; i < currentStroke.length; i++) {
          ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
        }

        ctx.stroke();
      }
    }, [characters, currentChar, currentStroke]);

    const drawCharacter = (ctx: CanvasRenderingContext2D, char: CharacterCandidate, isComplete: boolean) => {
      // Draw all strokes in this character
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);

      char.strokes.forEach((stroke) => {
        if (stroke.points.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }

        ctx.stroke();
      });

      // Draw bounding box
      const paddedBox = padBoundingBox(char.boundingBox, 5);
      ctx.save();
      ctx.setLineDash([3, 3]);
      
      if (isComplete) {
        // Color based on confidence
        const confidence = char.confidence || 0;
        if (confidence > 0.7) {
          ctx.strokeStyle = '#00ff88'; // Green - high confidence
        } else if (confidence > 0.3) {
          ctx.strokeStyle = '#ffaa00'; // Orange - medium confidence
        } else {
          ctx.strokeStyle = '#ff4444'; // Red - low confidence
        }
      } else {
        ctx.strokeStyle = '#4488ff'; // Blue - in progress
      }
      
      ctx.lineWidth = 1;
      ctx.strokeRect(
        paddedBox.minX,
        paddedBox.minY,
        paddedBox.maxX - paddedBox.minX,
        paddedBox.maxY - paddedBox.minY
      );
      ctx.restore();

      // Draw recognized character above the bounding box
      if (isComplete && char.recognizedAs) {
        ctx.save();
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#00ff88';
        ctx.fillText(
          `${char.recognizedAs} (${Math.round((char.confidence || 0) * 100)}%)`,
          paddedBox.minX,
          paddedBox.minY - 5
        );
        ctx.restore();
      }
    };

    const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();

      if ('touches' in e) {
        const touch = e.touches[0] || e.changedTouches[0];
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      }

      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const point = getCanvasCoordinates(e);
      setCurrentStroke([point]);
      setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();

      const point = getCanvasCoordinates(e);
      setCurrentStroke((prev) => [...prev, point]);

      // Real-time drawing for responsiveness
      const ctx = contextRef.current;
      if (ctx && currentStroke.length > 0) {
        const lastPoint = currentStroke[currentStroke.length - 1];
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    };

    const finishDrawing = () => {
      if (!isDrawing || currentStroke.length < 2) {
        setIsDrawing(false);
        setCurrentStroke([]);
        return;
      }

      // Create new stroke
      const newStroke: Stroke = {
        id: generateId(),
        points: [...currentStroke],
        timestamp: Date.now(),
        boundingBox: calculateBoundingBox(currentStroke),
      };

      // Add stroke to grouper
      if (grouperRef.current) {
        grouperRef.current.addStroke(newStroke);
        
        // Update current character display
        setCurrentChar(grouperRef.current.getCurrentCharacter());
      }

      setIsDrawing(false);
      setCurrentStroke([]);
    };

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      getCharacters: () => grouperRef.current?.getCharacters() || [],
      getExpression: () => grouperRef.current?.getExpression() || '',
      updateCharacterRecognition: (charId: string, recognized: string, confidence: number) => {
        if (grouperRef.current) {
          grouperRef.current.updateRecognition(charId, recognized, confidence);
          setCharacters([...grouperRef.current.getCharacters()]);
        }
      },
      clearCanvas: () => {
        if (expressionTimerRef.current) {
          clearTimeout(expressionTimerRef.current);
        }
        grouperRef.current?.clear();
        setCharacters([]);
        setCurrentChar(null);
        setCurrentStroke([]);
      },
      getCanvas: () => canvasRef.current,
      forceRecognize: () => {
        grouperRef.current?.forceComplete();
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        className="fixed inset-0 bg-zinc-900 touch-none cursor-crosshair"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={finishDrawing}
        onMouseLeave={finishDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={finishDrawing}
      />
    );
  }
);

MathCanvasV2.displayName = 'MathCanvasV2';

export default MathCanvasV2;
