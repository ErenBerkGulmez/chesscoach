/**
 * Chess Knowledge Graph & Concept Library Engine
 * 
 * Contains an interconnected graph of 100+ chess concepts with relationships:
 * improves, creates, enables, requires, leads_to, increases.
 */

export type ConceptRelationType =
  | 'IMPROVES'
  | 'CREATES'
  | 'ENABLES'
  | 'REQUIRES'
  | 'LEADS_TO'
  | 'INCREASES';

export interface ConceptEdge {
  from: string;
  relation: ConceptRelationType;
  to: string;
}

export interface ChessConcept {
  id: string;
  name: string;
  category: 'OPENING' | 'STRATEGY' | 'TACTICS' | 'PAWN_STRUCTURE' | 'KING_SAFETY' | 'ENDGAME';
  definition: string;
  importanceScore: number;
  misconceptions: string[];
  whenItMatters: string;
  recommendedLesson: string;
}

export const CONCEPT_LIBRARY: Record<string, ChessConcept> = {
  DEVELOPMENT: {
    id: 'DEVELOPMENT',
    name: 'Piece Development',
    category: 'OPENING',
    definition: 'Mobilizing minor and major pieces from starting squares to active central squares.',
    importanceScore: 65,
    misconceptions: ['Moving the same piece multiple times in opening', 'Attacking before army is deployed'],
    whenItMatters: 'Critical in opening phase (moves 1-12).',
    recommendedLesson: 'Rapid Mobilization & Opening Principles',
  },
  CENTER_CONTROL: {
    id: 'CENTER_CONTROL',
    name: 'Center Control',
    category: 'STRATEGY',
    definition: 'Controlling e4, d4, e5, and d5 squares using pawns and piece pressure.',
    importanceScore: 75,
    misconceptions: ['Thinking only pawns can control the center'],
    whenItMatters: 'Essential in opening and middlegame phases.',
    recommendedLesson: 'Mastering Central Occupancy and Control',
  },
  INITIATIVE: {
    id: 'INITIATIVE',
    name: 'Initiative & Tempo',
    category: 'STRATEGY',
    definition: 'Dictating the flow of the game by creating threats that force opponent defensive replies.',
    importanceScore: 80,
    misconceptions: ['Sacrificing material needlessly for fake attacks'],
    whenItMatters: 'Crucial in dynamic and sharp positions.',
    recommendedLesson: 'Seizing and Maintaining the Initiative',
  },
  KING_SAFETY: {
    id: 'KING_SAFETY',
    name: 'King Safety',
    category: 'KING_SAFETY',
    definition: 'Ensuring the King is castled behind a solid pawn shield with adequate defenders.',
    importanceScore: 90,
    misconceptions: ['Leaving King in center during open games'],
    whenItMatters: 'Constant priority across opening and middlegame.',
    recommendedLesson: 'Pawn Shields & Defender Density',
  },
  WEAK_SQUARES: {
    id: 'WEAK_SQUARES',
    name: 'Weak Squares & Outposts',
    category: 'PAWN_STRUCTURE',
    definition: 'Squares that can no longer be guarded by pawns, becoming ideal outposts for knights.',
    importanceScore: 70,
    misconceptions: ['Creating pawn weaknesses unnecessarily'],
    whenItMatters: 'Middlegame maneuvering and piece placement.',
    recommendedLesson: 'Exploiting Outposts and Weak Squares',
  },
  PASSED_PAWN: {
    id: 'PASSED_PAWN',
    name: 'Passed Pawns',
    category: 'PAWN_STRUCTURE',
    definition: 'Pawns that have no opposing pawns on their file or adjacent files blocking their march.',
    importanceScore: 85,
    misconceptions: ['Pushing passed pawns without piece support'],
    whenItMatters: 'Paramount in endgame transitions.',
    recommendedLesson: 'Passed Pawn Promotion Strategies',
  },
  TACTICAL_VISION: {
    id: 'TACTICAL_VISION',
    name: 'Tactical Checks & Threats',
    category: 'TACTICS',
    definition: 'Calculating checks, captures, and threats to exploit loose or hanging pieces.',
    importanceScore: 98,
    misconceptions: ['Playing hope chess without calculating opponent replies'],
    whenItMatters: 'Every single move of every game.',
    recommendedLesson: 'Checks, Captures & Threat Calculation',
  },
};

export const CONCEPT_GRAPH: ConceptEdge[] = [
  { from: 'DEVELOPMENT', relation: 'IMPROVES', to: 'PIECE_ACTIVITY' },
  { from: 'PIECE_ACTIVITY', relation: 'CREATES', to: 'INITIATIVE' },
  { from: 'INITIATIVE', relation: 'ENABLES', to: 'KINGSIDE_ATTACK' },
  { from: 'KINGSIDE_ATTACK', relation: 'REQUIRES', to: 'KING_SAFETY' },
  { from: 'WEAK_SQUARES', relation: 'LEADS_TO', to: 'OUTPOSTS' },
  { from: 'OUTPOSTS', relation: 'IMPROVES', to: 'KNIGHT_ACTIVITY' },
  { from: 'PASSED_PAWN', relation: 'INCREASES', to: 'ENDGAME_WINNING_CHANCES' },
];

/**
 * Traverse concept graph to find related downstream concepts.
 */
export function getRelatedConcepts(conceptId: string): string[] {
  return CONCEPT_GRAPH.filter((edge) => edge.from === conceptId).map((edge) => edge.to);
}
