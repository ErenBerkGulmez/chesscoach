"use client";

import { useMemo, useEffect, useState } from "react";
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

  const [mode, setMode] = useState<ExplanationMode>('NORMAL');
  const [showDeepReasoning, setShowDeepReasoning] = useState(false);

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
    <div className="glass-card p-4 flex flex-col justify-between select-none space-y-3">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧠</span>
            <div>
              <h2 className="text-xs font-bold text-text-primary">
                Chess Knowledge Coach
              </h2>
              <p className="text-[9px] text-accent font-mono font-medium">
                Deterministic • Human-Coach Engine
              </p>
            </div>
          </div>

          <div className="flex items-center bg-surface border border-border/80 rounded-md p-0.5 text-[11px]">
            <button
              onClick={() => setMode('NORMAL')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                mode === 'NORMAL'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Normal
            </button>
            <button
              onClick={() => setMode('TECHNICAL')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                mode === 'TECHNICAL'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Technical
            </button>
          </div>
        </div>

        {!report || !currentMove ? (
          <div className="text-center text-text-muted text-xs py-8">
            Select a move to see human coach annotations.
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

              <div className="border border-border/60 rounded-lg bg-surface/30 overflow-hidden">
                <button
                  onClick={() => setShowDeepReasoning(!showDeepReasoning)}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between text-[11px] font-medium text-text-muted hover:text-text-primary hover:bg-surface/50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span>🕸️</span> Causal Graph & Deep Reasoning
                  </span>
                  <span>{showDeepReasoning ? "▲" : "▼"}</span>
                </button>

                {showDeepReasoning && (
                  <div className="p-2.5 border-t border-border/40 space-y-2 text-[11px] bg-background/40">
                    <div className="space-y-1">
                      <p className="font-semibold text-text-primary text-[10px] uppercase tracking-wider">
                        Causal Chain Flow
                      </p>
                      <p className="font-mono text-[10px] text-text-secondary leading-relaxed bg-surface/80 p-2 rounded border border-border/40">
                        {report.causalChain.summaryFlowText}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-1.5 rounded bg-surface/40 border border-border/30">
                        <span className="block text-[9px] text-text-muted">Primary Concept</span>
                        <span className="font-medium text-text-primary">{report.explanationPlan.primaryConcept}</span>
                      </div>
                      <div className="p-1.5 rounded bg-surface/40 border border-border/30">
                        <span className="block text-[9px] text-text-muted">Narrative Arc</span>
                        <span className="font-medium text-text-primary">{report.narrativeState.currentArc}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {report && (
        <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] text-text-muted">
          <span>Engine: Stockfish 18 WASM</span>
          <span className="font-mono text-accent">Severity Score: {report.severity.severityScore}/100</span>
        </div>
      )}
    </div>
  );
}
