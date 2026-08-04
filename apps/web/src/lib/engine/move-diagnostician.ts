import type { MoveAnalysis } from '@/types/chess';
import { GamePhase } from './phase-detector';
import { EvaluationSeverity, isCatastrophic, isSerious } from './severity-model';

export type MoveDiagnosisType =
  | 'CORRECT_IDEA_WRONG_EXECUTION'
  | 'INCORRECT_MOVE_ORDER'
  | 'GOOD_STRATEGIC_PLAN'
  | 'OVERLY_PASSIVE'
  | 'OVERLY_AGGRESSIVE'
  | 'PREMATURE_ATTACK'
  | 'SLOW_DEVELOPMENT'
  | 'WEAK_KING_SAFETY'
  | 'CREATED_WEAKNESS'
  | 'IGNORED_THREAT'
  | 'MISSED_TACTICAL_MOTIF'
  | 'MISSED_STRATEGIC_IMPROVEMENT'
  | 'CATASTROPHIC_TACTICAL_FAILURE';

export interface MoveDiagnosis {
  type: MoveDiagnosisType;
  title: string;
  descriptiveHeadline: string;
  explanationText: string;
  severity: 'EXCELLENT' | 'SOLID' | 'INACCURATE' | 'SERIOUS' | 'CATASTROPHIC';
}

export function diagnoseMoveQuality(
  analysis: MoveAnalysis,
  gamePhase?: GamePhase,
  objectiveSeverity?: EvaluationSeverity
): MoveDiagnosis {
  const cls = analysis.classification;

  if (cls === 'BEST' || cls === 'GREAT' || cls === 'BRILLIANT' || cls === 'EXCELLENT') {
    return {
      type: 'GOOD_STRATEGIC_PLAN',
      title: 'Optimal Strategic Execution',
      descriptiveHeadline: 'Excellent Positional Improvement',
      explanationText: 'Executed with peak tactical accuracy and positional harmony.',
      severity: 'EXCELLENT',
    };
  }

  if (objectiveSeverity && isCatastrophic(objectiveSeverity)) {
    const evalShift = Math.abs(objectiveSeverity.evalDeltaPlayer / 100).toFixed(1);

    if (objectiveSeverity.isMateTransition) {
      return {
        type: 'CATASTROPHIC_TACTICAL_FAILURE',
        title: 'Allows Forced Checkmate',
        descriptiveHeadline: 'Decisive Mistake — Forced Checkmate Allowed',
        explanationText: `This move allows a forced checkmate sequence. The position collapses completely.`,
        severity: 'CATASTROPHIC',
      };
    }

    if (objectiveSeverity.isMissedMate) {
      return {
        type: 'MISSED_TACTICAL_MOTIF',
        title: 'Missed Forced Checkmate',
        descriptiveHeadline: 'Missed Forced Checkmate',
        explanationText: 'A forced checkmate was available but was not played.',
        severity: 'CATASTROPHIC',
      };
    }

    return {
      type: 'CATASTROPHIC_TACTICAL_FAILURE',
      title: 'Catastrophic Tactical Failure',
      descriptiveHeadline: `Decisive Mistake (−${evalShift} pawns)`,
      explanationText: `This move loses ${evalShift} pawns due to immediate tactical consequences.`,
      severity: 'CATASTROPHIC',
    };
  }

  if (objectiveSeverity && isSerious(objectiveSeverity)) {
    const evalShift = Math.abs(objectiveSeverity.evalDeltaPlayer / 100).toFixed(1);
    return {
      type: 'MISSED_TACTICAL_MOTIF',
      title: 'Serious Tactical Oversight',
      descriptiveHeadline: `Allowed Tactical Counterplay (−${evalShift} pawns)`,
      explanationText: `Overlooked a critical tactical sequence resulting in a ${evalShift}-pawn deterioration.`,
      severity: 'SERIOUS',
    };
  }

  if (cls === 'BLUNDER' || cls === 'MISSED_WIN' || cls === 'MISSED_MATE') {
    return {
      type: 'MISSED_TACTICAL_MOTIF',
      title: 'Tactical Oversight',
      descriptiveHeadline: 'Allowed Tactical Counterplay',
      explanationText: 'Overlooked a critical tactical sequence or free piece opportunity.',
      severity: 'SERIOUS',
    };
  }

  const cpl = Math.abs(analysis.evalDelta ?? 0);

  if (gamePhase === 'OPENING' && cpl >= 35) {
    return {
      type: 'SLOW_DEVELOPMENT',
      title: 'Delayed Minor Piece Mobilization',
      descriptiveHeadline: 'Missed Development Opportunity',
      explanationText: 'Moved an already developed piece or pawn instead of completing minor piece deployment.',
      severity: cpl >= 100 ? 'SERIOUS' : 'INACCURATE',
    };
  }

  if (cpl >= 100) {
    return {
      type: 'IGNORED_THREAT',
      title: 'Unaddressed Opponent Threat',
      descriptiveHeadline: 'Ignored Immediate Danger',
      explanationText: 'Proceeded with a move while leaving an immediate opponent threat unaddressed.',
      severity: 'SERIOUS',
    };
  }

  if (cpl >= 40) {
    return {
      type: 'OVERLY_PASSIVE',
      title: 'Passive Square Choice',
      descriptiveHeadline: 'Conceded Central Space',
      explanationText: 'Retreated or placed a piece passively instead of claiming active territory.',
      severity: 'INACCURATE',
    };
  }

  return {
    type: 'MISSED_STRATEGIC_IMPROVEMENT',
    title: 'Sub-optimal Square Choice',
    descriptiveHeadline: 'Slight Positional Inaccuracy',
    explanationText: 'A slightly cleaner alternative existed.',
    severity: 'INACCURATE',
  };
}
