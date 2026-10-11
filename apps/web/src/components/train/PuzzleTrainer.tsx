"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SkillKey } from "@/lib/coach/report";
import { logPractice } from "@/lib/training/progress";
import {
  PUZZLE_LABEL,
  PUZZLE_SKILLS,
  applyUci,
  focusSkill,
  isSolutionMove,
  loadShard,
  loadStats,
  pickPuzzle,
  saveStat,
  startPuzzle,
  themeName,
  updateStat,
  type Puzzle,
  type PuzzleStat,
} from "@/lib/training/puzzles";
import { buildProfile, type GameSummary } from "@/lib/training/summary";
import { seeded } from "@/lib/training/visualize";
import TrainerBoard from "./TrainerBoard";

type Choice = SkillKey | "mixed";
type Status = "loading" | "solving" | "solved" | "failed" | "error";

interface Active {
  puzzle: Puzzle;
  fen: string;
  solver: "w" | "b";
  solution: string[];
  /** Index into `solution` of the move the solver has to find now. */
  step: number;
  last: string[];
  status: Status;
  /** Rating change from this puzzle, once it is decided. */
  change: number | null;
  /** The right move, shown after a miss. */
  reveal: { from: string; to: string } | null;
}

/**
 * Puzzles picked for the skill that costs the player most, at a difficulty
 * that follows their puzzle rating for that skill.
 */
export default function PuzzleTrainer({
  username,
  summaries,
  seed,
}: {
  username: string;
  summaries: GameSummary[];
  seed: number;
}) {
  const recommended = useMemo(() => focusSkill(buildProfile(summaries)), [summaries]);
  const [choice, setChoice] = useState<Choice>(recommended ?? "mixed");
  const [stats, setStats] = useState<Record<SkillKey, PuzzleStat> | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const rand = useRef(seeded(seed));
  const seen = useRef(new Set<string>());
  const statsRef = useRef<Record<SkillKey, PuzzleStat> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStats(username).then((loaded) => {
      if (cancelled) return;
      statsRef.current = loaded;
      setStats(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const ready = stats !== null;

  // Serve a puzzle whenever the choice changes or the player asks for the next one.
  useEffect(() => {
    if (!ready || !statsRef.current) return;
    let cancelled = false;
    const skill = choice === "mixed" ? PUZZLE_SKILLS[Math.floor(rand.current() * PUZZLE_SKILLS.length)] : choice;
    loadShard(skill)
      .then((puzzles) => {
        if (cancelled) return;
        const rating = statsRef.current![skill].rating;
        for (let attempt = 0; attempt < 5; attempt++) {
          const puzzle = pickPuzzle(puzzles, rating, seen.current, rand.current);
          if (!puzzle) break;
          seen.current.add(puzzle.id);
          const start = startPuzzle(puzzle);
          if (!start) continue;
          setError(null);
          setActive({
            puzzle,
            fen: start.fen,
            solver: start.solver,
            solution: start.solution,
            step: 0,
            last: start.lastMove,
            status: "solving",
            change: null,
            reveal: null,
          });
          return;
        }
        setError("No more puzzles of this kind for now.");
      })
      .catch(() => {
        if (!cancelled) setError("The puzzles could not be loaded. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [choice, round, ready]);

  const settle = (current: Active, solved: boolean): number => {
    const all = statsRef.current;
    if (!all) return 0;
    const before = all[current.puzzle.skill];
    const after = updateStat(before, current.puzzle.rating, solved);
    const next = { ...all, [current.puzzle.skill]: after };
    statsRef.current = next;
    setStats(next);
    void saveStat(after);
    void logPractice(username, "puzzle", solved);
    return after.rating - before.rating;
  };

  const onMove = (move: { from: string; to: string; fenAfter: string }) => {
    if (!active || active.status !== "solving") return;
    const expected = active.solution[active.step];
    if (!isSolutionMove(active.fen, move.from, move.to, expected)) {
      setActive({
        ...active,
        status: "failed",
        change: settle(active, false),
        reveal: { from: expected.slice(0, 2), to: expected.slice(2, 4) },
      });
      return;
    }

    const reply = active.solution[active.step + 1];
    const done = !reply || expected.slice(0, 4) !== move.from + move.to;
    if (done) {
      setActive({ ...active, fen: move.fenAfter, last: [move.from, move.to], status: "solved", change: settle(active, true) });
      return;
    }
    // The opponent answers, then the solver continues.
    const afterReply = applyUci(move.fenAfter, reply);
    setActive({
      ...active,
      fen: afterReply?.fen ?? move.fenAfter,
      last: afterReply ? [afterReply.from, afterReply.to] : [move.from, move.to],
      step: active.step + 2,
      status: afterReply ? "solving" : "solved",
      change: afterReply ? null : settle(active, true),
    });
  };

  const pick = (value: Choice) => {
    setChoice(value);
    setActive(null);
  };

  const next = () => {
    setActive(null);
    setRound((r) => r + 1);
  };

  const skill = active?.puzzle.skill;
  const stat = skill && stats ? stats[skill] : null;
  const status: Status = error ? "error" : active?.status ?? "loading";

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="w-full lg:flex-1 lg:max-w-[560px]">
        {active ? (
          <TrainerBoard
            fen={active.fen}
            orientation={active.solver}
            onMove={active.status === "solving" ? onMove : undefined}
            highlight={active.last}
            arrows={active.reveal ? [active.reveal] : undefined}
          />
        ) : (
          <div className="aspect-square w-full rounded-lg bg-surface flex items-center justify-center text-sm text-text-muted">
            {error ?? "Loading puzzles..."}
          </div>
        )}
      </div>

      <div className="w-full lg:w-[380px] shrink-0 space-y-3">
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-text-muted">Puzzles</h2>
            {stat && (
              <span className="text-xs text-text-muted tabular-nums">
                Your rating here: <strong className="text-text-primary">{stat.rating}</strong>
              </span>
            )}
          </div>

          <label className="block text-sm text-text-secondary">
            <span className="block text-xs text-text-muted mb-1">What to practise</span>
            <select
              value={choice}
              onChange={(e) => pick(e.target.value as Choice)}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="mixed">Mixed</option>
              {PUZZLE_SKILLS.map((s) => (
                <option key={s} value={s}>
                  {PUZZLE_LABEL[s]}
                  {s === recommended ? " (your biggest weakness)" : ""}
                </option>
              ))}
            </select>
          </label>

          {active && (
            <div aria-live="polite" className="space-y-1">
              {status === "solving" && (
                <p className="text-base font-semibold text-text-primary">
                  {active.solver === "w" ? "White" : "Black"} to move. Find the best move.
                </p>
              )}
              {status === "solved" && <p className="text-base font-semibold text-accent">Solved.</p>}
              {status === "failed" && (
                <p className="text-base font-semibold text-blunder">Not that one. The arrow shows the move.</p>
              )}
              {status !== "solving" && (
                <p className="text-sm text-text-secondary">
                  {PUZZLE_LABEL[active.puzzle.skill]} · {themeName(active.puzzle.theme)} · puzzle rating{" "}
                  {active.puzzle.rating}
                  {active.change !== null && (
                    <>
                      {" "}
                      · you{" "}
                      <span className={active.change >= 0 ? "text-accent" : "text-blunder"}>
                        {active.change >= 0 ? "+" : ""}
                        {active.change}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {(status === "solved" || status === "failed" || status === "error") && (
            <div className="flex justify-end">
              <button
                type="button"
                autoFocus
                onClick={next}
                className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
              >
                {status === "error" ? "Try again" : "Next puzzle"}
              </button>
            </div>
          )}
        </div>

        {stats && (
          <div className="glass-card p-3">
            <h3 className="text-xs font-semibold text-text-muted px-1 pb-1">Your puzzle ratings</h3>
            <ul className="text-sm">
              {PUZZLE_SKILLS.map((s) => (
                <li key={s} className="flex justify-between gap-2 px-1 py-0.5">
                  <span className="text-text-secondary truncate">{PUZZLE_LABEL[s]}</span>
                  <span className="tabular-nums text-text-primary whitespace-nowrap">
                    {stats[s].played === 0 ? "–" : stats[s].rating}
                    <span className="text-text-muted">
                      {stats[s].played > 0 ? ` · ${stats[s].solved}/${stats[s].played}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-text-muted px-1">30,000 puzzles from the Lichess puzzle database, sorted by skill.</p>
      </div>
    </div>
  );
}
