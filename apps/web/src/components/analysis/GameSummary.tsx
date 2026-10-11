"use client";

import { CLASSIFICATION_CONFIG, MoveClassification } from "@/types/chess";
import type { GameAnalysis } from "@/types/chess";
import EvalGraph from "@/components/chess/EvalGraph";

const SHOWN = [
  MoveClassification.BRILLIANT,
  MoveClassification.GREAT,
  MoveClassification.BEST,
  MoveClassification.INACCURACY,
  MoveClassification.MISTAKE,
  MoveClassification.BLUNDER,
  MoveClassification.MISSED_WIN,
] as const;

/** Accuracy, move-quality counts and the evaluation graph in one card. */
export default function GameSummary({ analysis }: { analysis: GameAnalysis }) {
  const phases = [
    ["Opening", analysis.openingAccuracy],
    ["Middlegame", analysis.middlegameAccuracy],
    ["Endgame", analysis.endgameAccuracy],
  ] as const;

  return (
    <section className="glass-card p-4 space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-text-muted">Your accuracy</p>
          <p className="text-3xl font-bold text-text-primary tabular-nums leading-tight">
            {analysis.accuracy}%
          </p>
        </div>
        <dl className="flex gap-3 text-right">
          {phases.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] text-text-muted">{label}</dt>
              <dd className="text-sm font-semibold text-text-secondary tabular-nums">
                {value !== null ? `${value}%` : "–"}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {SHOWN.map((key) => {
          const count = analysis.classificationCounts[key] || 0;
          if (count === 0) return null;
          const config = CLASSIFICATION_CONFIG[key];
          return (
            <li
              key={key}
              className="flex items-center gap-1.5 rounded-md bg-background/60 px-2 py-1 text-xs"
            >
              <span className="font-bold font-mono" style={{ color: config.color }}>
                {config.symbol}
              </span>
              <span className="text-text-secondary">{config.label}</span>
              <span className="font-semibold text-text-primary tabular-nums">{count}</span>
            </li>
          );
        })}
      </ul>

      <EvalGraph />
    </section>
  );
}
