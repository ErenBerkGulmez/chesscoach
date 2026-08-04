"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePlayerStore } from "@/stores/player-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { analyzeGame } from "@/lib/stockfish/analyzer";
import {
  CLASSIFICATION_CONFIG,
  MoveClassification,
} from "@/types/chess";
import ChessBoard from "@/components/chess/ChessBoard";
import BoardControls from "@/components/chess/BoardControls";
import MoveList from "@/components/chess/MoveList";
import EvalGraph from "@/components/chess/EvalGraph";
import EngineLines from "@/components/chess/EngineLines";
import AICoachPanel from "@/components/analysis/AICoachPanel";
import PositionMeters from "@/components/analysis/PositionMeters";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { motion } from "framer-motion";

import { fetchPlayerProfile, fetchAllGames } from "@/lib/api/chess-com";
import { parseChessComGame } from "@/lib/chess/pgn-parser";
import type { ParsedGame } from "@/types/chess";

export default function GameReviewPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const gameId = params.gameId as string;

  const { games, setUsername, setProfile, setGames } = usePlayerStore();

  const {
    currentGame,
    gameAnalysis,
    moveAnalyses,
    isAnalyzing,
    analysisProgress,
    analysisError,
    setGame,
    setAnalysis,
    setMoveAnalyses,
    setIsAnalyzing,
    setAnalysisProgress,
    setAnalysisError,
    clearGame,
    goToMove,
  } = useAnalysisStore();

  const [depth] = useState(16);
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);
  const [manualSkip, setManualSkip] = useState(false);

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
      setManualSkip(false);
    }
    return () => {
      clearGame();
    };
  }, [gameId, games, setGame, clearGame]);

  // Start position analysis
  const handleStartAnalysis = useCallback(async () => {
    if (!currentGame || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress(0);

    try {
      const results = await analyzeGame(currentGame.moves, currentGame.id, {
        depth,
        multiPv: 3,
        threads: 2,
        onProgress: (moveIndex, totalMoves) => {
          const progress = Math.round((moveIndex / totalMoves) * 100);
          setAnalysisProgress(progress);
        },
      });

      setAnalysis(results);
      setMoveAnalyses(results.moves);
      goToMove(0);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Failed to run position analysis"
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentGame, isAnalyzing, depth, setIsAnalyzing, setAnalysisError, setAnalysisProgress, setAnalysis, setMoveAnalyses, goToMove]);

  // Trigger analysis automatically
  useEffect(() => {
    if (currentGame && !gameAnalysis && !isAnalyzing && !analysisError && !manualSkip) {
      handleStartAnalysis();
    }
  }, [currentGame, gameAnalysis, isAnalyzing, analysisError, manualSkip, handleStartAnalysis]);

  // Loading state
  if (!currentGame) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center gap-4 overflow-hidden">
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
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Glow background */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Progress card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card max-w-md w-full p-8 text-center flex flex-col items-center gap-6 relative z-10 border border-border/80 shadow-2xl"
        >
          {/* Logo icon */}
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center relative">
            <span className="text-3xl animate-pulse">♞</span>
            <div className="absolute -inset-1 border border-accent/30 rounded-2xl animate-ping opacity-25" />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-lg font-bold text-text-primary">
              Analyzing Game
            </h1>
            <p className="text-xs text-text-muted mt-1">
              vs <span className="text-text-secondary font-semibold">{currentGame.opponentUsername}</span> ({currentGame.opponentRating})
            </p>
            <p className="text-[11px] text-accent mt-0.5 font-medium">
              {currentGame.openingName || "Standard Opening"}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full space-y-2">
            <div className="flex justify-between text-xs text-text-secondary font-mono">
              <span>Evaluating move {currentMoveNum}/{totalMoves}</span>
              <span className="font-bold text-accent">{analysisProgress}%</span>
            </div>
            <div className="h-2.5 bg-surface border border-border rounded-full overflow-hidden p-0.5">
              <motion.div
                className="h-full bg-gradient-to-r from-accent to-emerald-400 rounded-full"
                style={{ width: `${Math.max(5, analysisProgress)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* Footer note & skip */}
          <div className="flex items-center justify-between w-full text-xs text-text-muted pt-2 border-t border-border/50">
            <span>Engine: Stockfish 18 (Depth {depth})</span>
            <button
              onClick={() => setManualSkip(true)}
              className="text-accent hover:underline text-xs"
            >
              Skip to review →
            </button>
          </div>

          {/* Error */}
          {analysisError && (
            <p className="text-xs text-blunder bg-blunder/10 p-2 rounded w-full">
              {analysisError}
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  const analyzedMoves = Object.values(moveAnalyses);
  const dynamicAccuracy =
    analyzedMoves.length > 0
      ? Math.round(
          (analyzedMoves.reduce((acc, m) => acc + m.moveAccuracy, 0) /
            analyzedMoves.length) *
            10
        ) / 10
      : 0;

  const dynamicClassifications = {} as Record<MoveClassification, number>;
  analyzedMoves.forEach((m) => {
    dynamicClassifications[m.classification] =
      (dynamicClassifications[m.classification] || 0) + 1;
  });

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-background text-text-primary">
      {/* Header */}
      <header className="bg-surface border-b border-border shrink-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/dashboard/${username}`)}
              className="text-text-secondary hover:text-accent transition-colors flex items-center gap-1.5 text-sm"
            >
              ← Dashboard
            </button>
            <span className="text-text-muted">|</span>
            <div>
              <h1 className="text-sm font-bold truncate max-w-[200px] sm:max-w-none">
                vs {currentGame.opponentUsername} (
                {currentGame.opponentRating})
              </h1>
              <p className="text-[10px] text-text-muted">
                {currentGame.openingName || "Custom Opening"} •{" "}
                {currentGame.timeControl} •{" "}
                {currentGame.result}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartAnalysis}
              disabled={isAnalyzing}
              className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border text-text-secondary font-medium text-xs rounded-lg transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? "Analyzing..." : "↻ Re-Analyze"}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Review Layout */}
      <div className="flex-1 max-w-[1400px] w-full mx-auto p-4 flex gap-6 overflow-hidden">
        {/* Board Section */}
        <div className="flex-1 flex flex-col items-center justify-between overflow-hidden min-w-0">
          <div className="flex-1 flex items-center justify-center w-full min-h-0">
            <ChessBoard />
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-[450px] flex flex-col shrink-0 h-full overflow-hidden gap-3">
          {/* Coach & Position Meters Panel */}
          <div className="max-h-[45%] overflow-y-auto shrink-0 space-y-3 pr-1">
            {currentGame && <AICoachPanel />}
            <PositionMeters />
            <EngineLines />
          </div>

          {/* Move List & Performance Stats */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
            {/* Move List Card */}
            <div className="glass-card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  Move List
                </h2>
              </div>
              <MoveList moves={currentGame.moves} />
            </div>

            {/* Performance Stats Card */}
            {(gameAnalysis || analyzedMoves.length > 0) && (
              <div className="glass-card p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    {gameAnalysis
                      ? "Game Performance"
                      : "Live Performance"}
                  </h2>
                  <span className="text-accent text-sm font-bold">
                    {gameAnalysis
                      ? gameAnalysis.accuracy
                      : dynamicAccuracy}
                    % Accuracy
                  </span>
                </div>

                {/* Phase Accuracy */}
                {gameAnalysis && (
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="bg-surface p-2 rounded">
                      <p className="text-text-muted">Opening</p>
                      <p className="text-sm font-bold mt-0.5 text-text-secondary">
                        {gameAnalysis.openingAccuracy !== null
                          ? `${gameAnalysis.openingAccuracy}%`
                          : "—"}
                      </p>
                    </div>
                    <div className="bg-surface p-2 rounded">
                      <p className="text-text-muted">Middlegame</p>
                      <p className="text-sm font-bold mt-0.5 text-text-secondary">
                        {gameAnalysis.middlegameAccuracy !== null
                          ? `${gameAnalysis.middlegameAccuracy}%`
                          : "—"}
                      </p>
                    </div>
                    <div className="bg-surface p-2 rounded">
                      <p className="text-text-muted">Endgame</p>
                      <p className="text-sm font-bold mt-0.5 text-text-secondary">
                        {gameAnalysis.endgameAccuracy !== null
                          ? `${gameAnalysis.endgameAccuracy}%`
                          : "—"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Classification Counts */}
                <div className="space-y-1.5">
                  {(
                    [
                      MoveClassification.BRILLIANT,
                      MoveClassification.GREAT,
                      MoveClassification.BEST,
                      MoveClassification.EXCELLENT,
                      MoveClassification.GOOD,
                      MoveClassification.INACCURACY,
                      MoveClassification.MISTAKE,
                      MoveClassification.BLUNDER,
                      MoveClassification.MISSED_WIN,
                      MoveClassification.MISSED_MATE,
                    ] as const
                  ).map((key) => {
                    const count = gameAnalysis
                      ? gameAnalysis.classificationCounts[key] || 0
                      : dynamicClassifications[key] || 0;
                    const config = CLASSIFICATION_CONFIG[key];
                    if (!config || count === 0) return null;

                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-surface transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="font-bold w-4 text-center font-mono"
                            style={{ color: config.color }}
                          >
                            {config.symbol}
                          </span>
                          <span className="text-text-secondary">
                            {config.label}
                          </span>
                        </div>
                        <span className="font-semibold text-text-primary">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Controls & Graph */}
          <div className="shrink-0 space-y-3 pt-1 border-t border-border/50 bg-background">
            <BoardControls />
            <EvalGraph />
          </div>
        </div>
      </div>
    </div>
  );
}
