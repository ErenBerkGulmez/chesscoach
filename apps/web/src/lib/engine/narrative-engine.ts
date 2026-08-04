import type { MoveAnalysis } from '@/types/chess';
import { EvaluationSeverity, isCatastrophic, isSerious } from './severity-model';

export interface GameTurningPoint {
  moveNumber: number;
  color: string;
  sanMove: string;
  evalBefore: number;
  evalAfter: number;
  description: string;
}

export interface GameNarrativeState {
  turningPoints: GameTurningPoint[];
  currentArc:
    | 'OPENING_PHASE'
    | 'EQUAL_BALANCED'
    | 'PLAYER_INITIATIVE'
    | 'OPPONENT_INITIATIVE'
    | 'CRITICAL_MISTAKE'
    | 'ATTACKING_PHASE'
    | 'ENDGAME_CONVERSION'
    | 'DECISIVE_TURNING_POINT';
  narrativeReferenceText: string;
}

export function buildGameNarrative(
  allMoveAnalyses: Record<number, MoveAnalysis>,
  currentMoveIndex: number,
  severity?: EvaluationSeverity
): GameNarrativeState {
  const turningPoints: GameTurningPoint[] = [];

  for (let i = 0; i <= currentMoveIndex; i++) {
    const m = allMoveAnalyses[i];
    if (!m) continue;

    const delta = Math.abs(m.evalDelta ?? 0);
    if (delta >= 150) {
      turningPoints.push({
        moveNumber: m.moveNumber,
        color: m.color,
        sanMove: m.sanMove,
        evalBefore: m.evalBefore ?? 0,
        evalAfter: m.evalAfter ?? 0,
        description: `Move ${m.moveNumber} (${m.sanMove}) caused a major shift of ${(delta / 100).toFixed(1)} pawns.`,
      });
    }
  }

  const currentAnalysis = allMoveAnalyses[currentMoveIndex];

  if (severity && isCatastrophic(severity)) {
    const evalShift = Math.abs(severity.evalDeltaPlayer / 100).toFixed(1);
    return {
      turningPoints,
      currentArc: 'DECISIVE_TURNING_POINT',
      narrativeReferenceText: `This is the decisive turning point. The position collapses by ${evalShift} pawns.`,
    };
  }

  if (severity && isSerious(severity)) {
    const evalShift = Math.abs(severity.evalDeltaPlayer / 100).toFixed(1);
    return {
      turningPoints,
      currentArc: 'CRITICAL_MISTAKE',
      narrativeReferenceText: `This move marks a critical shift — the position deteriorates by ${evalShift} pawns.`,
    };
  }

  let currentArc: GameNarrativeState['currentArc'] = 'EQUAL_BALANCED';
  let narrativeReferenceText = 'The game maintains structural equilibrium.';

  if (currentMoveIndex <= 10) {
    currentArc = 'OPENING_PHASE';
    narrativeReferenceText = 'Both sides are mobilizing forces and competing for central control.';
  } else if (turningPoints.length > 0) {
    const lastTP = turningPoints[turningPoints.length - 1];
    if (currentMoveIndex > lastTP.moveNumber) {
      currentArc = 'CRITICAL_MISTAKE';
      narrativeReferenceText = `This position directly stems from the turning point on move ${lastTP.moveNumber} (${lastTP.sanMove}).`;
    }
  } else if (currentAnalysis) {
    const score = currentAnalysis.evalAfter ?? 0;
    if (score >= 150) {
      currentArc = 'PLAYER_INITIATIVE';
      narrativeReferenceText = 'White holds a commanding positional and evaluation initiative.';
    } else if (score <= -150) {
      currentArc = 'OPPONENT_INITIATIVE';
      narrativeReferenceText = 'Black commands strong counterplay and evaluation advantage.';
    }
  }

  return {
    turningPoints,
    currentArc,
    narrativeReferenceText,
  };
}
