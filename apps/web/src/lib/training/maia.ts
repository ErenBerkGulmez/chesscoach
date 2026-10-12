/**
 * Input and output handling for Maia-2, a neural network trained to predict
 * the move a human of a given rating would play (https://github.com/CSSLab/maia2, MIT).
 *
 * The network always sees the position from White's side: with Black to move
 * the board is mirrored first and the chosen move mirrored back. This module
 * is a port of the reference encoding and has no dependency on the runtime,
 * so it can be tested without the model.
 */
import { Chess } from 'chess.js';

export const MAIA_MIN_RATING = 1100;
export const MAIA_MAX_RATING = 2000;
/** Ratings the bot can be set to. Below 1100 and from 2000 up are single buckets in the model. */
export const MAIA_RATINGS = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];

const CHANNELS = 18;
const FILES = 'abcdefgh';

/** The model's rating bucket: 0 below 1100, then one per hundred points, 10 from 2000 up. */
export function ratingBucket(rating: number): number {
  if (rating < MAIA_MIN_RATING) return 0;
  if (rating >= MAIA_MAX_RATING) return 10;
  return Math.floor((rating - MAIA_MIN_RATING) / 100) + 1;
}

/** The closest rating the bot can be set to. */
export function nearestBotRating(rating: number): number {
  const clamped = Math.max(MAIA_RATINGS[0], Math.min(MAIA_RATINGS[MAIA_RATINGS.length - 1], rating));
  return Math.round(clamped / 100) * 100;
}

const squareName = (index: number) => `${FILES[index % 8]}${Math.floor(index / 8) + 1}`;

/** Squares a lone piece on `from` attacks, highest square first (the order the reference move list uses). */
function targets(from: number, knight: boolean): number[] {
  const file = from % 8;
  const rank = Math.floor(from / 8);
  const out: number[] = [];
  for (let to = 63; to >= 0; to--) {
    if (to === from) continue;
    const df = Math.abs((to % 8) - file);
    const dr = Math.abs(Math.floor(to / 8) - rank);
    const hit = knight ? (df === 1 && dr === 2) || (df === 2 && dr === 1) : df === 0 || dr === 0 || df === dr;
    if (hit) out.push(to);
  }
  return out;
}

function buildMoveList(): string[] {
  const moves: string[] = [];
  for (let from = 0; from < 64; from++) {
    for (const to of targets(from, false)) moves.push(squareName(from) + squareName(to));
    for (const to of targets(from, true)) moves.push(squareName(from) + squareName(to));
  }
  // Promotions, always written for White because the board is mirrored for Black.
  for (let f = 0; f < 8; f++) {
    const file = FILES[f];
    for (const piece of 'qrbn') moves.push(`${file}7${file}8${piece}`);
    if (f > 0) for (const piece of 'qrbn') moves.push(`${file}7${FILES[f - 1]}8${piece}`);
    if (f < 7) for (const piece of 'qrbn') moves.push(`${file}7${FILES[f + 1]}8${piece}`);
  }
  return moves;
}

/** Every move the model has an output for, in the model's order: 1880 in all. */
export const MAIA_MOVES: string[] = buildMoveList();
const MOVE_INDEX = new Map(MAIA_MOVES.map((uci, i) => [uci, i]));

const mirrorSquare = (square: string) => `${square[0]}${9 - Number(square[1])}`;

/** Flip a move top to bottom. */
export function mirrorMove(uci: string): string {
  return mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + uci.slice(4);
}

const swapCase = (text: string) =>
  [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');

/** The same position with the board flipped top to bottom and the colours swapped. */
export function mirrorFen(fen: string): string {
  const [board, turn, castling, ep, half, full] = fen.split(' ');
  const flipped = board.split('/').reverse().map(swapCase).join('/');
  const rights = castling === '-' ? '-' : [...'KQkq'].filter((c) => swapCase(castling).includes(c)).join('') || '-';
  return [flipped, turn === 'w' ? 'b' : 'w', rights, ep === '-' ? '-' : mirrorSquare(ep), half ?? '0', full ?? '1'].join(' ');
}

/**
 * The 18 planes the model reads, for a position with White to move:
 * 12 piece planes (White's pawn to king, then Black's), side to move,
 * four castling rights, and the en passant square. Row 0 is the first rank.
 */
export function encodeBoard(fen: string): Float32Array {
  const [board, turn, castling, ep] = fen.split(' ');
  const out = new Float32Array(CHANNELS * 64);
  const order = 'PNBRQKpnbrqk';

  board.split('/').forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const c of row) {
      if (c >= '1' && c <= '8') {
        file += Number(c);
        continue;
      }
      out[order.indexOf(c) * 64 + rank * 8 + file] = 1;
      file++;
    }
  });

  const fill = (channel: number) => out.fill(1, channel * 64, (channel + 1) * 64);
  if (turn === 'w') fill(12);
  [...'KQkq'].forEach((right, i) => {
    if (castling.includes(right)) fill(13 + i);
  });
  if (ep && ep !== '-') out[17 * 64 + (Number(ep[1]) - 1) * 8 + FILES.indexOf(ep[0])] = 1;
  return out;
}

export interface MaiaInput {
  board: Float32Array;
  ratingSelf: number;
  ratingOpponent: number;
  /** Legal moves as the player would write them, each with its index in the model's output. */
  legal: { uci: string; index: number }[];
}

/**
 * Everything the model needs for one position. `botRating` is the strength
 * the bot plays at and `opponentRating` is the player it faces.
 * Returns null when there is no legal move.
 */
export function prepareInput(fen: string, botRating: number, opponentRating: number): MaiaInput | null {
  const blackToMove = fen.split(' ')[1] === 'b';
  const seen = blackToMove ? mirrorFen(fen) : fen;
  const chess = new Chess(seen);
  const legal: MaiaInput['legal'] = [];
  for (const move of chess.moves({ verbose: true })) {
    const uci = move.from + move.to + (move.promotion ?? '');
    const index = MOVE_INDEX.get(uci);
    if (index === undefined) continue;
    legal.push({ uci: blackToMove ? mirrorMove(uci) : uci, index });
  }
  if (legal.length === 0) return null;
  // chess.js leaves the en passant square out unless a capture is possible, which is what the model expects too.
  return { board: encodeBoard(chess.fen()), ratingSelf: ratingBucket(botRating), ratingOpponent: ratingBucket(opponentRating), legal };
}

export interface RankedMove {
  uci: string;
  /** How likely a player of that rating is to choose this move, 0-1. */
  probability: number;
}

/** Turn the model's raw output into probabilities over the legal moves, likeliest first. */
export function rankMoves(logits: ArrayLike<number>, legal: MaiaInput['legal']): RankedMove[] {
  const max = legal.reduce((m, l) => Math.max(m, logits[l.index]), -Infinity);
  const weights = legal.map((l) => Math.exp(logits[l.index] - max));
  const total = weights.reduce((a, b) => a + b, 0);
  return legal
    .map((l, i) => ({ uci: l.uci, probability: weights[i] / total }))
    .sort((a, b) => b.probability - a.probability);
}

/**
 * Choose the bot's move. Sampling makes it play like a person rather than
 * repeat itself, but moves a human would almost never play (under a tenth as
 * likely as the favourite) are left out so it does not throw games at random.
 */
export function chooseMove(ranked: RankedMove[], rand: () => number): RankedMove {
  const top = ranked[0];
  const pool = ranked.filter((m) => m.probability >= top.probability * 0.1);
  const total = pool.reduce((s, m) => s + m.probability, 0);
  let roll = rand() * total;
  for (const move of pool) {
    roll -= move.probability;
    if (roll <= 0) return move;
  }
  return top;
}
