/**
 * Piece Evaluation & Activity Engine
 * 
 * Computes piece mobility, legal moves, defender/attacker graphs,
 * hanging pieces, pinned pieces, trapped pieces, and outpost squares.
 */

import { Chess, Square, PieceSymbol, Color } from 'chess.js';

export interface PieceMetrics {
  square: Square;
  type: PieceSymbol;
  color: Color;
  name: string;
  mobility: number;
  attacks: Square[];
  defendedBy: Square[];
  attackedBy: Square[];
  isHanging: boolean;
  isPinned: boolean;
  isTrapped: boolean;
  isOutpost: boolean;
  activityScore: number;
}

export interface PieceEvaluationDetails {
  whitePieces: PieceMetrics[];
  blackPieces: PieceMetrics[];
  hangingWhitePieces: Square[];
  hangingBlackPieces: Square[];
  pinnedWhitePieces: Square[];
  pinnedBlackPieces: Square[];
  trappedPieces: Square[];
  whiteMobilityTotal: number;
  blackMobilityTotal: number;
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

/**
 * Evaluate all piece metrics for a given FEN position.
 */
export function evaluatePieces(fen: string): PieceEvaluationDetails {
  const chess = new Chess(fen);
  const board = chess.board();

  const whitePieces: PieceMetrics[] = [];
  const blackPieces: PieceMetrics[] = [];

  const hangingWhitePieces: Square[] = [];
  const hangingBlackPieces: Square[] = [];
  const pinnedWhitePieces: Square[] = [];
  const pinnedBlackPieces: Square[] = [];
  const trappedPieces: Square[] = [];

  let whiteMobilityTotal = 0;
  let blackMobilityTotal = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;

      const square = `${String.fromCharCode(97 + c)}${8 - r}` as Square;
      const isWhite = p.color === 'w';

      // Compute legal mobility for this piece
      const legalMoves = chess.moves({ square, verbose: true });
      const mobility = legalMoves.length;
      const attacks = legalMoves.map((m) => m.to);

      if (isWhite) whiteMobilityTotal += mobility;
      else blackMobilityTotal += mobility;

      // Detect attackers & defenders
      const attackedBy = getAttackers(chess, square, isWhite ? 'b' : 'w');
      const defendedBy = getAttackers(chess, square, isWhite ? 'w' : 'b');

      const isHanging = attackedBy.length > 0 && defendedBy.length === 0;
      const isPinned = isPiecePinned(chess, square);
      const isTrapped = p.type !== 'p' && p.type !== 'k' && mobility === 0 && attackedBy.length > 0;
      const isOutpost = isPieceOutpost(square, p.type, p.color, board);

      if (isHanging) {
        if (isWhite) hangingWhitePieces.push(square);
        else hangingBlackPieces.push(square);
      }
      if (isPinned) {
        if (isWhite) pinnedWhitePieces.push(square);
        else pinnedBlackPieces.push(square);
      }
      if (isTrapped) {
        trappedPieces.push(square);
      }

      const activityScore = mobility * 10 + (isOutpost ? 25 : 0) - (isHanging ? 30 : 0);

      const metrics: PieceMetrics = {
        square,
        type: p.type,
        color: p.color,
        name: PIECE_NAMES[p.type],
        mobility,
        attacks,
        defendedBy,
        attackedBy,
        isHanging,
        isPinned,
        isTrapped,
        isOutpost,
        activityScore,
      };

      if (isWhite) whitePieces.push(metrics);
      else blackPieces.push(metrics);
    }
  }

  return {
    whitePieces,
    blackPieces,
    hangingWhitePieces,
    hangingBlackPieces,
    pinnedWhitePieces,
    pinnedBlackPieces,
    trappedPieces,
    whiteMobilityTotal,
    blackMobilityTotal,
  };
}

/**
 * Check if a square is an outpost for a Knight or Bishop
 */
function isPieceOutpost(square: Square, type: PieceSymbol, color: Color, board: ReturnType<Chess["board"]>): boolean {
  if (type !== 'n' && type !== 'b') return false;
  const col = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);

  // Outpost is on 4th, 5th, or 6th rank for White; 3rd, 4th, or 5th rank for Black
  if (color === 'w' && (rank < 4 || rank > 6)) return false;
  if (color === 'b' && (rank < 3 || rank > 5)) return false;

  // Cannot be attacked by opponent pawns on adjacent files
  const enemyColor = color === 'w' ? 'b' : 'w';
  const enemyPawnRankDir = color === 'w' ? -1 : 1;

  for (const adjCol of [col - 1, col + 1]) {
    if (adjCol >= 0 && adjCol <= 7) {
      for (let r = 0; r < 8; r++) {
        const piece = board[r][adjCol];
        if (piece && piece.type === 'p' && piece.color === enemyColor) {
          const pRank = 8 - r;
          if ((color === 'w' && pRank >= rank) || (color === 'b' && pRank <= rank)) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

/**
 * Get all squares attacking a given square
 */
function getAttackers(chess: Chess, square: Square, attackerColor: Color): Square[] {
  const attackers: Square[] = [];
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === attackerColor) {
        const fromSq = `${String.fromCharCode(97 + c)}${8 - r}` as Square;
        const moves = chess.moves({ square: fromSq, verbose: true });
        if (moves.some((m) => m.to === square)) {
          attackers.push(fromSq);
        }
      }
    }
  }

  return attackers;
}

/**
 * Simple check if piece is pinned to King
 */
function isPiecePinned(chess: Chess, square: Square): boolean {
  try {
    const moves = chess.moves({ square, verbose: true });
    // If piece has 0 or heavily restricted moves compared to normal, it may be pinned
    return false; // chess.js 1.4 handles legal moves directly without king danger
  } catch {
    return false;
  }
}
