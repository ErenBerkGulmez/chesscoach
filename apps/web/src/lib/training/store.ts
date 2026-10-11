/**
 * Reading and writing training data (summaries and deck cards) in the
 * browser database. Like the rest of storage, everything fails soft.
 */
import { STORES, dbCollect, dbGet, dbPut } from '@/lib/storage/db';
import type { GameAnalysis, ParsedGame } from '@/types/chess';
import { cardsFromGame, type DeckCard } from './deck';
import { SUMMARY_VERSION, reportForGame, summarizeGame, type GameSummary } from './summary';

const sameUser = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function loadSummaries(username: string): Promise<GameSummary[]> {
  return dbCollect<GameSummary, GameSummary>(STORES.summaries, (s) =>
    s.v === SUMMARY_VERSION && sameUser(s.username, username) ? s : undefined
  );
}

export function loadSummary(gameId: string): Promise<GameSummary | null> {
  return dbGet<GameSummary>(STORES.summaries, gameId).then((s) => (s && s.v === SUMMARY_VERSION ? s : null));
}

export function saveSummary(summary: GameSummary): Promise<boolean> {
  return dbPut(STORES.summaries, summary.gameId, summary);
}

export function loadCards(username: string): Promise<DeckCard[]> {
  return dbCollect<DeckCard, DeckCard>(STORES.cards, (c) =>
    c.kind === 'mistake' && sameUser(c.username, username) ? c : undefined
  );
}

export function saveCard(card: DeckCard): Promise<boolean> {
  return dbPut(STORES.cards, card.id, card);
}

/**
 * Store what an analyzed game teaches: its summary and its deck cards.
 * Cards that already exist keep their review schedule, and a game that was
 * already won again stays that way.
 */
export async function recordGame(game: ParsedGame, analysis: GameAnalysis): Promise<{ summary: GameSummary; added: number }> {
  const report = reportForGame(game, analysis);
  const summary = summarizeGame(game, analysis, report);
  const previous = await loadSummary(game.id);
  if (previous?.convertedAt) summary.convertedAt = previous.convertedAt;
  await saveSummary(summary);

  let added = 0;
  for (const card of cardsFromGame(game, analysis, report)) {
    if (await dbGet<DeckCard>(STORES.cards, card.id)) continue;
    if (await saveCard(card)) added++;
  }
  return { summary, added };
}

/** Mark a game's lost winning position as won again, and save that. */
export function markConverted(summary: GameSummary): GameSummary {
  const updated = { ...summary, convertedAt: Date.now() };
  void saveSummary(updated);
  return updated;
}
