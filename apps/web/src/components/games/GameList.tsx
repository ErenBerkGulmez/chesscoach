"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { ParsedGame } from "@/types/chess";
import { GameResult, TimeClass } from "@/types/chess";
import { motion } from "framer-motion";

interface GameListProps {
  games: ParsedGame[];
  username: string;
}

const TIME_CLASS_ICONS: Record<TimeClass, string> = {
  [TimeClass.BULLET]: "⚡",
  [TimeClass.BLITZ]: "🔥",
  [TimeClass.RAPID]: "⏱",
  [TimeClass.DAILY]: "📅",
};

const RESULT_STYLES: Record<
  GameResult,
  { bg: string; text: string; label: string }
> = {
  [GameResult.WIN]: { bg: "bg-best/15", text: "text-best", label: "WIN" },
  [GameResult.LOSS]: {
    bg: "bg-blunder/15",
    text: "text-blunder",
    label: "LOSS",
  },
  [GameResult.DRAW]: {
    bg: "bg-text-muted/15",
    text: "text-text-muted",
    label: "DRAW",
  },
};

const ITEMS_PER_PAGE = 25;

export default function GameList({ games, username }: GameListProps) {
  const router = useRouter();
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(games.length / ITEMS_PER_PAGE);
  const paginatedGames = games.slice(
    page * ITEMS_PER_PAGE,
    (page + 1) * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-3">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_80px_140px_100px_80px] gap-3 px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:grid">
        <span>Opponent</span>
        <span className="text-center">Result</span>
        <span className="text-center">Opening</span>
        <span className="text-center">Time</span>
        <span className="text-right">Date</span>
      </div>

      {/* Game rows */}
      {paginatedGames.map((game, idx) => {
        const result = RESULT_STYLES[game.result];
        const timeIcon = TIME_CLASS_ICONS[game.timeClass];

        return (
          <motion.button
            key={game.id || idx}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.3) }}
            onClick={() =>
              router.push(`/dashboard/${username}/games/${game.id}`)
            }
            className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_80px_140px_100px_80px] gap-x-3 gap-y-1 items-center px-4 py-3 rounded-lg bg-surface hover:bg-surface-hover border border-transparent hover:border-border transition-all text-left group"
          >
            {/* Opponent */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                  game.playerColor === "WHITE"
                    ? "bg-white border-gray-300"
                    : "bg-gray-800 border-gray-600"
                }`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                  {game.opponentUsername}
                </p>
                <p className="text-xs text-text-muted">{game.opponentRating}</p>
              </div>
            </div>

            {/* Result */}
            <div className="flex justify-end sm:justify-center">
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded ${result.bg} ${result.text}`}
              >
                {result.label}
              </span>
            </div>

            {/* Opening */}
            <div className="sm:text-center min-w-0">
              <p className="text-xs text-text-secondary truncate">
                {game.openingName || game.eco || "—"}
              </p>
            </div>

            {/* Time control */}
            <div className="hidden sm:block sm:text-center">
              <span className="text-xs text-text-muted">
                {timeIcon} {game.timeControl}
              </span>
            </div>

            {/* Date */}
            <div className="text-right">
              <p className="text-xs text-text-muted">
                {format(game.playedAt, "MMM d")}
              </p>
              <p className="text-[10px] text-text-muted hidden sm:block">
                {format(game.playedAt, "yyyy")}
              </p>
            </div>
          </motion.button>
        );
      })}

      {games.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No games match your filters.
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs rounded-lg border border-border bg-surface hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            ← Prev
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 7 + i;
              } else {
                pageNum = page - 3 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 text-xs rounded-lg transition-all ${
                    page === pageNum
                      ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                      : "border border-border bg-surface hover:bg-surface-hover text-text-muted"
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
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
