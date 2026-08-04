/**
 * King Safety Analyzer Engine
 * 
 * Computes pawn shield integrity, king flight squares, open files near king,
 * and attacker/defender density.
 */

import { Chess, Square } from 'chess.js';

export interface KingSafetyDetails {
  whiteKingSquare: Square;
  blackKingSquare: Square;
  whiteShieldScore: number; // 0-100
  blackShieldScore: number; // 0-100
  whiteFlightSquares: number;
  blackFlightSquares: number;
  openFilesNearWhiteKing: string[];
  openFilesNearBlackKing: string[];
  whiteKingDangerScore: number; // 0-100
  blackKingDangerScore: number; // 0-100
}

/**
 * Evaluate King Safety for White and Black.
 */
export function evaluateKingSafety(fen: string): KingSafetyDetails {
  const chess = new Chess(fen);
  const board = chess.board();

  let whiteKingSquare: Square = 'e1';
  let blackKingSquare: Square = 'e8';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k') {
        const sq = `${String.fromCharCode(97 + c)}${8 - r}` as Square;
        if (p.color === 'w') whiteKingSquare = sq;
        else blackKingSquare = sq;
      }
    }
  }

  // Calculate pawn shield for White King
  const whiteShieldScore = calculatePawnShield(chess, whiteKingSquare, 'w');
  const blackShieldScore = calculatePawnShield(chess, blackKingSquare, 'b');

  // Flight squares
  const whiteFlightSquares = chess.moves({ square: whiteKingSquare }).length;
  const blackFlightSquares = chess.moves({ square: blackKingSquare }).length;

  const openFilesNearWhiteKing = getOpenFilesNearSquare(board, whiteKingSquare);
  const openFilesNearBlackKing = getOpenFilesNearSquare(board, blackKingSquare);

  const whiteKingDangerScore = Math.min(
    100,
    Math.max(0, 100 - whiteShieldScore + openFilesNearWhiteKing.length * 20)
  );
  const blackKingDangerScore = Math.min(
    100,
    Math.max(0, 100 - blackShieldScore + openFilesNearBlackKing.length * 20)
  );

  return {
    whiteKingSquare,
    blackKingSquare,
    whiteShieldScore,
    blackShieldScore,
    whiteFlightSquares,
    blackFlightSquares,
    openFilesNearWhiteKing,
    openFilesNearBlackKing,
    whiteKingDangerScore,
    blackKingDangerScore,
  };
}

function calculatePawnShield(chess: Chess, kingSq: Square, color: 'w' | 'b'): number {
  const col = kingSq.charCodeAt(0) - 97;
  const rank = parseInt(kingSq[1], 10);
  const board = chess.board();

  let shieldPawns = 0;
  const shieldRank = color === 'w' ? rank + 1 : rank - 1;

  if (shieldRank >= 1 && shieldRank <= 8) {
    for (const c of [col - 1, col, col + 1]) {
      if (c >= 0 && c <= 7) {
        const r = 8 - shieldRank;
        const p = board[r][c];
        if (p && p.type === 'p' && p.color === color) {
          shieldPawns++;
        }
      }
    }
  }

  return Math.min(100, Math.round((shieldPawns / 3) * 100));
}

function getOpenFilesNearSquare(board: any, sq: Square): string[] {
  const col = sq.charCodeAt(0) - 97;
  const openFiles: string[] = [];

  for (const c of [col - 1, col, col + 1]) {
    if (c >= 0 && c <= 7) {
      let hasPawns = false;
      for (let r = 0; r < 8; r++) {
        const p = board[r][c];
        if (p && p.type === 'p') {
          hasPawns = true;
          break;
        }
      }
      if (!hasPawns) {
        openFiles.push(String.fromCharCode(97 + c));
      }
    }
  }

  return openFiles;
}
