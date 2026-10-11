"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePlayerStore } from "@/stores/player-store";
import { useShallow } from "zustand/react/shallow";
import { useAnalysisStore } from "@/stores/analysis-store";
import { loadCachedAnalysis, saveCachedAnalysis } from "@/lib/analysis/cache";
import ChessBoard from "@/components/chess/ChessBoard";
import BoardControls from "@/components/chess/BoardControls";
import MoveList from "@/components/chess/MoveList";
import EngineLines from "@/components/chess/EngineLines";
import CoachPanel from "@/components/analysis/CoachPanel";
import GameReportCard from "@/components/analysis/GameReportCard";
import GameSummary from "@/components/analysis/GameSummary";
import ThemeToggle from "@/components/layout/ThemeToggle";

import { fetchPlayerProfile, fetchAllGames } from "@/lib/api/chess-com";
import { parseChessComGame } from "@/lib/chess/pgn-parser";
import type { ParsedGame } from "@/types/chess";

export default function GameReviewPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const gameId = params.gameId as string;

  const { games, setUsername, setProfile, setGames } = usePlayerStore(
    useShallow((s) => ({ games: s.games, setUsername: s.setUsername, setProfile: s.setProfile, setGames: s.setGames }))
  );

  const { currentGame, gameAnalysis, moveAnalyses, isAnalyzing, analysisProgress, analysisError, setGame, setAnalysis, setMoveAnalyses, setIsAnalyzing, setAnalysisProgress, setAnalysisError, clearGame, goToMove } = useAnalysisStore(
    useShallow((s) => ({ currentGame: s.currentGame, gameAnalysis: s.gameAnalysis, moveAnalyses: s.moveAnalyses, isAnalyzing: s.isAnalyzing, analysisProgress: s.analysisProgress, analysisError: s.analysisError, setGame: s.setGame, setAnalysis: s.setAnalysis, setMoveAnalyses: s.setMoveAnalyses, setIsAnalyzing: s.setIsAnalyzing, setAnalysisProgress: s.setAnalysisProgress, setAnalysisError: s.setAnalysisError, clearGame: s.clearGame, goToMove: s.goToMove }))
  );

  const [isSyncingLocal, setIsSyncingLocal] = useState(false);
  const [refining, setRefining] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Stop the engine workers when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);
  // Skipping is remembered per game, so opening another game shows its progress again.
  const [skippedGameId, setSkippedGameId] = useState<string | null>(null);
  const manualSkip = skippedGameId === gameId;

  // Fetch games if missing from local store
  useEffect(() => {
    async function loadGameIfMissing() {
      if (games.length > 0) return;
      setIsSyncingLocal(true);
      try {
        setUsername(username);
        const playerProfile = await fetchPlayerProfile(username);
        setProfile(playerProfile);

        const chessComGames = await fetchAllGames(
          username,
          undefined,
          undefined,
          3
        );
        const parsedGames = chessComGames
          .map((g) => {
            try {
              return parseChessComGame(g, username);
            } catch {
              return null;
            }
          })
          .filter((g): g is ParsedGame => g !== null);
        setGames(parsedGames);
      } catch (e) {
        console.error("Failed to load games list for review", e);
      } finally {
        setIsSyncingLocal(false);
      }
    }
    loadGameIfMissing();
  }, [username, games.length, setUsername, setProfile, setGames]);

  // Set active game
  useEffect(() => {
    const game = games.find((g) => g.id === gameId);
    if (game) {
      setGame(game);
    }
    return () => {
      clearGame();
    };
  }, [gameId, games, setGame, clearGame]);

  // Full-game analysis. A cached result is used unless `fresh` is set.
  const handleStartAnalysis = useCallback(async (fresh = false) => {
    if (!currentGame || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress(0);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const cached = fresh ? null : await loadCachedAnalysis(currentGame.id);
      let shown = false;
      const results =
        cached ??
        (await (await import("@/lib/stockfish/analyzer")).analyzeGame(currentGame.moves, currentGame.id, {
          playerColor: currentGame.playerColor,
          signal: controller.signal,
          onProgress: (done, total) => {
            setAnalysisProgress(Math.round((done / total) * 100));
          },
          // Show the review as soon as the fast pass is done; the deeper
          // re-check of critical moves replaces it when it finishes.
          onPreliminary: (preliminary) => {
            shown = true;
            setRefining(true);
            setAnalysis(preliminary);
            setMoveAnalyses(preliminary.moves);
            goToMove(0);
          },
        }));
      if (!cached) void saveCachedAnalysis(results);

      setAnalysis(results);
      setMoveAnalyses(results.moves);
      if (!shown) goToMove(0);
    } catch (err) {
      if (controller.signal.aborted) return;
      setAnalysisError(
        err instanceof Error ? err.message : "Failed to run position analysis"
      );
    } finally {
      setIsAnalyzing(false);
      setRefining(false);
    }
  }, [currentGame, isAnalyzing, setIsAnalyzing, setAnalysisError, setAnalysisProgress, setAnalysis, setMoveAnalyses, goToMove]);

  // Trigger analysis automatically
  useEffect(() => {
    if (currentGame && !gameAnalysis && !isAnalyzing && !analysisError && !manualSkip) {
      handleStartAnalysis();
    }
  }, [currentGame, gameAnalysis, isAnalyzing, analysisError, manualSkip, handleStartAnalysis]);

  // Loading state
  if (!currentGame) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <p className="text-sm text-text-muted">
          {isSyncingLocal
            ? "Fetching game archives from Chess.com..."
            : "Loading game review..."}
        </p>
      </div>
    );
  }

  // Analysis progress screen
  if (!gameAnalysis && (isAnalyzing || !manualSkip)) {
    const totalMoves = currentGame.moves.length;
    const currentMoveNum = Math.min(
      totalMoves,
      Math.ceil((analysisProgress / 100) * totalMoves)
    );

    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="glass-card max-w-sm w-full p-6 flex flex-col gap-4">
          <div>
            <h1 className="text-base font-semibold text-text-primary">Analyzing game</h1>
            <p className="text-sm text-text-muted mt-0.5 truncate">
              vs {currentGame.opponentUsername} ({currentGame.opponentRating})
              {currentGame.openingName ? ` · ${currentGame.openingName}` : ""}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-text-secondary tabular-nums">
              <span>Evaluating move {currentMoveNum}/{totalMoves}</span>
              <span className="font-semibold text-accent">{analysisProgress}%</span>
            </div>
            <div
              className="h-2 bg-background rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={analysisProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-accent rounded-full transition-[width] duration-300"
                style={{ width: `${Math.max(3, analysisProgress)}%` }}
              />
            </div>
          </div>

          {analysisError && (
            <p className="text-xs text-blunder bg-blunder/10 p-2 rounded">{analysisError}</p>
          )}

          <button
            onClick={() => setSkippedGameId(gameId)}
            className="self-end text-sm text-accent hover:underline"
          >
            Skip to the board
          </button>
        </div>
      </div>
    );
  }

  const resultLabel =
    currentGame.result === "WIN" ? "Won" : currentGame.result === "LOSS" ? "Lost" : "Draw";
  const resultClass =
    currentGame.result === "WIN"
      ? "bg-accent/15 text-accent"
      : currentGame.result === "LOSS"
        ? "bg-blunder/15 text-blunder"
        : "bg-surface-hover text-text-secondary";

  return (
    <div className="min-h-screen lg:h-dvh lg:overflow-hidden flex flex-col bg-background text-text-primary">
      <header className="bg-surface border-b border-border shrink-0">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push(`/dashboard/${username}`)}
            aria-label="Back to games"
            className="w-9 h-9 -ml-1 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface-hover transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-semibold truncate">
              vs {currentGame.opponentUsername}{" "}
              <span className="text-text-muted font-normal">({currentGame.opponentRating})</span>
            </h1>
            <p className="text-xs text-text-muted truncate">
              {currentGame.openingName || "Unknown opening"}
            </p>
          </div>
          <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${resultClass}`}>
            {resultLabel}
          </span>
          {refining && (
            <span className="hidden sm:inline text-xs text-text-muted">Checking key moves...</span>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-2 sm:p-4 flex flex-col lg:flex-row gap-3 lg:gap-5 lg:min-h-0">
        {/* Board column: sized by height on desktop so it never overflows */}
        <div className="flex flex-col items-center gap-2 lg:flex-1 lg:min-h-0 lg:justify-center">
          <div className="w-full lg:w-[min(100%,calc(100dvh-9.5rem))]">
            <ChessBoard />
          </div>
          <div className="w-full lg:w-[min(100%,calc(100dvh-9.5rem))]">
            <BoardControls />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1 pb-4">
          {gameAnalysis && (
            <GameReportCard moves={gameAnalysis.moves} playerColor={currentGame.playerColor} />
          )}
          <CoachPanel />
          {gameAnalysis && <GameSummary analysis={gameAnalysis} />}
          <EngineLines />
          <section className="glass-card p-3">
            <h2 className="text-xs font-semibold text-text-muted px-1 pb-2">Moves</h2>
            <div data-move-scroll className="relative max-h-72 overflow-y-auto">
              <MoveList moves={currentGame.moves} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
