// TensorFlow.js Model Manager
// Handles loading and inference with EMNIST-style models

import { StrokeGroup } from './types';
import { createCharacterCanvases } from './image-processing';

// TensorFlow types
interface TFTensor {
  dispose: () => void;
  dataSync: () => Float32Array | Int32Array | Uint8Array;
  shape: number[];
  argMax: (axis?: number) => TFTensor;
}

interface TFLayersModel {
  predict: (input: TFTensor) => TFTensor;
  dispose: () => void;
}

interface TensorFlowJS {
  loadLayersModel: (url: string) => Promise<TFLayersModel>;
  browser: {
    fromPixels: (source: HTMLCanvasElement, numChannels?: number) => TFTensor;
  };
  tidy: <T>(fn: () => T) => T;
  div: (a: TFTensor, b: number) => TFTensor;
  expandDims: (a: TFTensor, axis?: number) => TFTensor;
  dispose: (tensor: TFTensor | TFTensor[]) => void;
  ready: () => Promise<void>;
  setBackend: (backend: string) => Promise<boolean>;
  getBackend: () => string;
}

// Singleton TensorFlow instance
let tf: TensorFlowJS | null = null;
let model: TFLayersModel | null = null;
let isLoading = false;
let loadError: Error | null = null;

// EMNIST ByClass labels (62 classes: 0-9, A-Z, a-z)
const EMNIST_BYCLASS_LABELS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// EMNIST Balanced labels (47 classes: 0-9, A-Z, a-k lowercase)
const EMNIST_BALANCED_LABELS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk';

// Simple digit-only labels for MNIST
const MNIST_LABELS = '0123456789';

// Current label map in use
let currentLabelMap = MNIST_LABELS;

/**
 * Load TensorFlow.js dynamically
 */
export async function loadTensorFlow(): Promise<TensorFlowJS> {
  if (tf) return tf;

  try {
    // Dynamic import to avoid SSR issues
    const tfModule = await import('@tensorflow/tfjs');
    tf = tfModule as unknown as TensorFlowJS;
    
    // Wait for TF to be ready
    await tf.ready();
    
    console.log('TensorFlow.js loaded, backend:', tf.getBackend());
    return tf;
  } catch (error) {
    console.error('Failed to load TensorFlow.js:', error);
    throw error;
  }
}

/**
 * Load a pre-trained model from a URL
 */
export async function loadModel(modelUrl?: string): Promise<TFLayersModel> {
  if (model) return model;
  if (isLoading) {
    // Wait for loading to complete
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (model) return model;
    if (loadError) throw loadError;
  }

  isLoading = true;
  loadError = null;

  try {
    const tfInstance = await loadTensorFlow();
    
    // Default to a simple MNIST model if no URL provided
    // You can host your own model or use a CDN
    const url = modelUrl || '/models/mnist/model.json';
    
    console.log('Loading model from:', url);
    model = await tfInstance.loadLayersModel(url);
    console.log('Model loaded successfully');
    
    // Set label map based on model
    if (url.includes('emnist-byclass')) {
      currentLabelMap = EMNIST_BYCLASS_LABELS;
    } else if (url.includes('emnist-balanced') || url.includes('emnist')) {
      currentLabelMap = EMNIST_BALANCED_LABELS;
    } else {
      currentLabelMap = MNIST_LABELS;
    }
    
    isLoading = false;
    return model;
  } catch (error) {
    loadError = error instanceof Error ? error : new Error('Failed to load model');
    isLoading = false;
    throw loadError;
  }
}

/**
 * Check if model is loaded and ready
 */
export function isModelReady(): boolean {
  return tf !== null && model !== null;
}

/**
 * Get model loading status
 */
export function getModelStatus(): { loaded: boolean; loading: boolean; error: string | null } {
  return {
    loaded: model !== null,
    loading: isLoading,
    error: loadError?.message || null,
  };
}

/**
 * Preprocess a canvas for model input
 * Converts to grayscale, normalizes to [0,1], and adds batch dimension
 */
function preprocessCanvas(canvas: HTMLCanvasElement): TFTensor | null {
  if (!tf) return null;
  
  const tfInstance = tf;
  return tfInstance.tidy(() => {
    // Get grayscale tensor from canvas
    let tensor = tfInstance.browser.fromPixels(canvas, 1);
    
    // Normalize to [0, 1]
    tensor = tfInstance.div(tensor, 255.0);
    
    // Add batch dimension: [28, 28, 1] -> [1, 28, 28, 1]
    tensor = tfInstance.expandDims(tensor, 0);
    
    return tensor;
  });
}

/**
 * Predict a single character from a preprocessed canvas
 */
async function predictSingleCharacter(canvas: HTMLCanvasElement): Promise<{ char: string; confidence: number }> {
  if (!tf || !model) {
    throw new Error('Model not loaded');
  }

  const inputTensor = preprocessCanvas(canvas);
  if (!inputTensor) {
    throw new Error('Failed to preprocess canvas');
  }

  try {
    const prediction = model.predict(inputTensor) as TFTensor;
    const probabilities = prediction.dataSync() as Float32Array;
    
    // Find the class with highest probability
    let maxProb = 0;
    let maxIndex = 0;
    for (let i = 0; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIndex = i;
      }
    }
    
    // Map index to character
    const char = maxIndex < currentLabelMap.length ? currentLabelMap[maxIndex] : '?';
    
    // Cleanup
    prediction.dispose();
    inputTensor.dispose();
    
    return { char, confidence: maxProb };
  } catch (error) {
    inputTensor.dispose();
    throw error;
  }
}

/**
 * Recognize all characters in a stroke group
 */
export async function recognizeGroup(group: StrokeGroup): Promise<{
  expression: string;
  characters: Array<{ char: string; confidence: number }>;
}> {
  if (!isModelReady()) {
    throw new Error('Model not loaded. Call loadModel() first.');
  }

  // Get character canvases
  const canvases = createCharacterCanvases(group, 28);
  const characters: Array<{ char: string; confidence: number }> = [];
  
  for (const canvas of canvases) {
    try {
      const result = await predictSingleCharacter(canvas);
      characters.push(result);
    } catch (error) {
      console.error('Error predicting character:', error);
      characters.push({ char: '?', confidence: 0 });
    }
  }
  
  const expression = characters.map(c => c.char).join('');
  
  return { expression, characters };
}

/**
 * Post-process recognized expression
 * Fixes common recognition errors and normalizes symbols
 */
export function postProcessExpression(raw: string): string {
  let result = raw;
  
  // Common substitutions for math context
  const substitutions: [RegExp, string | ((match: string, ...args: string[]) => string)][] = [
    // Lowercase 'x' between numbers is multiplication
    [/(\d)x(\d)/gi, '$1×$2'],
    // 'X' at start or between operators is variable
    [/^X/i, 'x'],
    // Common letter->digit substitutions
    [/O/g, '0'], // O -> 0
    [/o(?=\d)/g, '0'], // o before digit -> 0
    [/I(?=\d)/g, '1'], // I before digit -> 1
    [/l(?=\d)/g, '1'], // l before digit -> 1
    [/S/g, '5'], // S -> 5 (context dependent)
    [/B/g, '8'], // B -> 8 (context dependent)
    // Fix equals sign
    [/-$/g, '='], // trailing minus might be equals
  ];
  
  for (const [pattern, replacement] of substitutions) {
    if (typeof replacement === 'string') {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  
  return result;
}

/**
 * Full recognition pipeline with model
 */
export async function recognizeWithModel(group: StrokeGroup): Promise<string> {
  const { expression } = await recognizeGroup(group);
  return postProcessExpression(expression);
}

/**
 * Cleanup resources
 */
export function disposeModel(): void {
  if (model) {
    model.dispose();
    model = null;
  }
}
