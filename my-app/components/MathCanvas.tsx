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
  calculateGroupBoundingBox,
  findClosestGroup,
  padBoundingBox,
} from '@/lib/stroke-utils';

interface MathCanvasProps {
  onGroupReady?: (group: StrokeGroup) => void;
  debounceMs?: number;
  clusterThreshold?: number;
}

export interface MathCanvasRef {
  getGroups: () => StrokeGroup[];
  updateGroupResult: (groupId: string, expression: string, result: string) => void;
  clearCanvas: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

const MathCanvas = forwardRef<MathCanvasRef, MathCanvasProps>(
  ({ onGroupReady, debounceMs = 1000, clusterThreshold = 50 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
    const [groups, setGroups] = useState<StrokeGroup[]>([]);
    const debounceTimerRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

    // Initialize canvas
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Set canvas to full screen
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

        // Redraw all strokes after resize
        redrawCanvas();
      };

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    // Redraw canvas whenever groups change
    useEffect(() => {
      redrawCanvas();
    }, [groups]);

    const redrawCanvas = useCallback(() => {
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      const dpr = window.devicePixelRatio || 1;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      // Draw all strokes
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;

      groups.forEach((group) => {
        // Draw strokes in this group
        group.strokes.forEach((stroke) => {
          if (stroke.points.length < 2) return;

          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }

          ctx.stroke();
        });

        // Draw debug bounding box around the group
        const paddedBox = padBoundingBox(group.boundingBox, 10);
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = group.isProcessing ? '#ffaa00' : '#00ff88';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          paddedBox.minX,
          paddedBox.minY,
          paddedBox.maxX - paddedBox.minX,
          paddedBox.maxY - paddedBox.minY
        );
        ctx.restore();

        // Draw result if available
        if (group.result) {
          ctx.save();
          ctx.font = "bold 32px cursive";
          ctx.fillStyle = '#FFD700'; // Gold color
          const resultX = paddedBox.maxX + 20;
          const resultY =
            (paddedBox.minY + paddedBox.maxY) / 2 + 10; // Vertically centered
          ctx.fillText(group.result, resultX, resultY);
          ctx.restore();
        }
      });

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
    }, [groups, currentStroke]);

    const getCanvasCoordinates = (
      e: React.MouseEvent | React.TouchEvent
    ): Point => {
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

      // Find closest group or create new one
      setGroups((prevGroups) => {
        const closestGroupIndex = findClosestGroup(
          newStroke,
          prevGroups,
          clusterThreshold
        );

        let updatedGroups: StrokeGroup[];
        let affectedGroupId: string;

        if (closestGroupIndex >= 0) {
          // Add stroke to existing group
          updatedGroups = prevGroups.map((group, index) => {
            if (index === closestGroupIndex) {
              const newStrokes = [...group.strokes, newStroke];
              return {
                ...group,
                strokes: newStrokes,
                boundingBox: calculateGroupBoundingBox(newStrokes),
                result: undefined, // Clear previous result when new stroke added
                expression: undefined,
                isProcessing: false,
              };
            }
            return group;
          });
          affectedGroupId = prevGroups[closestGroupIndex].id;
        } else {
          // Create new group
          const newGroup: StrokeGroup = {
            id: generateId(),
            strokes: [newStroke],
            boundingBox: newStroke.boundingBox,
            isProcessing: false,
          };
          updatedGroups = [...prevGroups, newGroup];
          affectedGroupId = newGroup.id;
        }

        // Set up debounce timer for recognition
        if (debounceTimerRef.current[affectedGroupId]) {
          clearTimeout(debounceTimerRef.current[affectedGroupId]);
        }

        debounceTimerRef.current[affectedGroupId] = setTimeout(() => {
          const group = updatedGroups.find((g) => g.id === affectedGroupId);
          if (group && onGroupReady) {
            // Mark as processing
            setGroups((prev) =>
              prev.map((g) =>
                g.id === affectedGroupId ? { ...g, isProcessing: true } : g
              )
            );
            onGroupReady(group);
          }
        }, debounceMs);

        return updatedGroups;
      });

      setIsDrawing(false);
      setCurrentStroke([]);
    };

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      getGroups: () => groups,
      updateGroupResult: (groupId: string, expression: string, result: string) => {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, expression, result, isProcessing: false }
              : g
          )
        );
      },
      clearCanvas: () => {
        // Clear all timers
        Object.values(debounceTimerRef.current).forEach(clearTimeout);
        debounceTimerRef.current = {};
        setGroups([]);
        setCurrentStroke([]);
      },
      getCanvas: () => canvasRef.current,
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

MathCanvas.displayName = 'MathCanvas';

export default MathCanvas;
