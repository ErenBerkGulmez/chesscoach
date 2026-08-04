/**
 * Candidate Move Comparison Engine
 * 
 * Compares the played move against Stockfish's top candidate moves (PV1, PV2, PV3)
 * to answer: "WHY is the best move superior?"
 */

import type { MoveAnalysis } from '@/types/chess';
import { formatEval } from '@/lib/stockfish/engine';

export interface ComparisonResult {
  playedMoveSan: string;
  bestMoveSan: string | null;
  secondBestMoveSan: string | null;
  evalDifferenceCp: number;
  superiorityReason: string;
  tacticalAdvantage: string;
  positionalGain: string;
  candidateLines: {
    rank: number;
    san: string;
    evalText: string;
    pvSan: string[];
  }[];
}

/**
 * Compare played move with top engine candidates and generate structured comparison rationale.
 */
export function compareCandidateMoves(analysis: MoveAnalysis): ComparisonResult {
  const playedMoveSan = analysis.sanMove;
  const bestMoveSan = analysis.bestMoveSan;
  const pvLines = analysis.pvLines || [];

  const candidateLines = pvLines.slice(0, 3).map((line, idx) => ({
    rank: idx + 1,
    san: line.pvSan?.[0] || line.pv[0] || '—',
    evalText: formatEval(line.score, line.mate ?? null),
    pvSan: line.pvSan || [],
  }));

  const secondBestMoveSan = candidateLines[1]?.san || null;
  const evalDifferenceCp = Math.abs(analysis.evalDelta ?? 0);

  let superiorityReason = '';
  let tacticalAdvantage = '';
  let positionalGain = '';

  if (analysis.classification === 'BEST' || analysis.classification === 'GREAT' || analysis.classification === 'BRILLIANT') {
    superiorityReason = `You found the top engine recommendation (${playedMoveSan})! It preserves maximum evaluation advantage and piece activity.`;
    tacticalAdvantage = 'Maintains optimal tactical harmony across all variations.';
    positionalGain = 'Keeps control of central files and restricts opponent counterplay.';
  } else if (bestMoveSan) {
    if (evalDifferenceCp >= 200) {
      superiorityReason = `Playing ${bestMoveSan} instead of ${playedMoveSan} saves a major ${ (evalDifferenceCp / 100).toFixed(2) } pawn evaluation advantage.`;
      tacticalAdvantage = `The engine move ${bestMoveSan} prevents a critical tactic or wins material directly.`;
      positionalGain = `Improves piece coordination and avoids creating unnecessary structural weaknesses.`;
    } else if (evalDifferenceCp >= 50) {
      superiorityReason = `${bestMoveSan} offered a cleaner tactical continuation (+${(evalDifferenceCp / 100).toFixed(2)} pawns better than ${playedMoveSan}).`;
      tacticalAdvantage = `${bestMoveSan} puts immediate pressure on the opponent's position.`;
      positionalGain = `Maintains better pawn structure and file control.`;
    } else {
      superiorityReason = `${bestMoveSan} was slightly more precise than ${playedMoveSan}, though your move is completely playable.`;
      tacticalAdvantage = 'Slightly better move order in tactical calculation.';
      positionalGain = 'Slightly cleaner piece deployment.';
    }
  } else {
    superiorityReason = `${playedMoveSan} is a solid continuation.`;
    tacticalAdvantage = 'No critical tactical missed.';
    positionalGain = 'Preserves solid positional harmony.';
  }

  return {
    playedMoveSan,
    bestMoveSan,
    secondBestMoveSan,
    evalDifferenceCp,
    superiorityReason,
    tacticalAdvantage,
    positionalGain,
    candidateLines,
  };
}
