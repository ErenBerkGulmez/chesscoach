/**
 * The mistake deck: the key moments of the player's own games, turned into
 * "find the better move" cards and scheduled with spaced repetition (FSRS).
 */
import { createEmptyCard, fsrs, Rating, State, type Card } from 'ts-fsrs';
import { SKILL_OF, type GameReport, type SkillKey } from '@/lib/coach/report';
import { evalToWinPercent } from '@/lib/stockfish/engine';
import type { GameAnalysis, MoveAnalysis, ParsedGame } from '@/types/chess';
import { PlayerColor } from '@/types/chess';

/** A key moment becomes a card only if it cost at least this much winning chance. */
export const MIN_CARD_WIN_DROP = 10;
/** The second engine move is also accepted unless it is this much worse than the first. */
export const CLEARLY_WORSE = 10;

/** 'mistake' cards come from key moments of games, 'opening' cards from repeated opening positions. */
export type CardKind = 'mistake' | 'opening';

export interface DeckCard {
  /** `${gameId}:${moveIndex}` */
  id: string;
  kind: CardKind;
  /** Lower-case Chess.com username the card belongs to. */
  username: string;
  gameId: string;
  /** Index of the move in the game. */
  index: number;
  opponent: string;
  /** Position before the mistake, with the player to move. */
  fen: string;
  color: 'w' | 'b';
  /** Moves (SAN) that count as correct. The first is the engine's choice. */
  answers: string[];
  /** The engine's line, SAN. */
  line: string[];
  /** What the player played in the game. */
  played: string;
  headline: string;
  detail: string;
  why: string | null;
  takeaway: string | null;
  skill: SkillKey | null;
  winDrop: number;
  createdAt: number;
  /** Times the card has been answered. */
  seen: number;
  /** Times it was answered correctly. */
  correct: number;
  fsrs: Card;
}

const scheduler = fsrs({ enable_fuzz: false });

/**
 * Moves that count as correct for a position: the engine's first choice, plus
 * its second when that is not clearly worse.
 */
export function acceptedAnswers(a: MoveAnalysis): string[] {
  const best = a.bestMoveSan ?? a.pvLines[0]?.pvSan?.[0];
  if (!best) return [];
  const [first, second] = a.pvLines;
  const alt = second?.pvSan?.[0];
  if (!first || !alt || alt === best) return [best];
  // Engine lines are scored from the side to move, which is the player here.
  const gap = evalToWinPercent(first.score, first.mate) - evalToWinPercent(second.score, second.mate);
  return gap < CLEARLY_WORSE ? [best, alt] : [best];
}

/** Cards for the key moments of one analyzed game. */
export function cardsFromGame(game: ParsedGame, analysis: GameAnalysis, report: GameReport, now = Date.now()): DeckCard[] {
  const cards: DeckCard[] = [];
  for (const moment of report.keyMoments) {
    const a = analysis.moves[moment.index];
    const e = moment.explanation;
    if (!a || e.winDrop < MIN_CARD_WIN_DROP) continue;
    const answers = acceptedAnswers(a);
    // No engine move, or the player already played an accepted one: nothing to learn.
    if (answers.length === 0 || answers.includes(a.sanMove)) continue;
    cards.push({
      id: `${game.id}:${moment.index}`,
      kind: 'mistake',
      username: game.playerUsername.toLowerCase(),
      gameId: game.id,
      index: moment.index,
      opponent: game.opponentUsername,
      fen: a.fenBefore,
      color: a.color === PlayerColor.WHITE ? 'w' : 'b',
      answers,
      line: (a.pvLines[0]?.pvSan ?? [answers[0]]).slice(0, 6),
      played: a.sanMove,
      headline: e.headline,
      detail: e.detail,
      why: e.better?.why ?? null,
      takeaway: e.takeaway,
      skill: e.motif ? SKILL_OF[e.motif] : null,
      winDrop: Math.round(e.winDrop),
      createdAt: now,
      seen: 0,
      correct: 0,
      fsrs: createEmptyCard(new Date(now)),
    });
  }
  return cards;
}

/** Strip check and mate marks so "Nf3+" and "Nf3" compare equal. */
const plain = (san: string) => san.replace(/[+#!?]/g, '');

export function isCorrect(card: Pick<DeckCard, 'answers'>, san: string): boolean {
  return card.answers.some((a) => plain(a) === plain(san));
}

/** Reschedule a card after an answer. A wrong answer brings it back soon. */
export function reviewCard(card: DeckCard, correct: boolean, now = Date.now()): DeckCard {
  const next = scheduler.next(card.fsrs, new Date(now), correct ? Rating.Good : Rating.Again);
  return { ...card, seen: card.seen + 1, correct: card.correct + (correct ? 1 : 0), fsrs: next.card };
}

/** Cards that are due, the most overdue first. */
export function dueCards(cards: DeckCard[], now = Date.now(), limit = 20): DeckCard[] {
  return cards
    .filter((c) => new Date(c.fsrs.due).getTime() <= now)
    .sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime())
    .slice(0, limit);
}

export interface DeckStats {
  total: number;
  due: number;
  /** Cards that have left the learning steps. */
  learned: number;
  /** Share of all answers that were correct, 0-100. Null before the first answer. */
  recall: number | null;
  /** When the next card comes due, if none is due now. */
  nextDue: number | null;
}

export function deckStats(cards: DeckCard[], now = Date.now()): DeckStats {
  const dues = cards.map((c) => new Date(c.fsrs.due).getTime());
  const due = dues.filter((d) => d <= now).length;
  const seen = cards.reduce((s, c) => s + c.seen, 0);
  const correct = cards.reduce((s, c) => s + c.correct, 0);
  const later = dues.filter((d) => d > now);
  return {
    total: cards.length,
    due,
    learned: cards.filter((c) => c.fsrs.state === State.Review).length,
    recall: seen ? Math.round((correct / seen) * 100) : null,
    nextDue: due === 0 && later.length ? Math.min(...later) : null,
  };
}
