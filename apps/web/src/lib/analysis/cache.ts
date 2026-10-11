/**
 * Finished game analyses, kept in IndexedDB so reopening a game is instant.
 * Every call fails soft: no IndexedDB (private mode, SSR, tests) just means no cache.
 */
import type { GameAnalysis } from '@/types/chess';

const DB_NAME = 'chesscoach';
const STORE = 'analyses';
/** Bump when the analysis format or engine settings change. */
export const CACHE_VERSION = 3;

function cacheKey(gameId: string) {
  return `${gameId}:v${CACHE_VERSION}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadCachedAnalysis(gameId: string): Promise<GameAnalysis | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(cacheKey(gameId));
      req.onsuccess = () => {
        const value = req.result as GameAnalysis | undefined;
        resolve(value ? { ...value, analyzedAt: value.analyzedAt ? new Date(value.analyzedAt) : null } : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveCachedAnalysis(analysis: GameAnalysis): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(analysis, cacheKey(analysis.gameId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
