/**
 * Opening drill: positions from the player's own openings that they have
 * reached at least twice and where their move gave up real ground. Each
 * becomes a card in the same spaced-repetition deck as the mistakes.
 */
import { createEmptyCard } from 'ts-fsrs';
import { formatLine } from '@/lib/coach/board';
import type { DeckCard } from './deck';
import type { GameSummary, OpeningMove } from './summary';

/** A position has to have come up this many times. */
export const MIN_REACHED = 2;
/** And the move played there has to have lost at least this much, in centipawns (0.7 of a pawn). */
export const MIN_LOSS = 70;
/** Time the drill may take per day. */
export const DAILY_SECONDS = 5 * 60;
/** Thinking time counted for one card at most, so a break does not use up the day. */
export const MAX_CARD_SECONDS = 60;

interface Seen extends OpeningMove {
  gameId: string;
  opponent: string;
  playedAt: number;
}

/** Cards for every opening position that qualifies. The most recent bad move there is the one shown. */
export function openingCards(summaries: GameSummary[], now = Date.now()): DeckCard[] {
  const byPosition = new Map<string, Seen[]>();
  for (const s of summaries) {
    for (const m of s.openingMoves ?? []) {
      const list = byPosition.get(m.key) ?? [];
      list.push({ ...m, gameId: s.gameId, opponent: s.opponent, playedAt: s.playedAt });
      byPosition.set(m.key, list);
    }
  }

  const cards: DeckCard[] = [];
  for (const [key, seen] of byPosition) {
    if (seen.length < MIN_REACHED) continue;
    const slips = seen.filter((m) => m.loss >= MIN_LOSS && m.played !== m.best).sort((a, b) => b.playedAt - a.playedAt);
    const slip = slips[0];
    if (!slip) continue;
    const username = summaries[0].username;
    const pawns = (slip.loss / 100).toFixed(1);
    cards.push({
      id: `opening:${username}:${key}`,
      kind: 'opening',
      username,
      gameId: slip.gameId,
      index: slip.ply,
      opponent: slip.opponent,
      fen: slip.fen,
      color: slip.fen.split(' ')[1] === 'b' ? 'b' : 'w',
      answers: [slip.best],
      line: slip.line,
      played: slip.played,
      headline: `${slip.played} gives up about ${pawns} pawns here`,
      detail: `You have had this position ${seen.length} times and went wrong in ${slips.length} of them. The engine line is ${formatLine(slip.fen, slip.line)}.`,
      why: null,
      takeaway: 'Learn this one move, so the position is familiar next time it comes up.',
      skill: null,
      winDrop: Math.round(slip.loss / 10),
      createdAt: now,
      seen: 0,
      correct: 0,
      fsrs: createEmptyCard(new Date(now)),
    });
  }
  // The earliest positions first: they come up most often.
  return cards.sort((a, b) => a.index - b.index);
}

/** Cards that are not in the deck yet. */
export function missingCards(wanted: DeckCard[], existing: DeckCard[]): DeckCard[] {
  const have = new Set(existing.map((c) => c.id));
  return wanted.filter((c) => !have.has(c.id));
}

/** Seconds of drill left today. */
export function secondsLeft(spentToday: number): number {
  return Math.max(0, DAILY_SECONDS - spentToday);
}

/** Seconds to count for one answered card. */
export function cardSeconds(shownAt: number, answeredAt: number): number {
  return Math.min(MAX_CARD_SECONDS, Math.max(0, Math.round((answeredAt - shownAt) / 1000)));
}
