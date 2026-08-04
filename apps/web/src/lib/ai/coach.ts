/**
 * Deterministic Chess Knowledge Coach
 * 
 * Replaces LLM dependencies with the 100% offline, deterministic Chess Knowledge Engine.
 */

import { MoveClassification, type MoveAnalysis } from '@/types/chess';
import { knowledgeEngine, FullMoveKnowledgeReport } from '@/lib/engine/knowledge-engine';
import { ExplanationMode } from '@/lib/engine/explanation-flow-nlg';

/**
 * Generate full move knowledge report using the Knowledge Engine.
 */
export function getFullMoveReport(
  analysis: MoveAnalysis,
  mode: ExplanationMode = 'NORMAL',
  openingName?: string
): FullMoveKnowledgeReport {
  return knowledgeEngine.analyzeMove(analysis, mode, openingName);
}

/**
 * Get an explanation for a specific move.
 */
export async function explainMove(
  analysis: MoveAnalysis,
  mode: ExplanationMode = 'NORMAL',
  gamePhase: string = 'middlegame',
  openingName?: string,
  prevMoveSan?: string | null,
  signal?: AbortSignal
): Promise<string> {
  const report = knowledgeEngine.analyzeMove(analysis, mode, openingName);
  return `${report.v2Explanation.headline}\n\n${report.v2Explanation.summary}\n\n${report.v2Explanation.body}`;
}

/**
 * Get a summary of an entire game.
 */
export async function summarizeGame(
  moveAnalyses: MoveAnalysis[],
  playerColor: string,
  accuracy: number,
  mode: ExplanationMode = 'NORMAL',
  openingName?: string,
  result?: string,
  signal?: AbortSignal
): Promise<string> {
  const report = knowledgeEngine.generatePlayerReport(moveAnalyses);
  const blunders = moveAnalyses.filter(
    (m) => m.color === playerColor && m.classification === MoveClassification.BLUNDER
  ).length;
  const brilliances = moveAnalyses.filter(
    (m) => m.color === playerColor && m.classification === MoveClassification.BRILLIANT
  ).length;

  const resultText =
    result === 'WIN' ? 'a fantastic victory' : result === 'LOSS' ? 'a tough defeat' : 'a balanced draw';

  let summaryText = `This game, concluding in ${resultText} for ${playerColor}, featured the ${
    openingName || 'Standard Opening'
  }. Overall played move accuracy was ${accuracy.toFixed(1)}%. ${
    blunders > 0
      ? `Critical blunders occurred on ${blunders} turns where tactical vigilance was needed.`
      : 'Maintained solid tactical vigilance throughout.'
  } ${
    brilliances > 0
      ? `Executed ${brilliances} brilliant tactic(s)!`
      : 'Look to increase tactical pressure on key turns.'
  }`;

  if (report.topWeaknesses.length > 0) {
    summaryText += ` Core area to improve: ${report.topWeaknesses[0].title}.`;
  }

  return summaryText;
}

/**
 * Generate a quick coaching tip for a specific move.
 */
export async function getQuickCoachTip(
  analysis: MoveAnalysis,
  signal?: AbortSignal
): Promise<string> {
  const report = knowledgeEngine.analyzeMove(analysis, 'NORMAL');
  return report.v2Explanation.body;
}
