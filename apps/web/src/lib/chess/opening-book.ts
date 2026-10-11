/**
 * Opening names by position.
 *
 * The book (public/openings/book.tsv) is built from the public-domain
 * lichess-org/chess-openings tables by scripts/build-openings.mjs. Looking a
 * game up by position rather than by its first moves means transpositions get
 * the right name.
 */
import type { ParsedMove } from '@/types/chess';
import { PlayerColor } from '@/types/chess';

export interface BookEntry {
  eco: string;
  name: string;
}

export type OpeningBook = Map<string, BookEntry>;

/** A named position reached in a game. */
export interface NamedPosition extends BookEntry {
  /** Number of half-moves played to reach it. */
  ply: number;
}

/** Book lines are short; nothing is named after this many half-moves. */
const MAX_BOOK_PLY = 40;

/** The part of a FEN that identifies a position: pieces, side to move, castling, en passant. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function parseOpeningBook(tsv: string): OpeningBook {
  const book: OpeningBook = new Map();
  for (const line of tsv.split('\n')) {
    const [position, eco, name] = line.split('\t');
    if (position && eco && name) book.set(position, { eco, name: name.trim() });
  }
  return book;
}

let bookPromise: Promise<OpeningBook | null> | null = null;

/** Load the book once. Resolves to null when it cannot be fetched. */
export function loadOpeningBook(): Promise<OpeningBook | null> {
  if (!bookPromise) {
    bookPromise = fetch('/openings/book.tsv')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(parseOpeningBook)
      .catch(() => {
        bookPromise = null;
        return null;
      });
  }
  return bookPromise;
}

/** "Sicilian Defense: Najdorf Variation" -> "Sicilian Defense". */
export function openingFamily(name: string): string {
  return name.split(':')[0].trim();
}

/** The last named position of a game: walk the moves and keep the deepest book hit. */
export function nameOpening(moves: ParsedMove[], book: OpeningBook): NamedPosition | null {
  let found: NamedPosition | null = null;
  const end = Math.min(moves.length, MAX_BOOK_PLY);
  for (let i = 0; i < end; i++) {
    const entry = book.get(positionKey(moves[i].fen));
    if (entry) found = { ...entry, ply: i + 1 };
  }
  return found;
}

/**
 * What each side chose: the deepest named position that arose from a move by
 * White, and the deepest that arose from a move by Black. In 1.e4 c5 2.c3 the
 * choice by Black is the Sicilian and the choice by White is the Alapin.
 */
export function sideChoices(
  moves: ParsedMove[],
  book: OpeningBook
): { white: NamedPosition | null; black: NamedPosition | null } {
  let white: NamedPosition | null = null;
  let black: NamedPosition | null = null;
  const end = Math.min(moves.length, MAX_BOOK_PLY);
  for (let i = 0; i < end; i++) {
    const entry = book.get(positionKey(moves[i].fen));
    if (!entry) continue;
    if (moves[i].color === PlayerColor.WHITE) white = { ...entry, ply: i + 1 };
    else black = { ...entry, ply: i + 1 };
  }
  return { white, black };
}
