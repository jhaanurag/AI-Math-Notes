// Data Pipeline: Convert stroke groups to tensors for neural network recognition

import { StrokeGroup, BoundingBox, Point } from './types';
import { padBoundingBox } from './stroke-utils';

// TensorFlow.js types - will be dynamically imported
type Tensor = {
  dispose: () => void;
  dataSync: () => Float32Array | Int32Array | Uint8Array;
  shape: number[];
};

type TensorFlow = {
  browser: {
    fromPixels: (
      pixels: HTMLCanvasElement | ImageData,
      numChannels?: number
    ) => Tensor;
  };
  image: {
    resizeBilinear: (images: Tensor, size: [number, number]) => Tensor;
  };
  mean: (x: Tensor, axis?: number | number[]) => Tensor;
  expandDims: (x: Tensor, axis?: number) => Tensor;
  div: (a: Tensor, b: number | Tensor) => Tensor;
  sub: (a: Tensor, b: number | Tensor) => Tensor;
  cast: (x: Tensor, dtype: string) => Tensor;
  tidy: <T>(fn: () => T) => T;
  dispose: (tensor: Tensor) => void;
};

/**
 * Extract the image data for a specific group from the canvas
 * Returns an ImageData object containing only the strokes in the group
 */
export function extractGroupImageData(
  canvas: HTMLCanvasElement,
  group: StrokeGroup,
  padding: number = 20
): ImageData | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const paddedBox = padBoundingBox(group.boundingBox, padding);
  const dpr = window.devicePixelRatio || 1;

  // Clamp to canvas bounds
  const x = Math.max(0, Math.floor(paddedBox.minX * dpr));
  const y = Math.max(0, Math.floor(paddedBox.minY * dpr));
  const width = Math.min(
    canvas.width - x,
    Math.ceil((paddedBox.maxX - paddedBox.minX + 2 * padding) * dpr)
  );
  const height = Math.min(
    canvas.height - y,
    Math.ceil((paddedBox.maxY - paddedBox.minY + 2 * padding) * dpr)
  );

  if (width <= 0 || height <= 0) return null;

  return ctx.getImageData(x, y, width, height);
}

/**
 * Create a clean canvas containing only the strokes from a specific group
 * This ensures we don't include other groups' strokes
 */
export function createGroupCanvas(
  group: StrokeGroup,
  targetSize: number = 28,
  padding: number = 4
): HTMLCanvasElement {
  // Calculate the size needed
  const box = group.boundingBox;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;

  // Create a canvas just for this group
  const groupCanvas = document.createElement('canvas');
  const scale = Math.min(
    (targetSize - 2 * padding) / Math.max(width, 1),
    (targetSize - 2 * padding) / Math.max(height, 1)
  );

  groupCanvas.width = targetSize;
  groupCanvas.height = targetSize;

  const ctx = groupCanvas.getContext('2d');
  if (!ctx) return groupCanvas;

  // Fill with black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, targetSize, targetSize);

  // Calculate offset to center the content
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const offsetX = (targetSize - scaledWidth) / 2;
  const offsetY = (targetSize - scaledHeight) / 2;

  // Draw strokes in white
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, 2 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  group.strokes.forEach((stroke) => {
    if (stroke.points.length < 2) return;

    ctx.beginPath();
    const startPoint = stroke.points[0];
    ctx.moveTo(
      (startPoint.x - box.minX) * scale + offsetX,
      (startPoint.y - box.minY) * scale + offsetY
    );

    for (let i = 1; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      ctx.lineTo(
        (point.x - box.minX) * scale + offsetX,
        (point.y - box.minY) * scale + offsetY
      );
    }

    ctx.stroke();
  });

  return groupCanvas;
}

/**
 * Segment a group into individual character bounding boxes
 * Uses vertical histogram projection to find character boundaries
 */
export function segmentGroupIntoCharacters(
  group: StrokeGroup,
  minGap: number = 15
): BoundingBox[] {
  const boxes = group.strokes.map((s) => s.boundingBox);

  if (boxes.length === 0) return [];

  // Sort strokes by horizontal position (left to right)
  const sortedBoxes = boxes.slice().sort((a, b) => a.minX - b.minX);

  // Merge overlapping/close bounding boxes into character regions
  const merged: BoundingBox[] = [];
  let current = { ...sortedBoxes[0] };

  for (let i = 1; i < sortedBoxes.length; i++) {
    const box = sortedBoxes[i];

    // Check if this box overlaps or is close to the current merged box
    if (box.minX <= current.maxX + minGap) {
      // Merge
      current = {
        minX: Math.min(current.minX, box.minX),
        minY: Math.min(current.minY, box.minY),
        maxX: Math.max(current.maxX, box.maxX),
        maxY: Math.max(current.maxY, box.maxY),
      };
    } else {
      // Start new character region
      merged.push(current);
      current = { ...box };
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Create individual character canvases from a group
 */
export function createCharacterCanvases(
  group: StrokeGroup,
  targetSize: number = 28,
  padding: number = 4
): HTMLCanvasElement[] {
  const characterBoxes = segmentGroupIntoCharacters(group);
  const canvases: HTMLCanvasElement[] = [];

  for (const box of characterBoxes) {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // Fill with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetSize, targetSize);

    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;

    // Calculate scale to fit in target size with padding
    const scale = Math.min(
      (targetSize - 2 * padding) / Math.max(width, 1),
      (targetSize - 2 * padding) / Math.max(height, 1)
    );

    // Calculate offset to center
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const offsetX = (targetSize - scaledWidth) / 2;
    const offsetY = (targetSize - scaledHeight) / 2;

    // Draw strokes that are within this character's bounding box
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    group.strokes.forEach((stroke) => {
      // Check if this stroke overlaps with the character box
      const strokeBox = stroke.boundingBox;
      const overlaps =
        strokeBox.minX <= box.maxX + 5 &&
        strokeBox.maxX >= box.minX - 5 &&
        strokeBox.minY <= box.maxY + 5 &&
        strokeBox.maxY >= box.minY - 5;

      if (!overlaps || stroke.points.length < 2) return;

      ctx.beginPath();
      const startPoint = stroke.points[0];
      ctx.moveTo(
        (startPoint.x - box.minX) * scale + offsetX,
        (startPoint.y - box.minY) * scale + offsetY
      );

      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i];
        ctx.lineTo(
          (point.x - box.minX) * scale + offsetX,
          (point.y - box.minY) * scale + offsetY
        );
      }

      ctx.stroke();
    });

    canvases.push(canvas);
  }

  return canvases;
}

/**
 * Convert a canvas to a tensor suitable for MNIST-style models
 * Output shape: [1, 28, 28, 1] (batch, height, width, channels)
 */
export async function canvasToTensor(
  canvas: HTMLCanvasElement,
  tf: TensorFlow
): Promise<Tensor> {
  return tf.tidy(() => {
    // Get tensor from canvas (shape: [height, width, 4] for RGBA)
    let tensor = tf.browser.fromPixels(canvas, 1); // Grayscale

    // Normalize to [0, 1]
    tensor = tf.div(tensor, 255.0);

    // Add batch dimension [1, height, width, 1]
    tensor = tf.expandDims(tensor, 0);

    return tensor;
  });
}

/**
 * Convert a group to multiple tensors (one per character)
 * for recognition by a neural network
 */
export async function convertGroupToImageTensors(
  group: StrokeGroup,
  tf: TensorFlow,
  targetSize: number = 28
): Promise<{ tensors: Tensor[]; canvases: HTMLCanvasElement[] }> {
  const canvases = createCharacterCanvases(group, targetSize);
  const tensors: Tensor[] = [];

  for (const canvas of canvases) {
    const tensor = await canvasToTensor(canvas, tf);
    tensors.push(tensor);
  }

  return { tensors, canvases };
}

/**
 * Debug: Display a canvas in a popup for visual verification
 */
export function debugDisplayCanvas(canvas: HTMLCanvasElement, title: string = 'Debug'): void {
  const dataUrl = canvas.toDataURL();
  console.log(`${title}:`, dataUrl);

  // Create a debug overlay element
  const existing = document.getElementById('debug-canvas-preview');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'debug-canvas-preview';
  container.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    background: rgba(0,0,0,0.9);
    padding: 10px;
    border-radius: 8px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 5px;
  `;

  const label = document.createElement('div');
  label.textContent = title;
  label.style.cssText = 'color: white; font-size: 12px;';
  container.appendChild(label);

  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.cssText = `
    width: 112px;
    height: 112px;
    image-rendering: pixelated;
    border: 1px solid #444;
  `;
  container.appendChild(img);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'padding: 5px; cursor: pointer;';
  closeBtn.onclick = () => container.remove();
  container.appendChild(closeBtn);

  document.body.appendChild(container);

  // Auto-remove after 5 seconds
  setTimeout(() => container.remove(), 5000);
}
