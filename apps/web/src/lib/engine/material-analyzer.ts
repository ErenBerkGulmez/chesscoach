/**
 * Material Imbalance & Trade Analyzer Engine
 * 
 * Computes material piece counts, imbalances, piece trades, and material advantage.
 */

import { Chess } from 'chess.js';

export interface MaterialDetails {
  whiteMaterial: number;
  blackMaterial: number;
  difference: number; // positive = White advantage, negative = Black advantage
  advantageSide: 'WHITE' | 'BLACK' | 'EQUAL';
  whiteBishopPair: boolean;
  blackBishopPair: boolean;
  imbalanceDescription: string;
}

const PIECE_VALS: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

/**
 * Evaluate material counts, imbalances, and bishop pairs.
 */
export function analyzeMaterial(fen: string): MaterialDetails {
  const chess = new Chess(fen);
  const board = chess.board();

  let wMat = 0;
  let bMat = 0;
  let wBishops = 0;
  let bBishops = 0;
  let wKnights = 0;
  let bKnights = 0;
  let wRooks = 0;
  let bRooks = 0;
  let wQueens = 0;
  let bQueens = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.type === 'k') continue;

      const val = PIECE_VALS[p.type] || 0;
      if (p.color === 'w') {
        wMat += val;
        if (p.type === 'b') wBishops++;
        if (p.type === 'n') wKnights++;
        if (p.type === 'r') wRooks++;
        if (p.type === 'q') wQueens++;
      } else {
        bMat += val;
        if (p.type === 'b') bBishops++;
        if (p.type === 'n') bKnights++;
        if (p.type === 'r') bRooks++;
        if (p.type === 'q') bQueens++;
      }
    }
  }

  const difference = wMat - bMat;
  let advantageSide: 'WHITE' | 'BLACK' | 'EQUAL' = 'EQUAL';

  if (difference >= 1) advantageSide = 'WHITE';
  else if (difference <= -1) advantageSide = 'BLACK';

  const whiteBishopPair = wBishops >= 2;
  const blackBishopPair = bBishops >= 2;

  let imbalanceDescription = 'Material is equal';
  if (difference > 0) {
    imbalanceDescription = `White is up +${difference} in material`;
  } else if (difference < 0) {
    imbalanceDescription = `Black is up +${Math.abs(difference)} in material`;
  }

  if (whiteBishopPair && !blackBishopPair) {
    imbalanceDescription += ' (White has the Bishop Pair)';
  } else if (blackBishopPair && !whiteBishopPair) {
    imbalanceDescription += ' (Black has the Bishop Pair)';
  }

  return {
    whiteMaterial: wMat,
    blackMaterial: bMat,
    difference,
    advantageSide,
    whiteBishopPair,
    blackBishopPair,
    imbalanceDescription,
  };
}
