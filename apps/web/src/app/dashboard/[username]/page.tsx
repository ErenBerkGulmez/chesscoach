"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePlayerStore } from "@/stores/player-store";
import { useShallow } from "zustand/react/shallow";
import {
  fetchPlayerProfile,
  fetchAllGames,
} from "@/lib/api/chess-com";
import { parseChessComGame } from "@/lib/chess/pgn-parser";
import type { ParsedGame } from "@/types/chess";
import GameList from "@/components/games/GameList";
import GameFilters from "@/components/games/GameFilters";
import dynamic from "next/dynamic";

// The statistics tab pulls in charting code; load it only when opened.
const StatsOverview = dynamic(() => import("@/components/dashboard/StatsOverview"), {
  ssr: false,
  loading: () => <p className="text-sm text-text-muted py-8 text-center">Loading statistics...</p>,
});
import ThemeToggle from "@/components/layout/ThemeToggle";
import SiteFooter from "@/components/layout/SiteFooter";

export default function DashboardPage() {
  const params = useParams();
  const username = params.username as string;

  const { profile, games, filteredGames, isSyncing, syncProgress, syncError, filters, searchQuery, setUsername, setProfile, setGames, setIsSyncing, setSyncProgress, setSyncError } = usePlayerStore(
    useShallow((s) => ({ profile: s.profile, games: s.games, filteredGames: s.filteredGames, isSyncing: s.isSyncing, syncProgress: s.syncProgress, syncError: s.syncError, filters: s.filters, searchQuery: s.searchQuery, setUsername: s.setUsername, setProfile: s.setProfile, setGames: s.setGames, setIsSyncing: s.setIsSyncing, setSyncProgress: s.setSyncProgress, setSyncError: s.setSyncError }))
  );

  const [activeTab, setActiveTab] = useState<"games" | "stats">(
    "games"
  );

  // Fetch profile and games on mount
  const syncPlayer = useCallback(async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncError(null);
    setUsername(username);

    try {
      // Fetch profile
      const playerProfile = await fetchPlayerProfile(username);
      setProfile(playerProfile);

      // Fetch all games
      const chessComGames = await fetchAllGames(
        username,
        undefined,
        (completed, total) => {
          setSyncProgress(completed, total);
        }
      );

      // Parse games
      const parsedGames: ParsedGame[] = chessComGames
        .map((g) => {
          try {
            return parseChessComGame(g, username);
          } catch {
            return null;
          }
        })
        .filter((g): g is ParsedGame => g !== null)
        .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());

      setGames(parsedGames);
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : "Failed to fetch games"
      );
    } finally {
      setIsSyncing(false);
    }
  }, [
    username,
    isSyncing,
    setUsername,
    setProfile,
    setGames,
    setIsSyncing,
    setSyncProgress,
    setSyncError,
  ]);

  useEffect(() => {
    syncPlayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const hasActiveFilters = !!(
    filters.timeClass ||
    filters.result ||
    filters.color ||
    searchQuery
  );

  const displayGames = hasActiveFilters ? filteredGames : games;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="text-lg font-bold text-accent hover:text-accent-hover transition-colors"
            >
              ♞<span className="hidden sm:inline"> Chess Coach</span>
            </Link>
            <span className="text-text-muted hidden sm:inline">/</span>
            <div className="flex items-center gap-2">
              {profile?.avatar && (
                <img
                  src={profile.avatar}
                  alt={username}
                  className="w-7 h-7 rounded-full"
                />
              )}
              <span className="font-semibold text-text-primary truncate">
                {profile?.title && (
                  <span className="text-accent mr-1 text-sm font-bold">
                    {profile.title}
                  </span>
                )}
                {username}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted hidden sm:inline">
              {games.length} games
            </span>
            <button
              onClick={syncPlayer}
              disabled={isSyncing}
              aria-label="Refresh games"
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isSyncing ? "Syncing..." : <>↻<span className="hidden sm:inline"> Refresh</span></>}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Sync Progress */}
      {isSyncing && (
        <div className="bg-surface-hover border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2">
            <div className="flex items-center gap-3">
              <svg
                className="animate-spin h-4 w-4 text-accent"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="text-sm text-text-secondary">
                Fetching games... {syncProgress.completed}/{syncProgress.total}{" "}
                archives
              </span>
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{
                    width: syncProgress.total
                      ? `${(syncProgress.completed / syncProgress.total) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {syncError && (
        <div className="bg-blunder/10 border-b border-blunder/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
            <p className="text-sm text-blunder">{syncError}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1">
            {(
              [
                { key: "games", label: "Games", icon: "♟" },
                { key: "stats", label: "Statistics", icon: "📊" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? "text-accent"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
                {tab.key === "games" && games.length > 0 && (
                  <span className="ml-1.5 text-xs text-text-muted">
                    ({games.length})
                  </span>
                )}
                {activeTab === tab.key && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                  />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">
        {activeTab === "games" && (
          <div
            key="games"
            className="space-y-4"
          >
            <GameFilters />
            {!isSyncing && games.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-text-muted text-lg">No games found yet.</p>
                <p className="text-text-muted text-sm mt-2">
                  Games will appear once syncing is complete.
                </p>
              </div>
            ) : (
              <GameList
                games={displayGames}
                username={username}
              />
            )}
          </div>
        )}

        {activeTab === "stats" && (
          <div
            key="stats"
          >
            <StatsOverview />
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
