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

// Model labels for recognition - 17 classes
// Matches the order from your training:
// 0-9: digits, 10: divide_symbol, 11: lparen, 12: minus, 13: plus, 14: rparen, 15: slash, 16: times
export const MODEL_LABELS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '÷',   // 10: divide_symbol
  '(',   // 11: lparen
  '-',   // 12: minus
  '+',   // 13: plus
  ')',   // 14: rparen
  '/',   // 15: slash
  '×',   // 16: times
];

// Map model output to math symbols we can evaluate
export const SYMBOL_TO_MATH: Record<string, string> = {
  '÷': '/',
  '×': '*',
};

// Math symbols we support
export const SYMBOL_LABELS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '+', '-', '*', '/', '=', '(', ')', '.', '^', '÷', '×'
];

// Map certain characters if needed
export const LETTER_TO_SYMBOL: Record<string, string> = {
  'X': '*',
  'x': '*',
  '÷': '/',
  '×': '*',
};

export type SymbolLabel = typeof SYMBOL_LABELS[number];
