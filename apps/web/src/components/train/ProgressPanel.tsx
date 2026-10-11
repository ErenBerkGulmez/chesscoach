"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchPlayerStats } from "@/lib/api/chess-com";
import { deckStats, type DeckCard } from "@/lib/training/deck";
import {
  loadPracticeLog,
  mainTimeClass,
  phaseAccuracy,
  practiceTotals,
  weekCard,
  weeklyTrend,
  type PracticeDay,
} from "@/lib/training/progress";
import type { GameSummary } from "@/lib/training/summary";
import type { ChessComPlayerStats } from "@/types/chess";

const TOOLTIP = {
  backgroundColor: "#1a1f27",
  borderColor: "#2d343e",
  borderRadius: "8px",
  fontSize: "12px",
};
const AXIS = "#9aa0a6";
const GRID = "rgba(154, 160, 166, 0.2)";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-background/50 px-3 py-2">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-lg font-semibold text-text-primary tabular-nums">{value}</p>
      {note && <p className="text-xs text-text-muted">{note}</p>}
    </div>
  );
}

function change(value: number | null, unit = "") {
  if (value === null || value === 0) return undefined;
  // For blunders and lost chances, down is good.
  return `${value > 0 ? "up" : "down"} ${Math.abs(value)}${unit} on last week`;
}

function Trend({
  title,
  note,
  data,
  dataKey,
  colour,
}: {
  title: string;
  note: string;
  data: object[];
  dataKey: string;
  colour: string;
}) {
  return (
    <section className="glass-card p-4 space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="text-xs text-text-muted">{note}</p>
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" stroke={AXIS} fontSize={10} />
            <YAxis stroke={AXIS} fontSize={10} domain={["auto", "auto"]} />
            <Tooltip contentStyle={TOOLTIP} />
            <Line type="monotone" dataKey={dataKey} name={title} stroke={colour} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** How your games and your practice are trending, week by week. */
export default function ProgressPanel({
  username,
  summaries,
  cards,
  now,
}: {
  username: string;
  summaries: GameSummary[];
  cards: DeckCard[];
  now: number;
}) {
  const [log, setLog] = useState<PracticeDay[]>([]);
  const [ratings, setRatings] = useState<ChessComPlayerStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPracticeLog(username).then((days) => {
      if (!cancelled) setLog(days);
    });
    fetchPlayerStats(username)
      .then((stats) => {
        if (!cancelled) setRatings(stats);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [username]);

  const trend = useMemo(() => weeklyTrend(summaries, now), [summaries, now]);
  const week = useMemo(() => weekCard(summaries, log, now), [summaries, log, now]);
  const phases = useMemo(() => phaseAccuracy(summaries), [summaries]);
  const deck = useMemo(() => deckStats(cards, now), [cards, now]);
  const puzzles = useMemo(() => practiceTotals(log, ["puzzle"]), [log]);
  const main = mainTimeClass(summaries);

  const live = [
    ["Rapid", ratings?.chess_rapid?.last.rating],
    ["Blitz", ratings?.chess_blitz?.last.rating],
    ["Bullet", ratings?.chess_bullet?.last.rating],
  ].filter((r): r is [string, number] => typeof r[1] === "number");

  if (summaries.length === 0 && log.length === 0) {
    return (
      <div className="glass-card p-6 text-center space-y-2">
        <h2 className="text-base font-semibold text-text-primary">No progress to show yet</h2>
        <p className="text-sm text-text-secondary max-w-md mx-auto">
          Analyze some games (the weakness profile on the Statistics tab does 50 at once) and do a few exercises. This
          page then tracks how both change over time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="glass-card p-4 space-y-3">
        <div>
          <h2 className="text-xs font-semibold text-text-muted">This week</h2>
          <p className="text-base font-semibold text-text-primary">{week.headline}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat label="Games analyzed" value={String(week.games)} />
          <Stat
            label="Blunders per 100 moves"
            value={week.blundersPer100 === null ? "–" : String(week.blundersPer100)}
            note={change(week.blunderChange)}
          />
          <Stat
            label="Chances lost per move"
            value={week.lostPerMove === null ? "–" : `${week.lostPerMove}%`}
            note={change(week.lostChange, "%")}
          />
          <Stat label="Days practised" value={`${week.practiceDays} of 7`} />
          <Stat
            label="Deck reviews"
            value={String(week.deck.seen)}
            note={week.deck.accuracy === null ? undefined : `${week.deck.accuracy}% right`}
          />
          <Stat
            label="Puzzles"
            value={String(week.puzzles.seen)}
            note={week.puzzles.accuracy === null ? undefined : `${week.puzzles.accuracy}% solved`}
          />
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <Trend
          title="Blunders per 100 moves"
          note="From your analyzed games, by the week they were played. Lower is better."
          data={trend}
          dataKey="blundersPer100"
          colour="#c2334d"
        />
        <Trend
          title="Winning chances lost per move"
          note="Percentage points given up per move, all mistakes counted. Lower is better."
          data={trend}
          dataKey="lostPerMove"
          colour="#d9742b"
        />
        <Trend
          title={`Chess.com rating${main ? ` (${main.toLowerCase()})` : ""}`}
          note="Your rating in the analyzed games of your most-played time control."
          data={trend}
          dataKey="rating"
          colour="#3b82c4"
        />
        <section className="glass-card p-4 space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Accuracy by phase</h3>
            <p className="text-xs text-text-muted">Average over {summaries.length} analyzed games.</p>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={phases} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="phase" stroke={AXIS} fontSize={10} />
                <YAxis stroke={AXIS} fontSize={10} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(154, 160, 166, 0.1)" }} />
                <Bar dataKey="accuracy" name="Accuracy" fill="#2f9e6e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="glass-card p-4 space-y-3">
        <h2 className="text-xs font-semibold text-text-muted">Overall</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat
            label="Deck recall"
            value={deck.recall === null ? "–" : `${deck.recall}%`}
            note={`${deck.total} cards, ${deck.learned} learned`}
          />
          <Stat
            label="Puzzle accuracy"
            value={puzzles.accuracy === null ? "–" : `${puzzles.accuracy}%`}
            note={`${puzzles.seen} puzzles`}
          />
          <Stat label="Games analyzed" value={String(summaries.length)} />
          {live.map(([label, rating]) => (
            <Stat key={label} label={`${label} rating now`} value={String(rating)} note="Chess.com" />
          ))}
        </div>
      </section>
    </div>
  );
}
