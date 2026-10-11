/**
 * Where the visualization exercises come from: the engine lines on the
 * player's own deck cards, and stretches of the bundled classic games.
 */
import { Chess } from 'chess.js';
import type { DeckCard } from './deck';
import { MASTER_GAMES } from './guess';
import { MIN_LINE, MAX_LINE } from './visualize';

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
