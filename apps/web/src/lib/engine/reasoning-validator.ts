import { EvaluationSeverity, isCatastrophic, isSerious, canUsePositiveLanguage, validateTextAgainstSeverity } from './severity-model';
import type { V2CoachingExplanation } from './explanation-flow-nlg';
import type { MoveDiagnosis } from './move-diagnostician';
import type { GameNarrativeState } from './narrative-engine';
import type { ExplanationPlan } from './explanation-planner';
import { ExplanationReasoning } from './reason-extractor';

export interface ValidationResult {
  isConsistent: boolean;
  violations: string[];
  correctedFields: Record<string, string>;
}

export function validateReasoningConsistency(
  severity: EvaluationSeverity,
  explanation: V2CoachingExplanation,
  diagnosis: MoveDiagnosis,
  narrative: GameNarrativeState,
  plan: ExplanationPlan,
  extractedReasoning?: ExplanationReasoning
): ValidationResult {
  const violations: string[] = [];
  const correctedFields: Record<string, string> = {};

  const bodyViolations = validateTextAgainstSeverity(explanation.body, severity);
  violations.push(...bodyViolations);

  const headlineViolations = validateTextAgainstSeverity(explanation.headline, severity);
  violations.push(...headlineViolations);

  if (isCatastrophic(severity) && diagnosis.severity !== 'SERIOUS' && diagnosis.severity !== 'CATASTROPHIC') {
    violations.push(
      `DIAGNOSIS CONTRADICTION: Severity is ${severity.tier} but diagnosis says "${diagnosis.severity}"`
    );
  }

  if (isSerious(severity) && narrative.currentArc === 'EQUAL_BALANCED') {
    violations.push(
      `NARRATIVE CONTRADICTION: Severity is ${severity.tier} but narrative says EQUAL_BALANCED`
    );
  }

  // ── CAUSAL COMPLETENESS CHECK (V3) ──
  if (isCatastrophic(severity) && explanation.mode === 'NORMAL') {
    const lowerBody = explanation.body.toLowerCase();
    const hasGenericOnly =
      lowerBody.includes('tactical vulnerability') &&
      !lowerBody.includes('capture') &&
      !lowerBody.includes('promote') &&
      !lowerBody.includes('queen') &&
      !lowerBody.includes('check') &&
      !lowerBody.includes('rook') &&
      !lowerBody.includes('bishop') &&
      !lowerBody.includes('knight') &&
      !lowerBody.includes('king') &&
      !lowerBody.includes('pawn');

    if (hasGenericOnly) {
      violations.push(
        `INCOMPLETE_CAUSAL_EXPLANATION: Catastrophic move explanation lacks concrete piece or board mechanism detail.`
      );
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.warn(`[ReasoningValidator] ${v}`);
    }
  }

  return {
    isConsistent: violations.length === 0,
    violations,
    correctedFields,
  };
}
