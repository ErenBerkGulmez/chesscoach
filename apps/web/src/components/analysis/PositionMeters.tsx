"use client";

import { useMemo } from "react";
import { useAnalysisStore } from "@/stores/analysis-store";
import { knowledgeEngine } from "@/lib/engine/knowledge-engine";

export default function PositionMeters() {
  const { currentMoveIndex, moveAnalyses, currentGame } = useAnalysisStore();

  const currentAnalysis = currentMoveIndex < 0 ? null : moveAnalyses[currentMoveIndex] ?? null;

  const meters = useMemo(() => {
    if (!currentAnalysis) return null;
    const report = knowledgeEngine.analyzeMove(
      currentAnalysis,
      'NORMAL',
      currentGame?.openingName,
      moveAnalyses
    );

    const wSafety = Math.max(0, 100 - report.kingSafetyDetails.whiteKingDangerScore);
    const bSafety = Math.max(0, 100 - report.kingSafetyDetails.blackKingDangerScore);
    const wActivity = Math.min(100, Math.max(10, report.pieceDetails.whiteMobilityTotal * 3));
    const bActivity = Math.min(100, Math.max(10, report.pieceDetails.blackMobilityTotal * 3));

    return {
      wSafety,
      bSafety,
      wActivity,
      bActivity,
      advantage: report.materialDetails.imbalanceDescription,
    };
  }, [currentAnalysis, currentGame?.openingName, moveAnalyses]);

  if (!meters) return null;

  return (
    <div className="glass-card p-3 space-y-2.5 text-xs select-none">
      <div className="flex items-center justify-between border-b border-border pb-1.5">
        <span className="font-semibold text-text-primary">Positional Metrics</span>
        <span className="text-[10px] text-text-muted">{meters.advantage}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* White Metrics */}
        <div className="space-y-1.5 bg-surface/40 p-2 rounded border border-border/40">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-text-secondary">⚪ White Safety</span>
            <span className="font-mono text-text-primary">{meters.wSafety}%</span>
          </div>
          <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${meters.wSafety}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1">
            <span className="font-medium text-text-secondary">⚪ White Activity</span>
            <span className="font-mono text-text-primary">{meters.wActivity}%</span>
          </div>
          <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${meters.wActivity}%` }}
            />
          </div>
        </div>

        {/* Black Metrics */}
        <div className="space-y-1.5 bg-surface/40 p-2 rounded border border-border/40">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-text-secondary">⚫ Black Safety</span>
            <span className="font-mono text-text-primary">{meters.bSafety}%</span>
          </div>
          <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${meters.bSafety}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1">
            <span className="font-medium text-text-secondary">⚫ Black Activity</span>
            <span className="font-mono text-text-primary">{meters.bActivity}%</span>
          </div>
          <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${meters.bActivity}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
