"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import ConvertTrainer from "@/components/train/ConvertTrainer";
import DeckTrainer from "@/components/train/DeckTrainer";
import GuessTrainer from "@/components/train/GuessTrainer";
import VisualizeTrainer from "@/components/train/VisualizeTrainer";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { deckStats, type DeckCard } from "@/lib/training/deck";
import { loadCards, loadSummaries } from "@/lib/training/store";
import { openConversions, type GameSummary } from "@/lib/training/summary";

const MODES = [
  { key: "deck", label: "Mistake deck" },
  { key: "convert", label: "Win it again" },
  { key: "visualize", label: "Visualization" },
  { key: "guess", label: "Guess the move" },
] as const;

type Mode = (typeof MODES)[number]["key"];

interface Loaded {
  cards: DeckCard[];
  summaries: GameSummary[];
  /** When the data was loaded. Fixes what counts as due for this visit. */
  now: number;
}

function Trainers() {
  const params = useParams();
  const search = useSearchParams();
  const username = params.username as string;
  const requested = search.get("mode");
  const [mode, setMode] = useState<Mode>(MODES.some((m) => m.key === requested) ? (requested as Mode) : "deck");
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCards(username), loadSummaries(username)]).then(([cards, summaries]) => {
      if (!cancelled) setData({ cards, summaries, now: Date.now() });
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const updateCard = (card: DeckCard) =>
    setData((d) => (d ? { ...d, cards: d.cards.map((c) => (c.id === card.id ? card : c)) } : d));
  const updateSummary = (summary: GameSummary) =>
    setData((d) => (d ? { ...d, summaries: d.summaries.map((s) => (s.gameId === summary.gameId ? summary : s)) } : d));

  const badge: Partial<Record<Mode, number>> = data
    ? { deck: deckStats(data.cards, data.now).due, convert: openConversions(data.summaries).length }
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
        ) : mode === "deck" ? (
          <DeckTrainer cards={data.cards} username={username} now={data.now} onChange={updateCard} />
        ) : mode === "convert" ? (
          <ConvertTrainer
            summaries={data.summaries}
            username={username}
            initialGameId={search.get("game")}
            onChange={updateSummary}
          />
        ) : mode === "visualize" ? (
          <VisualizeTrainer cards={data.cards} seed={data.now} />
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
