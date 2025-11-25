// Math Solver module - parses expressions and evaluates them using math.js

import { create, all, MathJsInstance } from 'mathjs';
import { MathScope } from './types';

// Create math.js instance with all functions
const math: MathJsInstance = create(all);

/**
 * Global scope to store variable assignments
 */
let globalScope: MathScope = {};

/**
 * Get the current scope
 */
export function getScope(): MathScope {
  return { ...globalScope };
}

/**
 * Clear the scope
 */
export function clearScope(): void {
  globalScope = {};
}

/**
 * Set a variable in the scope
 */
export function setVariable(name: string, value: number): void {
  globalScope[name] = value;
}

/**
 * Normalize an expression for math.js
 * - Replace × with *
 * - Replace ÷ with /
 * - Handle implicit multiplication (e.g., 2x -> 2*x)
 */
export function normalizeExpression(expr: string): string {
  let result = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\s+/g, ''); // Remove whitespace

  // Add implicit multiplication (e.g., 2x -> 2*x, x2 -> x*2)
  result = result.replace(/(\d)([a-zA-Z])/g, '$1*$2');
  result = result.replace(/([a-zA-Z])(\d)/g, '$1*$2');

  return result;
}

/**
 * Parse and categorize an expression
 */
export interface ParsedExpression {
  type: 'assignment' | 'equation' | 'expression' | 'invalid';
  variable?: string;
  value?: number;
  expression?: string;
  error?: string;
}

/**
 * Parse an expression to determine its type
 */
export function parseExpression(expr: string): ParsedExpression {
  const normalized = normalizeExpression(expr);

  // Check if it's empty
  if (!normalized) {
    return { type: 'invalid', error: 'Empty expression' };
  }

  // Check for variable assignment (e.g., "x=5" or "y = 10")
  const assignmentMatch = normalized.match(/^([a-zA-Z])=(.+)$/);
  if (assignmentMatch) {
    const varName = assignmentMatch[1];
    const valueExpr = assignmentMatch[2];

    // Don't treat "2+3=" as assignment
    if (/^[\d.]+$/.test(valueExpr) || /^[\d.+\-*/()]+$/.test(valueExpr)) {
      try {
        const value = math.evaluate(valueExpr, globalScope) as number;
        return {
          type: 'assignment',
          variable: varName,
          value: value,
          expression: normalized,
        };
      } catch {
        return { type: 'invalid', error: 'Invalid assignment value' };
      }
    }
  }

  // Check for expression ending with = (e.g., "2+2=")
  if (normalized.endsWith('=')) {
    const exprPart = normalized.slice(0, -1);
    return {
      type: 'equation',
      expression: exprPart,
    };
  }

  // Otherwise treat as a regular expression
  return {
    type: 'expression',
    expression: normalized,
  };
}

/**
 * Evaluate a parsed expression and return the result
 */
export interface EvaluationResult {
  success: boolean;
  result?: string;
  numericResult?: number;
  error?: string;
  scopeUpdate?: { variable: string; value: number };
}

/**
 * Evaluate a math expression
 */
export function evaluateExpression(expr: string): EvaluationResult {
  const parsed = parseExpression(expr);

  switch (parsed.type) {
    case 'assignment':
      if (parsed.variable && parsed.value !== undefined) {
        // Store in global scope
        globalScope[parsed.variable] = parsed.value;
        return {
          success: true,
          result: String(parsed.value),
          numericResult: parsed.value,
          scopeUpdate: {
            variable: parsed.variable,
            value: parsed.value,
          },
        };
      }
      return { success: false, error: 'Invalid assignment' };

    case 'equation':
      try {
        const result = math.evaluate(parsed.expression!, globalScope);
        const numResult = typeof result === 'number' ? result : Number(result);

        // Format the result nicely
        let formattedResult: string;
        if (Number.isInteger(numResult)) {
          formattedResult = String(numResult);
        } else {
          // Round to reasonable precision
          formattedResult = Number(numResult.toPrecision(10)).toString();
        }

        return {
          success: true,
          result: formattedResult,
          numericResult: numResult,
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Evaluation error',
        };
      }

    case 'expression':
      try {
        const result = math.evaluate(parsed.expression!, globalScope);
        const numResult = typeof result === 'number' ? result : Number(result);

        let formattedResult: string;
        if (Number.isInteger(numResult)) {
          formattedResult = String(numResult);
        } else {
          formattedResult = Number(numResult.toPrecision(10)).toString();
        }

        return {
          success: true,
          result: formattedResult,
          numericResult: numResult,
        };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Evaluation error',
        };
      }

    case 'invalid':
    default:
      return {
        success: false,
        error: parsed.error || 'Invalid expression',
      };
  }
}

/**
 * Main solver function - takes a recognized expression string,
 * evaluates it, and returns the result to display
 */
export function solve(expression: string): { result: string; error?: string } {
  const evalResult = evaluateExpression(expression);

  if (evalResult.success && evalResult.result) {
    return { result: evalResult.result };
  }

  return {
    result: '?',
    error: evalResult.error,
  };
}
