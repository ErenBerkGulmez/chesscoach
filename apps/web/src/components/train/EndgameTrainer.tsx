"use client";

import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  HOLD_MOVES,
  classicsFor,
  flipOutcome,
  judgeEndgameMove,
  outcomeOf,
  probeTablebase,
  taskText,
  type Outcome,
} from "@/lib/training/endgame";
import { logPractice } from "@/lib/training/progress";
import { applyUci } from "@/lib/training/puzzles";
import type { GameSummary } from "@/lib/training/summary";
import TrainerBoard from "./TrainerBoard";

interface Position {
  id: string;
  title: string;
  idea: string | null;
  fen: string;
}

type Phase = "idle" | "thinking" | "slip" | "done" | "error";

interface Play {
  id: string;
  fen: string;
  last: string[];
  /** The tablebase result of the starting position, for the player. */
  target: Outcome | null;
  moves: number;
  phase: Phase;
  message: string;
  /** After a slip: the position before it and a move that would have kept the result. */
  slip: { fenBefore: string; better: { from: string; to: string; san: string } | null } | null;
}

/**
 * Play out endgames with seven pieces or fewer. Every move is checked against
 * the tablebase, so you are told the moment a move changes the result.
 */
export default function EndgameTrainer({ summaries, username }: { summaries: GameSummary[]; username: string }) {
  const rating = useMemo(() => {
    const rated = summaries.filter((s) => s.playerRating);
    return rated.length ? Math.round(rated.reduce((s, g) => s + g.playerRating, 0) / rated.length) : 1200;
  }, [summaries]);

  const positions = useMemo<Position[]>(() => {
    const own = summaries
      .filter((s) => s.endgame)
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, 12)
      .map((s) => ({ id: `game:${s.gameId}`, title: `Your game against ${s.opponent}`, idea: null, fen: s.endgame!.fen }));
    const classics = classicsFor(rating).map((c) => ({ id: c.id, title: c.title, idea: c.idea, fen: c.fen }));
    return [...classics, ...own];
  }, [summaries, rating]);

  const [selectedId, setSelectedId] = useState(positions[0]?.id ?? "");
  const selected = positions.find((p) => p.id === selectedId) ?? positions[0];
  const [play, setPlay] = useState<Play | null>(null);

  const fresh: Play = {
    id: selected.id,
    fen: selected.fen,
    last: [],
    target: null,
    moves: 0,
    phase: "idle",
    message: "Make your move. The tablebase checks each one.",
    slip: null,
  };
  const state = play && play.id === selected.id ? play : fresh;
  const side = selected.fen.split(" ")[1] === "b" ? "b" : "w";

  const fail = (base: Play) =>
    setPlay({ ...base, phase: "error", message: "The tablebase could not be reached. Check your connection and try the move again." });

  const onMove = async (move: { from: string; to: string; san: string; fenAfter: string }) => {
    if (state.phase !== "idle") return;
    const before = state;
    setPlay({ ...before, fen: move.fenAfter, last: [move.from, move.to], phase: "thinking", message: "Checking the tablebase..." });

    try {
      // The result before the move, and what each legal move does to it.
      const here = await probeTablebase(before.fen);
      const startOutcome = outcomeOf(here.category);
      // The board promotes to a queen, so match that promotion first.
      const played = move.from + move.to;
      const mine = here.moves.find((m) => m.uci === played + 'q') ?? here.moves.find((m) => m.uci.slice(0, 4) === played);
      const afterForOpponent = mine ? outcomeOf(mine.category) : null;
      if (!startOutcome || !afterForOpponent) return fail(before);

      const target = before.target ?? startOutcome;
      const after = flipOutcome(afterForOpponent);
      const verdict = judgeEndgameMove(move.san, startOutcome, after);
      const moves = before.moves + 1;

      if (!verdict.ok) {
        const best = here.moves[0];
        void logPractice(username, "endgame", false);
        setPlay({
          ...before,
          target,
          phase: "slip",
          message: verdict.text,
          slip: {
            fenBefore: before.fen,
            better: best ? { from: best.uci.slice(0, 2), to: best.uci.slice(2, 4), san: best.san } : null,
          },
        });
        return;
      }

      const afterMove = new Chess(move.fenAfter);
      const finished = (message: string) => {
        void logPractice(username, "endgame", true);
        setPlay({ ...before, fen: move.fenAfter, last: [move.from, move.to], target, moves, phase: "done", message });
      };
      if (afterMove.isCheckmate()) return finished("Checkmate. Well played.");
      if (afterMove.isDraw() || afterMove.isStalemate()) return finished(target === "win" ? "Drawn." : "Draw held.");
      if (target !== "win" && moves >= HOLD_MOVES) {
        return finished(target === "draw" ? `Held for ${HOLD_MOVES} moves. That is the drawing method.` : `You defended for ${HOLD_MOVES} moves.`);
      }

      // The opponent answers with the tablebase's best move.
      const there = await probeTablebase(move.fenAfter);
      const reply = there.moves[0] ? applyUci(move.fenAfter, there.moves[0].uci) : null;
      if (!reply) return fail(before);
      const afterReply = new Chess(reply.fen);
      const base = { ...before, fen: reply.fen, last: [reply.from, reply.to], target, moves };
      if (afterReply.isCheckmate()) return setPlay({ ...base, phase: "done", message: "You were checkmated." });
      if (afterReply.isDraw() || afterReply.isStalemate()) {
        void logPractice(username, "endgame", target !== "win");
        return setPlay({ ...base, phase: "done", message: target === "win" ? "The game is drawn." : "Draw held." });
      }
      setPlay({ ...base, phase: "idle", message: `${verdict.text} Your opponent played ${reply.san}.` });
    } catch {
      fail(before);
    }
  };

  const showSlip = state.phase === "slip" && state.slip;

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="w-full lg:flex-1 lg:max-w-[560px]">
        <TrainerBoard
          fen={showSlip ? state.slip!.fenBefore : state.fen}
          orientation={side}
          onMove={state.phase === "idle" ? onMove : undefined}
          highlight={showSlip ? undefined : state.last}
          arrows={showSlip && state.slip!.better ? [state.slip!.better] : undefined}
        />
      </div>

      <div className="w-full lg:w-[380px] shrink-0 space-y-3">
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-text-muted">Endgame trainer</h2>
            <span className="text-xs text-text-muted">You are {side === "w" ? "White" : "Black"}</span>
          </div>
          <p className="text-base font-semibold text-text-primary">{selected.title}</p>
          {selected.idea && <p className="text-sm text-text-secondary">{selected.idea}</p>}
          {state.target && <p className="text-sm text-text-secondary">{taskText(state.target)}</p>}
          <p
            className={`text-sm font-semibold ${
              state.phase === "slip" || state.phase === "error" ? "text-blunder" : state.phase === "done" ? "text-accent" : "text-text-primary"
            }`}
            aria-live="polite"
          >
            {state.message}
            {showSlip && state.slip!.better ? ` ${state.slip!.better.san} would have kept it (see the arrow).` : ""}
          </p>

          <div className="flex justify-end gap-2 pt-1">
            {showSlip && (
              <button
                type="button"
                onClick={() => setPlay({ ...state, fen: state.slip!.fenBefore, phase: "idle", slip: null, message: "Try that move again." })}
                className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
              >
                Take it back
              </button>
            )}
            {state.phase === "error" && (
              <button
                type="button"
                onClick={() => setPlay({ ...state, phase: "idle", message: "Make your move." })}
                className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
              >
                Try again
              </button>
            )}
            {(state.moves > 0 || state.phase !== "idle") && (
              <button
                type="button"
                onClick={() => setPlay(null)}
                disabled={state.phase === "thinking"}
                className="px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                Start over
              </button>
            )}
          </div>
        </div>

        <div className="glass-card p-3 space-y-1">
          <h3 className="text-xs font-semibold text-text-muted px-1">Positions</h3>
          <ul className="max-h-64 overflow-y-auto">
            {positions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(p.id);
                    setPlay(null);
                  }}
                  aria-current={p.id === selected.id ? "true" : undefined}
                  className={`w-full text-left rounded-md px-2 py-1.5 text-sm transition-colors ${
                    p.id === selected.id ? "bg-accent/15 text-accent font-semibold" : "text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-text-muted px-1">
          Verdicts come from the Lichess tablebase, so this trainer needs an internet connection. Endgames from your own
          games appear once they are analyzed.
        </p>
      </div>
    </div>
  );
}
