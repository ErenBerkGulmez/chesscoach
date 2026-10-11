/**
 * Endgame trainer: play out endgames with seven pieces or fewer, from your
 * own games and from a few classics, and get told the moment a move changes
 * the result. Verdicts come from the Lichess tablebase API.
 */
import { positionKey } from '@/lib/chess/opening-book';
import { STORES, dbGet, dbPut } from '@/lib/storage/db';

export type Outcome = 'win' | 'draw' | 'loss';

export interface TablebaseMove {
  uci: string;
  san: string;
  /** Result for the side to move AFTER this move, i.e. for the opponent. */
  category: string;
  checkmate?: boolean;
  stalemate?: boolean;
}

export interface TablebaseResult {
  /** Result for the side to move. */
  category: string;
  checkmate?: boolean;
  stalemate?: boolean;
  /** Legal moves, the best for the side to move first. */
  moves: TablebaseMove[];
}

/**
 * Simplify a tablebase category. Wins and losses that only exist because of
 * the fifty-move rule ("cursed", "blessed") count as the result on the board.
 */
export function outcomeOf(category: string): Outcome | null {
  if (category === 'win' || category === 'cursed-win' || category === 'maybe-win' || category === 'syzygy-win') return 'win';
  if (category === 'loss' || category === 'blessed-loss' || category === 'maybe-loss' || category === 'syzygy-loss') return 'loss';
  if (category === 'draw') return 'draw';
  return null;
}

export const flipOutcome = (o: Outcome): Outcome => (o === 'win' ? 'loss' : o === 'loss' ? 'win' : 'draw');

const NOUN: Record<Outcome, string> = { win: 'a win', draw: 'a draw', loss: 'a loss' };

export interface MoveVerdict {
  /** False when the move made the result worse. */
  ok: boolean;
  text: string;
}

/** Compare the result before a move with the result after it, both from the mover's side. */
export function judgeEndgameMove(san: string, before: Outcome, after: Outcome): MoveVerdict {
  if (before === after) {
    return { ok: true, text: before === 'win' ? `${san} keeps the win.` : before === 'draw' ? `${san} holds the draw.` : `${san}: still lost, but the most stubborn defence is what counts.` };
  }
  const rank = { loss: 0, draw: 1, win: 2 };
  if (rank[after] > rank[before]) return { ok: true, text: `${san} is fine.` };
  return { ok: false, text: `${san} turns ${NOUN[before]} into ${NOUN[after]}.` };
}

/** What the player is asked to do, from the tablebase result of the starting position. */
export function taskText(outcome: Outcome): string {
  if (outcome === 'win') return 'This is a win. Play it out without letting the win slip.';
  if (outcome === 'draw') return 'This is a draw with best play. Hold it.';
  return 'This is lost with best play. Defend as stubbornly as you can.';
}

/** Moves the player has to get right in a drawn or lost position before it counts as held. */
export const HOLD_MOVES = 10;

// ─── Tablebase client ───────────────────────────────────────────

const TABLEBASE_URL = 'https://tablebase.lichess.ovh/standard';

/** Requests wait for each other, so the API never gets two at once. */
let queue: Promise<unknown> = Promise.resolve();

async function fetchTablebase(fen: string): Promise<TablebaseResult> {
  const res = await fetch(`${TABLEBASE_URL}?fen=${encodeURIComponent(fen)}`);
  if (!res.ok) throw new Error(`Tablebase request failed (${res.status})`);
  const data = (await res.json()) as TablebaseResult;
  return {
    category: data.category,
    checkmate: data.checkmate,
    stalemate: data.stalemate,
    moves: (data.moves ?? []).map((m) => ({
      uci: m.uci,
      san: m.san,
      category: m.category,
      checkmate: m.checkmate,
      stalemate: m.stalemate,
    })),
  };
}

/**
 * The tablebase answer for a position, from the local cache when it has been
 * asked before. Requests go out one at a time.
 */
export function probeTablebase(fen: string): Promise<TablebaseResult> {
  const key = positionKey(fen);
  const run = async () => {
    const cached = await dbGet<TablebaseResult>(STORES.tbCache, key);
    if (cached) return cached;
    const fresh = await fetchTablebase(fen);
    void dbPut(STORES.tbCache, key, fresh);
    return fresh;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

// ─── Classic positions ──────────────────────────────────────────

export interface ClassicEndgame {
  id: string;
  title: string;
  /** What to remember about it. */
  idea: string;
  fen: string;
  /** Roughly the playing strength at which it is worth learning. */
  rating: number;
}

/** Hand-entered textbook positions. The player has the move in each. */
export const CLASSIC_ENDGAMES: ClassicEndgame[] = [
  {
    id: 'kq-k',
    title: 'Queen against a bare king',
    idea: 'Box the king in with the queen a knight move away, bring your king, and watch out for stalemate.',
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    rating: 600,
  },
  {
    id: 'kr-k',
    title: 'Rook against a bare king',
    idea: 'Cut the king off with the rook, use your king to take the opposition, and check only when the kings face each other.',
    fen: '8/8/8/4k3/8/8/8/4K2R w - - 0 1',
    rating: 800,
  },
  {
    id: 'kp-opposition-win',
    title: 'King and pawn: king in front of the pawn',
    idea: 'With your king in front of the pawn and a spare pawn move, you can take the opposition and win.',
    fen: '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1',
    rating: 1000,
  },
  {
    id: 'kp-opposition-draw',
    title: 'King and pawn: holding with the opposition',
    idea: 'Stay in front of the pawn and step straight back, so that you can meet the king with the opposition.',
    fen: '8/8/4k3/8/4PK2/8/8/8 b - - 0 1',
    rating: 1100,
  },
  {
    id: 'lucena',
    title: 'The Lucena position',
    idea: 'Build a bridge: check the king away, bring the rook to the fourth rank, then walk your king out and block the checks.',
    fen: '1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1',
    rating: 1400,
  },
  {
    id: 'philidor',
    title: 'The Philidor position',
    idea: 'Keep your rook on the third rank until the pawn advances, then go behind it and check from the back.',
    fen: '4k3/7R/r7/4PK2/8/8/8/8 b - - 0 1',
    rating: 1400,
  },
];

/** Classics ordered for a player: the ones at or below their level first, easiest first. */
export function classicsFor(rating: number): ClassicEndgame[] {
  const within = CLASSIC_ENDGAMES.filter((c) => c.rating <= rating + 200).sort((a, b) => a.rating - b.rating);
  const above = CLASSIC_ENDGAMES.filter((c) => c.rating > rating + 200).sort((a, b) => a.rating - b.rating);
  return [...within, ...above];
}
