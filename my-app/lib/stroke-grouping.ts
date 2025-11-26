// Stroke grouping logic - groups strokes into characters based on spatial proximity and timing

import { Stroke, Character, BoundingBox } from './types';
import { 
  shouldGroupStrokes, 
  mergeBoundingBoxes, 
  generateId 
} from './geometry';

/**
 * Groups strokes into characters using spatial clustering
 * This is the key algorithm that determines which strokes form a single character
 */
export function groupStrokesIntoCharacters(strokes: Stroke[]): Character[] {
  if (strokes.length === 0) return [];

  // Use Union-Find to group strokes
  const parent: number[] = strokes.map((_, i) => i);
  
  function find(i: number): number {
    if (parent[i] !== i) {
      parent[i] = find(parent[i]);
    }
    return parent[i];
  }
  
  function union(i: number, j: number): void {
    const pi = find(i);
    const pj = find(j);
    if (pi !== pj) {
      parent[pi] = pj;
    }
  }

  // Compare all stroke pairs and group overlapping ones
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      if (shouldGroupStrokes(strokes[i], strokes[j])) {
        union(i, j);
      }
    }
  }

  // Collect groups
  const groups: Map<number, Stroke[]> = new Map();
  for (let i = 0; i < strokes.length; i++) {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(strokes[i]);
  }

  // Convert groups to characters
  const characters: Character[] = [];
  for (const strokeGroup of groups.values()) {
    const boundingBoxes = strokeGroup.map(s => s.boundingBox);
    const mergedBox = mergeBoundingBoxes(boundingBoxes);
    
    characters.push({
      id: generateId(),
      strokes: strokeGroup,
      boundingBox: mergedBox,
      recognized: null,
      confidence: 0,
    });
  }

  return characters;
}

/**
 * Update character groupings when a new stroke is added
 * More efficient than regrouping everything
 */
export function addStrokeToCharacters(
  existingCharacters: Character[],
  newStroke: Stroke
): Character[] {
  // Find which existing characters the new stroke overlaps with
  const overlappingIndices: number[] = [];
  
  for (let i = 0; i < existingCharacters.length; i++) {
    const char = existingCharacters[i];
    // Check if new stroke should be grouped with any stroke in this character
    for (const existingStroke of char.strokes) {
      if (shouldGroupStrokes(existingStroke, newStroke)) {
        overlappingIndices.push(i);
        break;
      }
    }
  }

  if (overlappingIndices.length === 0) {
    // New stroke forms a new character
    return [
      ...existingCharacters,
      {
        id: generateId(),
        strokes: [newStroke],
        boundingBox: newStroke.boundingBox,
        recognized: null,
        confidence: 0,
      },
    ];
  }

  if (overlappingIndices.length === 1) {
    // Add stroke to existing character
    const idx = overlappingIndices[0];
    const updated = [...existingCharacters];
    const char = updated[idx];
    const newStrokes = [...char.strokes, newStroke];
    const newBoundingBox = mergeBoundingBoxes(newStrokes.map(s => s.boundingBox));
    
    updated[idx] = {
      ...char,
      strokes: newStrokes,
      boundingBox: newBoundingBox,
      recognized: null, // Reset recognition since character changed
      confidence: 0,
    };
    
    return updated;
  }

  // Multiple overlaps - merge characters
  const mergedStrokes: Stroke[] = [newStroke];
  const remainingCharacters: Character[] = [];
  
  for (let i = 0; i < existingCharacters.length; i++) {
    if (overlappingIndices.includes(i)) {
      mergedStrokes.push(...existingCharacters[i].strokes);
    } else {
      remainingCharacters.push(existingCharacters[i]);
    }
  }

  const mergedBoundingBox = mergeBoundingBoxes(mergedStrokes.map(s => s.boundingBox));
  
  return [
    ...remainingCharacters,
    {
      id: generateId(),
      strokes: mergedStrokes,
      boundingBox: mergedBoundingBox,
      recognized: null,
      confidence: 0,
    },
  ];
}

/**
 * Check if enough time has passed to consider a character "complete"
 * Used to trigger recognition
 */
export function isCharacterComplete(character: Character, currentTime: number, threshold: number = 500): boolean {
  if (character.strokes.length === 0) return false;
  
  const lastStrokeTime = Math.max(
    ...character.strokes.map(s => s.points[s.points.length - 1]?.timestamp || 0)
  );
  
  return currentTime - lastStrokeTime > threshold;
}
