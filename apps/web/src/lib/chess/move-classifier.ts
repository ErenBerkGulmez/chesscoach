/**
 * Move Classification Algorithm
 * 
 * Classifies chess moves based on engine evaluation differences,
 * similar to Chess.com's system but with transparent reasoning.
 * 
 * Classification is determined by:
 * 1. Centipawn loss (CPL) = how much worse the played move is vs. the best move
 * 2. Position context (winning, losing, equal)
 * 3. Tactical flags (mate, sacrifices, forced lines)
 */

import { MoveClassification } from '@/types/chess';
import type { EvalResult } from '@/lib/stockfish/engine';

export interface ClassificationInput {
  /** Evaluation BEFORE the move (from moving side's perspective) */
  evalBefore: number | null;
  mateBefore: number | null;
  /** Evaluation AFTER the move (from moving side's perspective) */
  evalAfter: number | null;
  mateAfter: number | null;
  /** Engine's best move evaluation (from moving side's perspective) */
  bestMoveEval: number | null;
  bestMoveMate: number | null;
  /** Whether the played move matches the engine's best move */
  isEngineBestMove: boolean;
  /** UCI representation of the played move */
  playedMove: string;
  /** UCI representation of the engine's best move */
  bestMove: string;
  /** Whether this is white's move */
  isWhiteMove: boolean;
  /** Full engine output for context */
  pvLines: EvalResult[];
  /** Is a capture? */
  isCapture: boolean;
}

/**
 * Helper: Normalize evaluation to the moving side's perspective.
 * Stockfish reports from white's perspective; we need the moving side's view.
 */
function normalizeEvalForSide(score: number, isWhite: boolean): number {
  return isWhite ? score : -score;
}

/**
 * Helper: Check if a position has a forced mate
 */
function hasMate(mate: number | null): boolean {
  return mate !== null && mate !== 0;
}

/**
 * Helper: Check if a position is winning (>300cp or forced mate)
 */
function isWinning(eval_: number | null, mate: number | null): boolean {
  if (hasMate(mate) && mate! > 0) return true;
  return eval_ !== null && eval_ > 300;
}

/**
 * Helper: Calculate centipawn loss from the moving player's perspective
 */
function calculateCPL(
  bestEval: number | null,
  playedEval: number | null,
  bestMate: number | null,
  playedMate: number | null
): number {
  // If best move was mate and we didn't play it
  if (hasMate(bestMate) && bestMate! > 0 && !hasMate(playedMate)) {
    return 1000; // Massive loss for missing mate
  }
  if (hasMate(bestMate) && bestMate! > 0 && hasMate(playedMate) && playedMate! > 0) {
    // Both are mate, but different depth
    return Math.max(0, (playedMate! - bestMate!) * 50);
  }
  if (bestEval === null || playedEval === null) return 0;
  return Math.max(0, bestEval - playedEval);
}

/**
 * Detect if a move is a sacrifice (loses material but maintains/improves eval)
 */
function isSacrifice(input: ClassificationInput): boolean {
  if (!input.isCapture) return false;
  // A sacrifice is when you give up material but the position is still good
  // This is a simplified heuristic
  if (input.evalBefore !== null && input.evalAfter !== null) {
    const evalChange = (input.evalAfter) - (input.evalBefore);
    // If eval stays roughly same or improves despite material change
    return evalChange >= -50;
  }
  return false;
}

/**
 * Check if the played move is the ONLY good move (all alternatives are significantly worse)
 */
function isOnlyGoodMove(pvLines: EvalResult[], bestEval: number): boolean {
  if (pvLines.length < 2) return false;
  const secondBest = pvLines[1];
  if (!secondBest) return false;
  
  const secondBestScore = secondBest.mate !== null 
    ? (secondBest.mate > 0 ? 10000 : -10000)
    : secondBest.score;
  
  // If best move is 150+ cp better than second best, it's the only good move
  return Math.abs(bestEval - secondBestScore) > 150;
}

/**
 * Classify a move based on engine analysis.
 * 
 * The classification considers:
 * - Centipawn loss relative to the engine's best move
 * - Positional context (winning/losing/equal)
 * - Tactical elements (mates, sacrifices)
 * - Whether the move was the only good option
 */
export function classifyMove(input: ClassificationInput): MoveClassification {
  const {
    evalBefore,
    mateBefore,
    evalAfter,
    mateAfter,
    bestMoveEval,
    bestMoveMate,
    isEngineBestMove,
    pvLines,
  } = input;

  // ─── MISSED MATE ─────────────────────────────────────────
  // Player had a forced mate but didn't play it
  if (hasMate(mateBefore) && mateBefore! > 0 && !hasMate(mateAfter)) {
    return MoveClassification.MISSED_MATE;
  }
  // Had mate but played a longer mate (still bad if big difference)
  if (hasMate(mateBefore) && mateBefore! > 0 && hasMate(mateAfter) && mateAfter! < 0) {
    return MoveClassification.MISSED_MATE;
  }

  // ─── MISSED WIN ──────────────────────────────────────────
  // Player had a big advantage but threw it away
  if (isWinning(evalBefore, mateBefore) && evalAfter !== null && evalAfter < 100) {
    return MoveClassification.MISSED_WIN;
  }

  // ─── CPL-based classification ────────────────────────────
  const cpl = calculateCPL(bestMoveEval, evalAfter, bestMoveMate, mateAfter);

  // ─── BRILLIANT ───────────────────────────────────────────
  // The only good move in a complex position, or a sacrifice that works
  if (isEngineBestMove && cpl === 0) {
    if (isSacrifice(input) && isOnlyGoodMove(pvLines, bestMoveEval ?? 0)) {
      return MoveClassification.BRILLIANT;
    }
    if (isOnlyGoodMove(pvLines, bestMoveEval ?? 0) && pvLines.length >= 3) {
      // Complex position where only one move works
      const complexity = pvLines.length >= 3 && 
        Math.abs((pvLines[0]?.score ?? 0) - (pvLines[2]?.score ?? 0)) > 200;
      if (complexity) {
        return MoveClassification.BRILLIANT;
      }
    }
  }

  // ─── GREAT ───────────────────────────────────────────────
  // Top engine choice in a position with good alternatives
  if (isEngineBestMove && cpl === 0 && pvLines.length >= 2) {
    const secondBestLoss = Math.abs(
      (pvLines[0]?.score ?? 0) - (pvLines[1]?.score ?? 0)
    );
    if (secondBestLoss > 80) {
      return MoveClassification.GREAT;
    }
  }

  // ─── BEST ────────────────────────────────────────────────
  if (isEngineBestMove || cpl === 0) {
    return MoveClassification.BEST;
  }

  // ─── EXCELLENT ───────────────────────────────────────────
  if (cpl <= 10) {
    return MoveClassification.EXCELLENT;
  }

  // ─── GOOD ────────────────────────────────────────────────
  if (cpl <= 25) {
    return MoveClassification.GOOD;
  }

  // ─── INACCURACY ──────────────────────────────────────────
  if (cpl <= 50) {
    return MoveClassification.INACCURACY;
  }

  // ─── MISTAKE ─────────────────────────────────────────────
  if (cpl <= 150) {
    return MoveClassification.MISTAKE;
  }

  // ─── BLUNDER ─────────────────────────────────────────────
  return MoveClassification.BLUNDER;
}

/**
 * Calculate move accuracy (0-100) from centipawn loss.
 * Uses a formula similar to Chess.com's accuracy calculation.
 * 
 * Formula: accuracy = 103.1668 * exp(-0.04354 * (winPercentDelta)) - 3.1668
 * Where winPercentDelta is the change in win probability
 */
export function calculateMoveAccuracy(
  evalBefore: number | null,
  evalAfter: number | null,
  mateBefore: number | null,
  mateAfter: number | null
): number {
  const winBefore = evalToWinProb(evalBefore, mateBefore);
  const winAfter = evalToWinProb(evalAfter, mateAfter);
  
  const delta = Math.max(0, winBefore - winAfter);
  
  // Chess.com-style accuracy formula
  const accuracy = 103.1668 * Math.exp(-0.04354 * delta) - 3.1668;
  
  return Math.min(100, Math.max(0, accuracy));
}

/**
 * Convert centipawn eval to win probability (0-100)
 */
function evalToWinProb(score: number | null, mate: number | null): number {
  if (mate !== null) {
    return mate > 0 ? 100 : 0;
  }
  if (score === null) return 50;
  
  // Lichess formula
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score)) - 1);
}

/**
 * Calculate overall game accuracy from move accuracies.
 * Weighted average that penalizes blunders more heavily.
 */
export function calculateGameAccuracy(moveAccuracies: number[]): number {
  if (moveAccuracies.length === 0) return 0;
  
  // Use a harmonic-influenced mean that weights bad moves more
  const sum = moveAccuracies.reduce((acc, a) => acc + a, 0);
  return sum / moveAccuracies.length;
}

/**
 * Calculate average centipawn loss from an array of CPL values.
 */
export function calculateAverageCPL(cplValues: number[]): number {
  if (cplValues.length === 0) return 0;
  const sum = cplValues.reduce((acc, cpl) => acc + cpl, 0);
  return Math.round(sum / cplValues.length);
}
