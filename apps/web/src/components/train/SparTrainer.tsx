"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { CLASSIC_ENDGAMES } from "@/lib/training/endgame";
import { MAIA_RATINGS, nearestBotRating } from "@/lib/training/maia";
import { MAIA_MODEL_MB, MaiaBot, MaiaMissingError } from "@/lib/training/maia-client";
import { applyUci } from "@/lib/training/puzzles";
import type { GameSummary } from "@/lib/training/summary";
import { seeded } from "@/lib/training/visualize";
import TrainerBoard from "./TrainerBoard";

interface Start {
  id: string;
  group: string;
  title: string;
  fen: string;
}

type BotState = "off" | "loading" | "ready" | "missing" | "error";

interface Game {
  startId: string;
  fen: string;
  last: string[];
  moves: string[];
  thinking: boolean;
  /** What the bot's last move was, and how typical it is for its rating. */
  botNote: string | null;
  error: string | null;
}

/** Wait until at least `ms` have passed since `since`, so a reply does not land in the same instant as the move. */
function atLeast(since: number, ms: number): Promise<void> {
  const wait = ms - (performance.now() - since);
  return wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve();
}

/** How a finished game ended, in the player's words. Null while it is still going. */
function resultText(fen: string, player: "w" | "b"): string | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return chess.turn() === player ? "You were checkmated." : "Checkmate. You won.";
  if (chess.isStalemate()) return "Stalemate: a draw.";
  if (chess.isDraw()) return "The game is drawn.";
  return null;
}

/**
 * Sparring: play a position out against a bot that moves like a person of
 * the rating you choose, instead of like an engine.
 */
export default function SparTrainer({ summaries, seed }: { summaries: GameSummary[]; seed: number }) {
  const playerRating = useMemo(() => {
    const rated = summaries.filter((s) => s.playerRating);
    return rated.length ? Math.round(rated.reduce((s, g) => s + g.playerRating, 0) / rated.length) : 1200;
  }, [summaries]);

  const starts = useMemo<Start[]>(() => {
    const recent = [...summaries].sort((a, b) => b.playedAt - a.playedAt);
    return [
      ...recent
        .filter((s) => s.conversion)
        .slice(0, 8)
        .map((s) => ({ id: `win:${s.gameId}`, group: "Winning positions from your games", title: `Against ${s.opponent}`, fen: s.conversion!.fen })),
      ...recent
        .filter((s) => s.endgame)
        .slice(0, 8)
        .map((s) => ({ id: `end:${s.gameId}`, group: "Endgames from your games", title: `Against ${s.opponent}`, fen: s.endgame!.fen })),
      ...CLASSIC_ENDGAMES.map((c) => ({ id: `classic:${c.id}`, group: "Textbook endgames", title: c.title, fen: c.fen })),
    ];
  }, [summaries]);

  const [startId, setStartId] = useState(starts[0].id);
  const start = starts.find((s) => s.id === startId) ?? starts[0];
  const [botRating, setBotRating] = useState(() => nearestBotRating(playerRating));
  const [bot, setBot] = useState<BotState>("off");
  const [progress, setProgress] = useState(0);
  const [game, setGame] = useState<Game | null>(null);

  const botRef = useRef<MaiaBot | null>(null);
  const rand = useRef(seeded(seed));

  useEffect(
    () => () => {
      botRef.current?.dispose();
      botRef.current = null;
    },
    []
  );

  const player = start.fen.split(" ")[1] === "b" ? "b" : "w";
  const fresh: Game = { startId: start.id, fen: start.fen, last: [], moves: [], thinking: false, botNote: null, error: null };
  const state = game && game.startId === start.id ? game : fresh;
  const result = resultText(state.fen, player);

  const loadBot = async () => {
    setBot("loading");
    setProgress(0);
    const instance = botRef.current ?? new MaiaBot();
    botRef.current = instance;
    try {
      await instance.load((loaded, total) => setProgress(total ? Math.round((loaded / total) * 100) : 0));
      setBot("ready");
    } catch (error) {
      botRef.current = null;
      setBot(error instanceof MaiaMissingError ? "missing" : "error");
    }
  };

  const onMove = async (move: { from: string; to: string; san: string; fenAfter: string }) => {
    if (bot !== "ready" || state.thinking || result) return;
    const afterMine: Game = {
      ...state,
      fen: move.fenAfter,
      last: [move.from, move.to],
      moves: [...state.moves, move.san],
      thinking: true,
      error: null,
    };
    if (resultText(move.fenAfter, player)) return setGame({ ...afterMine, thinking: false });
    setGame(afterMine);

    try {
      const started = performance.now();
      const reply = await botRef.current!.move(move.fenAfter, botRating, playerRating, rand.current);
      const played = reply ? applyUci(move.fenAfter, reply.uci) : null;
      if (!reply || !played) throw new Error("no move");
      await atLeast(started, 500);
      setGame({
        ...afterMine,
        fen: played.fen,
        last: [played.from, played.to],
        moves: [...afterMine.moves, played.san],
        thinking: false,
        botNote: `The bot played ${played.san}. Players rated ${botRating} choose it ${Math.round(reply.probability * 100)}% of the time here.`,
      });
    } catch {
      setGame({ ...state, error: "The bot could not find a move. Try your move again.", thinking: false });
    }
  };

  const groups = [...new Set(starts.map((s) => s.group))];

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="w-full lg:flex-1 lg:max-w-[560px]">
        <TrainerBoard
          fen={state.fen}
          orientation={player}
          onMove={bot === "ready" && !state.thinking && !result ? onMove : undefined}
          highlight={state.last}
        />
      </div>

      <div className="w-full lg:w-[380px] shrink-0 space-y-3">
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-text-muted">Sparring</h2>
            <span className="text-xs text-text-muted">You are {player === "w" ? "White" : "Black"}</span>
          </div>
          <p className="text-sm text-text-secondary">
            Play this position against a bot that moves like a person of the rating you pick. It makes human mistakes,
            so you practise beating people, not an engine.
          </p>

          <label className="block text-sm text-text-secondary">
            <span className="block text-xs text-text-muted mb-1">Bot rating</span>
            <select
              value={botRating}
              onChange={(e) => setBotRating(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            >
              {MAIA_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r === MAIA_RATINGS[0] ? `${r} and below` : r === MAIA_RATINGS[MAIA_RATINGS.length - 1] ? `${r} and above` : r}
                  {r === nearestBotRating(playerRating) ? " (about your level)" : ""}
                </option>
              ))}
            </select>
          </label>

          {bot === "off" && (
            <button
              type="button"
              onClick={loadBot}
              className="w-full px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
            >
              Load the bot ({MAIA_MODEL_MB} MB, downloaded once)
            </button>
          )}
          {bot === "loading" && (
            <div className="space-y-1">
              <p className="text-sm text-text-secondary">
                {progress > 0 && progress < 100 ? `Loading the bot... ${progress}%` : "Starting the bot..."}
              </p>
              <div className="h-1.5 bg-border rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-accent rounded-full transition-[width] duration-200" style={{ width: `${Math.max(3, progress)}%` }} />
              </div>
            </div>
          )}
          {bot === "missing" && (
            <p className="text-sm text-blunder bg-blunder/10 p-2 rounded">
              The bot is not installed on this copy of the app. Whoever runs it needs to run{" "}
              <code className="font-mono">npm run setup:maia</code> once in <code className="font-mono">apps/web</code>.
            </p>
          )}
          {bot === "error" && (
            <div className="space-y-2">
              <p className="text-sm text-blunder bg-blunder/10 p-2 rounded">The bot could not be started in this browser.</p>
              <button type="button" onClick={loadBot} className="text-sm text-accent hover:underline">
                Try again
              </button>
            </div>
          )}

          {bot === "ready" && (
            <div className="space-y-1" aria-live="polite">
              <p className={`text-base font-semibold ${result ? "text-accent" : "text-text-primary"}`}>
                {result ?? (state.thinking ? "The bot is thinking..." : "Your move.")}
              </p>
              {state.botNote && <p className="text-sm text-text-secondary">{state.botNote}</p>}
              {state.error && <p className="text-sm text-blunder">{state.error}</p>}
              {state.moves.length > 0 && <p className="text-xs font-mono text-text-muted break-words">{state.moves.join(" ")}</p>}
            </div>
          )}

          {state.moves.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setGame(null)}
                disabled={state.thinking}
                className="px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                Start over
              </button>
            </div>
          )}
        </div>

        <div className="glass-card p-3 space-y-2">
          <h3 className="text-xs font-semibold text-text-muted px-1">Position to play</h3>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {groups.map((group) => (
              <div key={group}>
                <p className="text-xs text-text-muted px-1 pb-0.5">{group}</p>
                <ul>
                  {starts
                    .filter((s) => s.group === group)
                    .map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setStartId(s.id);
                            setGame(null);
                          }}
                          aria-current={s.id === start.id ? "true" : undefined}
                          className={`w-full text-left rounded-md px-2 py-1.5 text-sm transition-colors ${
                            s.id === start.id ? "bg-accent/15 text-accent font-semibold" : "text-text-secondary hover:bg-surface-hover"
                          }`}
                        >
                          {s.title}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-muted px-1">
          The bot is Maia-2, a network trained on millions of human games. It runs on your device.
        </p>
      </div>
    </div>
  );
}
