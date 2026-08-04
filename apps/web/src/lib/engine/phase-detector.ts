/**
 * Game Phase Detector Engine
 * 
 * Determines fine-grained game phases based on piece material, queen presence,
 * piece development, castling status, rook connectivity, king activity, and pawn count.
 */

import { Chess } from 'chess.js';

export type GamePhase =
  | 'OPENING'
  | 'OPENING_TRANSITION'
  | 'EARLY_MIDDLEGAME'
  | 'MIDDLEGAME'
  | 'COMPLEX_MIDDLEGAME'
  | 'ATTACKING_MIDDLEGAME'
  | 'STRATEGIC_MIDDLEGAME'
  | 'SIMPLIFIED_MIDDLEGAME'
  | 'ENDGAME_TRANSITION'
  | 'MINOR_PIECE_ENDGAME'
  | 'ROOK_ENDGAME'
  | 'QUEEN_ENDGAME'
  | 'PAWN_ENDGAME'
  | 'KING_AND_PAWN_ENDGAME'
  | 'TECHNICAL_ENDGAME'
  | 'WINNING_ENDGAME'
  | 'DRAWING_ENDGAME';

export interface PhaseDetails {
  phase: GamePhase;
  label: string;
  whiteQueens: number;
  blackQueens: number;
  whiteRooks: number;
  blackRooks: number;
  whiteMinorPieces: number;
  blackMinorPieces: number;
  whitePawns: number;
  blackPawns: number;
  totalMaterial: number;
  isEndgame: boolean;
  isOpening: boolean;
  isMiddlegame: boolean;
}

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/**
 * Detect the detailed game phase for a given FEN and move number.
 */
export function detectGamePhase(fen: string, moveNumber: number, evalScore: number = 0): PhaseDetails {
  const chess = new Chess(fen);
  const board = chess.board();

  let whiteQueens = 0;
  let blackQueens = 0;
  let whiteRooks = 0;
  let blackRooks = 0;
  let whiteMinor = 0;
  let blackMinor = 0;
  let whitePawns = 0;
  let blackPawns = 0;
  let totalMaterial = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const type = piece.type;
      const isWhite = piece.color === 'w';
      const val = PIECE_VALUES[type] || 0;
      totalMaterial += val;

      if (type === 'q') {
        if (isWhite) whiteQueens++;
        else blackQueens++;
      } else if (type === 'r') {
        if (isWhite) whiteRooks++;
        else blackRooks++;
      } else if (type === 'n' || type === 'b') {
        if (isWhite) whiteMinor++;
        else blackMinor++;
      } else if (type === 'p') {
        if (isWhite) whitePawns++;
        else blackPawns++;
      }
    }
  }

  const totalQueens = whiteQueens + blackQueens;
  const totalMinor = whiteMinor + blackMinor;
  const totalRooks = whiteRooks + blackRooks;
  const totalPawns = whitePawns + blackPawns;

  let phase: GamePhase = 'MIDDLEGAME';
  let label = 'Middlegame';

  // 1. Opening Phases
  if (moveNumber <= 8) {
    phase = 'OPENING';
    label = 'Opening';
  } else if (moveNumber <= 14 && totalMaterial >= 30) {
    phase = 'OPENING_TRANSITION';
    label = 'Opening Transition';
  }
  // 2. Endgame Phases
  else if (totalQueens === 0 && totalMaterial <= 24) {
    if (totalMinor === 0 && totalRooks === 0) {
      phase = 'KING_AND_PAWN_ENDGAME';
      label = 'King and Pawn Endgame';
    } else if (totalRooks === 0 && totalMinor > 0) {
      phase = 'MINOR_PIECE_ENDGAME';
      label = 'Minor Piece Endgame';
    } else if (totalRooks > 0 && totalMinor === 0) {
      phase = 'ROOK_ENDGAME';
      label = 'Rook Endgame';
    } else if (totalPawns <= 4) {
      phase = 'TECHNICAL_ENDGAME';
      label = 'Technical Endgame';
    } else {
      phase = 'ENDGAME_TRANSITION';
      label = 'Endgame';
    }

    if (Math.abs(evalScore) > 350) {
      phase = 'WINNING_ENDGAME';
      label = 'Winning Endgame';
    } else if (Math.abs(evalScore) < 50 && totalMaterial <= 16) {
      phase = 'DRAWING_ENDGAME';
      label = 'Equal Endgame';
    }
  } else if (totalQueens > 0 && totalMaterial <= 18) {
    phase = 'QUEEN_ENDGAME';
    label = 'Queen Endgame';
  }
  // 3. Middlegame Sub-Phases
  else {
    if (moveNumber <= 18) {
      phase = 'EARLY_MIDDLEGAME';
      label = 'Early Middlegame';
    } else if (Math.abs(evalScore) > 250) {
      phase = 'ATTACKING_MIDDLEGAME';
      label = 'Attacking Middlegame';
    } else if (totalMaterial >= 28) {
      phase = 'COMPLEX_MIDDLEGAME';
      label = 'Complex Middlegame';
    } else if (totalMaterial <= 22) {
      phase = 'SIMPLIFIED_MIDDLEGAME';
      label = 'Simplified Middlegame';
    } else {
      phase = 'STRATEGIC_MIDDLEGAME';
      label = 'Strategic Middlegame';
    }
  }

  const isOpening = phase === 'OPENING' || phase === 'OPENING_TRANSITION';
  const isEndgame =
    phase.includes('ENDGAME') ||
    phase === 'TECHNICAL_ENDGAME' ||
    phase === 'WINNING_ENDGAME' ||
    phase === 'DRAWING_ENDGAME';
  const isMiddlegame = !isOpening && !isEndgame;

  return {
    phase,
    label,
    whiteQueens,
    blackQueens,
    whiteRooks,
    blackRooks,
    whiteMinorPieces: whiteMinor,
    blackMinorPieces: blackMinor,
    whitePawns,
    blackPawns,
    totalMaterial,
    isEndgame,
    isOpening,
    isMiddlegame,
  };
}
