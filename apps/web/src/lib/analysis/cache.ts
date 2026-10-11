/**
 * Finished game analyses, kept in IndexedDB so reopening a game is instant.
 * Every call fails soft: no IndexedDB (private mode, SSR, tests) just means no cache.
 */
import type { GameAnalysis } from '@/types/chess';
import { PlayerColor } from '@/types/chess';
import { STORES, dbCollect, dbGet, dbPut } from '@/lib/storage/db';

/** Bump when the analysis format or engine settings change. */
export const CACHE_VERSION = 3;

const SUFFIX = `:v${CACHE_VERSION}`;

function cacheKey(gameId: string) {
  return `${gameId}${SUFFIX}`;
}

export async function loadCachedAnalysis(gameId: string): Promise<GameAnalysis | null> {
  const value = await dbGet<GameAnalysis>(STORES.analyses, cacheKey(gameId));
  return value ? { ...value, analyzedAt: value.analyzedAt ? new Date(value.analyzedAt) : null } : null;
}

export async function saveCachedAnalysis(analysis: GameAnalysis): Promise<void> {
  await dbPut(STORES.analyses, cacheKey(analysis.gameId), analysis);
}

/**
 * Evaluation after move 10 (in pawns, from White's side) for every analyzed
 * game that got that far. Used by the opening tree.
 */
export async function loadMoveTenEvals(): Promise<Map<string, number>> {
  const rows = await dbCollect<GameAnalysis, [string, number]>(STORES.analyses, (value, key) => {
    if (!key.endsWith(SUFFIX)) return undefined;
    const move = value.moves?.[19];
    if (!move || move.color !== PlayerColor.BLACK) return undefined;
    if (move.mateAfter !== null && move.mateAfter !== 0) return [value.gameId, move.mateAfter > 0 ? 10 : -10];
    if (move.evalAfter === null) return undefined;
    return [value.gameId, Math.max(-10, Math.min(10, move.evalAfter / 100))];
  });
  return new Map(rows);
}
