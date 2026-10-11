/**
 * Where the visualization and threat exercises come from: the player's own
 * deck cards, and the bundled classic games.
 */
import { Chess } from 'chess.js';
import type { DeckCard } from './deck';
import { MASTER_GAMES } from './guess';
import { findThreats, type ThreatSet } from './threats';
import { MIN_LINE, MAX_LINE, seeded } from './visualize';

export interface LineSource {
  fen: string;
  line: string[];
  /** Where the line is from, shown to the player. */
  from: string;
}

/** Lines of at least four half-moves from the player's deck. */
export function linesFromCards(cards: DeckCard[]): LineSource[] {
  return cards
    .filter((c) => c.line.length >= MIN_LINE)
    .map((c) => ({ fen: c.fen, line: c.line, from: `The better line from your game against ${c.opponent}` }));
}

/** Six-move stretches of the classic games, starting after the opening. */
export function linesFromMasterGames(): LineSource[] {
  const out: LineSource[] = [];
  for (const game of MASTER_GAMES) {
    const chess = new Chess();
    chess.loadPgn(game.moves);
    const history = chess.history();
    const board = new Chess();
    for (let i = 0; i < history.length; i++) {
      if (i >= 8 && i % 4 === 0 && history.length - i >= MIN_LINE) {
        out.push({
          fen: board.fen(),
          line: history.slice(i, i + MAX_LINE),
          from: `${game.white} vs ${game.black}, ${game.year}`,
        });
      }
      board.move(history[i]);
    }
  }
  return out;
}

export interface ThreatPosition {
  fen: string;
  from: string;
  set: ThreatSet;
}

/** How many positions make one threat-spotter session. */
export const THREAT_SESSION = 10;

/**
 * Positions for the threat spotter, each with at least one threat. The
 * player's own cards about missed threats come first; positions from the
 * classic games (with the winner to move) fill the session.
 */
export function threatPositions(cards: DeckCard[], seed: number): ThreatPosition[] {
  const rand = seeded(seed);
  const shuffled = <T,>(items: T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const withThreats = (fen: string, from: string): ThreatPosition | null => {
    const set = findThreats(fen);
    return set.threats.length > 0 ? { fen, from, set } : null;
  };

  const own = shuffled(cards.filter((c) => c.skill === 'blunder-check' || c.skill === 'opponent-threats'))
    .map((c) => withThreats(c.fen, `From your game against ${c.opponent}`))
    .filter((p): p is ThreatPosition => p !== null)
    .slice(0, THREAT_SESSION);

  const classics: ThreatPosition[] = [];
  for (const game of MASTER_GAMES) {
    const chess = new Chess();
    chess.loadPgn(game.moves);
    const history = chess.history();
    const board = new Chess();
    history.forEach((san, i) => {
      if (i >= 8 && board.turn() === game.side) {
        const p = withThreats(board.fen(), `${game.white} vs ${game.black}, ${game.year}`);
        if (p) classics.push(p);
      }
      board.move(san);
    });
  }

  return [...own, ...shuffled(classics)].slice(0, THREAT_SESSION);
}
