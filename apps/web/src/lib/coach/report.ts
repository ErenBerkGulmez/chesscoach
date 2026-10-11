/**
 * Whole-game coaching report: the key moments, the patterns behind the
 * mistakes, and a short, prioritized list of what to work on.
 */
import { getGamePhase } from '@/lib/chess/pgn-parser';
import { evalToWinPercent } from '@/lib/stockfish/engine';
import type { MoveAnalysis } from '@/types/chess';
import { MoveClassification, PlayerColor } from '@/types/chess';
import { explainMove, TAKEAWAYS, type Motif, type MoveExplanation } from './explain';

export interface KeyMoment {
  /** Index into the game's move list. */
  index: number;
  label: string;
  explanation: MoveExplanation;
}

export interface Pattern {
  motif: Motif;
  title: string;
  count: number;
  /** Move labels like "24...cxd4". */
  moves: string[];
  indices: number[];
  /** Sum of winning chances lost, 0-100 per move. */
  cost: number;
}

export interface FocusItem {
  title: string;
  why: string;
  drill: string;
  indices: number[];
}

export interface GameReport {
  verdict: string;
  keyMoments: KeyMoment[];
  patterns: Pattern[];
  focus: FocusItem[];
  phases: { phase: 'opening' | 'middlegame' | 'endgame'; mistakes: number; cost: number }[];
  strengths: string[];
}

const PATTERN_TITLE: Record<Motif, string> = {
  'allowed-mate': 'Allowed a mating attack',
  'missed-mate': 'Missed a forced mate',
  fork: 'Walked into a fork',
  'hanging-piece': 'Left a piece undefended',
  'lost-material': 'Lost material in an exchange',
  'missed-material': 'Missed free material',
  'missed-fork': 'Missed a fork',
  'king-safety': 'Weakened your own king',
  'king-attack': 'Let your king get attacked',
  endgame: 'Endgame technique',
  positional: 'Drifted without a tactic',
};

/** Skills to train. Several motifs map to the same skill. */
const SKILLS = {
  'blunder-check': {
    title: 'Blunder-check every move',
    drill: 'Before each move, name every piece the move leaves undefended and every capture your opponent gets. Do this out loud in your next 10 games.',
  },
  'opponent-threats': {
    title: "Spot your opponent's tactics",
    drill: "After each opponent move, list its checks, captures and double attacks before you think about your plan. 15 minutes of 'defend against the threat' puzzles a day helps.",
  },
  'own-tactics': {
    title: 'Find your own tactics',
    drill: 'Solve 20 short tactics puzzles a day (forks, free pieces, mate in 2). In games, look at every check and capture you have before making a quiet move.',
  },
  'king-safety': {
    title: 'Keep your king safe',
    drill: 'Leave the pawns in front of your castled king alone unless you can say exactly what the push achieves.',
  },
  endgame: {
    title: 'Practice basic endgames',
    drill: 'Study king and pawn endings and rook endings (opposition, Lucena, Philidor), then play them out against the engine from won positions.',
  },
  plans: {
    title: 'Choose a plan in quiet positions',
    drill: 'In quiet positions, find your worst-placed piece and improve it. Afterwards, compare your choice with the engine move in this review.',
  },
} as const;

const SKILL_OF: Record<Motif, keyof typeof SKILLS> = {
  'hanging-piece': 'blunder-check',
  'lost-material': 'blunder-check',
  fork: 'opponent-threats',
  'allowed-mate': 'opponent-threats',
  'king-attack': 'opponent-threats',
  'missed-material': 'own-tactics',
  'missed-fork': 'own-tactics',
  'missed-mate': 'own-tactics',
  'king-safety': 'king-safety',
  endgame: 'endgame',
  positional: 'plans',
};

const BAD = new Set<MoveClassification>([
  MoveClassification.INACCURACY,
  MoveClassification.MISTAKE,
  MoveClassification.BLUNDER,
  MoveClassification.MISSED_WIN,
  MoveClassification.MISSED_MATE,
]);

function label(a: MoveAnalysis) {
  return a.color === PlayerColor.WHITE ? `${a.moveNumber}.${a.sanMove}` : `${a.moveNumber}...${a.sanMove}`;
}

function moverEval(a: MoveAnalysis, white: number | null, mate: number | null) {
  const w = a.color === PlayerColor.WHITE;
  return evalToWinPercent(white === null ? 0 : w ? white : -white, mate === null ? null : w ? mate : -mate);
}

export function buildGameReport(analyses: MoveAnalysis[], playerColor: PlayerColor): GameReport {
  const mine = analyses
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => a.color === playerColor);

  const bad = mine
    .filter(({ a }) => BAD.has(a.classification))
    .map(({ a, index }) => ({ index, a, explanation: explainMove(a) }));

  // Key moments: the costliest mistakes, in game order.
  const keyMoments: KeyMoment[] = [...bad]
    .filter((b) => b.explanation.severity !== 'inaccuracy' || b.explanation.winDrop >= 8)
    .sort((x, y) => y.explanation.winDrop - x.explanation.winDrop)
    .slice(0, 5)
    .sort((x, y) => x.index - y.index)
    .map((b) => ({ index: b.index, label: label(b.a), explanation: b.explanation }));

  // Patterns: group mistakes by motif.
  const byMotif = new Map<Motif, Pattern>();
  for (const b of bad) {
    const motif = b.explanation.motif;
    if (!motif) continue;
    const p = byMotif.get(motif) ?? { motif, title: PATTERN_TITLE[motif], count: 0, moves: [], indices: [], cost: 0 };
    p.count++;
    p.moves.push(label(b.a));
    p.indices.push(b.index);
    p.cost += b.explanation.winDrop;
    byMotif.set(motif, p);
  }
  const patterns = [...byMotif.values()].sort((x, y) => y.cost - x.cost);

  // Focus: group patterns by skill, rank by total cost.
  const skills = new Map<string, { title: string; drill: string; cost: number; count: number; moves: string[]; indices: number[]; motifs: Motif[] }>();
  for (const p of patterns) {
    const key = SKILL_OF[p.motif];
    const s = SKILLS[key];
    const cur = skills.get(key) ?? { title: s.title, drill: s.drill, cost: 0, count: 0, moves: [], indices: [], motifs: [] };
    cur.cost += p.cost;
    cur.count += p.count;
    cur.moves.push(...p.moves);
    cur.indices.push(...p.indices);
    cur.motifs.push(p.motif);
    skills.set(key, cur);
  }

  const focus: FocusItem[] = [...skills.values()]
    .filter((s) => s.cost >= 5)
    .sort((x, y) => y.cost - x.cost)
    .slice(0, 3)
    .map((s) => {
      const order = s.indices.map((v, i) => [v, s.moves[i]] as const).sort((x, y) => x[0] - y[0]);
      const what = s.motifs.map((m) => PATTERN_TITLE[m].toLowerCase()).join(', ');
      return {
        title: s.title,
        why: `${s.count} ${s.count === 1 ? 'move' : 'moves'} in this game (${order.map((o) => o[1]).join(', ')}): ${what}.`,
        drill: s.drill,
        indices: order.map((o) => o[0]),
      };
    });

  // Conversion: was the player clearly winning at some point but did not keep it?
  const peak = mine.reduce((m, { a }) => Math.max(m, moverEval(a, a.evalBefore, a.mateBefore)), 0);
  const last = mine.length ? mine[mine.length - 1].a : null;
  const end = last ? moverEval(last, last.evalAfter, last.mateAfter) : 50;
  if (peak >= 85 && end < 60 && focus.length < 3) {
    focus.push({
      title: 'Convert winning positions',
      why: `You reached a winning position (about ${Math.round(peak)}% winning chances) but did not keep it.`,
      drill: 'When you are winning, trade pieces, remove your opponent\'s counterplay first, and play safe moves rather than the most ambitious ones.',
      indices: [],
    });
  }

  // Phases.
  const phases = (['opening', 'middlegame', 'endgame'] as const).map((phase) => {
    const inPhase = bad.filter((b) => getGamePhase(b.a.fenBefore, b.a.moveNumber) === phase);
    return { phase, mistakes: inPhase.length, cost: Math.round(inPhase.reduce((s, b) => s + b.explanation.winDrop, 0)) };
  });

  // Strengths: phases played cleanly, good tactical moves.
  const strengths: string[] = [];
  for (const p of phases) {
    const moves = mine.filter(({ a }) => getGamePhase(a.fenBefore, a.moveNumber) === p.phase).length;
    if (moves >= 4 && p.cost < 5) strengths.push(`Clean ${p.phase}: no costly mistakes in ${moves} moves.`);
  }
  const blunders = bad.filter((b) => b.explanation.severity === 'blunder').length;
  const mistakes = bad.filter((b) => b.explanation.severity === 'mistake').length;
  let verdict: string;
  if (bad.length === 0) verdict = 'A clean game: no inaccuracies or worse from you.';
  else if (keyMoments.length && keyMoments[0] && blunders + mistakes > 0) {
    const worst = [...keyMoments].sort((x, y) => y.explanation.winDrop - x.explanation.winDrop)[0];
    const counts = [
      blunders ? `${blunders} ${blunders === 1 ? 'blunder' : 'blunders'}` : '',
      mistakes ? `${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}` : '',
    ].filter(Boolean);
    verdict = `${counts.join(' and ')}. The turning point was ${worst.label}, which ${worst.explanation.headline.replace(worst.label + ' ', '')}.`;
  } else verdict = `Only small inaccuracies (${bad.length}). Nothing that changed the result.`;

  return { verdict, keyMoments, patterns, focus, phases, strengths };
}


export { TAKEAWAYS };
