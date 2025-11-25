// Custom hook for managing the recognition engine
'use client';

import { useState, useEffect, useCallback } from 'react';
import { StrokeGroup } from '@/lib/types';
import { mockRecognize } from '@/lib/recognition';
import { loadModel, recognizeWithModel, isModelReady, getModelStatus } from '@/lib/model-manager';

export type RecognitionMode = 'mock' | 'model';

export interface UseRecognitionResult {
  recognize: (group: StrokeGroup) => Promise<string>;
  mode: RecognitionMode;
  setMode: (mode: RecognitionMode) => void;
  isLoading: boolean;
  error: string | null;
  loadModelFromUrl: (url: string) => Promise<void>;
}

export function useRecognition(initialMode: RecognitionMode = 'mock'): UseRecognitionResult {
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
          // Fall back to mock mode
          setMode('mock');
        });
    }
  }, [mode]);

  const recognize = useCallback(async (group: StrokeGroup): Promise<string> => {
    if (mode === 'model' && isModelReady()) {
      try {
        return await recognizeWithModel(group);
      } catch (err) {
        console.error('Model recognition failed, falling back to mock:', err);
        return mockRecognize(group);
      }
    }
    return mockRecognize(group);
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
