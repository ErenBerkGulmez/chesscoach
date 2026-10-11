/**
 * "Win it again": replay a winning position from one of your own games
 * against the engine and keep it winning.
 */
import { Chess } from 'chess.js';
import { evalToWinPercent, type EvalResult } from '@/lib/stockfish/engine';

/** Winning chances the player has to keep, 0-100. */
export const CONVERT_TARGET = 80;
/** Moves the player has to keep them for. */
export const CONVERT_MOVES = 10;

export type ConvertStatus = 'playing' | 'passed' | 'failed';

export interface ConvertVerdict {
  status: ConvertStatus;
  reason: string;
}

/**
 * Winning chances of the side that just moved, from the engine's lines for
 * the position after the move (where the opponent is to move).
 */
export function winAfterMove(fenAfter: string, lines: EvalResult[]): number {
  const chess = new Chess(fenAfter);
  if (chess.isCheckmate()) return 100;
  if (chess.isDraw() || chess.isStalemate()) return 50;
  const best = lines[0];
  if (!best) return 50;
  return 100 - evalToWinPercent(best.score, best.mate);
}

/**
 * Judge the exercise after a move by the player.
 * `movesPlayed` counts the player's moves including this one, and
 * `playerWin` is the player's winning chances after it.
 */
export function judgeConversion(fenAfter: string, playerWin: number, movesPlayed: number): ConvertVerdict {
  const chess = new Chess(fenAfter);
  if (chess.isCheckmate()) return { status: 'passed', reason: 'Checkmate. You converted it.' };
  if (chess.isStalemate()) return { status: 'failed', reason: 'Stalemate. The win is gone.' };
  if (chess.isDraw()) return { status: 'failed', reason: 'The position is now a draw.' };
  if (playerWin < CONVERT_TARGET) {
    return {
      status: 'failed',
      reason: `That move drops your winning chances to ${Math.round(playerWin)}%. You need to stay at ${CONVERT_TARGET}% or more.`,
    };
  }
  if (movesPlayed >= CONVERT_MOVES) {
    return { status: 'passed', reason: `You kept a winning position for ${CONVERT_MOVES} moves.` };
  }
  return { status: 'playing', reason: `${CONVERT_MOVES - movesPlayed} to go. Winning chances: ${Math.round(playerWin)}%.` };
}

/** Judge the position after the engine's reply: the player may have been mated or left with a draw. */
export function judgeAfterReply(fenAfterReply: string): ConvertVerdict | null {
  const chess = new Chess(fenAfterReply);
  if (chess.isCheckmate()) return { status: 'failed', reason: 'You were checkmated.' };
  if (chess.isDraw() || chess.isStalemate()) return { status: 'failed', reason: 'The position is now a draw.' };
  return null;
}
