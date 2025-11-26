// Geometry utilities for bounding boxes and stroke analysis

import { Point, Stroke, BoundingBox, Character } from './types';

/**
 * Calculate bounding box from an array of points
 */
export function calculateBoundingBox(points: Point[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

/**
 * Merge multiple bounding boxes into one
 */
export function mergeBoundingBoxes(boxes: BoundingBox[]): BoundingBox {
  if (boxes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

/**
 * Calculate overlap ratio between two bounding boxes
 * Returns a value between 0 (no overlap) and 1 (complete overlap)
 */
export function calculateOverlapRatio(box1: BoundingBox, box2: BoundingBox): { overlapX: number; overlapY: number; combined: number } {
  // Calculate overlap in X dimension
  const overlapX = Math.max(0, Math.min(box1.maxX, box2.maxX) - Math.max(box1.minX, box2.minX));
  const minWidth = Math.min(box1.width, box2.width);
  const overlapXRatio = minWidth > 0 ? overlapX / minWidth : 0;

  // Calculate overlap in Y dimension
  const overlapY = Math.max(0, Math.min(box1.maxY, box2.maxY) - Math.max(box1.minY, box2.minY));
  const minHeight = Math.min(box1.height, box2.height);
  const overlapYRatio = minHeight > 0 ? overlapY / minHeight : 0;

  // Combined overlap considering proximity too
  const centerDistX = Math.abs(box1.centerX - box2.centerX);
  const centerDistY = Math.abs(box1.centerY - box2.centerY);
  const avgWidth = (box1.width + box2.width) / 2;
  const avgHeight = (box1.height + box2.height) / 2;

  // Proximity factor - how close the centers are relative to size
  const proximityX = avgWidth > 0 ? Math.max(0, 1 - centerDistX / avgWidth) : 0;
  const proximityY = avgHeight > 0 ? Math.max(0, 1 - centerDistY / avgHeight) : 0;

  // Combined score weights both overlap and proximity
  const combined = (overlapXRatio * 0.3 + proximityX * 0.2) * (overlapYRatio * 0.3 + proximityY * 0.2);

  return { overlapX: overlapXRatio, overlapY: overlapYRatio, combined };
}

/**
 * Check if two strokes should be grouped as the same character
 * Uses overlap threshold and spatial proximity
 */
export function shouldGroupStrokes(stroke1: Stroke, stroke2: Stroke, threshold: number = 0.15): boolean {
  const overlap = calculateOverlapRatio(stroke1.boundingBox, stroke2.boundingBox);
  
  // Check if there's significant overlap in both dimensions
  // Or if the strokes are very close (for characters like +, =, etc.)
  const hasOverlap = overlap.overlapX > threshold || overlap.overlapY > threshold;
  
  // Also check proximity - strokes close together might be same character
  const centerDistX = Math.abs(stroke1.boundingBox.centerX - stroke2.boundingBox.centerX);
  const centerDistY = Math.abs(stroke1.boundingBox.centerY - stroke2.boundingBox.centerY);
  const avgSize = Math.max(
    (stroke1.boundingBox.width + stroke2.boundingBox.width) / 2,
    (stroke1.boundingBox.height + stroke2.boundingBox.height) / 2,
    30 // minimum size to prevent division issues
  );
  
  const isClose = centerDistX < avgSize * 1.2 && centerDistY < avgSize * 1.2;
  
  // Time-based grouping - strokes drawn close in time are likely same character
  const stroke1LastTime = stroke1.points[stroke1.points.length - 1]?.timestamp || 0;
  const stroke2FirstTime = stroke2.points[0]?.timestamp || 0;
  const timeDiff = Math.abs(stroke2FirstTime - stroke1LastTime);
  const isQuickSuccession = timeDiff < 1000; // Within 1 second

  return (hasOverlap && isClose) || (isClose && isQuickSuccession);
}

/**
 * Check if two characters/expressions are on the same line
 * Based on vertical overlap
 */
export function areOnSameLine(box1: BoundingBox, box2: BoundingBox, threshold: number = 0.3): boolean {
  const overlapY = Math.max(0, Math.min(box1.maxY, box2.maxY) - Math.max(box1.minY, box2.minY));
  const minHeight = Math.min(box1.height, box2.height);
  
  if (minHeight === 0) return false;
  
  return overlapY / minHeight > threshold;
}

/**
 * Sort characters from left to right
 */
export function sortCharactersLeftToRight(characters: Character[]): Character[] {
  return [...characters].sort((a, b) => a.boundingBox.centerX - b.boundingBox.centerX);
}

/**
 * Group characters into expression lines based on vertical proximity
 */
export function groupIntoLines(characters: Character[]): Character[][] {
  if (characters.length === 0) return [];
  
  const sorted = [...characters].sort((a, b) => a.boundingBox.centerY - b.boundingBox.centerY);
  const lines: Character[][] = [];
  let currentLine: Character[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const char = sorted[i];
    const lastCharInLine = currentLine[currentLine.length - 1];
    
    if (areOnSameLine(char.boundingBox, lastCharInLine.boundingBox)) {
      currentLine.push(char);
    } else {
      // Check against all characters in current line
      const isOnSameLine = currentLine.some(c => areOnSameLine(char.boundingBox, c.boundingBox));
      if (isOnSameLine) {
        currentLine.push(char);
      } else {
        lines.push(sortCharactersLeftToRight(currentLine));
        currentLine = [char];
      }
    }
  }
  
  if (currentLine.length > 0) {
    lines.push(sortCharactersLeftToRight(currentLine));
  }
  
  return lines;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
