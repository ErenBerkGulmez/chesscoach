import { Chess } from 'chess.js';
import type { EvalResult } from '@/lib/stockfish/engine';
import type { MoveAnalysis, PlayerColor } from '@/types/chess';
import { MoveClassification } from '@/types/chess';

/**
 * Engine suggestion for the position BEFORE a move was played.
 * `beforeLines` must be the engine lines for `fenBefore`, not for the
 * position after the move (those are the opponent's replies).
 */
export function bestFromBefore(fenBefore: string, beforeLines: EvalResult[]) {
  const bestMove = beforeLines[0]?.pv[0] ?? null;
  return {
    bestMove,
    bestMoveSan: bestMove ? uciLineToSan(fenBefore, [bestMove])[0] ?? null : null,
    pvLines: beforeLines.map((l) => ({ ...l, pvSan: uciLineToSan(fenBefore, l.pv) })),
  };
}

/** Play a UCI line out from `fen` and return SAN, stopping at the first illegal move. */
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const out: string[] = [];
  try {
    const chess = new Chess(fen);
    for (const uci of uciMoves) {
      const m = chess.move({
        from: uci.substring(0, 2),
        to: uci.substring(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      if (!m) break;
      out.push(m.san);
    }
  } catch {
    // illegal move or bad FEN: return what we have
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Accuracy, average CPL and classification counts for one side only. */
export function summarizePlayerMoves(analyses: MoveAnalysis[], playerColor: PlayerColor) {
  const mine = analyses.filter((m) => m.color === playerColor);
  const accuracy = mine.length
    ? round1(mine.reduce((a, m) => a + m.moveAccuracy, 0) / mine.length)
    : 0;
  const cpl = mine.map((m) => Math.max(0, -(m.evalDelta ?? 0)));
  const averageCpl = cpl.length ? Math.round(cpl.reduce((a, b) => a + b, 0) / cpl.length) : 0;
  const classificationCounts = Object.values(MoveClassification).reduce(
    (acc, cls) => {
      acc[cls] = mine.filter((m) => m.classification === cls).length;
      return acc;
    },
    {} as Record<MoveClassification, number>
  );
  return { accuracy, averageCpl, classificationCounts, moveCount: mine.length };
}
