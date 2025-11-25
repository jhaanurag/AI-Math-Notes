// Per-character recognition with intelligent stroke grouping
// Uses timing + spatial analysis to determine character boundaries

import { Point, Stroke, BoundingBox, StrokeGroup } from './types';
import { calculateBoundingBox, boundingBoxDistance, mergeBoundingBoxes } from './stroke-utils';

export interface CharacterCandidate {
  id: string;
  strokes: Stroke[];
  boundingBox: BoundingBox;
  lastStrokeTime: number;
  isComplete: boolean;
  recognizedAs?: string;
  confidence?: number;
}

export interface RecognitionResult {
  char: string;
  confidence: number;
  boundingBox: BoundingBox;
}

// Configuration for character detection
export const CHARACTER_CONFIG = {
  // Time in ms after which a character is considered complete
  COMPLETION_TIMEOUT: 400,
  
  // Max distance (px) between strokes to be considered same character
  MAX_STROKE_DISTANCE: 40,
  
  // If new stroke would make bbox wider than this ratio of height, it's probably a new char
  MAX_ASPECT_RATIO: 2.5,
  
  // Minimum bbox size to be considered a valid character
  MIN_CHAR_SIZE: 10,
  
  // Maximum bbox size (probably multiple characters if larger)
  MAX_CHAR_SIZE: 150,
};

/**
 * Determines if a new stroke belongs to the current character or starts a new one
 */
export function shouldStartNewCharacter(
  newStroke: Stroke,
  currentChar: CharacterCandidate | null,
  config = CHARACTER_CONFIG
): boolean {
  // No current character - always start new
  if (!currentChar || currentChar.strokes.length === 0) {
    return true;
  }
  
  // Check time gap
  const timeSinceLastStroke = newStroke.timestamp - currentChar.lastStrokeTime;
  if (timeSinceLastStroke > config.COMPLETION_TIMEOUT) {
    return true;
  }
  
  // Check spatial distance
  const distance = boundingBoxDistance(newStroke.boundingBox, currentChar.boundingBox);
  if (distance > config.MAX_STROKE_DISTANCE) {
    return true;
  }
  
  // Check if adding this stroke would make an unreasonably shaped character
  const combinedBox = mergeBoundingBoxes(newStroke.boundingBox, currentChar.boundingBox);
  const width = combinedBox.maxX - combinedBox.minX;
  const height = combinedBox.maxY - combinedBox.minY;
  
  // If the combined bbox is too wide (like two characters side by side)
  if (width > height * config.MAX_ASPECT_RATIO && width > config.MAX_CHAR_SIZE) {
    return true;
  }
  
  // If the combined bbox is just too large in general
  if (width > config.MAX_CHAR_SIZE && height > config.MAX_CHAR_SIZE) {
    return true;
  }
  
  return false;
}

/**
 * Check if a character candidate is complete (ready for recognition)
 */
export function isCharacterComplete(
  char: CharacterCandidate,
  currentTime: number,
  config = CHARACTER_CONFIG
): boolean {
  if (char.isComplete) return true;
  
  const timeSinceLastStroke = currentTime - char.lastStrokeTime;
  return timeSinceLastStroke > config.COMPLETION_TIMEOUT;
}

/**
 * Create a canvas with the character drawn on it for recognition
 */
export function createCharacterCanvas(
  char: CharacterCandidate,
  size: number = 28,
  padding: number = 4
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  
  const box = char.boundingBox;
  const charWidth = box.maxX - box.minX;
  const charHeight = box.maxY - box.minY;
  
  // Calculate scale to fit character in canvas with padding
  const availableSize = size - 2 * padding;
  const scale = Math.min(
    availableSize / Math.max(charWidth, 1),
    availableSize / Math.max(charHeight, 1)
  );
  
  // Center the character
  const scaledWidth = charWidth * scale;
  const scaledHeight = charHeight * scale;
  const offsetX = (size - scaledWidth) / 2;
  const offsetY = (size - scaledHeight) / 2;
  
  // Draw strokes in white
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, 2.5 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (const stroke of char.strokes) {
    if (stroke.points.length < 2) continue;
    
    ctx.beginPath();
    const first = stroke.points[0];
    ctx.moveTo(
      (first.x - box.minX) * scale + offsetX,
      (first.y - box.minY) * scale + offsetY
    );
    
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      ctx.lineTo(
        (p.x - box.minX) * scale + offsetX,
        (p.y - box.minY) * scale + offsetY
      );
    }
    ctx.stroke();
  }
  
  return canvas;
}

/**
 * Analyze stroke patterns to guess the character type
 * This helps improve recognition accuracy
 */
export function analyzeStrokePattern(char: CharacterCandidate): {
  strokeCount: number;
  hasLoop: boolean;
  isVertical: boolean;
  isHorizontal: boolean;
  aspectRatio: number;
} {
  const box = char.boundingBox;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const aspectRatio = width / Math.max(height, 1);
  
  const strokeCount = char.strokes.length;
  
  // Check for loops (closed curves)
  let hasLoop = false;
  for (const stroke of char.strokes) {
    if (stroke.points.length > 10) {
      const first = stroke.points[0];
      const last = stroke.points[stroke.points.length - 1];
      const dist = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2));
      if (dist < 20) {
        hasLoop = true;
        break;
      }
    }
  }
  
  // Check orientation
  const isVertical = aspectRatio < 0.5;
  const isHorizontal = aspectRatio > 2;
  
  return {
    strokeCount,
    hasLoop,
    isVertical,
    isHorizontal,
    aspectRatio,
  };
}

/**
 * Simple heuristic recognition based on stroke patterns
 * Used as fallback or to improve ML model predictions
 */
export function heuristicRecognize(char: CharacterCandidate): { char: string; confidence: number } {
  const pattern = analyzeStrokePattern(char);
  
  // Single stroke characters
  if (pattern.strokeCount === 1) {
    if (pattern.hasLoop && pattern.aspectRatio > 0.6 && pattern.aspectRatio < 1.5) {
      return { char: '0', confidence: 0.7 };
    }
    if (pattern.isVertical) {
      return { char: '1', confidence: 0.7 };
    }
    if (pattern.isHorizontal) {
      return { char: '-', confidence: 0.8 };
    }
  }
  
  // Two stroke characters
  if (pattern.strokeCount === 2) {
    // Check if it looks like a +
    const stroke1 = char.strokes[0];
    const stroke2 = char.strokes[1];
    
    const s1Horizontal = isStrokeHorizontal(stroke1);
    const s2Horizontal = isStrokeHorizontal(stroke2);
    const s1Vertical = isStrokeVertical(stroke1);
    const s2Vertical = isStrokeVertical(stroke2);
    
    if ((s1Horizontal && s2Vertical) || (s1Vertical && s2Horizontal)) {
      return { char: '+', confidence: 0.85 };
    }
    
    if (s1Horizontal && s2Horizontal) {
      return { char: '=', confidence: 0.85 };
    }
  }
  
  return { char: '?', confidence: 0 };
}

function isStrokeHorizontal(stroke: Stroke): boolean {
  if (stroke.points.length < 2) return false;
  const first = stroke.points[0];
  const last = stroke.points[stroke.points.length - 1];
  const dx = Math.abs(last.x - first.x);
  const dy = Math.abs(last.y - first.y);
  return dx > dy * 2;
}

function isStrokeVertical(stroke: Stroke): boolean {
  if (stroke.points.length < 2) return false;
  const first = stroke.points[0];
  const last = stroke.points[stroke.points.length - 1];
  const dx = Math.abs(last.x - first.x);
  const dy = Math.abs(last.y - first.y);
  return dy > dx * 2;
}

/**
 * Character grouping manager
 * Handles real-time stroke grouping into characters
 */
export class CharacterGrouper {
  private characters: CharacterCandidate[] = [];
  private currentCharacter: CharacterCandidate | null = null;
  private nextId = 1;
  private onCharacterComplete?: (char: CharacterCandidate) => void;
  private completionTimer: NodeJS.Timeout | null = null;
  
  constructor(onCharacterComplete?: (char: CharacterCandidate) => void) {
    this.onCharacterComplete = onCharacterComplete;
  }
  
  /**
   * Add a new stroke and determine if it's part of current character or new one
   */
  addStroke(stroke: Stroke): void {
    const shouldStartNew = shouldStartNewCharacter(stroke, this.currentCharacter);
    
    if (shouldStartNew) {
      // Finalize current character if it exists
      this.finalizeCurrentCharacter();
      
      // Start new character
      this.currentCharacter = {
        id: `char-${this.nextId++}`,
        strokes: [stroke],
        boundingBox: stroke.boundingBox,
        lastStrokeTime: stroke.timestamp,
        isComplete: false,
      };
    } else if (this.currentCharacter) {
      // Add to current character
      this.currentCharacter.strokes.push(stroke);
      this.currentCharacter.boundingBox = mergeBoundingBoxes(
        this.currentCharacter.boundingBox,
        stroke.boundingBox
      );
      this.currentCharacter.lastStrokeTime = stroke.timestamp;
    }
    
    // Reset completion timer
    this.resetCompletionTimer();
  }
  
  /**
   * Reset the timer that triggers character completion
   */
  private resetCompletionTimer(): void {
    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
    }
    
    this.completionTimer = setTimeout(() => {
      this.finalizeCurrentCharacter();
    }, CHARACTER_CONFIG.COMPLETION_TIMEOUT);
  }
  
  /**
   * Finalize the current character and trigger recognition
   */
  private finalizeCurrentCharacter(): void {
    if (this.currentCharacter && this.currentCharacter.strokes.length > 0) {
      this.currentCharacter.isComplete = true;
      this.characters.push(this.currentCharacter);
      
      if (this.onCharacterComplete) {
        this.onCharacterComplete(this.currentCharacter);
      }
    }
    this.currentCharacter = null;
  }
  
  /**
   * Force completion of current character (e.g., when user explicitly triggers)
   */
  forceComplete(): void {
    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
    }
    this.finalizeCurrentCharacter();
  }
  
  /**
   * Get all completed characters
   */
  getCharacters(): CharacterCandidate[] {
    return this.characters;
  }
  
  /**
   * Get current in-progress character
   */
  getCurrentCharacter(): CharacterCandidate | null {
    return this.currentCharacter;
  }
  
  /**
   * Clear all characters
   */
  clear(): void {
    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
    }
    this.characters = [];
    this.currentCharacter = null;
  }
  
  /**
   * Update a character with recognition result
   */
  updateRecognition(charId: string, recognized: string, confidence: number): void {
    const char = this.characters.find(c => c.id === charId);
    if (char) {
      char.recognizedAs = recognized;
      char.confidence = confidence;
    }
  }
  
  /**
   * Get the full recognized expression (all characters in order)
   */
  getExpression(): string {
    // Sort characters by x position (left to right)
    const sorted = [...this.characters].sort((a, b) => a.boundingBox.minX - b.boundingBox.minX);
    return sorted.map(c => c.recognizedAs || '?').join('');
  }
}
