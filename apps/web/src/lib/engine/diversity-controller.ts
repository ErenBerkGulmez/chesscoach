import { ExplanationReason } from './reason-extractor';
import { MoveClassification } from '@/types/chess';

export interface ExplanationHistory {
  recentOpeners: string[];
  recentStructures: string[];
  recentReasonTypes: string[];
}

export type ExplanationCategoryFamily =
  | 'TACTICAL_BLUNDER'
  | 'PROMOTION_FAILURE'
  | 'STRATEGIC_MISTAKE'
  | 'OPENING_PRINCIPLE'
  | 'ENDGAME_TECHNIQUE'
  | 'BEST_MOVE_PRECISION'
  | 'BEST_MOVE_TACTICAL'
  | 'BEST_MOVE_POSITIONAL'
  | 'BRILLIANT_FIND'
  | 'GENERAL_MISTAKE';

const OPENER_FAMILIES: Record<ExplanationCategoryFamily, string[]> = {
  PROMOTION_FAILURE: [
    'The promotion fails tactically.',
    'Promoting now is premature.',
    'The pawn promotion runs directly into a tactical refutation.',
    'The idea to promote is natural, but the execution fails.',
  ],
  TACTICAL_BLUNDER: [
    'This move overlooks an immediate tactical response.',
    'A serious tactical oversight changes the evaluation.',
    'The position turns against you immediately here.',
    'This allows your opponent a decisive tactical resource.',
    'The problem with this move appears on the very next turn.',
  ],
  STRATEGIC_MISTAKE: [
    'The issue here is more about long-term positional coordination.',
    'This move gives away your strategic advantage.',
    'Your plan is reasonable, but the execution concessions space.',
    'A subtle positional mistake reduces your army’s mobility.',
  ],
  OPENING_PRINCIPLE: [
    'The opening principle here is rapid, efficient development.',
    'This move is slightly premature in the opening phase.',
    'Prioritize developing minor pieces and securing king safety first.',
    'The issue here is opening move order and tempo.',
  ],
  ENDGAME_TECHNIQUE: [
    'In this endgame, king activity and passed pawn safety dictate the line.',
    'Endgame technique requires extreme precision.',
    'The key endgame resource here is piece activity.',
  ],
  BEST_MOVE_PRECISION: [
    'This is exactly the kind of move the position calls for.',
    'A clean, highly accurate decision that maintains complete control.',
    'You found the most efficient continuation on the board.',
    'This keeps the position under control without conceding counterplay.',
  ],
  BEST_MOVE_TACTICAL: [
    'A very precise tactical move that solves the position’s immediate problem.',
    'This move works cleanly because it combines attack and defense.',
    'The strength of this move is that it restricts all opponent counterplay.',
  ],
  BEST_MOVE_POSITIONAL: [
    'Strong positional technique—improving your piece harmony effortlessly.',
    'This is a multi-purpose move that improves piece placement and controls the center.',
    'A practical improvement: your forces become substantially more active.',
  ],
  BRILLIANT_FIND: [
    'A beautiful tactical resource!',
    'This is the key move that makes the entire combination work.',
    'The hidden point of this move is exceptional calculation.',
    'A very difficult tactical find over the board.',
  ],
  GENERAL_MISTAKE: [
    'This continuation gives away some of your evaluation edge.',
    'A more precise alternative was available.',
    'This move is playable, but makes the position harder to handle.',
  ],
};

const LESSON_OPENERS: string[] = [
  'Remember this pattern:',
  'The practical takeaway is:',
  'A useful rule in similar positions is:',
  'The key habit to build:',
  'In positions like this, always check:',
  'The broader chess principle:',
];

export function getDeterministicIndex(seed: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % max;
}

export function selectDiverseOpener(
  family: ExplanationCategoryFamily,
  moveNumber: number,
  gameId: string = 'game',
  history?: ExplanationHistory
): string {
  const options = OPENER_FAMILIES[family] || OPENER_FAMILIES.GENERAL_MISTAKE;
  const seed = `${gameId}-${moveNumber}-${family}`;

  let selectedIndex = getDeterministicIndex(seed, options.length);
  let selectedOpener = options[selectedIndex];

  // Anti-repetition: if recent openers contain this choice and we have alternatives, try next index
  if (history && history.recentOpeners.includes(selectedOpener) && options.length > 1) {
    selectedIndex = (selectedIndex + 1) % options.length;
    selectedOpener = options[selectedIndex];
  }

  if (history) {
    history.recentOpeners.push(selectedOpener);
    if (history.recentOpeners.length > 4) {
      history.recentOpeners.shift();
    }
  }

  return selectedOpener;
}

export function selectDiverseLessonOpener(
  moveNumber: number,
  gameId: string = 'game',
  history?: ExplanationHistory
): string {
  const seed = `lesson-${gameId}-${moveNumber}`;
  let selectedIndex = getDeterministicIndex(seed, LESSON_OPENERS.length);
  let selectedOpener = LESSON_OPENERS[selectedIndex];

  if (history && history.recentOpeners.includes(selectedOpener) && LESSON_OPENERS.length > 1) {
    selectedIndex = (selectedIndex + 1) % LESSON_OPENERS.length;
    selectedOpener = LESSON_OPENERS[selectedIndex];
  }

  return selectedOpener;
}
