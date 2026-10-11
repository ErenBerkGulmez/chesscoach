/**
 * The app's IndexedDB database. Everything is stored in the browser only.
 * Every call fails soft: no IndexedDB (private mode, SSR, tests without a
 * polyfill) just means nothing is stored.
 */

export const DB_NAME = 'chesscoach';
export const DB_VERSION = 2;

/**
 * Object stores. `analyses` exists since version 1; the rest were added in
 * version 2 for the training features. All use out-of-line string keys.
 */
export const STORES = {
  /** Full engine analysis per game, keyed `${gameId}:v${CACHE_VERSION}`. */
  analyses: 'analyses',
  /** Small per-game coaching summaries for the weakness profile. */
  summaries: 'summaries',
  /** Spaced-repetition cards (mistake deck, opening drill). */
  cards: 'cards',
  /** Puzzle rating per theme. */
  puzzleStats: 'puzzleStats',
  /** The current training plan and its progress. */
  plan: 'plan',
  /** Cached endgame tablebase answers. */
  tbCache: 'tbCache',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Create any store that is missing. Existing stores and their data are left alone. */
export function upgradeSchema(db: IDBDatabase) {
  for (const name of Object.values(STORES)) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
  }
}

export function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  const opening = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => upgradeSchema(req.result);
      req.onsuccess = () => {
        const db = req.result;
        // Let another tab upgrade the database instead of blocking it.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  dbPromise = opening;
  // A failed open is retried on the next call.
  void opening.then((db) => {
    if (!db && dbPromise === opening) dbPromise = null;
  });
  return opening;
}

/** Close the shared connection. Used by tests. */
export async function closeDb() {
  const db = await dbPromise;
  db?.close();
  dbPromise = null;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fallback: T,
  work: (s: IDBObjectStore, done: (value: T) => void) => void
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve) => {
        if (!db) return resolve(fallback);
        try {
          const tx = db.transaction(store, mode);
          let result = fallback;
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => resolve(fallback);
          tx.onabort = () => resolve(fallback);
          work(tx.objectStore(store), (value) => {
            result = value;
          });
        } catch {
          resolve(fallback);
        }
      })
  );
}

export function dbGet<T>(store: StoreName, key: string): Promise<T | null> {
  return run<T | null>(store, 'readonly', null, (s, done) => {
    const req = s.get(key);
    req.onsuccess = () => done((req.result as T | undefined) ?? null);
  });
}

export function dbPut<T>(store: StoreName, key: string, value: T): Promise<boolean> {
  return run<boolean>(store, 'readwrite', false, (s, done) => {
    const req = s.put(value, key);
    req.onsuccess = () => done(true);
  });
}

export function dbDelete(store: StoreName, key: string): Promise<boolean> {
  return run<boolean>(store, 'readwrite', false, (s, done) => {
    const req = s.delete(key);
    req.onsuccess = () => done(true);
  });
}

/** Every value in a store, in key order. */
export function dbGetAll<T>(store: StoreName): Promise<T[]> {
  return run<T[]>(store, 'readonly', [], (s, done) => {
    const req = s.getAll();
    req.onsuccess = () => done(req.result as T[]);
  });
}

/**
 * Visit every entry in a store without holding them all in memory.
 * `pick` returns what to keep from each entry, or undefined to skip it.
 */
export function dbCollect<T, R>(store: StoreName, pick: (value: T, key: string) => R | undefined): Promise<R[]> {
  return run<R[]>(store, 'readonly', [], (s, done) => {
    const out: R[] = [];
    done(out);
    const req = s.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const kept = pick(cursor.value as T, String(cursor.key));
      if (kept !== undefined) out.push(kept);
      cursor.continue();
    };
  });
}
