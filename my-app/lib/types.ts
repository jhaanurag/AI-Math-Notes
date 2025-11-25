// Core types for the Spatial Math Notes application

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  timestamp: number;
  boundingBox: BoundingBox;
}

export interface StrokeGroup {
  id: string;
  strokes: Stroke[];
  boundingBox: BoundingBox;
  result?: string;
  expression?: string;
  isProcessing?: boolean;
}

export interface MathScope {
  [key: string]: number;
}
