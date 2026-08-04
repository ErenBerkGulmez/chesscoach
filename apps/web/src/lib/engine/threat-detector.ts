import type { MoveAnalysis } from '@/types/chess';
import { Chess, Square } from 'chess.js';

export type ThreatType =
  | 'MATE_THREAT'
  | 'PIECE_TRAP'
  | 'FORK_THREAT'
  | 'PIN_THREAT'
  | 'SKEWER_THREAT'
  | 'BACK_RANK_THREAT'
  | 'DISCOVERED_ATTACK_THREAT'
  | 'PAWN_BREAK_THREAT'
  | 'OPEN_FILE_THREAT';

export interface ThreatDetail {
  type: ThreatType;
  title: string;
  description: string;
  targetSquare?: Square;
  attackerSquare?: Square;
  severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE';
}

export interface ThreatAnalysisResult {
  threatsBefore: ThreatDetail[];
  threatsAfter: ThreatDetail[];
  threatsEliminatedByBestMove: ThreatDetail[];
  invisibleThreatText?: string;
}

export function detectPositionThreats(analysis: MoveAnalysis): ThreatAnalysisResult {
  const threatsBefore: ThreatDetail[] = [];
  const threatsAfter: ThreatDetail[] = [];
  const threatsEliminatedByBestMove: ThreatDetail[] = [];

  const chessAfter = new Chess(analysis.fen);
  const uci = analysis.uciMove;
  const toSq = uci.substring(2, 4) as Square;

  if (analysis.mateAfter !== null) {
    if (analysis.mateAfter > 0) {
      threatsAfter.push({
        type: 'MATE_THREAT',
        title: `Checkmate Threat in ${Math.abs(analysis.mateAfter)}`,
        description: `Delivers a forced checkmate attack in ${Math.abs(analysis.mateAfter)} moves.`,
        severity: 'CRITICAL',
      });
    } else if (analysis.mateAfter < 0) {
      threatsAfter.push({
        type: 'MATE_THREAT',
        title: `Exposed to Checkmate in ${Math.abs(analysis.mateAfter)}`,
        description: `Leaves your position vulnerable to a forced checkmate sequence.`,
        severity: 'CRITICAL',
      });
    }
  }

  const attacksAfter = chessAfter.moves({ square: toSq, verbose: true });
  const kingOrQueenAttacks = attacksAfter.filter(
    (m) => m.captured === 'k' || m.captured === 'q' || m.captured === 'r'
  );

  if (attacksAfter.length >= 2 && kingOrQueenAttacks.length >= 2) {
    threatsAfter.push({
      type: 'FORK_THREAT',
      title: 'Fork / Double Attack',
      description: `The piece on ${toSq} threatens multiple high-value enemy pieces simultaneously.`,
      attackerSquare: toSq,
      severity: 'SERIOUS',
    });
  }

  if (analysis.isCheck) {
    if (analysis.sanMove.includes('#')) {
      threatsAfter.push({
        type: 'MATE_THREAT',
        title: 'Checkmate Delivered',
        description: 'Delivers immediate game-ending checkmate.',
        severity: 'CRITICAL',
      });
    }
  }

  if (analysis.classification === 'BLUNDER' || analysis.classification === 'MISSED_WIN') {
    if (analysis.bestMoveSan) {
      threatsEliminatedByBestMove.push({
        type: 'PIN_THREAT',
        title: `Tactical Target (${analysis.bestMoveSan})`,
        description: `Playing ${analysis.bestMoveSan} would have eliminated the opponent's counter-attack.`,
        severity: 'CRITICAL',
      });
    }
  }

  let invisibleThreatText: string | undefined = undefined;
  if (threatsAfter.length > 0) {
    invisibleThreatText = threatsAfter[0].description;
  } else if (threatsEliminatedByBestMove.length > 0) {
    invisibleThreatText = threatsEliminatedByBestMove[0].description;
  }

  return {
    threatsBefore,
    threatsAfter,
    threatsEliminatedByBestMove,
    invisibleThreatText,
  };
}
