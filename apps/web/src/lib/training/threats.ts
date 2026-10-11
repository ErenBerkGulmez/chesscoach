/**
 * Threat spotter: in a position where the opponent has just moved, find what
 * is in danger before choosing a move. The player taps their own pieces that
 * can be won, and the enemy pieces that can give check next move.
 */
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { PIECE_NAME, PIECE_VALUE, forkTargets, isHanging, other } from '@/lib/coach/board';

export type ThreatKind = 'hanging' | 'cheaper-attacker' | 'forked' | 'checker';

export interface Threat {
  square: Square;
  kind: ThreatKind;
  /** Why this square matters, shown after answering. */
  note: string;
}

export interface ThreatSet {
  /** Who is to move, and so whose pieces are in danger. */
  side: Color;
  threats: Threat[];
}

/** The same position with the other side to move, or null if that is not a legal position. */
function passTurn(fen: string): Chess | null {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    return new Chess(parts.join(' '));
  } catch {
    return null;
  }
}

function cheapestAttacker(chess: Chess, square: Square, by: Color): PieceSymbol | null {
  let best: PieceSymbol | null = null;
  for (const from of chess.attackers(square, by)) {
    const type = chess.get(from)?.type;
    if (type && (best === null || PIECE_VALUE[type] < PIECE_VALUE[best])) best = type;
  }
  return best;
}

/**
 * Everything the side to move should notice:
 *  - its own pieces (not pawns) that are attacked and undefended,
 *  - its own pieces attacked by something cheaper,
 *  - its own pieces caught in a fork,
 *  - enemy pieces that could give check on their next move.
 * One entry per square; the first reason found wins.
 */
export function findThreats(fen: string): ThreatSet {
  const chess = new Chess(fen);
  const side = chess.turn();
  const enemy = other(side);
  const found = new Map<Square, Threat>();
  const add = (square: Square, kind: ThreatKind, note: string) => {
    if (!found.has(square)) found.set(square, { square, kind, note });
  };

  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== side || sq.type === 'p' || sq.type === 'k') continue;
      const name = PIECE_NAME[sq.type];
      if (isHanging(chess, sq.square)) {
        add(sq.square, 'hanging', `The ${name} on ${sq.square} is attacked and has no defender.`);
        continue;
      }
      const attacker = cheapestAttacker(chess, sq.square, enemy);
      if (attacker && PIECE_VALUE[attacker] < PIECE_VALUE[sq.type]) {
        add(sq.square, 'cheaper-attacker', `The ${name} on ${sq.square} is attacked by a ${PIECE_NAME[attacker]}, which is worth less.`);
      }
    }
  }

  // Forks: an enemy piece that attacks two or more valuable or loose targets at once.
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== enemy) continue;
      const targets = forkTargets(chess, sq.square);
      if (targets.length < 2) continue;
      for (const t of targets) {
        if (t.type === 'k') continue;
        add(t.square, 'forked', `The ${PIECE_NAME[t.type]} on ${t.square} is forked by the ${PIECE_NAME[sq.type]} on ${sq.square}.`);
      }
    }
  }

  // Checks the opponent could give if it were their move.
  if (!chess.isCheck()) {
    const passed = passTurn(fen);
    if (passed) {
      for (const move of passed.moves({ verbose: true })) {
        if (!move.san.includes('+') && !move.san.includes('#')) continue;
        const mate = move.san.includes('#');
        add(move.from, 'checker', `The ${PIECE_NAME[move.piece]} on ${move.from} can give ${mate ? 'checkmate' : 'check'} with ${move.san}.`);
      }
    }
  }

  return { side, threats: [...found.values()] };
}

export interface ThreatGrade {
  found: Square[];
  missed: Square[];
  wrong: Square[];
  /** True when every threat was found and nothing else was tapped. */
  perfect: boolean;
}

export function gradeThreats(set: ThreatSet, picked: string[]): ThreatGrade {
  const expected = new Set<string>(set.threats.map((t) => t.square));
  const chosen = new Set(picked);
  const found = [...expected].filter((s) => chosen.has(s)) as Square[];
  const missed = [...expected].filter((s) => !chosen.has(s)) as Square[];
  const wrong = [...chosen].filter((s) => !expected.has(s)) as Square[];
  return { found, missed, wrong, perfect: missed.length === 0 && wrong.length === 0 };
}
