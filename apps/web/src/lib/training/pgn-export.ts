/**
 * Export the deck as a PGN file: one game per card, starting from the card's
 * position, with the explanation as comments and the moves as arrows. The
 * file imports into a Lichess study (and any PGN reader that handles
 * `[%cal]` arrow annotations).
 */
import { Chess } from 'chess.js';
import type { DeckCard } from './deck';

/** PGN comments end at "}", and header values at '"'. */
const inComment = (text: string) => text.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
const inHeader = (text: string) => text.replace(/["\\]/g, "'").replace(/\s+/g, ' ').trim();

/** `[%cal Ge2e4]`: a green (G) or red (R) arrow for a SAN move in a position. */
function arrow(fen: string, san: string, colour: 'G' | 'R'): string {
  try {
    const move = new Chess(fen).move(san);
    return ` [%cal ${colour}${move.from}${move.to}]`;
  } catch {
    return '';
  }
}

function pgnDate(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** One card as a PGN game. The moves are the engine's line from the card's position. */
export function cardToPgn(card: DeckCard, player: string): string {
  const chess = new Chess(card.fen);
  const whiteToMove = chess.turn() === 'w';
  const best = card.answers[0];

  const intro = inComment(
    `In the game you played ${card.played}. ${card.headline}. ${card.detail}` +
      (card.takeaway ? ` Habit: ${card.takeaway}` : '')
  );
  const better = inComment(
    card.answers.length > 1 ? `Better. ${card.answers[1]} is about as good.` : card.why ? `Better, because ${card.why}.` : 'Better.'
  );

  let moveText = `{ ${intro}${arrow(card.fen, card.played, 'R')} }`;
  let moveNumber = Number(card.fen.split(' ')[5]) || 1;
  let white = whiteToMove;
  let first = true;
  for (const san of card.line.length ? card.line : [best]) {
    try {
      const fenBefore = chess.fen();
      chess.move(san);
      const prefix = white ? `${moveNumber}.` : first ? `${moveNumber}...` : '';
      moveText += ` ${prefix}${prefix ? ' ' : ''}${san}`;
      if (first) moveText += ` { ${better}${arrow(fenBefore, san, 'G')} }`;
      if (!white) moveNumber++;
      white = !white;
      first = false;
    } catch {
      break;
    }
  }

  const title = card.kind === 'opening' ? 'Opening drill' : 'Mistake deck';
  const headers = [
    ['Event', `${title}: ${inHeader(card.headline)}`],
    ['Site', 'Chess Coach'],
    ['Date', pgnDate(card.createdAt)],
    ['White', card.color === 'w' ? player : card.opponent],
    ['Black', card.color === 'w' ? card.opponent : player],
    ['Result', '*'],
    ['SetUp', '1'],
    ['FEN', card.fen],
  ]
    .map(([k, v]) => `[${k} "${inHeader(v)}"]`)
    .join('\n');

  return `${headers}\n\n${moveText} *\n`;
}

/** The whole deck as one PGN file, in the order given. */
export function deckToPgn(cards: DeckCard[], player: string): string {
  return cards.map((c) => cardToPgn(c, player)).join('\n');
}

export function exportFileName(player: string, now = Date.now()): string {
  return `chess-coach-deck-${player.toLowerCase()}-${pgnDate(now).replace(/\./g, '-')}.pgn`;
}
