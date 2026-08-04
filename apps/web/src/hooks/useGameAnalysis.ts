import { useEffect } from 'react';
import { useAnalysisStore } from '@/stores/analysis-store';

export function useGameAnalysis() {
  const {
    currentMoveIndex,
    isExploring,
    isAnalyzing,
    moveAnalyses,
    analyzeMove,
  } = useAnalysisStore();

  useEffect(() => {
    if (
      currentMoveIndex >= 0 &&
      !isExploring &&
      !isAnalyzing &&
      !moveAnalyses[currentMoveIndex]
    ) {
      analyzeMove(currentMoveIndex);
    }
  }, [currentMoveIndex, isExploring, isAnalyzing, moveAnalyses, analyzeMove]);

  return {
    currentMoveIndex,
    isExploring,
    isAnalyzing,
    currentMoveAnalysis: moveAnalyses[currentMoveIndex] ?? null,
  };
}
