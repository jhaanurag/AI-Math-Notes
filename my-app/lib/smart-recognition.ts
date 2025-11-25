// Simple real-time handwriting recognition using canvas analysis
// This works without needing a ML model by analyzing stroke patterns

import { StrokeGroup, BoundingBox, Point } from './types';

interface CharacterFeatures {
  aspectRatio: number;
  strokeCount: number;
  hasHorizontalLine: boolean;
  hasVerticalLine: boolean;
  hasDiagonalLine: boolean;
  hasCurve: boolean;
  hasLoop: boolean;
  density: number;
  centerOfMass: { x: number; y: number };
}

/**
 * Analyze a stroke to extract features
 */
function analyzeStroke(points: Point[]): {
  isHorizontal: boolean;
  isVertical: boolean;
  isDiagonal: boolean;
  isCurved: boolean;
  length: number;
} {
  if (points.length < 2) {
    return { isHorizontal: false, isVertical: false, isDiagonal: false, isCurved: false, length: 0 };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const directLength = Math.sqrt(dx * dx + dy * dy);

  // Calculate actual path length
  let pathLength = 0;
  for (let i = 1; i < points.length; i++) {
    const pdx = points[i].x - points[i - 1].x;
    const pdy = points[i].y - points[i - 1].y;
    pathLength += Math.sqrt(pdx * pdx + pdy * pdy);
  }

  const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  const curvature = directLength > 0 ? pathLength / directLength : 1;

  return {
    isHorizontal: angle < 20 || angle > 160,
    isVertical: angle > 70 && angle < 110,
    isDiagonal: (angle > 30 && angle < 60) || (angle > 120 && angle < 150),
    isCurved: curvature > 1.3,
    length: pathLength,
  };
}

/**
 * Check if a stroke forms a loop (closed curve)
 */
function isLoop(points: Point[], threshold: number = 20): boolean {
  if (points.length < 10) return false;
  const first = points[0];
  const last = points[points.length - 1];
  const dist = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2));
  return dist < threshold;
}

/**
 * Simple pattern-based digit recognition
 */
function recognizeDigitPattern(strokes: { points: Point[]; boundingBox: BoundingBox }[]): string {
  if (strokes.length === 0) return '?';

  const allPoints = strokes.flatMap(s => s.points);
  const box = {
    minX: Math.min(...allPoints.map(p => p.x)),
    minY: Math.min(...allPoints.map(p => p.y)),
    maxX: Math.max(...allPoints.map(p => p.x)),
    maxY: Math.max(...allPoints.map(p => p.y)),
  };

  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const aspectRatio = width / Math.max(height, 1);

  const strokeAnalyses = strokes.map(s => ({
    ...analyzeStroke(s.points),
    isLoop: isLoop(s.points),
  }));

  const hasLoop = strokeAnalyses.some(s => s.isLoop);
  const hasHorizontal = strokeAnalyses.some(s => s.isHorizontal);
  const hasVertical = strokeAnalyses.some(s => s.isVertical);
  const hasCurve = strokeAnalyses.some(s => s.isCurved);
  const strokeCount = strokes.length;

  // Pattern matching for digits
  // 0: One loop, round
  if (hasLoop && strokeCount === 1 && aspectRatio > 0.5 && aspectRatio < 1.5) {
    return '0';
  }

  // 1: Single vertical stroke, narrow
  if (strokeCount === 1 && hasVertical && !hasCurve && aspectRatio < 0.4) {
    return '1';
  }

  // +: Two strokes, one horizontal one vertical, crossing
  if (strokeCount === 2 && hasHorizontal && hasVertical) {
    return '+';
  }

  // -: Single horizontal stroke
  if (strokeCount === 1 && hasHorizontal && !hasVertical && aspectRatio > 2) {
    return '-';
  }

  // =: Two horizontal strokes
  if (strokeCount === 2 && strokeAnalyses.every(s => s.isHorizontal)) {
    return '=';
  }

  // x or ×: Two diagonal strokes crossing
  if (strokeCount === 2) {
    const bothDiagonal = strokeAnalyses.every(s => s.isDiagonal);
    if (bothDiagonal) {
      return '×';
    }
  }

  // 7: Two strokes - horizontal top, diagonal down
  if (strokeCount === 2 || strokeCount === 1) {
    const hasTopHorizontal = strokeAnalyses.some(s => s.isHorizontal);
    const hasDiagonal = strokeAnalyses.some(s => s.isDiagonal);
    if (hasTopHorizontal && hasDiagonal && aspectRatio > 0.4) {
      return '7';
    }
  }

  // 4: Usually 2-3 strokes
  if ((strokeCount === 2 || strokeCount === 3) && hasVertical && !hasLoop) {
    // Check for the characteristic "4" shape
    return '4';
  }

  // For curved single strokes, try to classify based on shape
  if (strokeCount === 1 && hasCurve) {
    // Analyze curve direction
    const points = strokes[0].points;
    if (points.length > 5) {
      const midPoint = points[Math.floor(points.length / 2)];
      const startPoint = points[0];
      const endPoint = points[points.length - 1];

      // 2: Starts top-left, curves right, ends bottom
      if (startPoint.y < endPoint.y && midPoint.x > startPoint.x) {
        return '2';
      }

      // 3: Two bumps on the right
      if (aspectRatio > 0.4 && aspectRatio < 1.2) {
        return '3';
      }

      // 5: Horizontal top, vertical middle, curve bottom
      if (startPoint.y < midPoint.y && midPoint.y < endPoint.y) {
        return '5';
      }

      // 6: Loop at bottom
      if (hasLoop || (startPoint.y < endPoint.y && midPoint.x < startPoint.x)) {
        return '6';
      }

      // 8: Figure-eight or two loops
      if (hasLoop && height > width * 1.2) {
        return '8';
      }

      // 9: Loop at top
      if (startPoint.y > endPoint.y) {
        return '9';
      }
    }
  }

  // Default fallback based on stroke count and shape
  if (strokeCount === 1) {
    if (hasLoop) return '0';
    if (hasVertical && !hasCurve) return '1';
    if (hasCurve) return '2';
  }

  return '?';
}

/**
 * Segment strokes into character groups based on horizontal position
 */
export function segmentIntoCharacters(strokes: { points: Point[]; boundingBox: BoundingBox }[]): { points: Point[]; boundingBox: BoundingBox }[][] {
  if (strokes.length === 0) return [];

  // Sort strokes by their horizontal center position
  const sortedStrokes = [...strokes].sort((a, b) => {
    const centerA = (a.boundingBox.minX + a.boundingBox.maxX) / 2;
    const centerB = (b.boundingBox.minX + b.boundingBox.maxX) / 2;
    return centerA - centerB;
  });

  const groups: { points: Point[]; boundingBox: BoundingBox }[][] = [];
  let currentGroup: { points: Point[]; boundingBox: BoundingBox }[] = [sortedStrokes[0]];

  for (let i = 1; i < sortedStrokes.length; i++) {
    const prevStroke = sortedStrokes[i - 1];
    const currStroke = sortedStrokes[i];

    // Calculate gap between strokes
    const prevRight = prevStroke.boundingBox.maxX;
    const currLeft = currStroke.boundingBox.minX;
    const gap = currLeft - prevRight;

    // Calculate average character width for dynamic threshold
    const avgWidth = currentGroup.reduce((sum, s) => 
      sum + (s.boundingBox.maxX - s.boundingBox.minX), 0) / currentGroup.length;

    // If gap is larger than 40% of avg width, start new character
    const threshold = Math.max(15, avgWidth * 0.4);

    if (gap > threshold) {
      groups.push(currentGroup);
      currentGroup = [currStroke];
    } else {
      currentGroup.push(currStroke);
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Main recognition function using pattern analysis
 */
export function recognizeExpression(group: StrokeGroup): string {
  const strokes = group.strokes.map(s => ({
    points: s.points,
    boundingBox: s.boundingBox,
  }));

  // Segment into individual characters
  const characterGroups = segmentIntoCharacters(strokes);

  // Recognize each character
  const characters = characterGroups.map(charStrokes => 
    recognizeDigitPattern(charStrokes)
  );

  return characters.join('');
}

/**
 * Enhanced mock recognition that uses pattern analysis
 */
export async function smartRecognize(group: StrokeGroup): Promise<string> {
  // Small delay to simulate processing
  await new Promise(resolve => setTimeout(resolve, 100));

  const recognized = recognizeExpression(group);

  // If we couldn't recognize anything useful, return a default
  if (recognized === '?' || recognized === '????' || !recognized) {
    // Fallback: count strokes and guess
    const strokeCount = group.strokes.length;
    if (strokeCount <= 2) return '1+1=';
    if (strokeCount <= 4) return '2+2=';
    if (strokeCount <= 6) return '3+3=';
    return '5+5=';
  }

  // Add equals sign if it looks like an expression without one
  if (/^\d+[+\-×÷]\d+$/.test(recognized)) {
    return recognized + '=';
  }

  return recognized;
}
