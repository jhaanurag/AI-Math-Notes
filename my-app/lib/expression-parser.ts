// Expression parser and evaluator using Math.js

import { create, all, MathJsInstance } from 'mathjs';
import { Character, Expression } from './types';
import { mergeBoundingBoxes, groupIntoLines, generateId } from './geometry';

// Create math.js instance with all functions
const math: MathJsInstance = create(all);

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
    const boundingBox = mergeBoundingBoxes(lineChars.map(c => c.boundingBox));
    const text = buildExpressionString(lineChars);
    const hasEquals = hasEqualsSign(lineChars);
    
    let result: string | null = null;
    if (hasEquals) {
      const evalResult = evaluateExpression(text);
      result = evalResult.result;
    }

    return {
      id: generateId(),
      characters: lineChars,
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
