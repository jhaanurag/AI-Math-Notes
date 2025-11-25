// Custom hook for managing the recognition engine
'use client';

import { useState, useEffect, useCallback } from 'react';
import { StrokeGroup } from '@/lib/types';
import { smartRecognize } from '@/lib/smart-recognition';
import { loadModel, recognizeWithModel, isModelReady } from '@/lib/model-manager';

export type RecognitionMode = 'smart' | 'model';

export interface UseRecognitionResult {
  recognize: (group: StrokeGroup) => Promise<string>;
  mode: RecognitionMode;
  setMode: (mode: RecognitionMode) => void;
  isLoading: boolean;
  error: string | null;
  loadModelFromUrl: (url: string) => Promise<void>;
}

export function useRecognition(initialMode: RecognitionMode = 'smart'): UseRecognitionResult {
  const [mode, setMode] = useState<RecognitionMode>(initialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load model when switching to model mode
  useEffect(() => {
    if (mode === 'model' && !isModelReady()) {
      setIsLoading(true);
      setError(null);
      
      loadModel()
        .then(() => {
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'Failed to load model');
          setIsLoading(false);
          // Fall back to smart mode
          setMode('smart');
        });
    }
  }, [mode]);

  const recognize = useCallback(async (group: StrokeGroup): Promise<string> => {
    if (mode === 'model' && isModelReady()) {
      try {
        return await recognizeWithModel(group);
      } catch (err) {
        console.error('Model recognition failed, falling back to smart:', err);
        return smartRecognize(group);
      }
    }
    return smartRecognize(group);
  }, [mode]);

  const loadModelFromUrl = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await loadModel(url);
      setMode('model');
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model');
      setIsLoading(false);
    }
  }, []);

  return {
    recognize,
    mode,
    setMode,
    isLoading,
    error,
    loadModelFromUrl,
  };
}
