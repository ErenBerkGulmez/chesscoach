/**
 * Position Type & Strategic Nature Detector Engine
 * 
 * Classifies the position into structural, dynamic, tactical, and strategic nature types.
 */

import { Chess } from 'chess.js';

export type PositionNature =
  | 'OPEN'
  | 'SEMI_OPEN'
  | 'CLOSED'
  | 'LOCKED_CENTER'
  | 'FLUID_CENTER'
  | 'SHARP'
  | 'DYNAMIC'
  | 'STATIC'
  | 'TACTICAL'
  | 'STRATEGIC'
  | 'POSITIONAL'
  | 'ATTACKING'
  | 'DEFENSIVE'
  | 'OPPOSITE_CASTLING'
  | 'SAME_CASTLING'
  | 'PASSED_PAWN_RACE'
  | 'FORTRESS'
  | 'ZUGZWANG_POTENTIAL';

export interface PositionTypeDetails {
  primaryNature: PositionNature;
  secondaryNature: PositionNature;
  tags: PositionNature[];
  centerType: 'Open Center' | 'Closed Center' | 'Locked Center' | 'Fluid Center';
  castlingType: 'Same-Side Castling' | 'Opposite-Side Castling' | 'Uncastled';
  description: string;
}

/**
 * Detect position nature, center dynamics, and structural tags from FEN and eval.
 */
export function detectPositionType(
  fen: string,
  evalDelta: number = 0,
  isCheck: boolean = false
): PositionTypeDetails {
  const chess = new Chess(fen);
  const board = chess.board();

  // 1. Analyze Center Pawns (d4, d5, e4, e5)
  const d4 = board[4][3]; // White d4 (row 4, col 3 in 0-index)
  const d5 = board[3][3]; // Black d5
  const e4 = board[4][4]; // White e4
  const e5 = board[3][4]; // Black e5

  const centerPawns = [d4, d5, e4, e5].filter(
    (p) => p && p.type === 'p'
  ).length;

  let centerType: 'Open Center' | 'Closed Center' | 'Locked Center' | 'Fluid Center' = 'Fluid Center';
  let isClosed = false;
  let isOpen = false;

  if (centerPawns === 0) {
    centerType = 'Open Center';
    isOpen = true;
  } else if (
    d4 && d5 && d4.color === 'w' && d5.color === 'b' &&
    e4 && e5 && e4.color === 'w' && e5.color === 'b'
  ) {
    centerType = 'Locked Center';
    isClosed = true;
  } else if (centerPawns >= 3) {
    centerType = 'Closed Center';
    isClosed = true;
  }

  // 2. Analyze Castling Status
  let wKingSquare = '';
  let bKingSquare = '';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k') {
        const file = String.fromCharCode(97 + c);
        const rank = 8 - r;
        if (p.color === 'w') wKingSquare = `${file}${rank}`;
        else bKingSquare = `${file}${rank}`;
      }
    }
  }

  const wCastledKingside = wKingSquare === 'g1';
  const wCastledQueenside = wKingSquare === 'c1';
  const bCastledKingside = bKingSquare === 'g8';
  const bCastledQueenside = bKingSquare === 'c8';

  let castlingType: 'Same-Side Castling' | 'Opposite-Side Castling' | 'Uncastled' = 'Uncastled';
  let isOppositeCastling = false;

  if (
    (wCastledKingside && bCastledQueenside) ||
    (wCastledQueenside && bCastledKingside)
  ) {
    castlingType = 'Opposite-Side Castling';
    isOppositeCastling = true;
  } else if (
    (wCastledKingside && bCastledKingside) ||
    (wCastledQueenside && bCastledQueenside)
  ) {
    castlingType = 'Same-Side Castling';
  }

  // 3. Tags Collection
  const tags: PositionNature[] = [];

  if (isOpen) tags.push('OPEN');
  else if (isClosed) tags.push('CLOSED');
  else tags.push('SEMI_OPEN');

  if (centerType === 'Locked Center') tags.push('LOCKED_CENTER');
  if (centerType === 'Fluid Center') tags.push('FLUID_CENTER');

  if (isOppositeCastling) tags.push('OPPOSITE_CASTLING');
  else tags.push('SAME_CASTLING');

  if (Math.abs(evalDelta) > 180 || isCheck) {
    tags.push('SHARP');
    tags.push('TACTICAL');
    tags.push('ATTACKING');
  } else {
    tags.push('POSITIONAL');
    tags.push('STRATEGIC');
    tags.push('STATIC');
  }

  const primaryNature = tags[0];
  const secondaryNature = tags[1] || 'STRATEGIC';

  let description = `${centerType} position with ${castlingType.toLowerCase()}`;
  if (tags.includes('SHARP')) {
    description += ' — sharp and tactical dynamics';
  } else {
    description += ' — positional maneuvering';
  }

  return {
    primaryNature,
    secondaryNature,
    tags,
    centerType,
    castlingType,
    description,
  };
}
