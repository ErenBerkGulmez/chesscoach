import type { MoveAnalysis } from '@/types/chess';
import { PhaseDetails } from './phase-detector';
import { PositionTypeDetails } from './position-type-detector';
import { DetectedTacticalMotif } from './tactical-pattern-engine';
import { DetectedStrategicTheme } from './strategic-theme-engine';
import { ComparisonResult } from './candidate-comparator';
import { MistakeTag } from './mistake-classifier';
import { EvaluationSeverity, isCatastrophic, isSerious, canUsePositiveLanguage } from './severity-model';

export interface StructuredReasoning {
  whatChanged: string;
  advantageLost: string;
  principleViolated: string;
  tacticalMotifText: string;
  bestMoveRationale: string;
  longTermConsequences: string;
  howToThink: string;
  generalLesson: string;
}

export function generateReasoning(
  analysis: MoveAnalysis,
  phaseDetails?: PhaseDetails,
  posTypeDetails?: PositionTypeDetails,
  motifs: DetectedTacticalMotif[] = [],
  themes: DetectedStrategicTheme[] = [],
  comparison?: ComparisonResult,
  mistakeTags: MistakeTag[] = [],
  severity?: EvaluationSeverity
): StructuredReasoning {
  const played = analysis.sanMove;
  const best = analysis.bestMoveSan;
  const cpl = Math.abs(analysis.evalDelta ?? 0);
  const isGood = analysis.classification === 'BEST' || analysis.classification === 'GREAT' || analysis.classification === 'BRILLIANT';

  let whatChanged = '';
  if (analysis.isCastle) {
    whatChanged = `You castled, securing your King and connecting your Rooks.`;
  } else if (analysis.isPromotion) {
    whatChanged = `You promoted a pawn with ${played}.`;
  } else if (analysis.isCapture) {
    whatChanged = `You played ${played}, capturing an opponent piece.`;
  } else if (analysis.isCheck) {
    whatChanged = `You played ${played}, placing the opponent King in check.`;
  } else {
    whatChanged = `You played ${played}.`;
  }

  let advantageLost = '';
  if (isGood) {
    advantageLost = `You maintained maximum engine position evaluation.`;
  } else if (severity && isCatastrophic(severity)) {
    const evalShift = Math.abs(severity.evalDeltaPlayer / 100).toFixed(1);
    advantageLost = `This move causes a catastrophic ${evalShift}-pawn collapse. The position changes from ${severity.evalBeforeWhite >= 0 ? 'equal or better' : 'already difficult'} to completely lost.`;
  } else if (severity && isSerious(severity)) {
    const evalShift = Math.abs(severity.evalDeltaPlayer / 100).toFixed(1);
    advantageLost = `This move concedes a serious ${evalShift}-pawn evaluation shift.`;
  } else if (cpl >= 200) {
    advantageLost = `This move conceded a major ${(cpl / 100).toFixed(1)} pawn evaluation shift to your opponent.`;
  } else if (cpl >= 50) {
    advantageLost = `This move dropped ${(cpl / 100).toFixed(1)} pawns in evaluation advantage.`;
  } else {
    advantageLost = `This move resulted in a slight ${(cpl / 100).toFixed(2)} pawn evaluation inaccuracy.`;
  }

  let principleViolated = '';
  if (isGood) {
    principleViolated = `Followed core chess principles: active piece deployment and central harmony.`;
  } else if (severity && isCatastrophic(severity)) {
    principleViolated = `Critical principle violated: always calculate the opponent's forcing replies (checks, captures, threats) before committing to any move.`;
  } else if (mistakeTags.some((t) => t.category === 'DEVELOPMENT_MISTAKE')) {
    principleViolated = `Violated opening principle: develop minor pieces rapidly before moving the same piece twice or making unnecessary pawn pushes.`;
  } else if (mistakeTags.some((t) => t.category === 'TACTICAL_OVERSIGHT')) {
    principleViolated = `Violated tactical principle: always calculate checks, captures, and threats (CCT) before committing your move.`;
  } else if (mistakeTags.some((t) => t.category === 'KING_SAFETY_MISTAKE')) {
    principleViolated = `Violated king safety principle: avoid weakening the pawn shield in front of your castled King.`;
  } else {
    principleViolated = `Violated positional principle: prefer active moves over passive alternatives.`;
  }

  let tacticalMotifText = '';
  if (motifs.length > 0) {
    tacticalMotifText = `Tactical Motif: ${motifs.map((m) => m.label).join(', ')}. ${motifs[0].description}`;
  } else if (severity && isCatastrophic(severity)) {
    tacticalMotifText = `A forced tactical sequence exists that exploits the weakness created by ${played}.`;
  } else {
    tacticalMotifText = `No immediate tactical combination occurred; positional considerations predominate.`;
  }

  let bestMoveRationale = '';
  if (isGood) {
    bestMoveRationale = `${played} is the optimal continuation.`;
  } else if (severity && isCatastrophic(severity) && best) {
    bestMoveRationale = `${best} was the only way to hold the position. It avoids the tactical catastrophe and maintains defensive integrity.`;
  } else if (best) {
    bestMoveRationale = comparison?.superiorityReason || `${best} maintains stronger piece activity and control.`;
  } else {
    bestMoveRationale = `The position calls for careful piece coordination.`;
  }

  let longTermConsequences = '';
  if (isGood) {
    longTermConsequences = `Consolidates space and piece activity into the next phase.`;
  } else if (severity && isCatastrophic(severity)) {
    longTermConsequences = `The position is now unrecoverable against accurate play. The opponent has a decisive advantage.`;
  } else if (severity && isSerious(severity)) {
    longTermConsequences = `Gives the opponent a commanding advantage that will be very difficult to overcome.`;
  } else if (cpl >= 150) {
    longTermConsequences = `Gives the opponent an active opportunity to seize the initiative or win material.`;
  } else {
    longTermConsequences = `Slightly reduces pressure on the opponent position.`;
  }

  let howToThink = '';
  let generalLesson = '';

  if (isGood) {
    howToThink = `Keep identifying candidate moves that activate your pieces and restrict your opponent's counterplay.`;
    generalLesson = `Excellent execution of chess principles! Continue maintaining piece coordination.`;
  } else if (severity && isCatastrophic(severity)) {
    howToThink = `Before committing to any forcing move, stop and calculate the opponent's forcing replies — checks, captures, and direct threats — at least two moves deep.`;
    generalLesson = `The most dangerous moves to play are the ones that look obviously good. Always verify there is no tactical refutation before executing.`;
  } else if (mistakeTags.some((t) => t.category === 'DEVELOPMENT_MISTAKE')) {
    howToThink = `In the opening, ask yourself: 'Is all my army developed?' before launching attacks.`;
    generalLesson = `Prioritize rapid minor piece development and early castling in opening positions.`;
  } else if (mistakeTags.some((t) => t.category === 'TACTICAL_OVERSIGHT')) {
    howToThink = `Before completing your move, perform a mandatory candidate check: 'What can my opponent capture or attack on their next move?'`;
    generalLesson = `Always scan for undefended pieces and tactical double attacks before finalizing a move.`;
  } else {
    howToThink = `Look for candidate moves that improve your least active piece.`;
    generalLesson = `Focus on improving your worst-placed piece to maximize overall army coordination.`;
  }

  return {
    whatChanged,
    advantageLost,
    principleViolated,
    tacticalMotifText,
    bestMoveRationale,
    longTermConsequences,
    howToThink,
    generalLesson,
  };
}
