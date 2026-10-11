"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { winAfterMove } from "@/lib/training/conversion";
import { MASTER_GAMES, gameScore, guessPoints, guessVerdict, type MasterGame } from "@/lib/training/guess";
import TrainerBoard from "./TrainerBoard";

const SCORES_KEY = "chesscoach:guess-scores";
const DEPTH = 12;

type Scores = Record<string, number>;

function readScores(): Scores {
  try {
    return JSON.parse(localStorage.getItem(SCORES_KEY) ?? "{}") as Scores;
  } catch {
    return {};
  }
}

interface Ply {
  san: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  color: "w" | "b";
}

function plies(game: MasterGame): Ply[] {
  const chess = new Chess();
  chess.loadPgn(game.moves);
  return chess.history({ verbose: true }).map((m) => ({
    san: m.san,
    from: m.from,
    to: m.to,
    fenBefore: m.before,
    fenAfter: m.after,
    color: m.color,
  }));
}

/** Index of the first move to guess: the master's move at `startMove`. */
function firstGuess(game: MasterGame) {
  return (game.startMove - 1) * 2 + (game.side === "w" ? 0 : 1);
}

interface Feedback {
  guess: string;
  master: string;
  points: number;
  verdict: string;
  same: boolean;
}

/** Winning chances after each of two moves, from the mover's side. */
async function compare(fenAfterGuess: string, fenAfterMaster: string): Promise<[number, number]> {
  const open = [fenAfterGuess, fenAfterMaster].filter((fen) => !new Chess(fen).isGameOver());
  const { evaluatePositions } = await import("@/lib/stockfish/analyzer");
  const lines = await evaluatePositions(open, { depth: DEPTH, multiPv: 1, workers: 2 });
  const win = (fen: string) => {
    const i = open.indexOf(fen);
    return winAfterMove(fen, i >= 0 ? lines[i] ?? [] : []);
  };
  return [win(fenAfterGuess), win(fenAfterMaster)];
}

/**
 * Guess the move: play through a classic game from the winner's side. Each
 * guess is scored against the move that was actually played.
 */
export default function GuessTrainer() {
  const [scores, setScores] = useState<Scores>({});
  const [gameId, setGameId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [points, setPoints] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Stored scores are only readable in the browser, after the first render.
    const stored = readScores();
    if (Object.keys(stored).length > 0) queueMicrotask(() => setScores(stored));
  }, []);

  const game = MASTER_GAMES.find((g) => g.id === gameId) ?? null;
  const moves = useMemo(() => (game ? plies(game) : []), [game]);

  if (!game) {
    return (
      <div className="glass-card p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Guess the move</h2>
          <p className="text-sm text-text-secondary">
            Pick a classic game and play the winner&apos;s side. For every move you guess, the engine compares your move
            with the one that was played. Matching it, or finding something just as good, scores 100.
          </p>
        </div>
        <ul className="grid sm:grid-cols-2 gap-2">
          {MASTER_GAMES.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => {
                  setGameId(g.id);
                  setIndex(firstGuess(g));
                  setPoints([]);
                  setFeedback(null);
                  setError(null);
                }}
                className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:bg-surface-hover transition-colors"
              >
                <span className="block text-sm font-semibold text-text-primary">
                  {g.white} vs {g.black}
                </span>
                <span className="block text-xs text-text-muted">
                  {g.event}, {g.year} · you play {g.side === "w" ? "White" : "Black"}
                  {scores[g.id] !== undefined ? ` · best ${scores[g.id]}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const current = moves[index];
  const finished = !current;
  const total = moves.filter((m, i) => i >= firstGuess(game) && m.color === game.side).length;
  const score = gameScore(points);

  const finishGame = (all: number[]) => {
    const final = gameScore(all);
    const best = Math.max(final, scores[game.id] ?? 0);
    const next = { ...scores, [game.id]: best };
    setScores(next);
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(next));
    } catch {
      // storage is full or blocked: the score just is not remembered
    }
  };

  const onGuess = async (move: { san: string; fenAfter: string }) => {
    if (busy || feedback || !current) return;
    const same = move.san === current.san;
    setBusy(true);
    setError(null);
    try {
      let earned = 100;
      if (!same) {
        const [guessWin, masterWin] = await compare(move.fenAfter, current.fenAfter);
        earned = guessPoints(masterWin, guessWin, false);
      }
      const all = [...points, earned];
      setPoints(all);
      setFeedback({ guess: move.san, master: current.san, points: earned, verdict: guessVerdict(earned, same), same });
      // The last guess of the game also settles the score.
      if (!moves.slice(index + 1).some((m) => m.color === game.side)) finishGame(all);
    } catch {
      setError("The engine could not score that move. Try it again.");
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    // Play the master's move and the reply, then ask for the next one.
    setIndex((i) => i + 2);
    setFeedback(null);
  };

  const last = feedback ? current : moves[index - 1];
  const boardFen = finished ? moves[moves.length - 1].fenAfter : current.fenBefore;

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="w-full lg:flex-1 lg:max-w-[560px]">
        <TrainerBoard
          fen={boardFen}
          orientation={game.side}
          onMove={!finished && !feedback && !busy ? onGuess : undefined}
          highlight={!feedback && last ? [last.from, last.to] : undefined}
          arrows={feedback && current ? [{ from: current.from, to: current.to }] : undefined}
        />
      </div>

      <div className="w-full lg:w-[380px] shrink-0 space-y-3">
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-text-muted">Guess the move</h2>
            <span className="text-xs text-text-muted tabular-nums">
              {Math.min(points.length + (feedback || finished ? 0 : 1), total)} of {total} · score {score}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            <strong className="text-text-primary">
              {game.white} vs {game.black}
            </strong>
            , {game.event}, {game.year}. You are {game.side === "w" ? game.white : game.black}.
          </p>

          {finished ? (
            <p className="text-base font-semibold text-text-primary" aria-live="polite">
              Game over. Your score: {score} out of 100
              {scores[game.id] !== undefined && scores[game.id] > score ? ` (best ${scores[game.id]})` : ""}.
            </p>
          ) : feedback ? (
            <div className="space-y-1" aria-live="polite">
              <p className={`text-base font-semibold ${feedback.points >= 70 ? "text-accent" : feedback.points >= 30 ? "text-inaccuracy" : "text-blunder"}`}>
                {feedback.points} points for {feedback.guess}
              </p>
              <p className="text-sm text-text-secondary">
                {feedback.verdict}
                {feedback.same ? "" : ` The game went ${feedback.master}.`}
              </p>
            </div>
          ) : (
            <p className="text-base font-semibold text-text-primary" aria-live="polite">
              {busy
                ? "Scoring your move..."
                : `Move ${Math.floor(index / 2) + 1}: what did ${game.side === "w" ? "White" : "Black"} play?`}
            </p>
          )}
          {error && <p className="text-xs text-blunder">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button type="button" onClick={() => setGameId(null)} className="text-sm text-accent hover:underline">
              All games
            </button>
            {feedback && !finished && (
              <button
                type="button"
                autoFocus
                onClick={next}
                className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
              >
                {moves[index + 1] ? "Next" : "Finish"}
              </button>
            )}
            {finished && (
              <button
                type="button"
                onClick={() => {
                  setIndex(firstGuess(game));
                  setPoints([]);
                  setFeedback(null);
                }}
                className="px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors"
              >
                Play it again
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-text-muted px-1">
          The opening moves are played for you. Your opponent&apos;s replies are the ones from the game.
        </p>
      </div>
    </div>
  );
}
