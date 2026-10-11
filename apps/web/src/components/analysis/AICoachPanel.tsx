"use client";

import { useMemo, useEffect } from "react";
import { useAnalysisStore } from "@/stores/analysis-store";
import { MoveClassification } from "@/types/chess";
import { knowledgeEngine, FullMoveKnowledgeReport } from "@/lib/engine/knowledge-engine";
import { ExplanationMode } from "@/lib/engine/explanation-flow-nlg";
import { motion, AnimatePresence } from "framer-motion";

export default function AICoachPanel() {
  const {
    currentMoveIndex,
    moves,
    moveAnalyses,
    currentGame,
    isExploring,
    isAnalyzing,
    analyzeMove,
  } = useAnalysisStore();

  const mode: ExplanationMode = 'NORMAL';

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

  const currentMove = currentMoveIndex < 0 ? null : moves[currentMoveIndex] ?? null;
  const currentAnalysis = currentMoveIndex < 0 ? null : moveAnalyses[currentMoveIndex] ?? null;

  const report: FullMoveKnowledgeReport | null = useMemo(() => {
    if (!currentAnalysis) return null;
    return knowledgeEngine.analyzeMove(
      currentAnalysis,
      mode,
      currentGame?.openingName,
      moveAnalyses,
      currentGame?.id || 'game'
    );
  }, [currentAnalysis, mode, currentGame?.openingName, currentGame?.id, moveAnalyses]);

  return (
    <div className="glass-card p-4">
      <div>
        <h2 className="text-xs font-semibold text-text-muted pb-2">Coach</h2>

        {!report || !currentMove ? (
          <div className="text-center text-text-muted text-xs py-8">
            Pick a move to see what the coach says about it.
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentMoveIndex}-${mode}`}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="space-y-3 text-xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-text-primary">
                    {report.v2Explanation.headline}
                  </h3>
                  <span className="text-[10px] font-mono text-text-muted">
                    {report.analysis.sanMove}
                  </span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed bg-surface/60 border border-border/80 rounded-lg p-2.5 whitespace-pre-line">
                  {report.v2Explanation.body}
                </p>
              </div>

              {report.forcingReply && report.forcingReply.concreteDescription && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5 text-xs text-amber-400 space-y-1">
                  <p className="font-bold text-[11px] flex items-center gap-1">
                    <span>⚡ Critical Opponent Response</span>
                  </p>
                  <p className="text-[11px] text-text-secondary leading-normal">
                    {report.forcingReply.concreteDescription}
                  </p>
                </div>
              )}

              {report.candidateStory &&
                report.analysis.classification !== MoveClassification.BEST &&
                report.analysis.classification !== MoveClassification.GREAT &&
                report.analysis.classification !== MoveClassification.BRILLIANT && (
                  <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-2.5 text-xs text-emerald-400 space-y-1">
                    <p className="font-bold text-[11px] flex items-center gap-1">
                      <span>💡 Best Alternative: {report.candidateStory.bestMoveSan}</span>
                    </p>
                    <p className="text-[11px] text-text-secondary leading-normal">
                      {report.candidateStory.immediateChange} {report.candidateStory.shortTermPlan}
                    </p>
                  </div>
                )}

            </motion.div>
          </AnimatePresence>
        )}
      </div>

    </div>
  );
}
