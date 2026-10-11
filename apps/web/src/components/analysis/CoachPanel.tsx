"use client";

import { useEffect, useMemo } from "react";
import { useAnalysisStore } from "@/stores/analysis-store";
import { explainMove, type Severity } from "@/lib/coach/explain";
import { baseTimeMs } from "@/lib/chess/clock";
import { PlayerColor } from "@/types/chess";

const SEVERITY_STYLE: Record<Severity, string> = {
  good: "text-accent",
  inaccuracy: "text-inaccuracy",
  mistake: "text-mistake",
  blunder: "text-blunder",
};

/** Explains the move on the board: what it allowed or missed, and what was better. */
export default function CoachPanel() {
  const currentMoveIndex = useAnalysisStore((s) => s.currentMoveIndex);
  const moveAnalyses = useAnalysisStore((s) => s.moveAnalyses);
  const playerColor = useAnalysisStore((s) => s.currentGame?.playerColor ?? PlayerColor.WHITE);
  const isExploring = useAnalysisStore((s) => s.isExploring);
  const isAnalyzing = useAnalysisStore((s) => s.isAnalyzing);
  const analyzeMove = useAnalysisStore((s) => s.analyzeMove);
  const startExploration = useAnalysisStore((s) => s.startExploration);

  const analysis = currentMoveIndex < 0 ? null : moveAnalyses[currentMoveIndex] ?? null;
  const next = moveAnalyses[currentMoveIndex + 1] ?? null;

  // Moves skipped by the full analysis are analyzed on demand.
  useEffect(() => {
    if (currentMoveIndex >= 0 && !isExploring && !isAnalyzing && !analysis) {
      analyzeMove(currentMoveIndex);
    }
  }, [currentMoveIndex, isExploring, isAnalyzing, analysis, analyzeMove]);

  const clockMs = useAnalysisStore((s) => s.currentGame?.moves[currentMoveIndex]?.clockMs);
  const timeControl = useAnalysisStore((s) => s.currentGame?.timeControl);
  const explanation = useMemo(
    () => (analysis ? explainMove(analysis, { clockMs, baseMs: baseTimeMs(timeControl) }) : null),
    [analysis, clockMs, timeControl]
  );

  if (!analysis || !explanation) {
    return (
      <section id="coach-panel" className="glass-card p-4">
        <h2 className="text-xs font-semibold text-text-muted">Coach</h2>
        <p className="text-sm text-text-secondary mt-2">
          Step through the game, or pick a key moment from the report, to see what each move did.
        </p>
      </section>
    );
  }

  const isMine = analysis.color === playerColor;

  // Opponent moves: say whether it was a mistake and how to punish it.
  if (!isMine) {
    const punish = next?.bestMoveSan;
    return (
      <section id="coach-panel" className="glass-card p-4 space-y-2">
        <h2 className="text-xs font-semibold text-text-muted">Coach · opponent&apos;s move</h2>
        <p className={`text-sm font-semibold ${SEVERITY_STYLE[explanation.severity]}`}>
          {explanation.severity === "good"
            ? `${explanation.headline.replace(" is fine", "")}: a good move by your opponent.`
            : `${explanation.headline.replace(/^(\S+)/, "$1 by your opponent")}.`}
        </p>
        {explanation.severity !== "good" && punish && (
          <p className="text-sm text-text-secondary">
            Your best reply was <strong className="text-text-primary">{punish}</strong>
            {next && next.sanMove === punish ? ", and you found it." : `. You played ${next?.sanMove ?? "something else"}.`}
          </p>
        )}
      </section>
    );
  }

  return (
    <section id="coach-panel" className="glass-card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold text-text-muted">Coach</h2>
        <span className="text-xs font-mono text-text-muted tabular-nums">
          {explanation.clock && (
            <span className={explanation.timeTrouble ? "text-blunder" : undefined} title="Time left on your clock after this move">
              {explanation.clock} left ·{" "}
            </span>
          )}
          {explanation.evalChange}
        </span>
      </div>

      <p className={`text-base font-semibold leading-snug ${SEVERITY_STYLE[explanation.severity]}`}>
        {explanation.headline}
      </p>
      <p className="text-sm text-text-secondary leading-relaxed">{explanation.detail}</p>

      {explanation.better && (
        <div className="rounded-lg bg-accent/10 border border-accent/25 p-3 space-y-1.5">
          <p className="text-sm text-text-primary">
            Better was <strong>{explanation.better.san}</strong>, because {explanation.better.why}.
          </p>
          <button
            type="button"
            onClick={() => {
              const pv = analysis.pvLines[0]?.pvSan ?? [explanation.better!.san];
              startExploration(pv.slice(0, 6), analysis.fenBefore);
            }}
            className="text-xs font-mono text-accent hover:underline text-left"
            title="Play this line on the board"
          >
            {explanation.better.line} ▸
          </button>
        </div>
      )}

      {explanation.takeaway && (
        <p className="text-sm text-text-secondary border-l-2 border-border pl-3">
          <span className="font-semibold text-text-primary">Habit: </span>
          {explanation.takeaway}
        </p>
      )}
    </section>
  );
}
