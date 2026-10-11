/**
 * Structured Natural Language Generation (NLG) Engine
 * 
 * Assembles human-quality, deterministic coaching text across 5 coaching styles:
 * Beginner, Intermediate, Advanced, Master, Technical.
 */

import type { MoveAnalysis } from '@/types/chess';
import { ExplanationLevel, MoveClassification } from '@/types/chess';
import { PhaseDetails } from './phase-detector';
import { PositionTypeDetails } from './position-type-detector';
import { DetectedTacticalMotif } from './tactical-pattern-engine';
import { DetectedStrategicTheme } from './strategic-theme-engine';
import { ComparisonResult } from './candidate-comparator';
import { StructuredReasoning } from './reasoning-engine';

export interface CoachingExplanation {
  headline: string;
  summary: string;
  body: string;
  tacticalNote?: string;
  bestMoveRationale?: string;
  keyTakeaway: string;
  style: ExplanationLevel | 'TECHNICAL';
}

/**
 * Generate a multi-style natural language coaching explanation.
 */
export function buildNlgExplanation(
  analysis: MoveAnalysis,
  reasoning: StructuredReasoning,
  style: ExplanationLevel | 'TECHNICAL' = ExplanationLevel.INTERMEDIATE,
  phaseDetails?: PhaseDetails,
  posTypeDetails?: PositionTypeDetails,
  motifs: DetectedTacticalMotif[] = [],
  themes: DetectedStrategicTheme[] = [],
  comparison?: ComparisonResult,
  openingName?: string
): CoachingExplanation {
  const played = analysis.sanMove;
  const best = analysis.bestMoveSan;
  const cls = analysis.classification;
  const isGood = cls === 'BEST' || cls === 'GREAT' || cls === 'BRILLIANT';

  // 1. Headline
  const headline = getHeadline(cls, played, best);

  // 2. Summary
  const summary = `${reasoning.whatChanged} ${reasoning.advantageLost}`;

  // 3. Body text based on coaching style
  let body = '';
  switch (style) {
    case ExplanationLevel.BEGINNER:
      body = buildBeginnerNlg(analysis, reasoning, motifs);
      break;

    case ExplanationLevel.ADVANCED:
      body = buildAdvancedNlg(analysis, reasoning, posTypeDetails, themes);
      break;

    case ExplanationLevel.MASTER:
      body = buildMasterNlg(analysis, reasoning, posTypeDetails, themes, comparison);
      break;

    case 'TECHNICAL':
      body = buildTechnicalNlg(analysis, reasoning, comparison);
      break;

    case ExplanationLevel.INTERMEDIATE:
    default:
      body = buildIntermediateNlg(analysis, reasoning, themes);
      break;
  }

  // 4. Tactical & Best Move notes
  const tacticalNote = motifs.length > 0 ? motifs[0].description : undefined;
  const bestMoveRationale = !isGood && best ? comparison?.superiorityReason : undefined;
  const keyTakeaway = reasoning.generalLesson;

  return {
    headline,
    summary,
    body,
    tacticalNote,
    bestMoveRationale,
    keyTakeaway,
    style,
  };
}

function getHeadline(cls: MoveClassification, played: string, best: string | null): string {
  switch (cls) {
    case MoveClassification.BRILLIANT:
      return `🌟 Brilliant Move! ${played}`;
    case MoveClassification.GREAT:
      return `⭐ Great Move! ${played}`;
    case MoveClassification.BEST:
      return `✅ Best Move: ${played}`;
    case MoveClassification.EXCELLENT:
      return `👍 Excellent Move: ${played}`;
    case MoveClassification.GOOD:
      return `👌 Solid Move: ${played}`;
    case MoveClassification.INACCURACY:
      return `⚠️ Inaccuracy: ${played}${best ? ` (Prefer ${best})` : ''}`;
    case MoveClassification.MISTAKE:
      return `❓ Mistake: ${played}${best ? ` (Better was ${best})` : ''}`;
    case MoveClassification.BLUNDER:
      return `❌ Blunder: ${played}${best ? ` (Missed ${best})` : ''}`;
    case MoveClassification.MISSED_WIN:
      return `🏆 Missed Win: ${played}${best ? ` (Winning line was ${best})` : ''}`;
    case MoveClassification.MISSED_MATE:
      return `🎯 Missed Mate: ${played}${best ? ` (Forced mate was ${best})` : ''}`;
    default:
      return `Move ${played}`;
  }
}

function buildBeginnerNlg(
  analysis: MoveAnalysis,
  reasoning: StructuredReasoning,
  motifs: DetectedTacticalMotif[]
): string {
  if (analysis.classification === 'BEST' || analysis.classification === 'GREAT' || analysis.classification === 'BRILLIANT') {
    return `Great job! Moving your piece with ${analysis.sanMove} helps control the board safely and gets your army working together. ${reasoning.generalLesson}`;
  }
  if (analysis.classification === 'BLUNDER' || analysis.classification === 'MISSED_MATE') {
    return `Oops! ${analysis.sanMove} leaves an open threat or loses a valuable piece. ${reasoning.howToThink}`;
  }
  return `${reasoning.whatChanged} A safer option was ${analysis.bestMoveSan || 'a defensive move'}. ${reasoning.generalLesson}`;
}

function buildIntermediateNlg(
  analysis: MoveAnalysis,
  reasoning: StructuredReasoning,
  themes: DetectedStrategicTheme[]
): string {
  const themeStr = themes.length > 0 ? ` This move relates to ${themes[0].title.toLowerCase()}.` : '';
  return `${reasoning.whatChanged} ${reasoning.principleViolated}${themeStr} ${reasoning.bestMoveRationale}`;
}

function buildAdvancedNlg(
  analysis: MoveAnalysis,
  reasoning: StructuredReasoning,
  posType?: PositionTypeDetails,
  themes?: DetectedStrategicTheme[]
): string {
  const natureStr = posType ? ` In this ${posType.centerType.toLowerCase()} position, ` : ' ';
  return `${natureStr}${reasoning.whatChanged} ${reasoning.advantageLost} ${reasoning.bestMoveRationale} ${reasoning.longTermConsequences}`;
}

function buildMasterNlg(
  analysis: MoveAnalysis,
  reasoning: StructuredReasoning,
  posType?: PositionTypeDetails,
  themes?: DetectedStrategicTheme[],
  comparison?: ComparisonResult
): string {
  const compStr = comparison?.bestMoveSan ? ` Theoretical continuation ${comparison.bestMoveSan} offered precise control.` : '';
  return `${reasoning.whatChanged} ${reasoning.principleViolated}${compStr} ${reasoning.longTermConsequences}`;
}

function buildTechnicalNlg(
  analysis: MoveAnalysis,
  reasoning: StructuredReasoning,
  comparison?: ComparisonResult
): string {
  const cpl = Math.abs(analysis.evalDelta ?? 0);
  const lines = comparison?.candidateLines.map((c) => `[${c.rank}] ${c.san} (${c.evalText})`).join(' | ') || '';
  return `UCI: ${analysis.uciMove} | CPL: ${cpl}cp | Accuracy: ${analysis.moveAccuracy.toFixed(1)}% | Eval After: ${(analysis.evalAfter ?? 0) / 100} pawns.\nCandidates: ${lines}`;
}
