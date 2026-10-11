/**
 * Small board helpers for the coach: material, line replay, attacks.
 * Everything is computed with chess.js, so explanations are always about
 * real squares and pieces on the board.
 */
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Material of `color` minus material of the other side, in pawns. */
export function materialBalance(chess: Chess, color: Color): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      total += sq.color === color ? PIECE_VALUE[sq.type] : -PIECE_VALUE[sq.type];
    }
  }
  return total;
}

/** Play SAN moves from `fen`, stopping at the first illegal one. */
export function replay(fen: string, sans: string[]): { chess: Chess; moves: Move[] } {
  const chess = new Chess(fen);
  const moves: Move[] = [];
  for (const san of sans) {
    try {
      moves.push(chess.move(san));
    } catch {
      break;
    }
  }
  return { chess, moves };
}

/**
 * Material change for `color` along a line, read at the last quiet point:
 * after a ply that is not a check, when the next ply is not a capture.
 */
export function materialSwing(fen: string, sans: string[], color: Color, maxPlies = 10): number {
  const chess = new Chess(fen);
  const start = materialBalance(chess, color);
  const line = sans.slice(0, maxPlies);
  let settled = start;
  for (let i = 0; i < line.length; i++) {
    let m: Move;
    try {
      m = chess.move(line[i]);
    } catch {
      break;
    }
    const next = line[i + 1];
    const nextIsCapture = next !== undefined && next.includes('x');
    // Remember the balance at each quiet point; the last one is the outcome.
    if (i >= 1 && !m.san.includes('+') && !nextIsCapture) settled = materialBalance(chess, color);
  }
  return settled - start;
}

/** Squares holding pieces of `victim` that the piece on `from` attacks. */
export function attackedTargets(chess: Chess, from: Square): { square: Square; type: PieceSymbol }[] {
  const piece = chess.get(from);
  if (!piece) return [];
  const victim = other(piece.color);
  const out: { square: Square; type: PieceSymbol }[] = [];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== victim) continue;
      if (chess.attackers(sq.square, piece.color).includes(from)) out.push({ square: sq.square, type: sq.type });
    }
  }
  return out;
}

/**
 * A fork: the piece on `from` attacks two or more targets that are each
 * worth more than it, undefended, or the king.
 */
export function forkTargets(chess: Chess, from: Square): { square: Square; type: PieceSymbol }[] {
  const piece = chess.get(from);
  if (!piece) return [];
  const targets = attackedTargets(chess, from).filter((t) => {
    if (t.type === 'k') return true;
    if (t.type === 'p') return false;
    const defended = chess.attackers(t.square, other(piece.color)).length > 0;
    return PIECE_VALUE[t.type] > PIECE_VALUE[piece.type] || !defended;
  });
  return targets.length >= 2 ? targets : [];
}

/** Is the piece on `square` attacked by the opponent and not defended? */
export function isHanging(chess: Chess, square: Square): boolean {
  const piece = chess.get(square);
  if (!piece) return false;
  return chess.attackers(square, other(piece.color)).length > 0 && chess.attackers(square, piece.color).length === 0;
}

/** "24...cxd4 25.Re7+ Kb6" style text for a line starting at `fen`. */
export function formatLine(fen: string, sans: string[], max = 6): string {
  const parts = fen.split(' ');
  let moveNo = parseInt(parts[5] ?? '1', 10) || 1;
  let white = parts[1] !== 'b';
  const out: string[] = [];
  sans.slice(0, max).forEach((san, i) => {
    if (white) out.push(`${moveNo}.${san}`);
    else out.push(i === 0 ? `${moveNo}...${san}` : san);
    if (!white) moveNo++;
    white = !white;
  });
  return out.join(' ');
}

export function pointsText(n: number): string {
  const v = Math.round(Math.abs(n));
  return `${v} point${v === 1 ? '' : 's'}`;
}

/** Name of what was won or lost, e.g. "a knight" or "the exchange", from a swing in pawns. */
export function materialName(n: number): string {
  const v = Math.round(Math.abs(n));
  if (v >= 9) return 'the queen';
  if (v >= 5) return 'a rook';
  if (v === 2) return 'the exchange';
  if (v >= 3) return 'a piece';
  if (v === 1) return 'a pawn';
  return 'material';
}
