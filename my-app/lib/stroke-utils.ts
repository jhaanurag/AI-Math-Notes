// Utility functions for stroke and bounding box operations

import { Point, BoundingBox, Stroke, StrokeGroup } from './types';

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate the bounding box for an array of points
 */
export function calculateBoundingBox(points: Point[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Merge two bounding boxes into one that contains both
 */
export function mergeBoundingBoxes(a: BoundingBox, b: BoundingBox): BoundingBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Calculate the minimum distance between two bounding boxes
 */
export function boundingBoxDistance(a: BoundingBox, b: BoundingBox): number {
  // Calculate horizontal distance
  let dx = 0;
  if (a.maxX < b.minX) {
    dx = b.minX - a.maxX;
  } else if (b.maxX < a.minX) {
    dx = a.minX - b.maxX;
  }

  // Calculate vertical distance
  let dy = 0;
  if (a.maxY < b.minY) {
    dy = b.minY - a.maxY;
  } else if (b.maxY < a.minY) {
    dy = a.minY - b.maxY;
  }

  // Return Euclidean distance
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if two bounding boxes are within a threshold distance
 */
export function areBoundingBoxesClose(
  a: BoundingBox,
  b: BoundingBox,
  threshold: number = 50
): boolean {
  return boundingBoxDistance(a, b) <= threshold;
}

/**
 * Calculate the combined bounding box for a group of strokes
 */
export function calculateGroupBoundingBox(strokes: Stroke[]): BoundingBox {
  if (strokes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let result = strokes[0].boundingBox;
  for (let i = 1; i < strokes.length; i++) {
    result = mergeBoundingBoxes(result, strokes[i].boundingBox);
  }

  return result;
}

/**
 * Find the closest group to a stroke within a threshold
 * Returns the group index or -1 if no close group found
 */
export function findClosestGroup(
  stroke: Stroke,
  groups: StrokeGroup[],
  threshold: number = 50
): number {
  let closestIndex = -1;
  let closestDistance = Infinity;

  for (let i = 0; i < groups.length; i++) {
    const distance = boundingBoxDistance(stroke.boundingBox, groups[i].boundingBox);
    if (distance <= threshold && distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }

  return closestIndex;
}

/**
 * Add padding to a bounding box
 */
export function padBoundingBox(box: BoundingBox, padding: number): BoundingBox {
  return {
    minX: box.minX - padding,
    minY: box.minY - padding,
    maxX: box.maxX + padding,
    maxY: box.maxY + padding,
  };
}
