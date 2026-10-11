"use client";

import { useMemo, useState } from "react";
import type { Square } from "chess.js";
import type { DeckCard } from "@/lib/training/deck";
import { logPractice } from "@/lib/training/progress";
import { threatPositions } from "@/lib/training/sources";
import { gradeThreats } from "@/lib/training/threats";
import TrainerBoard from "./TrainerBoard";

const PICKED = "rgba(20, 110, 190, 0.55)";
const FOUND = "rgba(47, 158, 110, 0.7)";
const MISSED = "rgba(209, 161, 31, 0.8)";
const WRONG = "rgba(194, 51, 77, 0.6)";

/**
 * Threat spotter: your opponent has just moved. Before thinking about your
 * own plan, tap everything that is in danger.
 */
export default function ThreatTrainer({ cards, username, seed }: { cards: DeckCard[]; username: string; seed: number }) {
  const positions = useMemo(() => threatPositions(cards, seed), [cards, seed]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Square[]>([]);
  const [checked, setChecked] = useState(false);
  const [tally, setTally] = useState({ perfect: 0, done: 0 });

  const position = positions[index];

  if (!position) {
    return (
      <div className="glass-card p-6 text-center space-y-3">
        <h2 className="text-base font-semibold text-text-primary">Session done</h2>
        <p className="text-sm text-text-secondary">
          You spotted everything in {tally.perfect} of {tally.done} positions.
        </p>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setPicked([]);
            setChecked(false);
            setTally({ perfect: 0, done: 0 });
          }}
          className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
        >
          Go again
        </button>
      </div>
    );
  }

  const { set } = position;
  const grade = gradeThreats(set, picked);
  const side = set.side === "w" ? "White" : "Black";

  const marks: Record<string, string> = {};
  if (!checked) for (const sq of picked) marks[sq] = PICKED;
  else {
    for (const sq of grade.found) marks[sq] = FOUND;
    for (const sq of grade.missed) marks[sq] = MISSED;
    for (const sq of grade.wrong) marks[sq] = WRONG;
  }

  const toggle = (square: Square) => {
    if (checked) return;
    setPicked((p) => (p.includes(square) ? p.filter((s) => s !== square) : [...p, square]));
  };

  const check = () => {
    setChecked(true);
    setTally((t) => ({ perfect: t.perfect + (grade.perfect ? 1 : 0), done: t.done + 1 }));
    void logPractice(username, "threat", grade.perfect);
  };

  const next = () => {
    setIndex((i) => i + 1);
    setPicked([]);
    setChecked(false);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="w-full lg:flex-1 lg:max-w-[560px]">
        <TrainerBoard fen={position.fen} orientation={set.side} onSquareTap={toggle} marks={marks} />
      </div>

      <div className="w-full lg:w-[380px] shrink-0 space-y-3">
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-text-muted">Threat spotter</h2>
            <span className="text-xs text-text-muted tabular-nums">
              {index + 1} of {positions.length}
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-base font-semibold text-text-primary">You are {side}, and it is your move.</p>
            <p className="text-sm text-text-secondary">
              Tap every piece of yours that can be won (undefended, attacked by something cheaper, or forked), and
              every enemy piece that can give check next move. Pawns do not count.
            </p>
            <p className="text-xs text-text-muted">{position.from}</p>
          </div>

          {!checked ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-muted">{picked.length} picked</span>
              <button
                type="button"
                onClick={check}
                className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
              >
                Check
              </button>
            </div>
          ) : (
            <div className="space-y-2" aria-live="polite">
              <p className={`text-base font-semibold ${grade.perfect ? "text-accent" : "text-inaccuracy"}`}>
                {grade.perfect
                  ? "You saw everything."
                  : `${grade.found.length} of ${set.threats.length} found${grade.wrong.length ? `, ${grade.wrong.length} that were not threats` : ""}.`}
              </p>
              <ul className="space-y-1 text-sm text-text-secondary">
                {set.threats.map((t) => (
                  <li key={t.square} className="flex gap-2">
                    <span
                      className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: grade.found.includes(t.square) ? FOUND : MISSED }}
                    />
                    {t.note}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <button
                  type="button"
                  autoFocus
                  onClick={next}
                  className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-text-muted px-1">
          Green: found. Yellow: missed. Red: not a threat. Positions come from your own mistakes first, then from
          classic games.
        </p>
      </div>
    </div>
  );
}
