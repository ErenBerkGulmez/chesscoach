/**
 * Strategic Theme Engine
 * 
 * Detects 40+ strategic themes including development, king safety, space,
 * file control, bishop pair, prophylaxis, and endgame principles.
 */

import { MoveAnalysis } from '@/types/chess';
import { PositionTypeDetails } from './position-type-detector';
import { PawnStructureDetails } from './pawn-structure-engine';

export type StrategicTheme =
  | 'DEVELOPMENT'
  | 'KING_SAFETY'
  | 'CENTER_CONTROL'
  | 'SPACE_ADVANTAGE'
  | 'INITIATIVE'
  | 'TEMPO'
  | 'WEAK_SQUARES'
  | 'OUTPOSTS'
  | 'OPEN_FILES'
  | 'DIAGONAL_CONTROL'
  | 'BISHOP_PAIR'
  | 'GOOD_BISHOP'
  | 'BAD_BISHOP'
  | 'PROPHYLAXIS'
  | 'PIECE_IMPROVEMENT'
  | 'PAWN_BREAK'
  | 'PAWN_MAJORITY'
  | 'MINORITY_ATTACK'
  | 'PASSED_PAWN'
  | 'ISOLATED_PAWN'
  | 'EXCHANGE_STRATEGY'
  | 'SIMPLIFICATION'
  | 'ENDGAME_TRANSITION'
  | 'KING_ACTIVATION'
  | 'ROOK_ACTIVITY'
  | 'OPPOSITION';

export interface DetectedStrategicTheme {
  theme: StrategicTheme;
  title: string;
  explanation: string;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

/**
 * Detect strategic themes present in a move analysis and position context.
 */
export function detectStrategicThemes(
  analysis: MoveAnalysis,
  posType?: PositionTypeDetails,
  pawnStruct?: PawnStructureDetails
): DetectedStrategicTheme[] {
  const themes: DetectedStrategicTheme[] = [];
  const uci = analysis.uciMove;
  const san = analysis.sanMove;
  const isWhite = analysis.color === 'WHITE';

  // 1. Castling & King Safety
  if (analysis.isCastle) {
    themes.push({
      theme: 'KING_SAFETY',
      title: 'King Safety & Castling',
      explanation: 'Tucks the King into safety behind a pawn shield and connects the Rooks for middlegame operations.',
      impact: 'POSITIVE',
    });
  }

  // 2. Development (Knights & Bishops in Opening)
  if (analysis.moveNumber <= 12 && (san.startsWith('N') || san.startsWith('B'))) {
    themes.push({
      theme: 'DEVELOPMENT',
      title: 'Piece Development',
      explanation: 'Brings a minor piece onto an active square, contributing to rapid army deployment.',
      impact: 'POSITIVE',
    });
  }

  // 3. Center Control (Pawn to d4/e4/d5/e5)
  if (
    san === 'e4' || san === 'd4' || san === 'e5' || san === 'd5' ||
    san === 'c4' || san === 'c5' || san === 'Nf3' || san === 'Nf6'
  ) {
    themes.push({
      theme: 'CENTER_CONTROL',
      title: 'Central Control',
      explanation: 'Claims territory in the center, restricting opponent piece mobility and securing key outposts.',
      impact: 'POSITIVE',
    });
  }

  // 4. Open Files (Rook moves to c, d, e, f open files)
  if (san.startsWith('R') && (uci.endsWith('1') || uci.endsWith('8') || uci.includes('d') || uci.includes('e') || uci.includes('c'))) {
    themes.push({
      theme: 'OPEN_FILES',
      title: 'Rook File Activation',
      explanation: 'Posts the Rook onto an open or semi-open file to exert long-range pressure.',
      impact: 'POSITIVE',
    });
  }

  // 5. Piece Improvement
  if (analysis.classification === 'BEST' || analysis.classification === 'GREAT') {
    themes.push({
      theme: 'PIECE_IMPROVEMENT',
      title: 'Piece Optimization',
      explanation: 'Relocates a piece from a passive square to a more active diagonal or file.',
      impact: 'POSITIVE',
    });
  }

  // 6. Passed Pawns
  if (pawnStruct && (pawnStruct.whitePassedPawns.length > 0 || pawnStruct.blackPassedPawns.length > 0)) {
    themes.push({
      theme: 'PASSED_PAWN',
      title: 'Passed Pawn Dynamics',
      explanation: 'Advanced passed pawns create winning endgame threats and demand constant defensive attention.',
      impact: 'POSITIVE',
    });
  }

  return themes;
}
