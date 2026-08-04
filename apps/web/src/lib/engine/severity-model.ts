import type { MoveAnalysis } from '@/types/chess';
import { MoveClassification } from '@/types/chess';

export type SeverityTier =
  | 'NEGLIGIBLE'
  | 'MINOR'
  | 'INACCURACY'
  | 'MISTAKE'
  | 'SERIOUS_MISTAKE'
  | 'BLUNDER'
  | 'CATASTROPHIC';

export type LanguageStrength =
  | 'POSITIVE'
  | 'NEUTRAL'
  | 'CAUTIONARY'
  | 'NEGATIVE'
  | 'CRITICAL';

export type ExplanationMode =
  | 'NORMAL'
  | 'POSITIONAL'
  | 'TACTICAL'
  | 'MISS'
  | 'BLUNDER'
  | 'CATASTROPHIC'
  | 'BRILLIANT'
  | 'MISSED_MATE'
  | 'MISSED_WIN'
  | 'ENDGAME'
  | 'OPENING';

export type ExplanationUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface EvaluationSeverity {
  centipawnLoss: number;
  severityScore: number;
  tier: SeverityTier;
  isForcedLoss: boolean;
  isMateTransition: boolean;
  isMissedMate: boolean;
  isMissedWin: boolean;
  languageStrength: LanguageStrength;
  explanationMode: ExplanationMode;
  explanationUrgency: ExplanationUrgency;
  evalBeforeWhite: number;
  evalAfterWhite: number;
  evalDeltaPlayer: number;
  mateBeforeWhite: number | null;
  mateAfterWhite: number | null;
}

const FORBIDDEN_POSITIVE_PHRASES = [
  'playable',
  'reasonable',
  'fine',
  'okay',
  'solid',
  'steady',
  'stable',
  'maintains balance',
  'maintains coordination',
  'keeps the position equal',
  'harmless',
  'comfortable',
  'maintains steady',
  'position coordination',
  'completely playable',
];

export function computeSeverity(analysis: MoveAnalysis): EvaluationSeverity {
  const evalBeforeWhite = analysis.evalBefore ?? 0;
  const evalAfterWhite = analysis.evalAfter ?? 0;
  const evalDeltaPlayer = analysis.evalDelta ?? 0;
  const mateBeforeWhite = analysis.mateBefore;
  const mateAfterWhite = analysis.mateAfter;
  const cls = analysis.classification;

  const cpl = Math.abs(evalDeltaPlayer);

  const isMateTransition =
    (mateBeforeWhite === null && mateAfterWhite !== null && mateAfterWhite < 0) ||
    (mateBeforeWhite !== null && mateBeforeWhite > 0 && mateAfterWhite !== null && mateAfterWhite < 0);

  const isMissedMate =
    cls === MoveClassification.MISSED_MATE ||
    (mateBeforeWhite !== null && mateBeforeWhite > 0 && mateAfterWhite === null);

  const isMissedWin =
    cls === MoveClassification.MISSED_WIN;

  const isForcedLoss =
    isMateTransition ||
    (mateAfterWhite !== null && mateAfterWhite < 0);

  let tier: SeverityTier;
  let severityScore: number;

  if (isMateTransition || isForcedLoss) {
    tier = 'CATASTROPHIC';
    severityScore = 100;
  } else if (isMissedMate) {
    tier = 'CATASTROPHIC';
    severityScore = 98;
  } else if (cpl >= 700) {
    tier = 'CATASTROPHIC';
    severityScore = 97;
  } else if (cpl >= 400) {
    tier = 'BLUNDER';
    severityScore = 90;
  } else if (cpl >= 200) {
    tier = 'SERIOUS_MISTAKE';
    severityScore = 80;
  } else if (cpl >= 100) {
    tier = 'MISTAKE';
    severityScore = 65;
  } else if (cpl >= 50) {
    tier = 'INACCURACY';
    severityScore = 45;
  } else if (cpl >= 20) {
    tier = 'MINOR';
    severityScore = 20;
  } else {
    tier = 'NEGLIGIBLE';
    severityScore = 5;
  }

  if (cls === MoveClassification.BLUNDER && tier !== 'CATASTROPHIC') {
    tier = 'BLUNDER';
    severityScore = Math.max(severityScore, 90);
  }

  let languageStrength: LanguageStrength;
  if (tier === 'NEGLIGIBLE') languageStrength = 'POSITIVE';
  else if (tier === 'MINOR') languageStrength = 'NEUTRAL';
  else if (tier === 'INACCURACY') languageStrength = 'CAUTIONARY';
  else if (tier === 'MISTAKE' || tier === 'SERIOUS_MISTAKE') languageStrength = 'NEGATIVE';
  else languageStrength = 'CRITICAL';

  let explanationMode: ExplanationMode;
  if (isMateTransition || tier === 'CATASTROPHIC') {
    explanationMode = 'CATASTROPHIC';
  } else if (isMissedMate) {
    explanationMode = 'MISSED_MATE';
  } else if (isMissedWin) {
    explanationMode = 'MISSED_WIN';
  } else if (cls === MoveClassification.BRILLIANT) {
    explanationMode = 'BRILLIANT';
  } else if (tier === 'BLUNDER' || tier === 'SERIOUS_MISTAKE') {
    explanationMode = 'BLUNDER';
  } else if (tier === 'MISTAKE' || tier === 'INACCURACY') {
    explanationMode = 'TACTICAL';
  } else {
    explanationMode = 'NORMAL';
  }

  let explanationUrgency: ExplanationUrgency;
  if (tier === 'CATASTROPHIC' || tier === 'BLUNDER') explanationUrgency = 'CRITICAL';
  else if (tier === 'SERIOUS_MISTAKE' || tier === 'MISTAKE') explanationUrgency = 'HIGH';
  else if (tier === 'INACCURACY') explanationUrgency = 'MEDIUM';
  else explanationUrgency = 'LOW';

  return {
    centipawnLoss: cpl,
    severityScore,
    tier,
    isForcedLoss,
    isMateTransition,
    isMissedMate,
    isMissedWin,
    languageStrength,
    explanationMode,
    explanationUrgency,
    evalBeforeWhite,
    evalAfterWhite,
    evalDeltaPlayer,
    mateBeforeWhite,
    mateAfterWhite,
  };
}

export function canUsePositiveLanguage(severity: EvaluationSeverity): boolean {
  return (
    severity.tier === 'NEGLIGIBLE' &&
    !severity.isForcedLoss &&
    !severity.isMateTransition &&
    severity.centipawnLoss < 20
  );
}

export function canUseNeutralLanguage(severity: EvaluationSeverity): boolean {
  return (
    (severity.tier === 'NEGLIGIBLE' || severity.tier === 'MINOR') &&
    !severity.isForcedLoss &&
    !severity.isMateTransition
  );
}

export function isCatastrophic(severity: EvaluationSeverity): boolean {
  return severity.tier === 'CATASTROPHIC' || severity.isForcedLoss || severity.isMateTransition;
}

export function isSerious(severity: EvaluationSeverity): boolean {
  return (
    severity.tier === 'BLUNDER' ||
    severity.tier === 'CATASTROPHIC' ||
    severity.tier === 'SERIOUS_MISTAKE' ||
    severity.isForcedLoss
  );
}

export function validateTextAgainstSeverity(text: string, severity: EvaluationSeverity): string[] {
  const violations: string[] = [];
  const lower = text.toLowerCase();

  if (isSerious(severity)) {
    for (const phrase of FORBIDDEN_POSITIVE_PHRASES) {
      if (lower.includes(phrase)) {
        violations.push(
          `SEVERITY VIOLATION: Text contains "${phrase}" but severity is ${severity.tier} (CPL: ${severity.centipawnLoss}, delta: ${severity.evalDeltaPlayer})`
        );
      }
    }
  }

  return violations;
}

export { FORBIDDEN_POSITIVE_PHRASES };
