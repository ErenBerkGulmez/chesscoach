"use client";

import { usePlayerStore } from "@/stores/player-store";
import { useShallow } from "zustand/react/shallow";
import { TimeClass, GameResult, PlayerColor } from "@/types/chess";
import { useState } from "react";

/**
 * Game Filters Component
 *
 * Provides filtering controls for the game list:
 * - Time class (bullet, blitz, rapid, daily)
 * - Result (win, loss, draw)
 * - Color (white, black)
 * - Opponent search
 * - Sort options
 */
export default function GameFilters() {
  const { filters, searchQuery, sortBy, sortOrder, games, filteredGames, setFilters, clearFilters, setSearchQuery, setSortBy, toggleSortOrder } = usePlayerStore(
    useShallow((s) => ({ filters: s.filters, searchQuery: s.searchQuery, sortBy: s.sortBy, sortOrder: s.sortOrder, games: s.games, filteredGames: s.filteredGames, setFilters: s.setFilters, clearFilters: s.clearFilters, setSearchQuery: s.setSearchQuery, setSortBy: s.setSortBy, toggleSortOrder: s.toggleSortOrder }))
  );

  const [isExpanded, setIsExpanded] = useState(false);

  const hasActiveFilters = !!(
    filters.timeClass ||
    filters.result ||
    filters.color ||
    searchQuery
  );

  return (
    <div className="space-y-3">
      {/* Search bar + Toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search opponent, opening, ECO..."
            className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent/50 focus:shadow-[0_0_0_3px_rgba(129,182,76,0.08)] transition-all"
          />
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`px-3 py-2 text-xs rounded-lg border transition-all flex items-center gap-1.5 ${
            hasActiveFilters
              ? "bg-accent/10 border-accent/30 text-accent"
              : "bg-surface border-border text-text-muted hover:bg-surface-hover hover:text-text-secondary"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filters
          {hasActiveFilters && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          )}
        </button>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-2 py-2 bg-surface border border-border rounded-lg text-xs text-text-secondary outline-none focus:border-accent/50"
        >
          <option value="date">Date</option>
          <option value="rating">Rating</option>
          <option value="result">Result</option>
        </select>

        <button
          onClick={toggleSortOrder}
          className="w-8 h-8 flex items-center justify-center bg-surface border border-border rounded-lg text-text-muted hover:text-text-secondary transition-colors"
          title={sortOrder === "asc" ? "Ascending" : "Descending"}
        >
          {sortOrder === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {/* Expandable filter panel */}
        {isExpanded && (
          <div
            className="overflow-hidden"
          >
            <div className="glass-card p-4 space-y-4">
              {/* Time class filter */}
              <div>
                <label className="text-[10px] text-text-muted uppercase tracking-wider font-bold block mb-2">
                  Time Control
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: undefined, label: "All", icon: "" },
                    { value: TimeClass.BULLET, label: "Bullet", icon: "⚡" },
                    { value: TimeClass.BLITZ, label: "Blitz", icon: "🔥" },
                    { value: TimeClass.RAPID, label: "Rapid", icon: "⏱" },
                    { value: TimeClass.DAILY, label: "Daily", icon: "📅" },
                  ].map((tc) => (
                    <FilterChip
                      key={tc.label}
                      label={`${tc.icon} ${tc.label}`}
                      active={filters.timeClass === tc.value}
                      onClick={() => setFilters({ timeClass: tc.value })}
                    />
                  ))}
                </div>
              </div>

              {/* Result filter */}
              <div>
                <label className="text-[10px] text-text-muted uppercase tracking-wider font-bold block mb-2">
                  Result
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: undefined, label: "All" },
                    { value: GameResult.WIN, label: "Win" },
                    { value: GameResult.LOSS, label: "Loss" },
                    { value: GameResult.DRAW, label: "Draw" },
                  ].map((r) => (
                    <FilterChip
                      key={r.label}
                      label={r.label}
                      active={filters.result === r.value}
                      onClick={() => setFilters({ result: r.value })}
                    />
                  ))}
                </div>
              </div>

              {/* Color filter */}
              <div>
                <label className="text-[10px] text-text-muted uppercase tracking-wider font-bold block mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: undefined, label: "Both" },
                    { value: PlayerColor.WHITE, label: "⬜ White" },
                    { value: PlayerColor.BLACK, label: "⬛ Black" },
                  ].map((c) => (
                    <FilterChip
                      key={c.label}
                      label={c.label}
                      active={filters.color === c.value}
                      onClick={() => setFilters({ color: c.value })}
                    />
                  ))}
                </div>
              </div>

              {/* Clear filters button */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-accent hover:text-accent-hover transition-colors font-medium"
                >
                  ✕ Clear all filters
                </button>
              )}
            </div>
          </div>
        )}

      {/* Results count */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          {hasActiveFilters
            ? `${filteredGames.length} of ${games.length} games`
            : `${games.length} games`}
        </span>
      </div>
    </div>
  );
}

// ─── FilterChip ─────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full border transition-all font-medium ${
        active
          ? "bg-accent/15 border-accent/40 text-accent"
          : "bg-surface border-border text-text-muted hover:bg-surface-hover hover:text-text-secondary hover:border-border"
      }`}
    >
      {label}
    </button>
  );
}
