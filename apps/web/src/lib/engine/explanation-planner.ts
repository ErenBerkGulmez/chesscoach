import type { MoveAnalysis } from '@/types/chess';
import { DetectedTacticalMotif } from './tactical-pattern-engine';
import { DetectedStrategicTheme } from './strategic-theme-engine';
import { MistakeTag } from './mistake-classifier';
import { EvaluationSeverity, isCatastrophic, isSerious } from './severity-model';

export type AdaptiveDensity = 'BRIEF' | 'COMPACT' | 'DETAILED' | 'FULL';

export interface ExplanationPlan {
  primaryConcept: string;
  secondaryConcept: string;
  ignoredConcepts: string[];
  educationalGoal: string;
  importanceScore: number;
  adaptiveDensity: AdaptiveDensity;
  objectiveSeverityTier?: string;
  explanationUrgency?: string;
}

export const IMPORTANCE_SCORES: Record<string, number> = {
  FORCED_MATE: 100,
  WINNING_TACTIC: 98,
  MATERIAL_WIN: 95,
  KING_SAFETY_COLLAPSE: 90,
  MAJOR_TACTICAL_MOTIF: 88,
  INITIATIVE_LOSS: 80,
  DEVELOPMENT_ISSUE: 65,
  WEAK_SQUARE: 40,
  PAWN_STRUCTURE: 30,
  SPACE: 20,
};

export function planExplanation(
  analysis: MoveAnalysis,
  motifs: DetectedTacticalMotif[] = [],
  themes: DetectedStrategicTheme[] = [],
  mistakes: MistakeTag[] = [],
  severity?: EvaluationSeverity
): ExplanationPlan {
  const cpl = Math.abs(analysis.evalDelta ?? 0);
  const cls = analysis.classification;

  let importanceScore = 30;

  if (severity && isCatastrophic(severity)) {
    importanceScore = IMPORTANCE_SCORES.FORCED_MATE;
  } else if (severity && isSerious(severity)) {
    importanceScore = IMPORTANCE_SCORES.KING_SAFETY_COLLAPSE;
  } else if (analysis.mateAfter !== null) {
    importanceScore = IMPORTANCE_SCORES.FORCED_MATE;
  } else if (cls === 'BRILLIANT' || cls === 'GREAT') {
    importanceScore = IMPORTANCE_SCORES.WINNING_TACTIC;
  } else if (cls === 'BLUNDER' || cls === 'MISSED_WIN' || cls === 'MISSED_MATE') {
    importanceScore = IMPORTANCE_SCORES.KING_SAFETY_COLLAPSE;
  } else if (motifs.length > 0) {
    importanceScore = IMPORTANCE_SCORES.MAJOR_TACTICAL_MOTIF;
  } else if (cpl >= 100) {
    importanceScore = IMPORTANCE_SCORES.INITIATIVE_LOSS;
  } else if (mistakes.some((m) => m.category === 'DEVELOPMENT_MISTAKE')) {
    importanceScore = IMPORTANCE_SCORES.DEVELOPMENT_ISSUE;
  } else if (themes.length > 0) {
    importanceScore = IMPORTANCE_SCORES.WEAK_SQUARE;
  }

  let primaryConcept = 'Piece Activity';
  let secondaryConcept = 'Positional Balance';
  const ignoredConcepts: string[] = [];

  if (severity && isCatastrophic(severity)) {
    primaryConcept = 'Catastrophic Tactical Failure';
    secondaryConcept = 'Forced Continuation Analysis';
    ignoredConcepts.push('Pawn Structure', 'Space', 'Development');
  } else if (severity && isSerious(severity)) {
    primaryConcept = 'Serious Tactical Oversight';
    secondaryConcept = 'Material & Safety Consequence';
    ignoredConcepts.push('Pawn Structure', 'Space');
  } else if (motifs.length > 0) {
    primaryConcept = motifs[0].label;
    secondaryConcept = themes[0]?.title || 'Tactical Calculation';
    ignoredConcepts.push('Pawn Structure', 'Space');
  } else if (mistakes.length > 0) {
    primaryConcept = mistakes[0].label;
    secondaryConcept = themes[0]?.title || 'Development Pace';
    ignoredConcepts.push('Space', 'Endgame Strategy');
  } else if (themes.length > 0) {
    primaryConcept = themes[0].title;
    secondaryConcept = themes[1]?.title || 'Center Control';
    ignoredConcepts.push('Tactical Motifs');
  }

  let educationalGoal = 'Refine subtle positional piece placements.';

  if (severity && isCatastrophic(severity)) {
    educationalGoal = 'Before committing to any move, calculate the opponent\'s forcing replies — checks, captures, and threats.';
  } else if (severity && isSerious(severity)) {
    educationalGoal = 'Always verify that your move does not leave pieces undefended or create tactical vulnerabilities.';
  } else if (importanceScore >= 90) {
    educationalGoal = 'Master critical tactical calculations and avoid material/king collapse.';
  } else if (importanceScore >= 65) {
    educationalGoal = 'Understand opening principles, rapid piece mobilization, and initiative.';
  }

  let adaptiveDensity: AdaptiveDensity = 'COMPACT';

  if (severity && (isCatastrophic(severity) || isSerious(severity))) {
    adaptiveDensity = 'FULL';
  } else if (importanceScore >= 90 || cpl >= 150) {
    adaptiveDensity = 'FULL';
  } else if (importanceScore >= 65 || cpl >= 50) {
    adaptiveDensity = 'DETAILED';
  } else if (cpl >= 20) {
    adaptiveDensity = 'COMPACT';
  } else {
    adaptiveDensity = 'BRIEF';
  }

  return {
    primaryConcept,
    secondaryConcept,
    ignoredConcepts,
    educationalGoal,
    importanceScore,
    adaptiveDensity,
    objectiveSeverityTier: severity?.tier,
    explanationUrgency: severity?.explanationUrgency,
  };
}
