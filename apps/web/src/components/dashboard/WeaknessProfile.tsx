"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadSummaries } from "@/lib/training/store";
import { buildProfile, type GameSummary } from "@/lib/training/summary";
import { useProfileQueue } from "@/stores/profile-store";
import type { ParsedGame } from "@/types/chess";

/** How many of the most recent games the profile is built from. */
const BATCH = 50;

/**
 * What costs the player the most, measured over their recent games: the six
 * skills ranked by winning chances lost per game, with examples to open.
 */
export default function WeaknessProfile({ games, username }: { games: ParsedGame[]; username: string }) {
  const status = useProfileQueue((s) => s.status);
  const done = useProfileQueue((s) => s.done);
  const total = useProfileQueue((s) => s.total);
  const current = useProfileQueue((s) => s.current);
  const currentProgress = useProfileQueue((s) => s.currentProgress);
  const cardsAdded = useProfileQueue((s) => s.cardsAdded);
  const error = useProfileQueue((s) => s.error);
  const version = useProfileQueue((s) => s.version);
  const start = useProfileQueue((s) => s.start);
  const pause = useProfileQueue((s) => s.pause);

  const [summaries, setSummaries] = useState<GameSummary[]>([]);
  const [openSkill, setOpenSkill] = useState<string | null>(null);

  const recent = useMemo(
    () => [...games].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime()).slice(0, BATCH),
    [games]
  );

  useEffect(() => {
    let cancelled = false;
    loadSummaries(username).then((all) => {
      if (!cancelled) setSummaries(all);
    });
    return () => {
      cancelled = true;
    };
  }, [username, version]);

  // The engine is busy while this runs, so stop when the player leaves this view.
  useEffect(() => () => pause(), [pause]);

  // The profile covers the recent games that have been analyzed.
  const profile = useMemo(() => {
    const ids = new Set(recent.map((g) => g.id));
    return buildProfile(summaries.filter((s) => ids.has(s.gameId)));
  }, [summaries, recent]);

  const running = status === "running";
  const remaining = recent.length - profile.games;
  const worst = profile.skills[0]?.lostPerGame ?? 0;
  const shownDone = running ? done : profile.games;
  const shownTotal = running ? total : recent.length;

  return (
    <section className="glass-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Your weakness profile</h2>
          <p className="text-xs text-text-muted max-w-xl">
            What your mistakes cost you, grouped by the skill behind them and measured in winning chances lost per game
            over your last {recent.length} games.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {running ? (
            <button
              type="button"
              onClick={pause}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors"
            >
              Pause
            </button>
          ) : remaining > 0 ? (
            <button
              type="button"
              onClick={() => start(recent)}
              className="px-3 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
            >
              {profile.games === 0 ? `Analyze my last ${recent.length} games` : `Resume (${remaining} left)`}
            </button>
          ) : (
            <span className="text-xs text-text-muted">All {recent.length} games analyzed</span>
          )}
          <Link
            href={`/dashboard/${username}/train`}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors"
          >
            Train
          </Link>
        </div>
      </div>

      {(running || (profile.games > 0 && remaining > 0)) && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-text-secondary tabular-nums">
            <span>
              {shownDone} of {shownTotal} games
              {running && current ? ` · analyzing the game against ${current} (${currentProgress}%)` : ""}
              {status === "paused" ? " · paused" : ""}
            </span>
            {cardsAdded > 0 && <span>{cardsAdded} new deck cards</span>}
          </div>
          <div
            className="h-1.5 bg-border rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={shownDone}
            aria-valuemin={0}
            aria-valuemax={shownTotal}
          >
            <div
              className="h-full bg-accent rounded-full transition-[width] duration-300"
              style={{ width: `${shownTotal ? (shownDone / shownTotal) * 100 : 0}%` }}
            />
          </div>
          {running && (
            <p className="text-xs text-text-muted">
              This uses the engine on your device and stops if you leave this tab. Finished games are saved, so you can
              pause and resume.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-blunder bg-blunder/10 p-2 rounded">{error}</p>}

      {profile.games === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing analyzed yet. Start the analysis here, or review games one at a time: every game you review is added.
        </p>
      ) : (
        <ol className="space-y-2">
          {profile.skills.map((s, i) => {
            const isOpen = openSkill === s.skill;
            return (
              <li key={s.skill} className="rounded-lg bg-background/50">
                <button
                  type="button"
                  onClick={() => setOpenSkill(isOpen ? null : s.skill)}
                  aria-expanded={isOpen}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3"
                >
                  <span className="w-5 h-5 shrink-0 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-text-primary truncate">{s.title}</span>
                      <span className="text-sm tabular-nums font-semibold text-text-primary whitespace-nowrap">
                        {s.lostPerGame.toFixed(1)}%<span className="text-xs font-normal text-text-muted"> per game</span>
                      </span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-full bg-border overflow-hidden" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${i === 0 ? "bg-blunder" : i === 1 ? "bg-mistake" : "bg-inaccuracy"}`}
                        style={{ width: `${worst > 0 ? Math.max(2, (s.lostPerGame / worst) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="mt-1 block text-xs text-text-muted">
                      {s.count === 0
                        ? "No mistakes of this kind"
                        : `${s.count} ${s.count === 1 ? "mistake" : "mistakes"} in ${s.games} of ${profile.games} games`}
                    </span>
                  </span>
                  <span className="text-text-muted text-xs" aria-hidden="true">
                    {isOpen ? "▾" : "▸"}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 pl-11 space-y-2">
                    <p className="text-sm text-text-secondary">{s.drill}</p>
                    {s.examples.length > 0 && (
                      <ul className="space-y-1">
                        {s.examples.map((e) => (
                          <li key={`${e.gameId}:${e.index}`}>
                            <Link
                              href={`/dashboard/${username}/games/${e.gameId}?move=${e.index}`}
                              className="block rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
                            >
                              <span className="text-text-primary font-medium">{e.headline}</span>
                              <span className="text-text-muted">
                                {" "}
                                · vs {e.opponent} · cost {Math.round(e.winDrop)}%
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
