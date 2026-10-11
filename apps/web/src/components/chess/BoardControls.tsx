"use client";

import { useAnalysisStore } from "@/stores/analysis-store";
import { useShallow } from "zustand/react/shallow";

/**
 * Board Navigation Controls
 *
 * Move navigation and board flip. Complements keyboard shortcuts.
 */
export default function BoardControls() {
  const { currentMoveIndex, moves, isFlipped, goToStart, goBackward, goForward, goToEnd, flipBoard } = useAnalysisStore(
    useShallow((s) => ({ currentMoveIndex: s.currentMoveIndex, moves: s.moves, isFlipped: s.isFlipped, goToStart: s.goToStart, goBackward: s.goBackward, goForward: s.goForward, goToEnd: s.goToEnd, flipBoard: s.flipBoard }))
  );

  const isAtStart = currentMoveIndex <= -1;
  const isAtEnd = currentMoveIndex >= moves.length - 1;

  return (
    <div className="flex items-center justify-between gap-2">
      {/* Navigation buttons */}
      <div className="flex items-center gap-1">
        <NavButton
          onClick={goToStart}
          disabled={isAtStart}
          label="First move"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="11 17 6 12 11 7" />
              <line x1="7" y1="12" x2="18" y2="12" />
              <line x1="6" y1="6" x2="6" y2="18" />
            </svg>
          }
        />
        <NavButton
          onClick={goBackward}
          disabled={isAtStart}
          label="Previous move"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          }
        />
        <NavButton
          onClick={goForward}
          disabled={isAtEnd}
          label="Next move"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          }
        />
        <NavButton
          onClick={goToEnd}
          disabled={isAtEnd}
          label="Last move"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 17 18 12 13 7" />
              <line x1="6" y1="12" x2="17" y2="12" />
              <line x1="18" y1="6" x2="18" y2="18" />
            </svg>
          }
        />
      </div>

      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        <ToolButton
          onClick={flipBoard}
          label="Flip board (F)"
          active={isFlipped}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 014-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 01-4 4H3" />
            </svg>
          }
        />
      </div>

      {/* Move counter */}
      <div className="text-[10px] text-text-muted font-mono tabular-nums">
        {currentMoveIndex < 0 ? "Start" : `${Math.floor(currentMoveIndex / 2) + 1}.${currentMoveIndex % 2 === 0 ? "" : ".."}`}
        {" "}
        <span className="text-text-secondary">
          ({currentMoveIndex + 1}/{moves.length})
        </span>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function NavButton({
  onClick,
  disabled,
  label,
  icon,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-11 h-10 flex items-center justify-center rounded-lg bg-surface border border-border text-text-secondary hover:bg-surface-hover hover:text-accent hover:border-accent/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:text-text-secondary disabled:hover:border-border"
    >
      {icon}
    </button>
  );
}

function ToolButton({
  onClick,
  label,
  active,
  icon,
}: {
  onClick: () => void;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-10 h-10 flex items-center justify-center rounded-md border transition-all ${
        active
          ? "bg-accent/10 border-accent/30 text-accent"
          : "bg-surface border-border text-text-muted hover:bg-surface-hover hover:text-text-secondary"
      }`}
    >
      {icon}
    </button>
  );
}
