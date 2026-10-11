"use client";

import { useMemo, useState } from "react";
import type { DeckCard } from "@/lib/training/deck";
import { linesFromCards, linesFromMasterGames } from "@/lib/training/sources";
import { gradeAnswer, makeExercise, seeded, type VisExercise } from "@/lib/training/visualize";
import TrainerBoard from "./TrainerBoard";

/** How many exercises make one session. */
const SESSION = 10;

interface Item {
  exercise: VisExercise;
  from: string;
}

function buildSession(cards: DeckCard[], seed: number): Item[] {
  const rand = seeded(seed);
  const pick = <T,>(items: T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  // Lines from the player's own games come first, then classic games fill the session.
  const sources = [...pick(linesFromCards(cards)).slice(0, SESSION / 2), ...pick(linesFromMasterGames())];
  const items: Item[] = [];
  for (const source of sources) {
    const exercise = makeExercise(source.fen, source.line, Math.floor(rand() * 1e9));
    if (exercise) items.push({ exercise, from: source.from });
    if (items.length === SESSION) break;
  }
  return pick(items);
}

/**
 * Read a short line without the pieces moving, then answer a question about
 * the position at the end. Trains seeing ahead, which is what calculation needs.
 */
export default function VisualizeTrainer({ cards, seed }: { cards: DeckCard[]; seed: number }) {
  const [round, setRound] = useState(0);
  const items = useMemo(() => buildSession(cards, seed + round), [cards, seed, round]);
  const [position, setPosition] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [right, setRight] = useState(0);

  const item = items[position];

  if (!item) {
    return (
      <div className="glass-card p-6 text-center space-y-3">
        <h2 className="text-base font-semibold text-text-primary">Session done</h2>
        <p className="text-sm text-text-secondary">
          {right} of {items.length} right.
        </p>
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setPosition(0);
            setChoice(null);
            setRight(0);
          }}
          className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
        >
          Another {SESSION}
        </button>
      </div>
    );
  }

  const { exercise, from } = item;
  const q = exercise.question;
  const answered = choice !== null;
  const correct = answered && gradeAnswer(q, choice);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="w-full lg:flex-1 lg:max-w-[560px]">
        {/* The pieces stay put until the question is answered. */}
        <TrainerBoard fen={answered ? exercise.finalFen : exercise.fen} orientation={exercise.turn} />
      </div>

      <div className="w-full lg:w-[380px] shrink-0 space-y-3">
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-text-muted">Visualization</h2>
            <span className="text-xs text-text-muted tabular-nums">
              {position + 1} of {items.length}
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-text-secondary">
              {exercise.turn === "w" ? "White" : "Black"} to move. Play this line in your head, without moving the
              pieces. Each move is written as from-to, with no capture or check marks:
            </p>
            <p className="text-lg font-mono font-semibold text-text-primary leading-snug">{exercise.text}</p>
            <p className="text-xs text-text-muted">{from}</p>
          </div>

          <div className="space-y-2">
            <p className="text-base font-semibold text-text-primary">{q.prompt}</p>
            <div className="grid grid-cols-2 gap-2">
              {q.options.map((option) => {
                const isAnswer = option === q.answer;
                const isChoice = option === choice;
                const tone = !answered
                  ? "border-border hover:bg-surface-hover text-text-primary"
                  : isAnswer
                    ? "border-accent bg-accent/15 text-accent"
                    : isChoice
                      ? "border-blunder bg-blunder/10 text-blunder"
                      : "border-border text-text-muted";
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={answered}
                    onClick={() => {
                      setChoice(option);
                      if (gradeAnswer(q, option)) setRight((r) => r + 1);
                    }}
                    className={`px-3 py-2 text-sm rounded-lg border font-medium transition-colors ${tone}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {answered && (
            <div className="flex items-center justify-between gap-3 pt-1" aria-live="polite">
              <p className={`text-sm font-semibold ${correct ? "text-accent" : "text-blunder"}`}>
                {correct ? "Right. " : "Not quite. "}
                <span className="font-normal text-text-secondary">{q.explain} The board now shows the end of the line.</span>
              </p>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setPosition((p) => p + 1);
                  setChoice(null);
                }}
                className="shrink-0 px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-text-muted px-1">
          {right} right so far. Lines come from your own mistake deck and from classic games.
        </p>
      </div>
    </div>
  );
}
