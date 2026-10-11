"use client";

import { useAnalysisStore } from "@/stores/analysis-store";
import { useShallow } from "zustand/react/shallow";
import { CLASSIFICATION_CONFIG, MoveClassification, PlayerColor } from "@/types/chess";
import type { ParsedMove, MoveAnalysis } from "@/types/chess";
import { useRef, useEffect } from "react";

/**
 * Move List Component
 * 
 * Displays all moves in the game with classification badges.
 * Click a move to navigate to that position.
 * Active move is highlighted and auto-scrolls into view smoothly.
 */
interface MoveListProps {
  moves: ParsedMove[];
}

export default function MoveList({ moves }: MoveListProps) {
  const { currentMoveIndex, moveAnalyses, goToMove } = useAnalysisStore(
    useShallow((s) => ({ currentMoveIndex: s.currentMoveIndex, moveAnalyses: s.moveAnalyses, goToMove: s.goToMove }))
  );

  // Group moves into pairs (white + black)
  const movePairs: Array<{
    number: number;
    white: { move: ParsedMove; index: number; analysis?: MoveAnalysis } | null;
    black: { move: ParsedMove; index: number; analysis?: MoveAnalysis } | null;
  }> = [];

  for (let i = 0; i < moves.length; i += 2) {
    const whiteMove = moves[i];
    const blackMove = moves[i + 1];

    movePairs.push({
      number: whiteMove.moveNumber,
      white: whiteMove
        ? { move: whiteMove, index: i, analysis: moveAnalyses[i] }
        : null,
      black: blackMove
        ? { move: blackMove, index: i + 1, analysis: moveAnalyses[i + 1] }
        : null,
    });
  }

  return (
    <div className="move-list space-y-0.5">
      {movePairs.map((pair) => (
        <div key={pair.number} className="flex items-stretch">
          {/* Move number */}
          <div className="w-8 flex-shrink-0 text-text-muted text-right pr-2 py-1 text-xs font-mono">
            {pair.number}.
          </div>

          {/* White move */}
          <div className="flex-1 min-w-0">
            {pair.white && (
              <MoveCell
                san={pair.white.move.san}
                index={pair.white.index}
                classification={pair.white.analysis?.classification}
                isActive={currentMoveIndex === pair.white.index}
                onClick={() => goToMove(pair.white!.index)}
              />
            )}
          </div>

          {/* Black move */}
          <div className="flex-1 min-w-0">
            {pair.black && (
              <MoveCell
                san={pair.black.move.san}
                index={pair.black.index}
                classification={pair.black.analysis?.classification}
                isActive={currentMoveIndex === pair.black.index}
                onClick={() => goToMove(pair.black!.index)}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Move Cell ──────────────────────────────────────────────

interface MoveCellProps {
  san: string;
  index: number;
  classification?: MoveClassification;
  isActive: boolean;
  onClick: () => void;
}

function MoveCell({ san, classification, isActive, onClick }: MoveCellProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive && ref.current) {
      // Scroll only the move list itself, never the page or sidebar.
      const el = ref.current;
      const box = el.closest("[data-move-scroll]") as HTMLElement | null;
      if (box) {
        const top = el.offsetTop; // the scroll box is the offsetParent (position: relative)
        if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
          box.scrollTo({ top: top - box.clientHeight / 2, behavior: "smooth" });
        }
      }
    }
  }, [isActive]);

  const config = classification
    ? CLASSIFICATION_CONFIG[classification]
    : null;

  // Determine if this is a notable classification (show symbol)
  const showSymbol =
    classification &&
    ![MoveClassification.GOOD, MoveClassification.EXCELLENT, MoveClassification.BEST].includes(
      classification
    );

  const classKey = classification?.toLowerCase() || "";

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`move-item w-full text-left flex items-center gap-1 ${
        isActive ? "active" : ""
      } ${classKey}`}
      style={
        config && showSymbol
          ? { color: config.color }
          : undefined
      }
    >
      <span>{san}</span>
      {showSymbol && config && (
        <span
          className="text-[10px] font-bold opacity-80"
          title={config.description}
        >
          {config.symbol}
        </span>
      )}
    </button>
  );
}
