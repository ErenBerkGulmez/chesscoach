"use client";

import { useMemo } from "react";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useShallow } from "zustand/react/shallow";
import { formatEval } from "@/lib/stockfish/engine";
import { Chess } from "chess.js";

export default function EngineLines() {
  const { currentMoveIndex, moveAnalyses, isExploring, explorationIndex, explorationMoves, startExploration, stepForwardExploration, stepBackwardExploration, exitExploration } = useAnalysisStore(
    useShallow((s) => ({ currentMoveIndex: s.currentMoveIndex, moveAnalyses: s.moveAnalyses, isExploring: s.isExploring, explorationIndex: s.explorationIndex, explorationMoves: s.explorationMoves, startExploration: s.startExploration, stepForwardExploration: s.stepForwardExploration, stepBackwardExploration: s.stepBackwardExploration, exitExploration: s.exitExploration }))
  );

  const currentAnalysis =
    currentMoveIndex < 0 ? null : moveAnalyses[currentMoveIndex] ?? null;

  const lines = useMemo(() => {
    if (!currentAnalysis?.pvLines) return [];

    return currentAnalysis.pvLines.map((line, idx) => {
      const fenBefore = currentAnalysis.fenBefore;
      const sanMoves = uciPvToSan(fenBefore, line.pv);

      return {
        rank: idx + 1,
        score: line.score,
        mate: line.mate ?? null,
        depth: line.depth,
        moves: sanMoves.length > 0 ? sanMoves : line.pv,
        fenBefore,
      };
    });
  }, [currentAnalysis]);

  if (!currentAnalysis || lines.length === 0) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-text-muted">
            Engine lines
          </span>
        </div>
        <p className="text-xs text-text-muted text-center py-4">
          Navigate to a move to see engine analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-muted">
          Engine lines
        </span>
        <span className="text-[10px] text-text-muted font-mono">
          depth {currentAnalysis.pvLines[0]?.depth ?? "?"}
        </span>
      </div>

      {isExploring && (
        <div className="bg-accent/15 border border-accent/30 rounded p-2 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-accent">
            <span>Exploring:</span>
            <span className="font-bold truncate max-w-[180px]">
              {explorationMoves.slice(0, explorationIndex + 1).join(" ")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={stepBackwardExploration}
              className="px-2 py-0.5 bg-surface border border-border rounded text-[10px] hover:bg-surface-hover"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={stepForwardExploration}
              className="px-2 py-0.5 bg-surface border border-border rounded text-[10px] hover:bg-surface-hover"
            >
              Next →
            </button>
            <button
              type="button"
              onClick={exitExploration}
              className="px-2 py-0.5 bg-blunder/20 border border-blunder/30 text-blunder rounded text-[10px] font-bold"
            >
              ✕ Exit
            </button>
          </div>
        </div>
      )}
        <div className="space-y-1.5">
          {lines.map((line) => (
            <div
              key={`${line.rank}-${line.score}`}
              className="flex items-start gap-2 group"
            >
              <div
                className={`flex-shrink-0 w-14 text-center py-1 rounded text-xs font-bold font-mono ${
                  getScoreStyle(line.score, line.mate)
                }`}
              >
                {formatEval(line.score, line.mate)}
              </div>

              <div className="flex-1 text-xs text-text-secondary font-mono leading-relaxed overflow-hidden">
                <div className="flex flex-wrap gap-1">
                  {line.moves.slice(0, 8).map((m, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        startExploration(line.moves.slice(0, i + 1), line.fenBefore)
                      }
                      className="hover:text-accent hover:underline cursor-pointer transition-colors px-0.5 rounded hover:bg-surface"
                    >
                      {m}
                    </button>
                  ))}
                  {line.moves.length > 8 && (
                    <span className="text-text-muted"> …</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
    </div>
  );
}

function getScoreStyle(score: number, mate: number | null): string {
  if (mate !== null) {
    return mate > 0
      ? "bg-white/10 text-white"
      : "bg-gray-900/80 text-gray-400";
  }
  if (score > 100) return "bg-white/10 text-white";
  if (score < -100) return "bg-gray-900/80 text-gray-400";
  return "bg-surface text-text-secondary";
}

function uciPvToSan(fen: string, uciMoves: string[]): string[] {
  try {
    const chess = new Chess(fen);
    const sanMoves: string[] = [];

    for (const uci of uciMoves) {
      try {
        const from = uci.substring(0, 2);
        const to = uci.substring(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        const move = chess.move({ from, to, promotion });
        if (move) {
          sanMoves.push(move.san);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    return sanMoves;
  } catch {
    return [];
  }
}
