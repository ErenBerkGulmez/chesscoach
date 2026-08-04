import type { MoveAnalysis } from '@/types/chess';
import { MoveClassification } from '@/types/chess';
import { ExplanationPlan } from './explanation-planner';
import { IntentAnalysis } from './intent-engine';
import { GameNarrativeState } from './narrative-engine';
import { CausalChainResult } from './causal-graph-engine';
import { CandidateStory } from './counterfactual-engine';
import { StructuredReasoning } from './reasoning-engine';
import { EvaluationSeverity, isCatastrophic, isSerious, canUsePositiveLanguage, canUseNeutralLanguage } from './severity-model';
import { ExplanationReasoning } from './reason-extractor';
import { selectDiverseOpener, selectDiverseLessonOpener, ExplanationCategoryFamily, ExplanationHistory } from './diversity-controller';

export type ExplanationMode = 'NORMAL' | 'TECHNICAL';

export interface V2CoachingExplanation {
  headline: string;
  flowType: 'OPENING_PRINCIPLE' | 'TACTICAL_OVERSIGHT' | 'STRATEGIC_PLAN' | 'ENDGAME_TECHNIQUE' | 'CATASTROPHIC_TACTICAL';
  summary: string;
  causalFlowText: string;
  intentComparisonText: string;
  candidateStoryText?: string;
  narrativeContextText?: string;
  educationalLesson: string;
  body: string;
  mode: ExplanationMode;
}

export function buildV2NlgExplanation(
  analysis: MoveAnalysis,
  plan: ExplanationPlan,
  intents: IntentAnalysis,
  narrative: GameNarrativeState,
  causalChain: CausalChainResult,
  candidateStory: CandidateStory | null,
  reasoning: StructuredReasoning,
  mode: ExplanationMode = 'NORMAL',
  severity?: EvaluationSeverity,
  extractedReasoning?: ExplanationReasoning,
  gameId: string = 'game',
  history?: ExplanationHistory
): V2CoachingExplanation {
  const played = analysis.sanMove;
  const best = analysis.bestMoveSan;
  const cls = analysis.classification;
  const isOptimal = cls === MoveClassification.BEST || cls === MoveClassification.GREAT || cls === MoveClassification.BRILLIANT || cls === MoveClassification.EXCELLENT;

  let flowType: V2CoachingExplanation['flowType'] = 'STRATEGIC_PLAN';

  if (severity && isCatastrophic(severity)) {
    flowType = 'CATASTROPHIC_TACTICAL';
  } else if (severity && isSerious(severity)) {
    flowType = 'TACTICAL_OVERSIGHT';
  } else if (plan.importanceScore >= 88) {
    flowType = 'TACTICAL_OVERSIGHT';
  } else if (analysis.moveNumber <= 12 && plan.primaryConcept.includes('Development')) {
    flowType = 'OPENING_PRINCIPLE';
  } else if (analysis.moveNumber >= 35) {
    flowType = 'ENDGAME_TECHNIQUE';
  }

  let headline = '';
  let body = '';

  if (mode === 'TECHNICAL') {
    // ── TECHNICAL MODE ──
    const evalBeforeStr = ((severity?.evalBeforeWhite ?? 0) / 100).toFixed(2);
    const evalAfterStr = ((severity?.evalAfterWhite ?? 0) / 100).toFixed(2);
    const cplStr = severity?.centipawnLoss ?? 0;
    const forcingStr = extractedReasoning?.forcingReply?.concreteDescription || 'None detected';
    const motifStr = extractedReasoning?.tacticalCause?.motif || 'Positional';

    headline = `[TECHNICAL] ${played} (${cls}) | CPL: ${cplStr}cp`;
    body = `Evaluation: ${evalBeforeStr} → ${evalAfterStr} (Delta: ${((severity?.evalDeltaPlayer ?? 0) / 100).toFixed(2)}).
Classification: ${cls} | Severity Tier: ${severity?.tier || 'N/A'}.
Critical Response: ${forcingStr}.
Tactical Motif: ${motifStr}.
Causal Graph: ${causalChain.summaryFlowText}.
Best Alternative: ${best || 'N/A'} (${candidateStory?.immediateChange || 'Preserves eval'}).`;

  } else {
    // ── NORMAL MODE ──
    if (extractedReasoning?.primaryReason === 'PROMOTION_TACTICAL_FAILURE') {
      const opener = selectDiverseOpener('PROMOTION_FAILURE', analysis.moveNumber, gameId, history);
      headline = `${opener} (${played})`;
      const intentStr = `You were trying to promote your passed pawn, which is completely natural.`;
      const whyStr = extractedReasoning.whyFailedOrSucceeded;
      const altStr = best ? `The stronger continuation is ${best}, which keeps the promotion threat while avoiding the capture.` : '';
      const lessonOpener = selectDiverseLessonOpener(analysis.moveNumber, gameId, history);
      const lessonStr = `${lessonOpener} Before promoting, always check whether the promotion square is actually safe from captures.`;

      body = `${intentStr} ${whyStr} ${altStr} ${lessonStr}`;

    } else if (severity && isCatastrophic(severity)) {
      const opener = selectDiverseOpener('TACTICAL_BLUNDER', analysis.moveNumber, gameId, history);
      headline = `${opener} (${played})`;
      const intentStr = `The idea to ${intents.playerIntentLabel.toLowerCase()} is understandable, but the timing is off.`;
      const whyStr = extractedReasoning?.whyFailedOrSucceeded || `This move collapses the position due to an immediate tactical refutation.`;
      const altStr = best ? `Playing ${best} was critical to maintain position balance.` : '';
      const lessonOpener = selectDiverseLessonOpener(analysis.moveNumber, gameId, history);
      const lessonStr = `${lessonOpener} Always calculate your opponent's immediate checks, captures, and threats.`;

      body = `${intentStr} ${whyStr} ${altStr} ${lessonStr}`;

    } else if (severity && isSerious(severity)) {
      const opener = selectDiverseOpener('TACTICAL_BLUNDER', analysis.moveNumber, gameId, history);
      headline = `${opener} (${played})`;
      const whyStr = extractedReasoning?.whyFailedOrSucceeded || `${played} concedes significant evaluation.`;
      const altStr = best ? `${best} was necessary to maintain piece activity.` : '';

      body = `${opener} ${whyStr} ${altStr}`;

    } else if (cls === MoveClassification.BRILLIANT) {
      const opener = selectDiverseOpener('BRILLIANT_FIND', analysis.moveNumber, gameId, history);
      headline = `${opener} (${played})`;
      body = `${opener} ${played} is the only continuation that maintains your advantage in this complex position.`;

    } else if (isOptimal) {
      let family: ExplanationCategoryFamily = 'BEST_MOVE_PRECISION';
      if (analysis.isCapture || analysis.isCheck) family = 'BEST_MOVE_TACTICAL';
      else if (analysis.moveNumber <= 10) family = 'OPENING_PRINCIPLE';
      else family = 'BEST_MOVE_POSITIONAL';

      const opener = selectDiverseOpener(family, analysis.moveNumber, gameId, history);
      headline = `${played} — Optimal Move`;
      body = `${opener} ${played} maintains optimal piece coordination and central control.`;

    } else if (severity && severity.tier === 'MISTAKE') {
      const opener = selectDiverseOpener('GENERAL_MISTAKE', analysis.moveNumber, gameId, history);
      headline = `${played} — Inaccurate`;
      body = `${opener} ${played} drops evaluation. ${best ? `${best} was cleaner.` : ''}`;

    } else if (severity && canUsePositiveLanguage(severity)) {
      headline = `${played}`;
      body = `${played} is a solid continuation that maintains positional balance.`;

    } else {
      headline = `${played}`;
      body = `${played} is a natural move. ${best && best !== played ? `Preferring ${best} offered slightly better piece mobility.` : ''}`;
    }
  }

  return {
    headline,
    flowType,
    summary: reasoning.advantageLost,
    causalFlowText: causalChain.summaryFlowText,
    intentComparisonText: intents.intentMismatchText,
    candidateStoryText: candidateStory ? `${candidateStory.immediateChange} ${candidateStory.shortTermPlan}` : undefined,
    narrativeContextText: narrative.narrativeReferenceText,
    educationalLesson: extractedReasoning?.suggestedLesson || plan.educationalGoal,
    body,
    mode,
  };
}
