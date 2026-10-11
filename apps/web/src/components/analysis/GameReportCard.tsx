"use client";

import { useMemo, useState } from "react";
import { useAnalysisStore } from "@/stores/analysis-store";
import { buildGameReport } from "@/lib/coach/report";
import type { MoveAnalysis, PlayerColor } from "@/types/chess";

const SEVERITY_DOT = {
  good: "bg-accent",
  inaccuracy: "bg-inaccuracy",
  mistake: "bg-mistake",
  blunder: "bg-blunder",
} as const;

/** Game-level coaching: verdict, what to work on, key moments and patterns. */
export default function GameReportCard({ moves, playerColor }: { moves: MoveAnalysis[]; playerColor: PlayerColor }) {
  const goTo = useAnalysisStore((s) => s.goToMove);
  // Jump to the move and bring the coach's explanation into view.
  const goToMove = (index: number) => {
    goTo(index);
    requestAnimationFrame(() =>
      document.getElementById("coach-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    );
  };
  const report = useMemo(() => buildGameReport(moves, playerColor), [moves, playerColor]);
  const [open, setOpen] = useState(true);

  return (
    <section className="glass-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-text-muted">Game report</h2>
          <p className="text-sm text-text-primary mt-1 leading-relaxed">{report.verdict}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="shrink-0 text-xs text-text-muted hover:text-text-primary"
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <>
          {report.keyMoments.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-text-muted">Key moments</h3>
              <ul className="space-y-1">
                {report.keyMoments.map((k) => (
                  <li key={k.index}>
                    <button
                      type="button"
                      onClick={() => goToMove(k.index)}
                      className="w-full text-left flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover transition-colors"
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[k.explanation.severity]}`} />
                      <span className="text-sm text-text-secondary">
                        <span className="text-text-primary font-medium">{k.explanation.headline}</span>
                        {k.explanation.better && <> · better {k.explanation.better.san}</>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.focus.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-text-muted">What to work on</h3>
              <ol className="space-y-3">
                {report.focus.map((f, i) => (
                  <li key={f.title} className="flex gap-3">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-text-primary">{f.title}</p>
                      <p className="text-xs text-text-muted">{f.why}</p>
                      <p className="text-sm text-text-secondary">{f.drill}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {report.patterns.length > 1 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-text-muted">Patterns in your mistakes</h3>
              <ul className="flex flex-wrap gap-1.5">
                {report.patterns.map((p) => (
                  <li key={p.motif}>
                    <button
                      type="button"
                      onClick={() => goToMove(p.indices[0])}
                      className="rounded-md bg-background/60 px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                      title={p.moves.join(", ")}
                    >
                      {p.title} <span className="font-semibold text-text-primary">×{p.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.strengths.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-text-muted">What went well</h3>
              <ul className="text-sm text-text-secondary space-y-0.5">
                {report.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
