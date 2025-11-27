// Expression parser and evaluator using Math.js

import { create, all, MathJsInstance } from 'mathjs';
import { Character, Expression } from './types';
import { mergeBoundingBoxes, groupIntoLines, generateId } from './geometry';

// Create math.js instance with all functions
const math: MathJsInstance = create(all);

/**
 * Detect two consecutive minus signs at similar Y positions and merge into equals sign
 * This handles the case when user draws '=' as two separate horizontal strokes
 * Uses very relaxed thresholds for better detection
 */
function mergeDoubleMinusToEquals(characters: Character[]): Character[] {
  if (characters.length < 2) return characters;
  
  // Sort by X position (center)
  const sorted = [...characters].sort((a, b) => a.boundingBox.centerX - b.boundingBox.centerX);
  const result: Character[] = [];
  let i = 0;
  
  while (i < sorted.length) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    // Check if current and next are both minus signs
    if (next && current.recognized === '-' && next.recognized === '-') {
      // Calculate horizontal overlap between the two strokes
      const overlapLeft = Math.max(current.boundingBox.minX, next.boundingBox.minX);
      const overlapRight = Math.min(current.boundingBox.maxX, next.boundingBox.maxX);
      const horizontalOverlap = overlapRight - overlapLeft;
      const minWidth = Math.min(current.boundingBox.width, next.boundingBox.width);
      const maxWidth = Math.max(current.boundingBox.width, next.boundingBox.width);
      
      // Check horizontal center distance
      const horizontalCenterDist = Math.abs(current.boundingBox.centerX - next.boundingBox.centerX);
      
      // Check vertical separation
      const verticalGap = Math.abs(current.boundingBox.centerY - next.boundingBox.centerY);
      const combinedHeight = current.boundingBox.height + next.boundingBox.height;
      
      // RELAXED: They should be somewhat aligned horizontally
      // Either overlapping OR centers are close relative to width
      const isHorizontallyAligned = horizontalOverlap > minWidth * 0.2 || horizontalCenterDist < maxWidth * 0.8;
      
      // RELAXED: Vertical gap should be reasonable - not on top of each other, not too far
      // Allow up to 6x combined height for very spaced out equals
      const isVerticallyStacked = verticalGap > 3 && verticalGap < combinedHeight * 6;
      
      console.log(`Equals check: hOverlap=${horizontalOverlap.toFixed(0)}, hCenterDist=${horizontalCenterDist.toFixed(0)}, vGap=${verticalGap.toFixed(0)}, aligned=${isHorizontallyAligned}, stacked=${isVerticallyStacked}`);
      
      if (isHorizontallyAligned && isVerticallyStacked) {
        // Merge into equals sign
        const mergedBoundingBox = mergeBoundingBoxes([current.boundingBox, next.boundingBox]);
        result.push({
          id: current.id,
          strokes: [...current.strokes, ...next.strokes],
          boundingBox: mergedBoundingBox,
          recognized: '=',
          confidence: Math.min(current.confidence, next.confidence),
        });
        console.log('Merged two minus signs into equals!');
        i += 2; // Skip both
        continue;
      }
    }
    
    result.push(current);
    i++;
  }
  
  return result;
}

/**
 * Build expression string from recognized characters
 */
export function buildExpressionString(characters: Character[]): string {
  return characters
    .map(c => c.recognized || '?')
    .join('');
}

/**
 * Normalize expression string for evaluation
 * Handles implicit multiplication and other math conventions
 */
function normalizeExpression(expr: string): string {
  let normalized = expr;
  
  // Replace 'x' or 'X' with '*' for multiplication (if it looks like multiplication context)
  normalized = normalized.replace(/(\d)x(\d)/gi, '$1*$2');
  
  // Replace '÷' with '/'
  normalized = normalized.replace(/÷/g, '/');
  
  // Replace '×' with '*'
  normalized = normalized.replace(/×/g, '*');
  
  // Handle implicit multiplication: 2(3) -> 2*(3)
  normalized = normalized.replace(/(\d)\(/g, '$1*(');
  normalized = normalized.replace(/\)(\d)/g, ')*$1');
  normalized = normalized.replace(/\)\(/g, ')*(');
  
  // Handle power notation: 2^3
  // Already supported by math.js
  
  return normalized;
}

/**
 * Evaluate a mathematical expression string
 */
export function evaluateExpression(exprString: string): { result: string | null; error: string | null } {
  // Remove equals sign and anything after it
  const parts = exprString.split('=');
  const toEvaluate = parts[0].trim();
  
  if (!toEvaluate || toEvaluate === '?') {
    return { result: null, error: 'Empty expression' };
  }

  // Check for unknown characters
  if (toEvaluate.includes('?')) {
    return { result: null, error: 'Unrecognized characters in expression' };
  }

  try {
    const normalized = normalizeExpression(toEvaluate);
    const result = math.evaluate(normalized);
    
    // Format result
    if (typeof result === 'number') {
      // Round to avoid floating point errors
      const rounded = Math.round(result * 1000000) / 1000000;
      return { result: rounded.toString(), error: null };
    }
    
    return { result: result.toString(), error: null };
  } catch (e) {
    return { result: null, error: (e as Error).message };
  }
}

/**
 * Check if expression has an equals sign
 */
export function hasEqualsSign(characters: Character[]): boolean {
  return characters.some(c => c.recognized === '=');
}

/**
 * Build expressions from characters
 * Groups characters into lines and creates expression objects
 */
export function buildExpressions(characters: Character[]): Expression[] {
  if (characters.length === 0) return [];

  // Group characters into lines
  const lines = groupIntoLines(characters);
  
  return lines.map(lineChars => {
    // Detect and merge double-minus into equals
    const mergedChars = mergeDoubleMinusToEquals(lineChars);
    
    const boundingBox = mergeBoundingBoxes(mergedChars.map(c => c.boundingBox));
    const text = buildExpressionString(mergedChars);
    const hasEquals = hasEqualsSign(mergedChars);
    
    let result: string | null = null;
    if (hasEquals) {
      const evalResult = evaluateExpression(text);
      result = evalResult.result;
    }

    return {
      id: generateId(),
      characters: mergedChars,
      boundingBox,
      text,
      result,
      hasEquals,
    };
  });
}

/**
 * Get the position to render the result
 * Returns coordinates after the equals sign
 */
export function getResultPosition(expression: Expression): { x: number; y: number } | null {
  if (!expression.hasEquals || !expression.result) return null;

  // Find the equals sign character
  const equalsChar = expression.characters.find(c => c.recognized === '=');
  if (!equalsChar) return null;

  // Position result after the equals sign
  return {
    x: equalsChar.boundingBox.maxX + 10,
    y: equalsChar.boundingBox.centerY,
  };
}

/**
 * Validate if expression is complete and can be evaluated
 */
export function isExpressionComplete(expression: Expression): boolean {
  // Must have equals sign
  if (!expression.hasEquals) return false;
  
  // Must have recognized characters before equals
  const beforeEquals = expression.text.split('=')[0];
  if (!beforeEquals || beforeEquals.includes('?')) return false;
  
  // Must be evaluable
  const evalResult = evaluateExpression(expression.text);
  return evalResult.result !== null;
}

/**
 * Parse expression to check validity without evaluation
 */
export function isValidExpression(exprString: string): boolean {
  try {
    const normalized = normalizeExpression(exprString.split('=')[0]);
    math.parse(normalized);
    return true;
  } catch {
    return false;
  }
}
