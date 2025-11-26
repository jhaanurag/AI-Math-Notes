// Character recognizer using TensorFlow.js - INFERENCE ONLY
// Loads pre-trained model, no training on client

import * as tf from '@tensorflow/tfjs';
import { Character, EMNIST_LABELS, LETTER_TO_SYMBOL } from './types';

const CANVAS_SIZE = 28;

let model: tf.LayersModel | null = null;
let isModelLoading = false;
let modelLoadPromise: Promise<boolean> | null = null;
let modelLoadFailed = false;

/**
 * Initialize the model - loads pre-trained model only
 */
export async function initializeModel(): Promise<boolean> {
  if (model) return true;
  if (modelLoadFailed) return false;
  
  if (modelLoadPromise) {
    return modelLoadPromise;
  }

  isModelLoading = true;
  
  modelLoadPromise = (async () => {
    try {
      // Set backend to webgl for GPU acceleration, fallback to cpu
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('TensorFlow.js backend:', tf.getBackend());
      
      // Try to load pre-trained model from public folder
      console.log('Loading model from /model/model.json...');
      model = await tf.loadLayersModel('/model/model.json');
      console.log('✅ Loaded pre-trained model');
      console.log('Model input shape:', model.inputs[0].shape);
      console.log('Model output shape:', model.outputs[0].shape);
      isModelLoading = false;
      return true;
    } catch (e) {
      console.error('❌ Model loading failed:', e);
      console.warn('Using rule-based recognition as fallback');
      modelLoadFailed = true;
      isModelLoading = false;
      return false;
    }
  })();

  return modelLoadPromise;
}

/**
 * Convert character strokes to a normalized 28x28 image tensor
 */
function characterToImageData(character: Character): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Calculate scaling to fit character in canvas with padding
  const bbox = character.boundingBox;
  const padding = 4;
  const availableSize = CANVAS_SIZE - padding * 2;
  const scale = Math.min(
    availableSize / Math.max(bbox.width, 1),
    availableSize / Math.max(bbox.height, 1)
  );

  // Center the character
  const offsetX = padding + (availableSize - bbox.width * scale) / 2 - bbox.minX * scale;
  const offsetY = padding + (availableSize - bbox.height * scale) / 2 - bbox.minY * scale;

  // Draw strokes
  ctx.strokeStyle = 'black';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of character.strokes) {
    if (stroke.points.length < 2) continue;

    ctx.beginPath();
    const firstPoint = stroke.points[0];
    ctx.moveTo(firstPoint.x * scale + offsetX, firstPoint.y * scale + offsetY);

    for (let i = 1; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      ctx.lineTo(point.x * scale + offsetX, point.y * scale + offsetY);
    }
    ctx.stroke();
  }

  // Get image data and convert to grayscale tensor format
  const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const data = new Float32Array(CANVAS_SIZE * CANVAS_SIZE);

  for (let i = 0; i < CANVAS_SIZE * CANVAS_SIZE; i++) {
    // Convert to grayscale and invert (black on white -> white on black for model)
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    const gray = (r + g + b) / 3;
    data[i] = 1 - gray / 255;
  }

  return data;
}

/**
 * Rule-based recognition fallback when model isn't available
 * Analyzes stroke patterns to identify symbols
 */
function recognizeWithRules(character: Character): { label: string; confidence: number } {
  const { strokes, boundingBox: bbox } = character;
  const numStrokes = strokes.length;
  const aspectRatio = bbox.width / Math.max(bbox.height, 1);
  
  // Count total points for stroke complexity
  const totalPoints = strokes.reduce((sum, s) => sum + s.points.length, 0);
  
  // Analyze stroke directions
  let hasHorizontal = false;
  let hasVertical = false;
  let hasDiagonal = false;
  
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    const first = stroke.points[0];
    const last = stroke.points[stroke.points.length - 1];
    const dx = Math.abs(last.x - first.x);
    const dy = Math.abs(last.y - first.y);
    
    if (dx > dy * 2) hasHorizontal = true;
    else if (dy > dx * 2) hasVertical = true;
    else if (dx > 5 && dy > 5) hasDiagonal = true;
  }
  
  // Simple heuristics
  
  // Equals sign: 2 horizontal strokes
  if (numStrokes === 2 && hasHorizontal && !hasVertical && aspectRatio > 1.5) {
    return { label: '=', confidence: 0.8 };
  }
  
  // Plus sign: 2 strokes, one horizontal, one vertical
  if (numStrokes === 2 && hasHorizontal && hasVertical) {
    return { label: '+', confidence: 0.75 };
  }
  
  // Minus sign: 1 horizontal stroke
  if (numStrokes === 1 && hasHorizontal && !hasVertical && aspectRatio > 2) {
    return { label: '-', confidence: 0.7 };
  }
  
  // Division: 1 diagonal stroke
  if (numStrokes === 1 && hasDiagonal && !hasHorizontal && !hasVertical) {
    return { label: '/', confidence: 0.6 };
  }
  
  // Multiplication: 2 diagonal strokes crossing
  if (numStrokes === 2 && hasDiagonal && !hasHorizontal && !hasVertical) {
    return { label: '*', confidence: 0.6 };
  }
  
  // Single vertical stroke could be 1
  if (numStrokes === 1 && hasVertical && !hasHorizontal && aspectRatio < 0.5) {
    return { label: '1', confidence: 0.5 };
  }
  
  // Dot: very small, single stroke
  if (numStrokes === 1 && bbox.width < 15 && bbox.height < 15 && totalPoints < 20) {
    return { label: '.', confidence: 0.6 };
  }
  
  // For complex shapes, make educated guesses based on stroke count and shape
  if (numStrokes === 1) {
    // Single continuous stroke - likely a digit
    if (aspectRatio > 0.7 && aspectRatio < 1.3) {
      // Roughly square - could be 0, 8, 6, 9
      if (totalPoints > 50) return { label: '0', confidence: 0.4 };
    }
    // Tall and narrow
    if (aspectRatio < 0.6) {
      return { label: '1', confidence: 0.4 };
    }
  }
  
  // Default: unknown
  return { label: '?', confidence: 0.1 };
}

/**
 * Recognize a character using the ML model or fallback to rules
 */
export async function recognizeCharacter(character: Character): Promise<{ label: string; confidence: number }> {
  // First, check if this looks like a math operator using rules
  // (ML model trained on EMNIST doesn't have +, -, =, etc.)
  const ruleResult = recognizeWithRules(character);
  
  // If rules are confident about an operator, use that
  const operators = ['+', '-', '*', '/', '=', '.', '^', '(', ')'];
  if (operators.includes(ruleResult.label) && ruleResult.confidence >= 0.6) {
    console.log(`Rule-based: ${ruleResult.label} (${(ruleResult.confidence * 100).toFixed(0)}%)`);
    return ruleResult;
  }
  
  // Try to load model if not already attempted
  const modelAvailable = await initializeModel();
  
  // If model loaded successfully, use it for digits/letters
  if (modelAvailable && model) {
    try {
      const imageData = characterToImageData(character);
      const tensor = tf.tensor4d(imageData, [1, CANVAS_SIZE, CANVAS_SIZE, 1]);
      
      const prediction = model.predict(tensor) as tf.Tensor;
      const probabilities = await prediction.data();
      
      tensor.dispose();
      prediction.dispose();

      // Find the class with highest probability
      let maxIdx = 0;
      let maxProb = probabilities[0];
      for (let i = 1; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIdx = i;
        }
      }

      // Get the predicted label from EMNIST
      let label = EMNIST_LABELS[maxIdx] || '?';
      
      // Map certain letters to math symbols
      if (LETTER_TO_SYMBOL[label]) {
        label = LETTER_TO_SYMBOL[label];
      }

      console.log(`ML prediction: ${label} (${(maxProb * 100).toFixed(1)}%) - index ${maxIdx}`);

      // If ML is confident, use it
      if (maxProb > 0.5) {
        return {
          label,
          confidence: maxProb,
        };
      }
      
      // Otherwise, if rules had a guess, use that
      if (ruleResult.confidence > 0.3) {
        return ruleResult;
      }
      
      // Default to ML result
      return { label, confidence: maxProb };
    } catch (e) {
      console.error('ML recognition failed:', e);
      // Fall through to rule-based
    }
  }
  
  // Fallback to rule-based recognition
  return ruleResult;
}

/**
 * Batch recognize multiple characters
 */
export async function recognizeCharacters(characters: Character[]): Promise<Character[]> {
  if (characters.length === 0) return [];

  const results = await Promise.all(
    characters.map(async (char) => {
      const result = await recognizeCharacter(char);
      return {
        ...char,
        recognized: result.label,
        confidence: result.confidence,
      };
    })
  );

  return results;
}

/**
 * Check if model is ready
 */
export function isModelReady(): boolean {
  return model !== null || modelLoadFailed; // Ready if model loaded OR we've fallen back to rules
}

/**
 * Check if using ML model or fallback
 */
export function isUsingMLModel(): boolean {
  return model !== null;
}
