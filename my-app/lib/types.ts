// Types for the Spatial Math Notes application

export interface Point {
  x: number;
  y: number;
  timestamp: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  boundingBox: BoundingBox;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface Character {
  id: string;
  strokes: Stroke[];
  boundingBox: BoundingBox;
  recognized: string | null;
  confidence: number;
}

export interface Expression {
  id: string;
  characters: Character[];
  boundingBox: BoundingBox;
  text: string;
  result: string | null;
  hasEquals: boolean;
}

export interface CanvasState {
  strokes: Stroke[];
  characters: Character[];
  expressions: Expression[];
  currentStroke: Stroke | null;
  isDrawing: boolean;
}

// Model labels for recognition - EMNIST Balanced (47 classes mapped to 42)
// The model outputs 42 classes from EMNIST balanced dataset
export const EMNIST_LABELS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z', 'a', 'b', 'd', 'e',
  'f', 'g'
];

// Math symbols we support (subset that can be recognized or mapped)
export const SYMBOL_LABELS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '+', '-', '*', '/', '=', '(', ')', '.', '^'
];

// Map certain letters to math symbols for recognition
export const LETTER_TO_SYMBOL: Record<string, string> = {
  'X': '*',  // X can mean multiply
  'x': '*',  // x can mean multiply
};

export type SymbolLabel = typeof SYMBOL_LABELS[number];
