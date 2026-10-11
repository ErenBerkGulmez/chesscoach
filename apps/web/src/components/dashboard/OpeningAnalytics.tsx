"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { usePlayerStore } from "@/stores/player-store";
import { useShallow } from "zustand/react/shallow";
import {
  OpeningCategoryKey,
  CategorizedOpeningStat,
  ParsedGame,
} from "@/types/chess";
import {
  computeOpeningCategoryStats,
  OpeningSortBy,
} from "@/lib/chess/opening-classifier";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  ReferenceLine,
} from "recharts";

/** Category definitions with descriptive labels & questions */
const CATEGORIES: {
  key: OpeningCategoryKey;
  title: string;
  subtitle: string;
  question: string;
  icon: string;
  color: string;
  badgeBg: string;
}[] = [
  {
    key: OpeningCategoryKey.WHITE_PLAYER_OPENINGS,
    title: "My White Openings",
    subtitle: "Openings I choose as White",
    question: "Which openings do I choose when I play White?",
    icon: "♔",
    color: "text-accent",
    badgeBg: "bg-accent/15 text-accent border-accent/30",
  },
  {
    key: OpeningCategoryKey.WHITE_OPPONENT_DEFENSES,
    title: "Defenses vs My White",
    subtitle: "What opponents play vs my White",
    question: "What do opponents usually play against my White openings?",
    icon: "🛡️",
    color: "text-blue-400",
    badgeBg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  {
    key: OpeningCategoryKey.BLACK_PLAYER_DEFENSES,
    title: "My Black Defenses",
    subtitle: "Openings I choose as Black",
    question: "Which openings do I choose when I play Black?",
    icon: "♚",
    color: "text-purple-400",
    badgeBg: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
  {
    key: OpeningCategoryKey.BLACK_OPPONENT_OPENINGS,
    title: "Openings vs My Black",
    subtitle: "What opponents play vs my Black",
    question: "Which openings do opponents choose when I am Black?",
    icon: "⚔️",
    color: "text-amber-400",
    badgeBg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
];

const ITEMS_PER_PAGE = 10;

export default function OpeningAnalytics() {
  const { games, username } = usePlayerStore(
    useShallow((s) => ({ games: s.games, username: s.username }))
  );
  const router = useRouter();

  // Active category tab
  const [activeCategoryKey, setActiveCategoryKey] = useState<OpeningCategoryKey>(
    OpeningCategoryKey.WHITE_PLAYER_OPENINGS
  );

  // Controls
  const [groupMode, setGroupMode] = useState<"family" | "detailed">("family");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<OpeningSortBy>("games");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"mostPlayed" | "winRate" | "share">("mostPlayed");

  const activeCategory = useMemo(
    () => CATEGORIES.find((c) => c.key === activeCategoryKey)!,
    [activeCategoryKey]
  );

  // Compute category statistics (memoized)
  const categoryResult = useMemo(() => {
    return computeOpeningCategoryStats(games, {
      category: activeCategoryKey,
      groupMode,
      searchQuery,
      sortBy,
      sortOrder,
    });
  }, [games, activeCategoryKey, groupMode, searchQuery, sortBy, sortOrder]);

  const { stats, totalGames, totalWins, totalLosses, totalDraws, winRate } =
    categoryResult;

  // Pagination
  const totalPages = Math.ceil(stats.length / ITEMS_PER_PAGE);
  const paginatedStats = useMemo(() => {
    return stats.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  }, [stats, page]);

  // Reset page when category, search, or grouping changes
  const handleCategoryChange = (key: OpeningCategoryKey) => {
    setActiveCategoryKey(key);
    setPage(0);
    setExpandedRow(null);
  };

  // Best performing opening (min 3 games)
  const bestOpening = useMemo(() => {
    const qualified = stats.filter((s) => s.games >= 3);
    if (qualified.length === 0) return null;
    return [...qualified].sort((a, b) => b.winRate - a.winRate)[0];
  }, [stats]);

  // Chart data (Top 8 openings in category)
  const chartData = useMemo(() => {
    return stats.slice(0, 8).map((s) => ({
      name: s.name.length > 22 ? `${s.name.substring(0, 20)}…` : s.name,
      fullName: s.name,
      games: s.games,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      winRate: s.winRate,
      percentage: s.percentageOfCategory,
      perf: s.performanceRating,
    }));
  }, [stats]);

  return (
    <div className="space-y-6">
      {/* ─── Header & Category Tabs ──────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <span>📖 Opening Analytics</span>
            </h2>
            <p className="text-xs text-text-muted">
              Independently categorized stats for White vs Black choices
            </p>
          </div>

          {/* Family vs Detailed Grouping Toggle */}
          <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border self-start sm:self-auto">
            <button
              onClick={() => {
                setGroupMode("family");
                setPage(0);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                groupMode === "family"
                  ? "bg-accent text-black shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Main Families
            </button>
            <button
              onClick={() => {
                setGroupMode("detailed");
                setPage(0);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                groupMode === "detailed"
                  ? "bg-accent text-black shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Specific Variations
            </button>
          </div>
        </div>

        {/* 4 Category Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CATEGORIES.map((cat) => {
            const isSelected = activeCategoryKey === cat.key;
            // Quick count for tab badge
            const isWhite =
              cat.key === OpeningCategoryKey.WHITE_PLAYER_OPENINGS ||
              cat.key === OpeningCategoryKey.WHITE_OPPONENT_DEFENSES;
            const catGamesCount = games.filter((g) =>
              isWhite
                ? g.playerColor === "WHITE"
                : g.playerColor === "BLACK"
            ).length;

            return (
              <button
                key={cat.key}
                onClick={() => handleCategoryChange(cat.key)}
                className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${
                  isSelected
                    ? "glass-card border-accent shadow-lg ring-1 ring-accent/30"
                    : "bg-surface border-border hover:border-border/80 hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">{cat.icon}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cat.badgeBg}`}
                  >
                    {catGamesCount} games
                  </span>
                </div>
                <h3 className={`text-sm font-bold ${isSelected ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"}`}>
                  {cat.title}
                </h3>
                <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">
                  {cat.subtitle}
                </p>

                {isSelected && (
                  <motion.div
                    layoutId="active-opening-cat-indicator"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-accent"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Active Category Question & Overview ───────────────────── */}
      <motion.div
        key={activeCategoryKey}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">{activeCategory.icon}</span>
              <h3 className="text-base font-bold text-text-primary">
                {activeCategory.title}
              </h3>
            </div>
            <p className="text-xs font-semibold text-accent mt-0.5 italic">
              &ldquo;{activeCategory.question}&rdquo;
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="text-right">
              <span className="text-text-muted block text-[10px] uppercase">
                Category Win Rate
              </span>
              <span
                className={`text-base font-extrabold ${
                  winRate >= 50 ? "text-best" : "text-mistake"
                }`}
              >
                {winRate}%
              </span>
            </div>
            <div className="text-right">
              <span className="text-text-muted block text-[10px] uppercase">
                Record
              </span>
              <span className="font-mono text-xs font-bold text-text-secondary">
                <span className="text-best">{totalWins}W</span> /{" "}
                <span className="text-blunder">{totalLosses}L</span> /{" "}
                <span className="text-text-muted">{totalDraws}D</span>
              </span>
            </div>
          </div>
        </div>

        {/* ─── Quick Summary Metrics ───────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-surface/70 p-3 rounded-lg border border-border/50">
            <span className="text-[10px] text-text-muted uppercase tracking-wider block">
              Unique Openings
            </span>
            <span className="text-lg font-bold text-text-primary">
              {stats.length}
            </span>
          </div>

          <div className="bg-surface/70 p-3 rounded-lg border border-border/50">
            <span className="text-[10px] text-text-muted uppercase tracking-wider block">
              Most Played
            </span>
            <span className="text-xs font-bold text-text-primary truncate block mt-1" title={stats[0]?.name}>
              {stats[0]?.name || "—"}
            </span>
            <span className="text-[10px] text-text-muted">
              {stats[0] ? `${stats[0].games} games (${stats[0].percentageOfCategory}%)` : ""}
            </span>
          </div>

          <div className="bg-surface/70 p-3 rounded-lg border border-border/50">
            <span className="text-[10px] text-text-muted uppercase tracking-wider block">
              Best Win Rate (min 3)
            </span>
            <span className="text-xs font-bold text-best truncate block mt-1" title={bestOpening?.name}>
              {bestOpening ? `${bestOpening.name}` : "—"}
            </span>
            <span className="text-[10px] text-text-muted">
              {bestOpening ? `${bestOpening.winRate}% (${bestOpening.games}g)` : ""}
            </span>
          </div>

          <div className="bg-surface/70 p-3 rounded-lg border border-border/50">
            <span className="text-[10px] text-text-muted uppercase tracking-wider block">
              Avg Opponent Rating
            </span>
            <span className="text-lg font-bold text-text-secondary">
              {stats.length > 0
                ? Math.round(
                    stats.reduce((acc, s) => acc + s.avgOpponentRating * s.games, 0) /
                      totalGames
                  )
                : "—"}
            </span>
          </div>
        </div>

        {/* ─── Visualizations Section ───────────────────────────── */}
        {chartData.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                📊 Category Visualizations
              </span>

              <div className="flex gap-1 text-[11px]">
                <button
                  onClick={() => setChartView("mostPlayed")}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    chartView === "mostPlayed"
                      ? "bg-accent/20 text-accent font-semibold"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  Most Played
                </button>
                <button
                  onClick={() => setChartView("winRate")}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    chartView === "winRate"
                      ? "bg-accent/20 text-accent font-semibold"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  Win Rate %
                </button>
                <button
                  onClick={() => setChartView("share")}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    chartView === "share"
                      ? "bg-accent/20 text-accent font-semibold"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  Share %
                </button>
              </div>
            </div>

            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                {chartView === "mostPlayed" ? (
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <XAxis type="number" stroke="#5f6368" fontSize={10} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="#9aa0a6"
                      fontSize={11}
                      width={140}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1f27",
                        borderColor: "#2d343e",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(val: unknown, name: unknown) => [
                        `${val ?? 0} games`,
                        name === "wins"
                          ? "Wins"
                          : name === "losses"
                          ? "Losses"
                          : "Draws",
                      ]}
                    />
                    <Bar dataKey="wins" stackId="a" fill="#81b64c" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="draws" stackId="a" fill="#5f6368" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="losses" stackId="a" fill="#ca3431" radius={[0, 4, 4, 0]} />
                  </BarChart>
                ) : chartView === "winRate" ? (
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      stroke="#5f6368"
                      fontSize={10}
                      unit="%"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="#9aa0a6"
                      fontSize={11}
                      width={140}
                    />
                    <ReferenceLine x={50} stroke="#f7c631" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1f27",
                        borderColor: "#2d343e",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(val: unknown) => [`${val ?? 0}%`, "Win Rate"]}
                    />
                    <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.winRate >= 50 ? "#81b64c" : "#e58f2a"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="games"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name} (${Math.round((percent || 0) * 100)}%)`}
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`pie-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1f27",
                        borderColor: "#2d343e",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </motion.div>

      {/* ─── Search, Filters & Sorting Controls ─────────────────────── */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              placeholder={`Search in ${activeCategory.title} (e.g. Sicilian, B90)...`}
              className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent/50 transition-all"
            />
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted hidden sm:inline">
              Sort by:
            </span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as OpeningSortBy);
                setPage(0);
              }}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-xs text-text-secondary outline-none focus:border-accent/50"
            >
              <option value="games">Most Played</option>
              <option value="winRate">Win Rate %</option>
              <option value="performance">Performance Rating</option>
              <option value="accuracy">Average Accuracy</option>
              <option value="cpl">Average CPL</option>
              <option value="recent">Recent Activity</option>
              <option value="name">Opening Name</option>
            </select>

            <button
              onClick={() =>
                setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
              }
              className="w-8 h-8 flex items-center justify-center bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary transition-colors"
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        {/* Count summary */}
        <div className="text-xs text-text-muted flex justify-between items-center pt-1 border-t border-border/40">
          <span>
            Showing {paginatedStats.length} of {stats.length} openings in{" "}
            <span className="text-text-primary font-semibold">
              {activeCategory.title}
            </span>
          </span>
          <span>
            Grouped by:{" "}
            <span className="text-accent font-semibold">
              {groupMode === "family" ? "Main Families" : "Specific Variations"}
            </span>
          </span>
        </div>
      </div>

      {/* ─── Sortable Data Table ───────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        {stats.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <p className="text-base">No openings found in this category.</p>
            <p className="text-xs mt-1">
              Try adjusting your search query or selecting another tab.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface/80 border-b border-border text-text-muted uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Opening / ECO</th>
                  <th className="py-3 px-3 text-center">Games (% Share)</th>
                  <th className="py-3 px-3 text-center">Record (W/L/D)</th>
                  <th className="py-3 px-3 text-center">Win Rate</th>
                  <th className="py-3 px-3 text-center">Perf. Rating</th>
                  <th className="py-3 px-3 text-center">Avg Accuracy</th>
                  <th className="py-3 px-3 text-center">Avg Moves</th>
                  <th className="py-3 px-4 text-right">Last Played</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedStats.map((item) => {
                  const isExpanded = expandedRow === item.name;

                  return (
                    <Fragment key={item.name}>
                      <tr
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : item.name)
                        }
                        className="hover:bg-surface-hover/80 transition-colors cursor-pointer group"
                      >
                        {/* Opening Name & ECO */}
                        <td className="py-3.5 px-4 font-medium text-text-primary">
                          <div className="flex items-center gap-2">
                            {item.eco && (
                              <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-accent">
                                {item.eco}
                              </span>
                            )}
                            <span className="group-hover:text-accent transition-colors">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                        </td>

                        {/* Games & % Share Bar */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-semibold text-text-primary tabular-nums">
                              {item.games}
                            </span>
                            <div className="w-16 h-1 bg-surface rounded-full overflow-hidden mt-1">
                              <div
                                className="h-full bg-accent rounded-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    item.percentageOfCategory
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="text-[9px] text-text-muted mt-0.5">
                              {item.percentageOfCategory}%
                            </span>
                          </div>
                        </td>

                        {/* Record W/L/D */}
                        <td className="py-3.5 px-3 text-center font-mono">
                          <div className="inline-flex items-center gap-1 text-[11px]">
                            <span className="text-best font-bold">
                              {item.wins}W
                            </span>
                            <span className="text-text-muted">/</span>
                            <span className="text-blunder font-bold">
                              {item.losses}L
                            </span>
                            <span className="text-text-muted">/</span>
                            <span className="text-text-muted">
                              {item.draws}D
                            </span>
                          </div>
                        </td>

                        {/* Win Rate % Badge */}
                        <td className="py-3.5 px-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded text-xs font-bold tabular-nums ${
                              item.winRate >= 55
                                ? "bg-best/15 text-best border border-best/30"
                                : item.winRate >= 45
                                ? "bg-inaccuracy/15 text-inaccuracy border border-inaccuracy/30"
                                : "bg-blunder/15 text-blunder border border-blunder/30"
                            }`}
                          >
                            {item.winRate}%
                          </span>
                        </td>

                        {/* Performance Rating */}
                        <td className="py-3.5 px-3 text-center font-mono">
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-text-primary text-xs">
                              {item.performanceRating}
                            </span>
                            <span className="text-[9px] text-text-muted">
                              vs {item.avgOpponentRating}
                            </span>
                          </div>
                        </td>

                        {/* Avg Accuracy % */}
                        <td className="py-3.5 px-3 text-center font-mono">
                          {item.avgAccuracy !== null ? (
                            <span className="text-xs font-semibold text-text-secondary">
                              {item.avgAccuracy}%
                            </span>
                          ) : (
                            <span className="text-text-muted text-[11px]">
                              —
                            </span>
                          )}
                        </td>

                        {/* Avg Moves */}
                        <td className="py-3.5 px-3 text-center font-mono text-text-muted">
                          {item.avgMoveCount} moves
                        </td>

                        {/* Last Played Date */}
                        <td className="py-3.5 px-4 text-right text-text-muted">
                          {format(item.lastPlayed, "MMM d, yyyy")}
                        </td>
                      </tr>

                      {/* Expandable Games List Drawer */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0 bg-surface/50">
                            <div className="p-4 border-t border-b border-border/80 space-y-2">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                                  Games in {item.name} ({item.gamesList.length})
                                </h4>
                                <span className="text-[10px] text-text-muted">
                                  Click any game to open review
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {item.gamesList.slice(0, 6).map((g) => (
                                  <div
                                    key={g.id}
                                    onClick={() =>
                                      router.push(
                                        `/dashboard/${username}/games/${g.id}`
                                      )
                                    }
                                    className="p-2.5 rounded-lg bg-surface border border-border hover:border-accent/50 transition-all cursor-pointer flex items-center justify-between text-xs group"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <p className="font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
                                        vs {g.opponentUsername} ({g.opponentRating})
                                      </p>
                                      <p className="text-[10px] text-text-muted">
                                        {format(g.playedAt, "MMM d")} • {g.timeControl}
                                      </p>
                                    </div>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        g.result === "WIN"
                                          ? "bg-best/15 text-best"
                                          : g.result === "LOSS"
                                          ? "bg-blunder/15 text-blunder"
                                          : "bg-surface-hover text-text-muted"
                                      }`}
                                    >
                                      {g.result}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Pagination Controls ──────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs rounded-lg border border-border bg-surface hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            ← Prev
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-8 h-8 text-xs rounded-lg transition-all ${
                  page === i
                    ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                    : "border border-border bg-surface hover:bg-surface-hover text-text-muted"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs rounded-lg border border-border bg-surface hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-helpers ───────────────────────────────────────────────
import { Fragment } from "react";

const PIE_COLORS = [
  "#81b64c",
  "#5c8bb0",
  "#f7c631",
  "#1bada6",
  "#e58f2a",
  "#ca3431",
  "#96bc4b",
  "#a3b86c",
];
