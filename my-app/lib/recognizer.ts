// Character recognizer using TensorFlow.js - INFERENCE ONLY
// Loads pre-trained model, no training on client

import * as tf from '@tensorflow/tfjs';
import { Character, MODEL_LABELS, LETTER_TO_SYMBOL } from './types';

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

  // Black background (MNIST style)
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Calculate scaling to fit character in canvas with padding
  const bbox = character.boundingBox;
  const padding = 3;
  const availableSize = CANVAS_SIZE - padding * 2;
  
  // Make sure we have valid dimensions
  const charWidth = Math.max(bbox.width, 10);
  const charHeight = Math.max(bbox.height, 10);
  
  // Scale to fit while maintaining aspect ratio
  const scale = Math.min(
    availableSize / charWidth,
    availableSize / charHeight
  );
  
  // Limit scale to reasonable range
  const finalScale = Math.min(Math.max(scale, 0.1), 2);

  // Calculate scaled dimensions
  const scaledWidth = charWidth * finalScale;
  const scaledHeight = charHeight * finalScale;

  // Center the character
  const offsetX = padding + (availableSize - scaledWidth) / 2 - bbox.minX * finalScale;
  const offsetY = padding + (availableSize - scaledHeight) / 2 - bbox.minY * finalScale;

  // Draw strokes in white (MNIST style: white on black)
  ctx.strokeStyle = 'white';
  ctx.lineWidth = Math.max(1.5, 2.5 * finalScale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of character.strokes) {
    if (stroke.points.length < 2) {
      // Draw single point as a dot
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        ctx.beginPath();
        ctx.arc(p.x * finalScale + offsetX, p.y * finalScale + offsetY, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
      }
      continue;
    }

    ctx.beginPath();
    const firstPoint = stroke.points[0];
    ctx.moveTo(firstPoint.x * finalScale + offsetX, firstPoint.y * finalScale + offsetY);

    for (let i = 1; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      ctx.lineTo(point.x * finalScale + offsetX, point.y * finalScale + offsetY);
    }
    ctx.stroke();
  }

  // Get image data - already white on black, just need grayscale
  const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const data = new Float32Array(CANVAS_SIZE * CANVAS_SIZE);

  for (let i = 0; i < CANVAS_SIZE * CANVAS_SIZE; i++) {
    // Just use red channel since it's grayscale
    data[i] = imageData.data[i * 4] / 255;
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
 * Check if a character that was recognized as '1' is actually a '/' (slash)
 * Looks at: tilt angle, aspect ratio, and comparison with neighbors
 */
function isActuallySlash(character: Character, predictedLabel: string): boolean {
  if (predictedLabel !== '1') return false;
  
  const { strokes, boundingBox: bbox } = character;
  if (strokes.length !== 1) return false;
  
  const stroke = strokes[0];
  if (stroke.points.length < 3) return false;
  
  const first = stroke.points[0];
  const last = stroke.points[stroke.points.length - 1];
  
  // Calculate the tilt angle
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  // Slash typically goes from top-right to bottom-left (angle around 110-160 degrees)
  // or bottom-left to top-right (angle around -70 to -20 degrees)
  const isForwardSlash = (angle > 100 && angle < 170) || (angle > -80 && angle < -10);
  
  // Check aspect ratio - slash is usually taller than wide but has some width
  const aspectRatio = bbox.width / Math.max(bbox.height, 1);
  const hasSlashAspect = aspectRatio > 0.2 && aspectRatio < 0.8;
  
  // Check if the stroke has significant horizontal movement (unlike a straight '1')
  const horizontalTravel = Math.abs(dx);
  const verticalTravel = Math.abs(dy);
  const hasDiagonalMovement = horizontalTravel > verticalTravel * 0.25;
  
  console.log(`Slash check: angle=${angle.toFixed(1)}°, aspect=${aspectRatio.toFixed(2)}, hTravel=${horizontalTravel.toFixed(0)}, isSlash=${isForwardSlash && hasSlashAspect && hasDiagonalMovement}`);
  
  return isForwardSlash && hasSlashAspect && hasDiagonalMovement;
}

/**
 * Check if character looks like an equals sign
 * Since the model doesn't have '=' in its training set, we use rules for this
 */
function isEqualsSign(character: Character): boolean {
  const { strokes, boundingBox: bbox } = character;
  const numStrokes = strokes.length;
  const aspectRatio = bbox.width / Math.max(bbox.height, 1);
  
  // Equals sign should have exactly 2 strokes
  if (numStrokes !== 2) return false;
  
  // Should be wider than tall
  if (aspectRatio < 1.2) return false;
  
  // Both strokes should be horizontal
  for (const stroke of strokes) {
    if (stroke.points.length < 2) return false;
    const first = stroke.points[0];
    const last = stroke.points[stroke.points.length - 1];
    const dx = Math.abs(last.x - first.x);
    const dy = Math.abs(last.y - first.y);
    
    // Stroke should be mostly horizontal
    if (dy > dx * 0.5) return false;
  }
  
  // Check that the two strokes are stacked vertically
  const stroke1Center = (strokes[0].boundingBox.minY + strokes[0].boundingBox.maxY) / 2;
  const stroke2Center = (strokes[1].boundingBox.minY + strokes[1].boundingBox.maxY) / 2;
  const verticalGap = Math.abs(stroke1Center - stroke2Center);
  
  // Gap should be reasonable (not too big, not too small)
  if (verticalGap < 5 || verticalGap > bbox.height) return false;
  
  return true;
}

/**
 * Recognize a character using the ML model or fallback to rules
 */
export async function recognizeCharacter(character: Character): Promise<{ label: string; confidence: number }> {
  // First check for equals sign since the model doesn't have it
  if (isEqualsSign(character)) {
    console.log('Rule-based: = (equals sign detected)');
    return { label: '=', confidence: 0.85 };
  }
  
  // Try to load model if not already attempted
  const modelAvailable = await initializeModel();
  
  // If model loaded successfully, use it
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

      // Get the predicted label from model
      let label = MODEL_LABELS[maxIdx] || '?';
      
      // Post-processing: check if '1' is actually '/'
      if (isActuallySlash(character, label)) {
        console.log('Post-process: Correcting 1 → / (slash detected by angle)');
        label = '/';
      }
      
      // Map certain characters if needed
      if (LETTER_TO_SYMBOL[label]) {
        label = LETTER_TO_SYMBOL[label];
      }

      console.log(`ML prediction: ${label} (${(maxProb * 100).toFixed(1)}%) - index ${maxIdx}`);

      return {
        label,
        confidence: maxProb,
      };
    } catch (e) {
      console.error('ML recognition failed:', e);
    }
  }
  
  // Fallback to rule-based recognition
  const ruleResult = recognizeWithRules(character);
  console.log(`Rule-based: ${ruleResult.label} (${(ruleResult.confidence * 100).toFixed(0)}%)`);
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
