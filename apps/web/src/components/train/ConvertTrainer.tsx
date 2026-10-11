"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { StockfishEngine } from "@/lib/stockfish/engine";
import {
  CONVERT_MOVES,
  CONVERT_TARGET,
  judgeAfterReply,
  judgeConversion,
  winAfterMove,
  type ConvertVerdict,
} from "@/lib/training/conversion";
import { markConverted } from "@/lib/training/store";
import { openConversions, type GameSummary } from "@/lib/training/summary";
import { PlayerColor } from "@/types/chess";
import TrainerBoard from "./TrainerBoard";

const ENGINE_DEPTH = 14;

interface Play {
  gameId: string;
  fen: string;
  moves: number;
  last: string[];
  verdict: ConvertVerdict;
  thinking: boolean;
}

/**
 * Win it again: positions from your own games where you were clearly winning
 * and did not win. Play them out against the engine and keep the advantage.
 */
export default function ConvertTrainer({
  summaries,
  username,
  initialGameId,
  onChange,
}: {
  summaries: GameSummary[];
  username: string;
  initialGameId?: string | null;
  onChange: (summary: GameSummary) => void;
}) {
  const open = openConversions(summaries);
  const won = summaries.filter((s) => s.conversion && s.convertedAt).length;
  const [selectedId, setSelectedId] = useState<string | null>(initialGameId ?? null);
  const selected = summaries.find((s) => s.gameId === selectedId && s.conversion) ?? open[0] ?? null;

  const engineRef = useRef<StockfishEngine | null>(null);
  const [play, setPlay] = useState<Play | null>(null);

  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
    []
  );

  if (!selected || !selected.conversion) {
    return (
      <div className="glass-card p-6 text-center space-y-2">
        <h2 className="text-base font-semibold text-text-primary">No positions to win again</h2>
        <p className="text-sm text-text-secondary max-w-md mx-auto">
          {won > 0
            ? `You have won all ${won} of them again. New ones appear when an analyzed game shows a winning position that slipped away.`
            : "A position lands here when you were clearly winning in a game (85% or better) and did not win it. Analyze more games to find them."}
        </p>
      </div>
    );
  }

  const conversion = selected.conversion;
  const color = selected.playerColor === PlayerColor.WHITE ? "w" : "b";
  const fresh: Play = {
    gameId: selected.gameId,
    fen: conversion.fen,
    moves: 0,
    last: [],
    verdict: { status: "playing", reason: `Keep your winning chances at ${CONVERT_TARGET}% or more for ${CONVERT_MOVES} moves, or give checkmate.` },
    thinking: false,
  };
  // A different game was picked: start from its position.
  const state = play && play.gameId === selected.gameId ? play : fresh;

  const engine = async () => {
    if (!engineRef.current) {
      const e = new StockfishEngine();
      await e.init({ multiPv: 1, threads: 1, hash: 16 });
      engineRef.current = e;
    }
    return engineRef.current;
  };

  const finish = (verdict: ConvertVerdict) => {
    if (verdict.status === "passed" && !selected.convertedAt) {
      onChange(markConverted(selected));
    }
  };

  const onMove = async (move: { from: string; to: string; fenAfter: string }) => {
    if (state.thinking || state.verdict.status !== "playing") return;
    // Stay on this game even once it counts as won.
    setSelectedId(selected.gameId);
    const moves = state.moves + 1;
    const base = { gameId: selected.gameId, moves, fen: move.fenAfter, last: [move.from, move.to] };
    setPlay({ ...base, verdict: state.verdict, thinking: true });

    try {
      const after = new Chess(move.fenAfter);
      const terminal = after.isGameOver();
      const lines = terminal ? [] : await (await engine()).evaluate(move.fenAfter, { depth: ENGINE_DEPTH, multiPv: 1 });
      const verdict = judgeConversion(move.fenAfter, winAfterMove(move.fenAfter, lines), moves);
      if (verdict.status !== "playing") {
        setPlay({ ...base, verdict, thinking: false });
        finish(verdict);
        return;
      }

      // The engine answers with its best move.
      const uci = lines[0]?.pv[0];
      const reply = uci ? after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) : null;
      if (!reply) {
        setPlay({ ...base, verdict, thinking: false });
        return;
      }
      const afterReply = judgeAfterReply(after.fen());
      setPlay({
        gameId: selected.gameId,
        moves,
        fen: after.fen(),
        last: [reply.from, reply.to],
        verdict: afterReply ?? verdict,
        thinking: false,
      });
    } catch {
      setPlay({
        ...base,
        verdict: { status: "failed", reason: "The engine could not be started. Try again." },
        thinking: false,
      });
    }
  };

  const status = state.verdict.status;
  const others = open.filter((s) => s.gameId !== selected.gameId);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="w-full lg:flex-1 lg:max-w-[560px]">
        <TrainerBoard
          fen={state.fen}
          orientation={color}
          onMove={status === "playing" && !state.thinking ? onMove : undefined}
          highlight={state.last}
        />
      </div>

      <div className="w-full lg:w-[380px] shrink-0 space-y-3">
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-text-muted">Win it again</h2>
            <span className="text-xs text-text-muted tabular-nums">
              Move {Math.min(state.moves + (status === "playing" ? 1 : 0), CONVERT_MOVES)} of {CONVERT_MOVES}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            From your game against <strong className="text-text-primary">{selected.opponent}</strong>. You had about{" "}
            {Math.round(conversion.peak)}% winning chances here and finished with {Math.round(conversion.end)}%. You are{" "}
            {color === "w" ? "White" : "Black"}; the engine plays the other side.
          </p>
          <p
            className={`text-base font-semibold ${
              status === "passed" ? "text-accent" : status === "failed" ? "text-blunder" : "text-text-primary"
            }`}
            aria-live="polite"
          >
            {state.thinking ? "The engine is thinking..." : state.verdict.reason}
          </p>

          <div className="flex items-center justify-between gap-3 pt-1">
            <Link
              href={`/dashboard/${username}/games/${selected.gameId}?move=${conversion.index}`}
              className="text-sm text-accent hover:underline"
            >
              Open in the game
            </Link>
            {(status !== "playing" || state.moves > 0) && (
              <button
                type="button"
                onClick={() => setPlay(null)}
                disabled={state.thinking}
                className="px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                {status === "passed" ? "Play it again" : "Start over"}
              </button>
            )}
          </div>
        </div>

        {others.length > 0 && (
          <div className="glass-card p-3 space-y-1">
            <h3 className="text-xs font-semibold text-text-muted px-1">Other positions to win ({others.length})</h3>
            <ul>
              {others.slice(0, 8).map((s) => (
                <li key={s.gameId}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(s.gameId);
                      setPlay(null);
                    }}
                    className="w-full text-left rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    vs {s.opponent}
                    <span className="text-text-muted"> · had {Math.round(s.conversion!.peak)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {won > 0 && <p className="text-xs text-text-muted px-1">{won} won again so far.</p>}
      </div>
    </div>
  );
}
