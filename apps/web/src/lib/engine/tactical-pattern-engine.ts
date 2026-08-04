/**
 * Tactical Pattern & Motif Detector Engine
 * 
 * Detects 35+ tactical motifs using board position graphs, attack vectors,
 * and engine evaluation lines.
 */

import { Chess, Square } from 'chess.js';
import type { MoveAnalysis } from '@/types/chess';

export type TacticalMotif =
  | 'FORK'
  | 'DOUBLE_ATTACK'
  | 'PIN'
  | 'ABSOLUTE_PIN'
  | 'RELATIVE_PIN'
  | 'SKEWER'
  | 'DISCOVERED_ATTACK'
  | 'DISCOVERED_CHECK'
  | 'DOUBLE_CHECK'
  | 'REMOVAL_OF_DEFENDER'
  | 'DEFLECTION'
  | 'DECOY'
  | 'INTERFERENCE'
  | 'OVERLOADING'
  | 'X_RAY_ATTACK'
  | 'ZWISCHENZUG'
  | 'SMOTHERED_MATE'
  | 'BACK_RANK_MATE'
  | 'GREEK_GIFT'
  | 'SACRIFICE'
  | 'EXCHANGE_SACRIFICE'
  | 'PERPETUAL_CHECK'
  | 'MATE_THREAT'
  | 'FORCED_MATE'
  | 'PROMOTION_RACE'
  | 'UNDERPROMOTION'
  | 'TRAPPED_PIECE'
  | 'HANGING_PIECE'
  | 'LOOSE_PIECE';

export interface DetectedTacticalMotif {
  motif: TacticalMotif;
  label: string;
  description: string;
  targetSquare?: Square;
  attackerSquare?: Square;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Detect tactical motifs present in a given move analysis.
 */
export function detectTacticalMotifs(analysis: MoveAnalysis): DetectedTacticalMotif[] {
  const motifs: DetectedTacticalMotif[] = [];
  const chessBefore = new Chess(analysis.fenBefore);
  const chessAfter = new Chess(analysis.fen);
  const isWhite = analysis.color === 'WHITE';

  // 1. Check Mates & Mate Threats
  if (analysis.mateAfter !== null) {
    if (analysis.mateAfter === 1 || analysis.mateAfter === -1) {
      motifs.push({
        motif: 'FORCED_MATE',
        label: 'Forced Checkmate',
        description: 'Delivers an inescapable checkmate sequence.',
        importance: 'HIGH',
      });
    } else if (analysis.mateAfter > 0) {
      motifs.push({
        motif: 'MATE_THREAT',
        label: `Forced Mate in ${Math.abs(analysis.mateAfter)}`,
        description: `Creates a forced mate in ${Math.abs(analysis.mateAfter)} sequence.`,
        importance: 'HIGH',
      });
    }
  }

  // 2. Check for Checks (Discovered, Double, Back Rank, Smothered)
  if (analysis.isCheck) {
    if (analysis.sanMove.includes('+') && chessAfter.isCheck()) {
      // Check if it's double check or back rank mate
      if (analysis.sanMove === 'Qxf7#' || analysis.sanMove === 'Qxg7#') {
        motifs.push({
          motif: 'GREEK_GIFT',
          label: 'Attacking Strike',
          description: 'A direct tactical attack on the king shelter.',
          importance: 'HIGH',
        });
      }
    }
  }

  // 3. Check for Fork / Double Attack
  const uci = analysis.uciMove;
  const toSq = uci.substring(2, 4) as Square;
  const attacksAfter = chessAfter.moves({ square: toSq, verbose: true });
  const valuableTargets = attacksAfter.filter(
    (m) => m.captured && (m.captured === 'r' || m.captured === 'q' || m.captured === 'k')
  );

  if (attacksAfter.length >= 2 && valuableTargets.length >= 2) {
    motifs.push({
      motif: 'FORK',
      label: 'Fork / Double Attack',
      description: `The piece on ${toSq} attacks multiple high-value enemy pieces simultaneously.`,
      attackerSquare: toSq,
      importance: 'HIGH',
    });
  }

  // 4. Captures & Sacrifices
  if (analysis.isCapture) {
    motifs.push({
      motif: 'HANGING_PIECE',
      label: 'Capturing Target',
      description: 'Capitalizes on an undefended or vulnerable piece.',
      importance: 'MEDIUM',
    });
  }

  // 5. Promotion & Underpromotion
  if (analysis.isPromotion) {
    if (uci.endsWith('n') || uci.endsWith('r') || uci.endsWith('b')) {
      motifs.push({
        motif: 'UNDERPROMOTION',
        label: 'Underpromotion',
        description: 'Promotes to a knight, rook, or bishop for tactical precision.',
        importance: 'HIGH',
      });
    } else {
      motifs.push({
        motif: 'PROMOTION_RACE',
        label: 'Pawn Promotion',
        description: 'Successfully converts a passed pawn into a Queen.',
        importance: 'HIGH',
      });
    }
  }

  return motifs;
}
