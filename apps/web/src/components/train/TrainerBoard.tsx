"use client";

import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Square } from "chess.js";

export interface TrainerArrow {
  from: string;
  to: string;
  color?: string;
}

interface Props {
  fen: string;
  orientation: "w" | "b";
  /** Called with a legal move the user made. Leave it out for a board that only shows a position. */
  onMove?: (move: { from: Square; to: Square; san: string; fenAfter: string }) => void;
  /** Squares to tint, e.g. the last move. */
  highlight?: string[];
  arrows?: TrainerArrow[];
  showNotation?: boolean;
}

const LAST_MOVE = "rgba(255, 255, 0, 0.4)";
const SELECTED = "rgba(20, 110, 190, 0.45)";

/**
 * A board for the trainers. Moves can be dragged or made with two taps, and
 * only legal moves get through. Promotions are made to a queen.
 */
export default function TrainerBoard({ fen, orientation, onMove, highlight, arrows, showNotation = true }: Props) {
  // The square picked with the first tap, remembered together with the position it belongs to.
  const [picked, setPicked] = useState<{ fen: string; square: Square } | null>(null);
  const selected = picked && picked.fen === fen ? picked.square : null;

  const tryMove = (from: string, to: string): boolean => {
    if (!onMove) return false;
    try {
      const chess = new Chess(fen);
      const move = chess.move({ from, to, promotion: "q" });
      if (!move) return false;
      setPicked(null);
      onMove({ from: move.from, to: move.to, san: move.san, fenAfter: chess.fen() });
      return true;
    } catch {
      return false;
    }
  };

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    for (const sq of highlight ?? []) styles[sq] = { backgroundColor: LAST_MOVE };
    if (selected) {
      styles[selected] = { backgroundColor: SELECTED };
      try {
        for (const m of new Chess(fen).moves({ square: selected, verbose: true })) {
          styles[m.to] = {
            ...styles[m.to],
            backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.25) 22%, transparent 24%)",
          };
        }
      } catch {
        // not a playable position: no hints
      }
    }
    return styles;
  }, [highlight, selected, fen]);

  const boardArrows = useMemo(
    () => (arrows ?? []).map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? "rgba(0, 128, 0, 0.6)" })),
    [arrows]
  );

  return (
    <div className="chess-board-container w-full">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation === "b" ? "black" : "white",
          boardStyle: { borderRadius: "0" },
          darkSquareStyle: { backgroundColor: "#739552" },
          lightSquareStyle: { backgroundColor: "#ebecd0" },
          squareStyles,
          arrows: boardArrows,
          showNotation,
          animationDurationInMs: 200,
          allowDragging: !!onMove,
          onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? tryMove(sourceSquare, targetSquare) : false),
          onSquareClick: ({ square }) => {
            if (!onMove) return;
            if (selected && selected !== square && tryMove(selected, square)) return;
            let own = false;
            try {
              const chess = new Chess(fen);
              own = chess.get(square as Square)?.color === chess.turn();
            } catch {
              own = false;
            }
            setPicked(own && selected !== square ? { fen, square: square as Square } : null);
          },
        }}
      />
    </div>
  );
}
