"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import ConvertTrainer from "@/components/train/ConvertTrainer";
import DeckTrainer from "@/components/train/DeckTrainer";
import EndgameTrainer from "@/components/train/EndgameTrainer";
import GuessTrainer from "@/components/train/GuessTrainer";
import PlanPanel from "@/components/train/PlanPanel";
import SparTrainer from "@/components/train/SparTrainer";
import PuzzleTrainer from "@/components/train/PuzzleTrainer";
import ThreatTrainer from "@/components/train/ThreatTrainer";
import VisualizeTrainer from "@/components/train/VisualizeTrainer";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { deckStats, type DeckCard } from "@/lib/training/deck";
import type { SkillKey } from "@/lib/coach/report";
import { missingCards, openingCards } from "@/lib/training/opening-drill";
import type { StepTarget } from "@/lib/training/plan";
import { loadPracticeDay } from "@/lib/training/progress";
import { loadCards, loadSummaries, saveCard } from "@/lib/training/store";
import { openConversions, type GameSummary } from "@/lib/training/summary";

// The charts are only needed on the progress tab.
const ProgressPanel = dynamic(() => import("@/components/train/ProgressPanel"), {
  ssr: false,
  loading: () => <p className="text-sm text-text-muted py-10 text-center">Loading your progress...</p>,
});

const MODES = [
  { key: "plan", label: "Plan" },
  { key: "deck", label: "Mistake deck" },
  { key: "puzzles", label: "Puzzles" },
  { key: "threats", label: "Threat spotter" },
  { key: "endgames", label: "Endgames" },
  { key: "openings", label: "Opening drill" },
  { key: "convert", label: "Win it again" },
  { key: "spar", label: "Sparring" },
  { key: "visualize", label: "Visualization" },
  { key: "guess", label: "Guess the move" },
  { key: "progress", label: "Progress" },
] as const;

type Mode = (typeof MODES)[number]["key"];

interface Loaded {
  cards: DeckCard[];
  summaries: GameSummary[];
  /** When the data was loaded. Fixes what counts as due for this visit. */
  now: number;
  /** Seconds already spent on the opening drill today. */
  openingSeconds: number;
}

function Trainers() {
  const params = useParams();
  const search = useSearchParams();
  const username = params.username as string;
  const requested = search.get("mode");
  const [mode, setMode] = useState<Mode>(MODES.some((m) => m.key === requested) ? (requested as Mode) : "plan");
  // The skill the plan asked the puzzle trainer to open on, if it did.
  const [puzzleChoice, setPuzzleChoice] = useState<SkillKey | "mixed" | undefined>(undefined);
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCards(username), loadSummaries(username), loadPracticeDay(username)]).then(
      async ([cards, summaries, today]) => {
        // Opening positions that now qualify for the drill join the deck.
        const added = missingCards(openingCards(summaries), cards);
        await Promise.all(added.map(saveCard));
        if (!cancelled) {
          setData({ cards: [...cards, ...added], summaries, now: Date.now(), openingSeconds: today.openingSeconds ?? 0 });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [username]);

  const updateCard = (card: DeckCard) =>
    setData((d) => (d ? { ...d, cards: d.cards.map((c) => (c.id === card.id ? card : c)) } : d));
  const updateSummary = (summary: GameSummary) =>
    setData((d) => (d ? { ...d, summaries: d.summaries.map((s) => (s.gameId === summary.gameId ? summary : s)) } : d));

  const mistakes = data ? data.cards.filter((c) => c.kind === "mistake") : [];
  const openings = data ? data.cards.filter((c) => c.kind === "opening") : [];
  // A step of the plan's session opens the trainer it names.
  const go = (target: StepTarget) => {
    if (target.mode === "game") return;
    if (target.mode === "puzzles") setPuzzleChoice(target.skill);
    setMode(target.mode);
  };

  const badge: Partial<Record<Mode, number>> = data
    ? {
        deck: deckStats(mistakes, data.now).due,
        openings: deckStats(openings, data.now).due,
        convert: openConversions(data.summaries).length,
      }
    : {};

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <header className="bg-surface border-b border-border">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-3">
          <Link
            href={`/dashboard/${username}`}
            aria-label="Back to the dashboard"
            className="w-9 h-9 -ml-1 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface-hover transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-semibold truncate">Training</h1>
            <p className="text-xs text-text-muted truncate">{username}</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <nav className="flex gap-1 overflow-x-auto" aria-label="Trainers">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                aria-current={mode === m.key ? "page" : undefined}
                className={`relative px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  mode === m.key ? "text-accent" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {m.label}
                {badge[m.key] ? (
                  <span className="ml-1.5 rounded-full bg-accent/15 text-accent text-xs font-semibold px-1.5 py-0.5 tabular-nums">
                    {badge[m.key]}
                  </span>
                ) : null}
                {mode === m.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-4">
        {!data ? (
          <p className="text-sm text-text-muted py-10 text-center">Loading your training data...</p>
        ) : mode === "plan" ? (
          <PlanPanel
            username={username}
            summaries={data.summaries}
            now={data.now}
            onGo={go}
            context={{
              dueMistakes: badge.deck ?? 0,
              dueOpenings: badge.openings ?? 0,
              openConversions: badge.convert ?? 0,
            }}
          />
        ) : mode === "spar" ? (
          <SparTrainer summaries={data.summaries} seed={data.now} />
        ) : mode === "deck" ? (
          <DeckTrainer key="mistake" cards={mistakes} username={username} now={data.now} onChange={updateCard} />
        ) : mode === "openings" ? (
          <DeckTrainer
            key="opening"
            cards={openings}
            username={username}
            now={data.now}
            onChange={updateCard}
            kind="opening"
            secondsSpent={data.openingSeconds}
          />
        ) : mode === "puzzles" ? (
          <PuzzleTrainer
            key={puzzleChoice ?? "default"}
            username={username}
            summaries={data.summaries}
            seed={data.now}
            initialChoice={puzzleChoice}
          />
        ) : mode === "threats" ? (
          <ThreatTrainer cards={mistakes} username={username} seed={data.now} />
        ) : mode === "endgames" ? (
          <EndgameTrainer summaries={data.summaries} username={username} />
        ) : mode === "progress" ? (
          <ProgressPanel username={username} summaries={data.summaries} cards={data.cards} now={data.now} />
        ) : mode === "convert" ? (
          <ConvertTrainer
            summaries={data.summaries}
            username={username}
            initialGameId={search.get("game")}
            onChange={updateSummary}
          />
        ) : mode === "visualize" ? (
          <VisualizeTrainer cards={mistakes} seed={data.now} />
        ) : (
          <GuessTrainer />
        )}
      </main>
    </div>
  );
}

export default function TrainPage() {
  return (
    <Suspense fallback={null}>
      <Trainers />
    </Suspense>
  );
}
