"use client";

import { useMemo, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useShallow } from "zustand/react/shallow";
import { evalToBarPercentage, formatEval } from "@/lib/stockfish/engine";
import { CLASSIFICATION_CONFIG } from "@/types/chess";
import type { Square } from "chess.js";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Interactive Chess Board with Evaluation Bar & Custom Move Exploration
 */
export default function ChessBoard() {
  const { currentMoveIndex, isFlipped, showCoordinates, highlightSquares, arrows, moveAnalyses, goForward, goBackward, goToStart, goToEnd, flipBoard, moves, customFen, customMoveSan, customAnalysis, makeCustomMove, resetCustomMove } = useAnalysisStore(
    useShallow((s) => ({ currentMoveIndex: s.currentMoveIndex, isFlipped: s.isFlipped, showCoordinates: s.showCoordinates, highlightSquares: s.highlightSquares, arrows: s.arrows, moveAnalyses: s.moveAnalyses, goForward: s.goForward, goBackward: s.goBackward, goToStart: s.goToStart, goToEnd: s.goToEnd, flipBoard: s.flipBoard, moves: s.moves, customFen: s.customFen, customMoveSan: s.customMoveSan, customAnalysis: s.customAnalysis, makeCustomMove: s.makeCustomMove, resetCustomMove: s.resetCustomMove }))
  );

  const fen =
    customFen ??
    (currentMoveIndex < 0
      ? STARTING_FEN
      : moves[currentMoveIndex]?.fen ?? STARTING_FEN);

  const activeAnalysis =
    customAnalysis ??
    (currentMoveIndex < 0 ? null : moveAnalyses[currentMoveIndex] ?? null);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          goForward();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goBackward();
          break;
        case "Home":
          e.preventDefault();
          goToStart();
          break;
        case "End":
          e.preventDefault();
          goToEnd();
          break;
        case "f":
          if (!e.ctrlKey && !e.metaKey) {
            flipBoard();
          }
          break;
        case "Escape":
          if (customFen) {
            resetCustomMove();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goForward, goBackward, goToStart, goToEnd, flipBoard, customFen, resetCustomMove]);

  // Convert arrows for react-chessboard v5 format
  const boardArrows = useMemo(() => {
    return arrows.map((arrow) => ({
      startSquare: arrow.from,
      endSquare: arrow.to,
      color: arrow.color,
    }));
  }, [arrows]);

  // Custom square styles for highlights
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    Object.entries(highlightSquares).forEach(([square, style]) => {
      styles[square] = style;
    });

    if (activeAnalysis && (currentMoveIndex >= 0 || customFen)) {
      const config = CLASSIFICATION_CONFIG[activeAnalysis.classification];
      if (config) {
        const uci = activeAnalysis.uciMove;
        const to = uci.substring(2, 4);
        styles[to] = {
          ...styles[to],
          backgroundColor: config.bgColor,
          borderRadius: "0",
        };
      }
    }

    return styles;
  }, [highlightSquares, activeAnalysis, currentMoveIndex, customFen]);

  // Eval bar data
  const evalPercent = useMemo(() => {
    if (!activeAnalysis) return 50;
    return evalToBarPercentage(
      activeAnalysis.evalAfter ?? 0,
      activeAnalysis.mateAfter
    );
  }, [activeAnalysis]);

  const evalText = useMemo(() => {
    if (!activeAnalysis) return "0.0";
    return formatEval(
      activeAnalysis.evalAfter ?? 0,
      activeAnalysis.mateAfter
    );
  }, [activeAnalysis]);

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!sourceSquare || !targetSquare) return false;
    makeCustomMove(sourceSquare as Square, targetSquare as Square);
    return true;
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Exploration Banner if playing custom move */}
      {customFen && (
        <div className="bg-accent/15 border border-accent/30 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs text-accent animate-fade-in">
          <div className="flex items-center gap-2 font-medium">
            <span>💡 Exploring variation:</span>
            <span className="font-mono font-bold">{customMoveSan}</span>
          </div>
          <button
            onClick={resetCustomMove}
            className="px-2 py-0.5 rounded bg-accent/20 hover:bg-accent/30 font-semibold text-[11px] transition-colors"
          >
            Reset to game line ↺
          </button>
        </div>
      )}

      <div className="flex gap-0 w-full">
        {/* Eval Bar */}
        <div className="eval-bar flex-shrink-0" style={{ minHeight: "100%" }}>
          <div
            className="eval-bar-fill"
            style={{ height: `${evalPercent}%` }}
          />
          {evalPercent > 50 ? (
            <span className="eval-bar-label eval-bar-label-bottom">
              {evalText}
            </span>
          ) : (
            <span className="eval-bar-label eval-bar-label-top">
              {evalText}
            </span>
          )}
        </div>

        {/* Board */}
        <div className="chess-board-container flex-1">
          <Chessboard
            options={{
              position: fen,
              boardOrientation: isFlipped ? "black" : "white",
              boardStyle: {
                borderRadius: "0",
              },
              darkSquareStyle: { backgroundColor: "#739552" },
              lightSquareStyle: { backgroundColor: "#ebecd0" },
              squareStyles: customSquareStyles,
              arrows: boardArrows,
              showNotation: showCoordinates,
              animationDurationInMs: 250,
              allowDragging: true,
              onPieceDrop: handlePieceDrop,
            }}
          />
        </div>
      </div>
    </div>
  );
}
