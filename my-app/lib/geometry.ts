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
 * Must be STRICT to avoid merging separate characters
 */
export function shouldGroupStrokes(stroke1: Stroke, stroke2: Stroke): boolean {
  const box1 = stroke1.boundingBox;
  const box2 = stroke2.boundingBox;
  
  // Calculate actual pixel overlap
  const overlapX = Math.max(0, Math.min(box1.maxX, box2.maxX) - Math.max(box1.minX, box2.minX));
  const overlapY = Math.max(0, Math.min(box1.maxY, box2.maxY) - Math.max(box1.minY, box2.minY));
  
  // Must have ACTUAL overlap (not just proximity) to be same character
  const hasRealOverlap = overlapX > 5 && overlapY > 5;
  
  // Calculate center distance
  const centerDistX = Math.abs(box1.centerX - box2.centerX);
  const centerDistY = Math.abs(box1.centerY - box2.centerY);
  
  // For multi-stroke characters like + or =
  // The strokes must be very close AND have significant overlap
  const avgWidth = (box1.width + box2.width) / 2;
  const avgHeight = (box1.height + box2.height) / 2;
  
  // Calculate how much one stroke is "inside" the other
  // For + sign: horizontal stroke's center should be inside vertical stroke's Y range and vice versa
  const stroke1InsideStroke2X = box1.centerX >= box2.minX - 10 && box1.centerX <= box2.maxX + 10;
  const stroke1InsideStroke2Y = box1.centerY >= box2.minY - 10 && box1.centerY <= box2.maxY + 10;
  const stroke2InsideStroke1X = box2.centerX >= box1.minX - 10 && box2.centerX <= box1.maxX + 10;
  const stroke2InsideStroke1Y = box2.centerY >= box1.minY - 10 && box2.centerY <= box1.maxY + 10;
  
  // Strokes cross each other (like in + sign)
  const strokesCross = (stroke1InsideStroke2X && stroke2InsideStroke1Y) || 
                       (stroke1InsideStroke2Y && stroke2InsideStroke1X);
  
  // Time-based: only consider if drawn VERY quickly together (< 500ms)
  const stroke1LastTime = stroke1.points[stroke1.points.length - 1]?.timestamp || 0;
  const stroke2FirstTime = stroke2.points[0]?.timestamp || 0;
  const timeDiff = Math.abs(stroke2FirstTime - stroke1LastTime);
  const isVeryQuick = timeDiff < 500;
  
  // For = sign: two horizontal strokes stacked vertically
  const bothHorizontal = box1.width > box1.height * 1.5 && box2.width > box2.height * 1.5;
  const stackedVertically = centerDistY < Math.max(avgHeight, 30) && centerDistX < Math.min(avgWidth * 0.5, 20);
  const isEqualsSign = bothHorizontal && stackedVertically && overlapX > avgWidth * 0.5;
  
  // Group if:
  // 1. Strokes physically cross each other (+ sign)
  // 2. Strokes are = sign pattern
  // 3. Has real overlap AND very quick succession
  return strokesCross || isEqualsSign || (hasRealOverlap && isVeryQuick);
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
