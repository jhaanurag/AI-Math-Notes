// Character recognizer using TensorFlow.js with optional Tesseract.js fallback
// Loads pre-trained model, no training on client

import * as tf from '@tensorflow/tfjs';
import { Character, MODEL_LABELS, LETTER_TO_SYMBOL } from './types';

const CANVAS_SIZE = 28;

let model: tf.LayersModel | null = null;
let isModelLoading = false;
let modelLoadPromise: Promise<boolean> | null = null;
let modelLoadFailed = false;

// Tesseract worker (lazy loaded)
let tesseractWorker: any = null;
let tesseractLoading = false;
let useTesseract = false;

/**
 * Initialize the TensorFlow model
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
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('TensorFlow.js backend:', tf.getBackend());
      
      console.log('Loading model from /model/model.json...');
      model = await tf.loadLayersModel('/model/model.json');
      console.log('✅ Loaded pre-trained model');
      isModelLoading = false;
      return true;
    } catch (e) {
      console.error('❌ Model loading failed:', e);
      modelLoadFailed = true;
      isModelLoading = false;
      return false;
    }
  })();

  return modelLoadPromise;
}

/**
 * Initialize Tesseract.js worker for OCR fallback
 */
async function initTesseract(): Promise<boolean> {
  if (tesseractWorker) return true;
  if (tesseractLoading) return false;
  
  tesseractLoading = true;
  
  try {
    const Tesseract = await import('tesseract.js');
    tesseractWorker = await Tesseract.createWorker('eng', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          console.log(`Tesseract: ${(m.progress * 100).toFixed(0)}%`);
        }
      }
    });
    
    await tesseractWorker.setParameters({
      tessedit_char_whitelist: '0123456789+-*/=().',
    });
    
    console.log('✅ Tesseract.js initialized');
    tesseractLoading = false;
    return true;
  } catch (e) {
    console.error('❌ Tesseract.js not available:', e);
    tesseractLoading = false;
    return false;
  }
}

/**
 * Enable/disable Tesseract OCR fallback
 */
export function setUseTesseract(enabled: boolean) {
  useTesseract = enabled;
  if (enabled) initTesseract();
}

export function isTesseractEnabled(): boolean {
  return useTesseract;
}

/**
 * Convert character strokes to 28x28 image for ML model
 */
function characterToImageData(character: Character): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const bbox = character.boundingBox;
  const padding = 3;
  const availableSize = CANVAS_SIZE - padding * 2;
  
  const charWidth = Math.max(bbox.width, 10);
  const charHeight = Math.max(bbox.height, 10);
  
  const scale = Math.min(availableSize / charWidth, availableSize / charHeight);
  const finalScale = Math.min(Math.max(scale, 0.1), 2);

  const scaledWidth = charWidth * finalScale;
  const scaledHeight = charHeight * finalScale;

  const offsetX = padding + (availableSize - scaledWidth) / 2 - bbox.minX * finalScale;
  const offsetY = padding + (availableSize - scaledHeight) / 2 - bbox.minY * finalScale;

  ctx.strokeStyle = 'white';
  ctx.lineWidth = Math.max(1.5, 2.5 * finalScale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of character.strokes) {
    if (stroke.points.length < 2) {
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
    ctx.moveTo(stroke.points[0].x * finalScale + offsetX, stroke.points[0].y * finalScale + offsetY);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * finalScale + offsetX, stroke.points[i].y * finalScale + offsetY);
    }
    ctx.stroke();
  }

  const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const data = new Float32Array(CANVAS_SIZE * CANVAS_SIZE);
  for (let i = 0; i < CANVAS_SIZE * CANVAS_SIZE; i++) {
    data[i] = imageData.data[i * 4] / 255;
  }
  
  // Debug: show what the model sees
  if (debugCanvas) {
    const debugCtx = debugCanvas.getContext('2d');
    if (debugCtx) {
      debugCtx.putImageData(imageData, 0, 0);
    }
  }
  
  return data;
}

// Debug canvas to visualize model input
let debugCanvas: HTMLCanvasElement | null = null;

export function setDebugCanvas(canvas: HTMLCanvasElement | null) {
  debugCanvas = canvas;
}

/**
 * Convert character to larger canvas for Tesseract OCR
 */
function characterToOCRCanvas(character: Character): HTMLCanvasElement {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const bbox = character.boundingBox;
  const padding = 8;
  const availableSize = SIZE - padding * 2;
  
  const charWidth = Math.max(bbox.width, 10);
  const charHeight = Math.max(bbox.height, 10);
  
  const scale = Math.min(availableSize / charWidth, availableSize / charHeight);
  const finalScale = Math.min(Math.max(scale, 0.1), 3);

  const offsetX = padding + (availableSize - charWidth * finalScale) / 2 - bbox.minX * finalScale;
  const offsetY = padding + (availableSize - charHeight * finalScale) / 2 - bbox.minY * finalScale;

  ctx.strokeStyle = 'black';
  ctx.lineWidth = Math.max(2, 3 * finalScale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of character.strokes) {
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * finalScale + offsetX, stroke.points[0].y * finalScale + offsetY);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * finalScale + offsetX, stroke.points[i].y * finalScale + offsetY);
    }
    ctx.stroke();
  }

  return canvas;
}

/**
 * Recognize with Tesseract OCR
 */
async function recognizeWithTesseract(character: Character): Promise<{ label: string; confidence: number } | null> {
  if (!tesseractWorker) {
    const loaded = await initTesseract();
    if (!loaded) return null;
  }
  
  try {
    const canvas = characterToOCRCanvas(character);
    const { data } = await tesseractWorker.recognize(canvas);
    
    const text = data.text.trim();
    const confidence = data.confidence / 100;
    
    console.log(`Tesseract: "${text}" (${(confidence * 100).toFixed(0)}%)`);
    
    if (text.length === 1 && confidence > 0.3) {
      return { label: text, confidence };
    }
    return null;
  } catch (e) {
    console.error('Tesseract failed:', e);
    return null;
  }
}

/**
 * Simple rule-based fallback for operators
 */
function recognizeWithRules(character: Character): { label: string; confidence: number } {
  const { strokes, boundingBox: bbox } = character;
  const numStrokes = strokes.length;
  const aspectRatio = bbox.width / Math.max(bbox.height, 1);
  
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
  
  if (numStrokes === 2 && hasHorizontal && !hasVertical && aspectRatio > 1.5) {
    return { label: '=', confidence: 0.8 };
  }
  if (numStrokes === 2 && hasHorizontal && hasVertical) {
    return { label: '+', confidence: 0.75 };
  }
  if (numStrokes === 1 && hasHorizontal && !hasVertical && aspectRatio > 2) {
    return { label: '-', confidence: 0.7 };
  }
  if (numStrokes === 1 && hasDiagonal && !hasHorizontal && !hasVertical) {
    return { label: '/', confidence: 0.6 };
  }
  if (numStrokes === 2 && hasDiagonal && !hasHorizontal && !hasVertical) {
    return { label: '×', confidence: 0.6 };
  }
  
  return { label: '?', confidence: 0.1 };
}

/**
 * Check if '1' is actually '/' (slash)
 */
function isActuallySlash(character: Character, predictedLabel: string): boolean {
  if (predictedLabel !== '1') return false;
  
  const { strokes, boundingBox: bbox } = character;
  if (strokes.length !== 1) return false;
  
  const stroke = strokes[0];
  if (stroke.points.length < 3) return false;
  
  const first = stroke.points[0];
  const last = stroke.points[stroke.points.length - 1];
  
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  const isForwardSlash = (angle > 100 && angle < 170) || (angle > -80 && angle < -10);
  const aspectRatio = bbox.width / Math.max(bbox.height, 1);
  const hasSlashAspect = aspectRatio > 0.2 && aspectRatio < 0.8;
  const hasDiagonalMovement = Math.abs(dx) > Math.abs(dy) * 0.25;
  
  return isForwardSlash && hasSlashAspect && hasDiagonalMovement;
}

/**
 * Check if character is equals sign
 */
function isEqualsSign(character: Character): boolean {
  const { strokes, boundingBox: bbox } = character;
  if (strokes.length !== 2) return false;
  
  const aspectRatio = bbox.width / Math.max(bbox.height, 1);
  if (aspectRatio < 1.2) return false;
  
  for (const stroke of strokes) {
    if (stroke.points.length < 2) return false;
    const first = stroke.points[0];
    const last = stroke.points[stroke.points.length - 1];
    const dx = Math.abs(last.x - first.x);
    const dy = Math.abs(last.y - first.y);
    if (dy > dx * 0.5) return false;
  }
  
  const stroke1Center = (strokes[0].boundingBox.minY + strokes[0].boundingBox.maxY) / 2;
  const stroke2Center = (strokes[1].boundingBox.minY + strokes[1].boundingBox.maxY) / 2;
  const verticalGap = Math.abs(stroke1Center - stroke2Center);
  
  return verticalGap >= 5 && verticalGap <= bbox.height;
}

/**
 * Main recognition function
 */
export async function recognizeCharacter(character: Character): Promise<{ label: string; confidence: number }> {
  // Check for equals sign first (model doesn't have it)
  if (isEqualsSign(character)) {
    console.log('Rule-based: = (equals sign)');
    return { label: '=', confidence: 0.85 };
  }
  
  // If Tesseract mode is ON, use ONLY Tesseract (no ML)
  if (useTesseract) {
    const ocrResult = await recognizeWithTesseract(character);
    if (ocrResult) {
      // Post-process: check if '1' is actually '/'
      if (isActuallySlash(character, ocrResult.label)) {
        console.log('Post-process: 1 → /');
        return { label: '/', confidence: ocrResult.confidence };
      }
      return ocrResult;
    }
    // Fallback to rules if Tesseract fails
    return recognizeWithRules(character);
  }
  
  // Otherwise use ML model
  const modelAvailable = await initializeModel();
  
  if (modelAvailable && model) {
    try {
      const imageData = characterToImageData(character);
      const tensor = tf.tensor4d(imageData, [1, CANVAS_SIZE, CANVAS_SIZE, 1]);
      
      const prediction = model.predict(tensor) as tf.Tensor;
      const probabilities = await prediction.data();
      
      tensor.dispose();
      prediction.dispose();

      let maxIdx = 0;
      let maxProb = probabilities[0];
      for (let i = 1; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIdx = i;
        }
      }

      let label = MODEL_LABELS[maxIdx] || '?';
      
      // Only post-processing: check if '1' is actually '/'
      if (isActuallySlash(character, label)) {
        console.log('Post-process: 1 → /');
        label = '/';
      }
      
      if (LETTER_TO_SYMBOL[label]) {
        label = LETTER_TO_SYMBOL[label];
      }

      console.log(`ML: ${label} (${(maxProb * 100).toFixed(1)}%)`);

      // Characters that Tesseract handles better - verify with OCR if confidence is low
      const tesseractBetterFor = ['7', '2', '9'];
      if (tesseractBetterFor.includes(label) && maxProb < 0.8) {
        const ocrResult = await recognizeWithTesseract(character);
        if (ocrResult && ocrResult.label !== label) {
          console.log(`Hybrid: ML said ${label}, Tesseract says ${ocrResult.label} - using Tesseract`);
          return ocrResult;
        }
      }

      return { label, confidence: maxProb };
    } catch (e) {
      console.error('ML failed:', e);
    }
  }
  
  // Final fallback
  return recognizeWithRules(character);
}

export async function recognizeCharacters(characters: Character[]): Promise<Character[]> {
  return Promise.all(
    characters.map(async (char) => {
      const result = await recognizeCharacter(char);
      return { ...char, recognized: result.label, confidence: result.confidence };
    })
  );
}

export function isModelReady(): boolean {
  return model !== null || modelLoadFailed;
}

export function isUsingMLModel(): boolean {
  return model !== null;
}
