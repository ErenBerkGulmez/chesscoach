/**
 * Targeted puzzles. The shards in public/puzzles/ hold about 30,000 puzzles
 * from the Lichess puzzle database (CC0), one gzipped file per coaching
 * skill, built by scripts/build-puzzles.mjs. The player has a puzzle rating
 * per skill, and is served puzzles close to it.
 */
import { Chess, type Square } from 'chess.js';
import type { SkillKey } from '@/lib/coach/report';
import { STORES, dbGet, dbPut } from '@/lib/storage/db';

export const PUZZLE_SKILLS: SkillKey[] = ['blunder-check', 'opponent-threats', 'own-tactics', 'king-safety', 'endgame', 'plans'];

/** What the puzzles of each skill are about, for the player. */
export const PUZZLE_LABEL: Record<SkillKey, string> = {
  'blunder-check': 'Loose and trapped pieces',
  'opponent-threats': 'Forks, pins and skewers',
  'own-tactics': 'Mates and combinations',
  'king-safety': 'Attacks on the king',
  endgame: 'Endgames',
  plans: 'Quiet and defensive moves',
};

/** Readable names for the Lichess theme tags kept in the shards. */
const THEME_NAME: Record<string, string> = {
  hangingPiece: 'hanging piece',
  trappedPiece: 'trapped piece',
  capturingDefender: 'capture the defender',
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  mateIn1: 'mate in 1',
  mateIn2: 'mate in 2',
  discoveredAttack: 'discovered attack',
  doubleCheck: 'double check',
  deflection: 'deflection',
  attraction: 'attraction',
  sacrifice: 'sacrifice',
  kingsideAttack: 'kingside attack',
  queensideAttack: 'queenside attack',
  exposedKing: 'exposed king',
  attackingF2F7: 'attack on f2 or f7',
  rookEndgame: 'rook endgame',
  pawnEndgame: 'pawn endgame',
  queenEndgame: 'queen endgame',
  knightEndgame: 'knight endgame',
  bishopEndgame: 'bishop endgame',
  promotion: 'promotion',
  quietMove: 'quiet move',
  advancedPawn: 'advanced pawn',
  zugzwang: 'zugzwang',
  defensiveMove: 'defensive move',
  intermezzo: 'in-between move',
};

export const themeName = (theme: string) => THEME_NAME[theme] ?? theme;

export interface Puzzle {
  /** `${skill}:${line number}` */
  id: string;
  skill: SkillKey;
  /** Position before the opponent's move that sets the puzzle up. */
  fen: string;
  /** UCI moves: the opponent's move, then the solution, alternating. */
  moves: string[];
  rating: number;
  theme: string;
}

export function parseShard(skill: SkillKey, text: string): Puzzle[] {
  const out: Puzzle[] = [];
  text.split('\n').forEach((line, i) => {
    const [fen, moves, rating, theme] = line.split('|');
    if (!fen || !moves || !rating) return;
    out.push({ id: `${skill}:${i}`, skill, fen, moves: moves.split(' '), rating: Number(rating), theme: theme ?? '' });
  });
  return out;
}

const shardCache = new Map<SkillKey, Promise<Puzzle[]>>();

/** Fetch and unpack one shard. Each is loaded at most once per visit. */
export function loadShard(skill: SkillKey): Promise<Puzzle[]> {
  let pending = shardCache.get(skill);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(`/puzzles/${skill}.txt.gz`);
      if (!res.ok) throw new Error(`Could not load puzzles (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // Some servers unpack .gz files on the way out. Only gunzip what is still gzipped.
      const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
      const text = gzipped
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : new TextDecoder().decode(bytes);
      return parseShard(skill, text);
    })();
    pending.catch(() => shardCache.delete(skill));
    shardCache.set(skill, pending);
  }
  return pending;
}

export interface PuzzleStart {
  /** The position the solver sees, after the opponent's move. */
  fen: string;
  /** Squares of the opponent's move, to highlight. */
  lastMove: [string, string];
  solver: 'w' | 'b';
  /** The solver's moves and the opponent's replies, UCI, solver first. */
  solution: string[];
}

/** Play the opponent's first move. Returns null for a puzzle that does not replay. */
export function startPuzzle(puzzle: Pick<Puzzle, 'fen' | 'moves'>): PuzzleStart | null {
  try {
    const chess = new Chess(puzzle.fen);
    const first = puzzle.moves[0];
    chess.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] });
    return {
      fen: chess.fen(),
      lastMove: [first.slice(0, 2), first.slice(2, 4)],
      solver: chess.turn(),
      solution: puzzle.moves.slice(1),
    };
  } catch {
    return null;
  }
}

/**
 * Is the solver's move right? It is when it matches the solution, or when it
 * gives checkmate (any mate is as good as the listed one).
 */
export function isSolutionMove(fenBefore: string, from: string, to: string, expected: string): boolean {
  if (expected.slice(0, 2) === from && expected.slice(2, 4) === to) return true;
  try {
    const chess = new Chess(fenBefore);
    chess.move({ from, to, promotion: 'q' });
    return chess.isCheckmate();
  } catch {
    return false;
  }
}

/** Apply a UCI move and return the new position, or null if it is not legal. */
export function applyUci(fen: string, uci: string): { fen: string; from: Square; to: Square; san: string } | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
    return { fen: chess.fen(), from: move.from, to: move.to, san: move.san };
  } catch {
    return null;
  }
}

// ─── Rating ─────────────────────────────────────────────────────

export const START_RATING = 1200;

export interface PuzzleStat {
  username: string;
  skill: SkillKey;
  rating: number;
  played: number;
  solved: number;
}

export function newStat(username: string, skill: SkillKey, rating = START_RATING): PuzzleStat {
  return { username: username.toLowerCase(), skill, rating, played: 0, solved: 0 };
}

/** Chance of solving a puzzle, by the usual Elo formula. */
export function expectedScore(playerRating: number, puzzleRating: number): number {
  return 1 / (1 + 10 ** ((puzzleRating - playerRating) / 400));
}

/** The rating after one puzzle. It moves faster during the first ten puzzles of a skill. */
export function updateStat(stat: PuzzleStat, puzzleRating: number, solved: boolean): PuzzleStat {
  const k = stat.played < 10 ? 48 : 24;
  const change = k * ((solved ? 1 : 0) - expectedScore(stat.rating, puzzleRating));
  return {
    ...stat,
    rating: Math.max(400, Math.round(stat.rating + change)),
    played: stat.played + 1,
    solved: stat.solved + (solved ? 1 : 0),
  };
}

const statKey = (username: string, skill: SkillKey) => `${username.toLowerCase()}:${skill}`;

export async function loadStats(username: string): Promise<Record<SkillKey, PuzzleStat>> {
  const entries = await Promise.all(
    PUZZLE_SKILLS.map(async (skill) => {
      const stored = await dbGet<PuzzleStat>(STORES.puzzleStats, statKey(username, skill));
      return [skill, stored ?? newStat(username, skill)] as const;
    })
  );
  return Object.fromEntries(entries) as Record<SkillKey, PuzzleStat>;
}

export function saveStat(stat: PuzzleStat): Promise<boolean> {
  return dbPut(STORES.puzzleStats, statKey(stat.username, stat.skill), stat);
}

// ─── Choosing ───────────────────────────────────────────────────

/**
 * Pick a puzzle near the player's rating that has not been shown yet. The
 * window around the rating widens until it holds at least ten candidates.
 */
export function pickPuzzle(puzzles: Puzzle[], rating: number, seen: Set<string>, rand: () => number): Puzzle | null {
  const fresh = puzzles.filter((p) => !seen.has(p.id));
  if (fresh.length === 0) return null;
  for (let window = 100; window <= 2000; window += 100) {
    const near = fresh.filter((p) => Math.abs(p.rating - rating) <= window);
    if (near.length >= Math.min(10, fresh.length)) return near[Math.floor(rand() * near.length)];
  }
  return fresh[Math.floor(rand() * fresh.length)];
}

/** The skill to practice: the one the weakness profile ranks first, if it costs anything. */
export function focusSkill(profile: { skills: { skill: SkillKey; lostPerGame: number }[] }): SkillKey | null {
  const top = profile.skills[0];
  return top && top.lostPerGame > 0 ? top.skill : null;
}
