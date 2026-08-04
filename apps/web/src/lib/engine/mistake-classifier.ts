/**
 * Categorized Mistake Classifier Engine
 * 
 * Classifies mistakes and inaccuracies into multi-tag error taxonomy categories.
 */

import type { MoveAnalysis } from '@/types/chess';
import { GamePhase } from './phase-detector';

export type MistakeCategory =
  | 'TACTICAL_OVERSIGHT'
  | 'CALCULATION_ERROR'
  | 'KING_SAFETY_MISTAKE'
  | 'DEVELOPMENT_MISTAKE'
  | 'POSITIONAL_MISTAKE'
  | 'PAWN_STRUCTURE_WEAKENING'
  | 'OPENING_INACCURACY'
  | 'PASSIVE_PLAY'
  | 'PREMATURE_ATTACK'
  | 'GREEDY_MOVE'
  | 'UNNECESSARY_EXCHANGE'
  | 'MISSED_OPPORTUNITY';

export interface MistakeTag {
  category: MistakeCategory;
  label: string;
  description: string;
  severity: 'BLUNDER' | 'MISTAKE' | 'INACCURACY' | 'NONE';
}

/**
 * Classify a move's mistakes into taxonomy categories.
 */
export function classifyMistakeTaxonomy(
  analysis: MoveAnalysis,
  gamePhase?: GamePhase
): MistakeTag[] {
  const tags: MistakeTag[] = [];
  const cpl = Math.abs(analysis.evalDelta ?? 0);
  const cls = analysis.classification;

  if (cls === 'BEST' || cls === 'GREAT' || cls === 'BRILLIANT' || cls === 'EXCELLENT') {
    return [];
  }

  const severity: 'BLUNDER' | 'MISTAKE' | 'INACCURACY' =
    cls === 'BLUNDER' || cls === 'MISSED_MATE' || cls === 'MISSED_WIN'
      ? 'BLUNDER'
      : cls === 'MISTAKE'
      ? 'MISTAKE'
      : 'INACCURACY';

  // 1. Opening Development Mistake
  if (gamePhase === 'OPENING' && cpl >= 35) {
    tags.push({
      category: 'DEVELOPMENT_MISTAKE',
      label: 'Development Delay',
      description: 'Moves an already active piece or pawn instead of completing minor piece development.',
      severity,
    });
  }

  // 2. Tactical Oversight / Missed Win
  if (cls === 'MISSED_WIN' || cls === 'MISSED_MATE' || (cpl >= 150 && analysis.isCapture)) {
    tags.push({
      category: 'TACTICAL_OVERSIGHT',
      label: 'Tactical Oversight',
      description: 'Overlooks a direct tactical strike, capture, or forced winning combination.',
      severity,
    });
  }

  // 3. Calculation Error
  if (cpl >= 100) {
    tags.push({
      category: 'CALCULATION_ERROR',
      label: 'Calculation Error',
      description: 'Miscalculates the tactical continuation or piece trade sequence.',
      severity,
    });
  }

  // 4. Positional & Passive Play
  if (cpl >= 30 && cpl < 100) {
    tags.push({
      category: 'PASSIVE_PLAY',
      label: 'Passive Play',
      description: 'Concedes initiative or central space to the opponent without sufficient counterplay.',
      severity,
    });
    tags.push({
      category: 'POSITIONAL_MISTAKE',
      label: 'Positional Inaccuracy',
      description: 'Allows opponent pieces to occupy active diagonals, files, or outpost squares.',
      severity,
    });
  }

  // 5. Default Missed Opportunity fallback
  if (tags.length === 0) {
    tags.push({
      category: 'MISSED_OPPORTUNITY',
      label: 'Missed Opportunity',
      description: 'Misses a cleaner tactical continuation suggested by the engine.',
      severity,
    });
  }

  return tags;
}
