"use client";

import { useMemo } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useShallow } from "zustand/react/shallow";
import { GameResult, TimeClass, PlayerColor } from "@/types/chess";
import type { ParsedGame } from "@/types/chess";
import { motion } from "framer-motion";
import OpeningAnalytics from "./OpeningAnalytics";
import WeaknessProfile from "./WeaknessProfile";

/**
 * Statistics Overview Dashboard
 *
 * Computes and displays player statistics from loaded games:
 * - General player performance (win/loss/draw, color, time controls)
 * - Four-Category Independent Opening Analytics Dashboard
 */
export default function StatsOverview() {
  const { games, username } = usePlayerStore(
    useShallow((s) => ({ games: s.games, username: s.username }))
  );

  const stats = useMemo(() => computeStats(games), [games]);

  if (games.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted text-lg">📊 No games loaded yet</p>
        <p className="text-text-muted text-sm mt-2">
          Games will appear once syncing is complete.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {username && <WeaknessProfile games={games} username={username} />}

      {/* Top-level stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Games"
          value={stats.totalGames.toString()}
          icon="♟"
          delay={0}
        />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate}%`}
          subtext={`${stats.wins}W / ${stats.losses}L / ${stats.draws}D`}
          icon="🏆"
          color={stats.winRate >= 50 ? "text-best" : "text-mistake"}
          delay={0.05}
        />
        <StatCard
          label="Avg Rating"
          value={stats.avgOpponentRating.toString()}
          subtext={`opponents faced`}
          icon="📈"
          delay={0.1}
        />
        <StatCard
          label="Games / Month"
          value={stats.gamesPerMonth.toFixed(1)}
          subtext={`across ${stats.monthSpan} months`}
          icon="📅"
          delay={0.15}
        />
      </div>

      {/* Win rate by color & Time controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5"
        >
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-4">
            Win Rate by Color
          </h3>
          <div className="space-y-3">
            <ColorBar
              label="White"
              wins={stats.whiteWins}
              losses={stats.whiteLosses}
              draws={stats.whiteDraws}
              total={stats.whiteGames}
              dotColor="bg-white border border-gray-300"
            />
            <ColorBar
              label="Black"
              wins={stats.blackWins}
              losses={stats.blackLosses}
              draws={stats.blackDraws}
              total={stats.blackGames}
              dotColor="bg-gray-800 border border-gray-600"
            />
          </div>
        </motion.div>

        {/* Time control breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-5"
        >
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-4">
            Time Controls
          </h3>
          <div className="space-y-2">
            {stats.timeControlStats.map((tc) => (
              <div key={tc.timeClass} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-base">{tc.icon}</span>
                  <span className="text-text-secondary">{tc.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-text-muted text-xs">
                    {tc.winRate}% win
                  </span>
                  <span className="text-text-primary font-semibold text-xs tabular-nums">
                    {tc.games}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Result breakdown bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-5"
      >
        <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3">
          Overall Results Distribution
        </h3>
        <div className="h-3.5 rounded-full overflow-hidden flex bg-surface border border-border/50">
          {stats.wins > 0 && (
            <div
              className="h-full bg-best transition-all duration-500"
              style={{ width: `${(stats.wins / stats.totalGames) * 100}%` }}
              title={`Wins: ${stats.wins}`}
            />
          )}
          {stats.draws > 0 && (
            <div
              className="h-full bg-text-muted/40 transition-all duration-500"
              style={{ width: `${(stats.draws / stats.totalGames) * 100}%` }}
              title={`Draws: ${stats.draws}`}
            />
          )}
          {stats.losses > 0 && (
            <div
              className="h-full bg-blunder transition-all duration-500"
              style={{ width: `${(stats.losses / stats.totalGames) * 100}%` }}
              title={`Losses: ${stats.losses}`}
            />
          )}
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-best font-semibold">{stats.wins} Wins ({((stats.wins / stats.totalGames) * 100).toFixed(0)}%)</span>
          <span className="text-text-muted">{stats.draws} Draws</span>
          <span className="text-blunder font-semibold">{stats.losses} Losses ({((stats.losses / stats.totalGames) * 100).toFixed(0)}%)</span>
        </div>
      </motion.div>

      {/* ─── 4-Category Independent Opening Analytics Dashboard ─── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <OpeningAnalytics />
      </motion.div>
    </div>
  );
}

// ─── StatCard ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtext,
  icon,
  color,
  delay = 0,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: string;
  color?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="glass-card p-4 text-center hover:border-accent/20 transition-colors"
    >
      <div className="text-xl mb-1">{icon}</div>
      <p className={`text-xl font-bold ${color || "text-text-primary"}`}>
        {value}
      </p>
      <p className="text-[10px] text-text-muted mt-0.5 uppercase tracking-wider">
        {label}
      </p>
      {subtext && (
        <p className="text-[10px] text-text-muted mt-0.5">{subtext}</p>
      )}
    </motion.div>
  );
}

// ─── ColorBar ───────────────────────────────────────────────

function ColorBar({
  label,
  wins,
  losses,
  draws,
  total,
  dotColor,
}: {
  label: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
  dotColor: string;
}) {
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;
  const drawPct = total > 0 ? Math.round((draws / total) * 100) : 0;
  const lossPct = total > 0 ? Math.round((losses / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${dotColor}`} />
          <span className="text-sm text-text-secondary">{label}</span>
          <span className="text-xs text-text-muted">({total})</span>
        </div>
        <span className={`text-xs font-bold ${winPct >= 50 ? "text-best" : "text-mistake"}`}>
          {winPct}% win
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden flex bg-surface">
        <div className="h-full bg-best" style={{ width: `${winPct}%` }} />
        <div className="h-full bg-text-muted/30" style={{ width: `${drawPct}%` }} />
        <div className="h-full bg-blunder" style={{ width: `${lossPct}%` }} />
      </div>
    </div>
  );
}

// ─── General Stats Computation ──────────────────────────────

interface ComputedGeneralStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgOpponentRating: number;
  whiteGames: number;
  whiteWins: number;
  whiteLosses: number;
  whiteDraws: number;
  blackGames: number;
  blackWins: number;
  blackLosses: number;
  blackDraws: number;
  gamesPerMonth: number;
  monthSpan: number;
  timeControlStats: {
    timeClass: TimeClass;
    label: string;
    icon: string;
    games: number;
    wins: number;
    winRate: number;
  }[];
}

function computeStats(games: ParsedGame[]): ComputedGeneralStats {
  const totalGames = games.length;

  const wins = games.filter((g) => g.result === GameResult.WIN).length;
  const losses = games.filter((g) => g.result === GameResult.LOSS).length;
  const draws = games.filter((g) => g.result === GameResult.DRAW).length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  const avgOpponentRating =
    totalGames > 0
      ? Math.round(games.reduce((sum, g) => sum + g.opponentRating, 0) / totalGames)
      : 0;

  const whiteGames = games.filter((g) => g.playerColor === PlayerColor.WHITE);
  const blackGames = games.filter((g) => g.playerColor === PlayerColor.BLACK);

  // Time span
  const dates = games.map((g) => g.playedAt.getTime());
  const earliest = Math.min(...dates);
  const latest = Math.max(...dates);
  const monthSpan = Math.max(1, Math.round((latest - earliest) / (1000 * 60 * 60 * 24 * 30)));
  const gamesPerMonth = totalGames / monthSpan;

  // Time control stats
  const tcMap = new Map<TimeClass, { games: number; wins: number }>();
  const TC_META: Record<TimeClass, { label: string; icon: string }> = {
    [TimeClass.BULLET]: { label: "Bullet", icon: "⚡" },
    [TimeClass.BLITZ]: { label: "Blitz", icon: "🔥" },
    [TimeClass.RAPID]: { label: "Rapid", icon: "⏱" },
    [TimeClass.DAILY]: { label: "Daily", icon: "📅" },
  };

  for (const g of games) {
    const existing = tcMap.get(g.timeClass) || { games: 0, wins: 0 };
    existing.games++;
    if (g.result === GameResult.WIN) existing.wins++;
    tcMap.set(g.timeClass, existing);
  }

  const timeControlStats = Array.from(tcMap.entries())
    .map(([tc, data]) => ({
      timeClass: tc,
      label: TC_META[tc]?.label || tc,
      icon: TC_META[tc]?.icon || "🎮",
      games: data.games,
      wins: data.wins,
      winRate: data.games > 0 ? Math.round((data.wins / data.games) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games);

  return {
    totalGames,
    wins,
    losses,
    draws,
    winRate,
    avgOpponentRating,
    whiteGames: whiteGames.length,
    whiteWins: whiteGames.filter((g) => g.result === GameResult.WIN).length,
    whiteLosses: whiteGames.filter((g) => g.result === GameResult.LOSS).length,
    whiteDraws: whiteGames.filter((g) => g.result === GameResult.DRAW).length,
    blackGames: blackGames.length,
    blackWins: blackGames.filter((g) => g.result === GameResult.WIN).length,
    blackLosses: blackGames.filter((g) => g.result === GameResult.LOSS).length,
    blackDraws: blackGames.filter((g) => g.result === GameResult.DRAW).length,
    gamesPerMonth,
    monthSpan,
    timeControlStats,
  };
}
