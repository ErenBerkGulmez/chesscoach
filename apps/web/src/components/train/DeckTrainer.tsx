"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import { formatLine } from "@/lib/coach/board";
import { deckStats, dueCards, isCorrect, reviewCard, type DeckCard } from "@/lib/training/deck";
import { DAILY_SECONDS, cardSeconds, secondsLeft } from "@/lib/training/opening-drill";
import { deckToPgn, exportFileName } from "@/lib/training/pgn-export";
import { logPractice } from "@/lib/training/progress";
import { saveCard } from "@/lib/training/store";
import TrainerBoard from "./TrainerBoard";

type Phase = "ask" | "right" | "wrong";

function whenText(ms: number, now: number) {
  const minutes = Math.max(1, Math.round((ms - now) / 60000));
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

/** Squares of a SAN move in a position, for drawing an arrow. */
function moveSquares(fen: string, san: string) {
  try {
    const m = new Chess(fen).move(san);
    return m ? { from: m.from, to: m.to } : null;
  } catch {
    return null;
  }
}

/** Save text as a file from the browser. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-chess-pgn" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Retry positions from your own games. Each card is a position where you
 * went wrong; find a better move. Cards come back on a spaced schedule.
 * The same trainer runs the mistake deck and the opening drill.
 */
export default function DeckTrainer({
  cards,
  username,
  now,
  onChange,
  kind = "mistake",
  secondsSpent = 0,
}: {
  cards: DeckCard[];
  username: string;
  /** The time the page was opened: what counts as due is fixed for the session. */
  now: number;
  onChange: (card: DeckCard) => void;
  kind?: "mistake" | "opening";
  /** Opening drill only: seconds already spent on it today. */
  secondsSpent?: number;
}) {
  const opening = kind === "opening";
  const title = opening ? "Opening drill" : "Mistake deck";
  const [spent, setSpent] = useState(secondsSpent);
  const shownAt = useRef(0);
  // The session works through the cards that were due when it started. Wrong answers come back at the end.
  const [queue, setQueue] = useState<DeckCard[]>(() => dueCards(cards, now));
  const [position, setPosition] = useState(0);
  const [phase, setPhase] = useState<Phase>("ask");
  const [answer, setAnswer] = useState<{ san: string; fenAfter: string } | null>(null);
  const [tally, setTally] = useState({ right: 0, wrong: 0 });

  const stats = useMemo(() => deckStats(cards, now), [cards, now]);
  const card = queue[position];

  // Time on a card runs from when it is shown.
  useEffect(() => {
    shownAt.current = Date.now();
  }, [position]);

  if (cards.length === 0) {
    return (
      <div className="glass-card p-6 text-center space-y-2">
        <h2 className="text-base font-semibold text-text-primary">
          {opening ? "No opening positions to drill yet" : "Your deck is empty"}
        </h2>
        <p className="text-sm text-text-secondary max-w-md mx-auto">
          {opening
            ? "A position lands here when you have reached it in at least two analyzed games and your move there gave up 0.7 of a pawn or more. Analyze more games to find them."
            : "Cards are made from the costly mistakes in games you have analyzed. Review a game, or run the weakness profile on the Statistics tab to analyze your recent games in one go."}
        </p>
        <Link href={`/dashboard/${username}`} className="inline-block text-sm text-accent hover:underline">
          Back to your games
        </Link>
      </div>
    );
  }

  const outOfTime = opening && secondsLeft(spent) === 0 && phase === "ask";

  if (!card || outOfTime) {
    const answered = tally.right + tally.wrong;
    return (
      <div className="glass-card p-6 text-center space-y-2">
        <h2 className="text-base font-semibold text-text-primary">
          {outOfTime ? "That is your five minutes for today" : answered > 0 ? "Session done" : "Nothing is due right now"}
        </h2>
        {outOfTime && (
          <p className="text-sm text-text-secondary">
            The opening drill is kept to {DAILY_SECONDS / 60} minutes a day on purpose. The rest of your time is better
            spent on tactics and your own games.
          </p>
        )}
        {answered > 0 && (
          <p className="text-sm text-text-secondary">
            {tally.right} right, {tally.wrong} wrong.
          </p>
        )}
        <p className="text-sm text-text-muted">
          {stats.total} {stats.total === 1 ? "card" : "cards"} in your deck, {stats.learned} learned
          {stats.recall !== null ? `, ${stats.recall}% of answers correct` : ""}.
          {stats.nextDue ? ` The next one is due ${whenText(stats.nextDue, now)}.` : ""}
        </p>
      </div>
    );
  }

  const answerMove = (move: { san: string; fenAfter: string }) => {
    if (phase !== "ask") return;
    const correct = isCorrect(card, move.san);
    const updated = reviewCard(card, correct);
    const seconds = opening ? cardSeconds(shownAt.current, Date.now()) : 0;
    setSpent((s) => s + seconds);
    void logPractice(username, opening ? "opening" : "deck", correct, seconds);
    void saveCard(updated);
    onChange(updated);
    setAnswer(move);
    setPhase(correct ? "right" : "wrong");
    setTally((t) => (correct ? { ...t, right: t.right + 1 } : { ...t, wrong: t.wrong + 1 }));
    // A missed card is asked again at the end of this session.
    if (!correct) setQueue((q) => [...q, updated]);
  };

  const next = () => {
    setPosition((p) => p + 1);
    setPhase("ask");
    setAnswer(null);
  };

  const best = card.answers[0];
  const bestSquares = phase === "wrong" ? moveSquares(card.fen, best) : null;
  const boardFen = phase === "right" && answer ? answer.fenAfter : card.fen;
  const side = card.color === "w" ? "White" : "Black";

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="w-full lg:flex-1 lg:max-w-[560px]">
        <TrainerBoard
          fen={boardFen}
          orientation={card.color}
          onMove={phase === "ask" ? answerMove : undefined}
          arrows={bestSquares ? [bestSquares] : undefined}
        />
      </div>

      <div className="w-full lg:w-[380px] shrink-0 space-y-3">
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-text-muted">{title}</h2>
            <span className="text-xs text-text-muted tabular-nums">
              {Math.min(position + 1, queue.length)} of {queue.length}
            </span>
          </div>

          {phase === "ask" && (
            <>
              <p className="text-base font-semibold text-text-primary">{side} to move. Find a better move.</p>
              <p className="text-sm text-text-secondary">
                From your game against {card.opponent}. You played <strong className="text-text-primary">{card.played}</strong>{" "}
                here
                {opening
                  ? `, in a position you have had before. ${card.headline}.`
                  : `, which cost about ${card.winDrop}% in winning chances.`}
              </p>
            </>
          )}

          {phase === "right" && (
            <>
              <p className="text-base font-semibold text-accent">Correct: {answer?.san}</p>
              {card.why && (
                <p className="text-sm text-text-secondary">
                  {answer && isCorrect({ answers: [best] }, answer.san) ? `It works because ${card.why}.` : `The engine's first choice was ${best}, and yours is about as good.`}
                </p>
              )}
              <p className="text-xs font-mono text-text-muted">{formatLine(card.fen, card.line)}</p>
            </>
          )}

          {phase === "wrong" && (
            <>
              <p className="text-base font-semibold text-blunder">
                Not {answer?.san}. Better is {card.answers.join(" or ")}
              </p>
              {card.why && <p className="text-sm text-text-secondary">{best} works because {card.why}.</p>}
              <p className="text-xs font-mono text-text-muted">{formatLine(card.fen, card.line)}</p>
              <div className="border-t border-border pt-2 space-y-1.5">
                <p className="text-sm font-semibold text-text-primary">In the game: {card.headline}</p>
                <p className="text-sm text-text-secondary">{card.detail}</p>
                {card.takeaway && (
                  <p className="text-sm text-text-secondary border-l-2 border-border pl-3">
                    <span className="font-semibold text-text-primary">Habit: </span>
                    {card.takeaway}
                  </p>
                )}
              </div>
            </>
          )}

          {phase !== "ask" && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <Link
                href={`/dashboard/${username}/games/${card.gameId}?move=${card.index}`}
                className="text-sm text-accent hover:underline"
              >
                Open in the game
              </Link>
              <button
                type="button"
                onClick={next}
                autoFocus
                className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-text-muted px-1">
          {stats.total} cards · {stats.due} due · {stats.learned} learned
          {stats.recall !== null ? ` · ${stats.recall}% correct` : ""}. Cards you miss come back sooner.
          {opening ? ` ${Math.ceil(secondsLeft(spent) / 60)} min left today.` : ""}
        </p>
        <button
          type="button"
          onClick={() => download(exportFileName(username), deckToPgn(cards, username))}
          className="text-xs text-accent hover:underline px-1"
        >
          Export these {cards.length} cards as PGN (opens in a Lichess study)
        </button>
      </div>
    </div>
  );
}
