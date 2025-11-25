// Recognition module - handles character recognition and expression building

import { StrokeGroup } from './types';
import { createCharacterCanvases, segmentGroupIntoCharacters } from './image-processing';

// Type for TensorFlow.js model
type Model = {
  predict: (tensor: unknown) => { dataSync: () => Float32Array; dispose: () => void; argMax: (axis?: number) => { dataSync: () => Int32Array } };
};

type TensorFlow = {
  loadLayersModel: (url: string) => Promise<Model>;
  browser: { fromPixels: (canvas: HTMLCanvasElement, channels?: number) => unknown };
  div: (a: unknown, b: number) => unknown;
  expandDims: (a: unknown, axis?: number) => unknown;
  tidy: <T>(fn: () => T) => T;
  dispose: (tensor: unknown) => void;
};

// EMNIST ByClass mapping (47 classes)
// 0-9: digits, 10-35: uppercase A-Z, 36-46: lowercase a-k (selected lowercase)
const EMNIST_BYCLASS_LABELS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';

// Extended mapping including math symbols (for HASYv2 or custom model)
const MATH_SYMBOLS = ['+', '-', '×', '÷', '=', '(', ')', '.', '^', '√'];

// Character classes we support
export const SUPPORTED_CHARS = '0123456789+-×÷=xyz().^';

/**
 * Mock recognition function - returns a simulated expression
 * This will be replaced with actual model inference
 */
export async function mockRecognize(
  group: StrokeGroup
): Promise<string> {
  // Simulate some processing time
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Count the number of character segments
  const segments = segmentGroupIntoCharacters(group);
  const numChars = segments.length;

  // Generate a mock expression based on the number of segments
  const mockExpressions = [
    '2+2=',
    '3×4=',
    '5+5=',
    '9-3=',
    '8÷2=',
    '7+8=',
    '6×7=',
    '15-7=',
    '24÷6=',
    'x=5',
    'y=10',
    '12+3=',
  ];

  // Return a mock expression roughly matching the segment count
  if (numChars <= 2) {
    return 'x=5';
  } else if (numChars <= 4) {
    return mockExpressions[Math.floor(Math.random() * 5)];
  } else {
    return mockExpressions[5 + Math.floor(Math.random() * 5)];
  }
}

/**
 * Preprocess canvas for EMNIST model
 * EMNIST expects 28x28 grayscale images
 */
function preprocessCanvasForModel(
  canvas: HTMLCanvasElement,
  tf: TensorFlow
): unknown {
  return tf.tidy(() => {
    // Get grayscale tensor
    let tensor = tf.browser.fromPixels(canvas, 1);

    // Normalize to [0, 1]
    tensor = tf.div(tensor, 255.0);

    // Add batch dimension [1, 28, 28, 1]
    tensor = tf.expandDims(tensor, 0);

    return tensor;
  });
}

/**
 * Real recognition using a TensorFlow.js model
 */
export async function modelRecognize(
  group: StrokeGroup,
  model: Model,
  tf: TensorFlow,
  labelMap: string = EMNIST_BYCLASS_LABELS
): Promise<string> {
  const canvases = createCharacterCanvases(group, 28);
  const chars: string[] = [];

  for (const canvas of canvases) {
    const tensor = preprocessCanvasForModel(canvas, tf);
    const prediction = model.predict(tensor as unknown);
    const argMax = prediction.argMax(-1);
    const classIndex = argMax.dataSync()[0];

    // Map class index to character
    if (classIndex < labelMap.length) {
      chars.push(labelMap[classIndex]);
    } else {
      chars.push('?');
    }

    // Cleanup
    tf.dispose(tensor);
    prediction.dispose();
    argMax.dispose();
  }

  return chars.join('');
}

/**
 * Recognition interface that can use mock or real model
 */
export interface RecognitionEngine {
  recognize: (group: StrokeGroup) => Promise<string>;
  isReady: () => boolean;
  getType: () => 'mock' | 'model';
}

/**
 * Create a mock recognition engine
 */
export function createMockEngine(): RecognitionEngine {
  return {
    recognize: mockRecognize,
    isReady: () => true,
    getType: () => 'mock',
  };
}

/**
 * Create a model-based recognition engine
 */
export function createModelEngine(
  model: Model,
  tf: TensorFlow,
  labelMap: string = EMNIST_BYCLASS_LABELS
): RecognitionEngine {
  return {
    recognize: (group: StrokeGroup) => modelRecognize(group, model, tf, labelMap),
    isReady: () => true,
    getType: () => 'model',
  };
}

/**
 * Post-process recognized string to clean up common errors
 */
export function postProcessExpression(raw: string): string {
  let result = raw.trim();

  // Replace common misrecognitions
  result = result
    .replace(/[xX]/g, (match, offset, string) => {
      // Keep 'x' as multiplication if between numbers, otherwise keep as variable
      const before = string[offset - 1];
      const after = string[offset + 1];
      if (before && after && /\d/.test(before) && /\d/.test(after)) {
        return '×';
      }
      return 'x';
    })
    .replace(/[oO]/g, '0') // O -> 0 in numeric context
    .replace(/[lI]/g, '1') // l or I -> 1
    .replace(/[Ss]/g, '5') // S -> 5 in numeric context
    .replace(/[Bb]/g, '8') // B -> 8 in numeric context
    .replace(/—/g, '-') // Em dash to minus
    .replace(/–/g, '-'); // En dash to minus

  return result;
}
