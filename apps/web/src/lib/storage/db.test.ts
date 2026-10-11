import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION, STORES, closeDb, dbCollect, dbDelete, dbGet, dbGetAll, dbPut, openDb } from "./db";
import { CACHE_VERSION, loadCachedAnalysis, loadMoveTenEvals, saveCachedAnalysis } from "@/lib/analysis/cache";
import { AnalysisStatus, PlayerColor, type GameAnalysis, type MoveAnalysis } from "@/types/chess";

function deleteDatabase() {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** Create the database the way version 1 of the app did, with one cached analysis. */
function createVersionOne(key: string, value: unknown) {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("analyses");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("analyses", "readwrite");
      tx.objectStore("analyses").put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function analysis(gameId: string, moves: Partial<MoveAnalysis>[] = []): GameAnalysis {
  return {
    gameId,
    engineDepth: 16,
    engineVersion: "test",
    moves: moves as MoveAnalysis[],
    averageCpl: 20,
    accuracy: 88.5,
    openingAccuracy: null,
    middlegameAccuracy: null,
    endgameAccuracy: null,
    classificationCounts: {} as GameAnalysis["classificationCounts"],
    status: AnalysisStatus.COMPLETED,
    analyzedAt: new Date("2026-01-02T03:04:05Z"),
  };
}

afterEach(async () => {
  await closeDb();
  await deleteDatabase();
});

describe("database upgrade", () => {
  it("keeps analyses cached by version 1 and adds the new stores", async () => {
    const old = analysis("cc_1");
    await createVersionOne(`cc_1:v${CACHE_VERSION}`, old);

    const db = await openDb();
    expect(db).not.toBeNull();
    expect(db!.version).toBe(DB_VERSION);
    expect([...db!.objectStoreNames].sort()).toEqual(Object.values(STORES).sort());

    const loaded = await loadCachedAnalysis("cc_1");
    expect(loaded?.accuracy).toBe(88.5);
    expect(loaded?.analyzedAt).toEqual(old.analyzedAt);
  });

  it("creates every store on a fresh install", async () => {
    const db = await openDb();
    expect([...db!.objectStoreNames].sort()).toEqual(Object.values(STORES).sort());
  });
});

describe("store helpers", () => {
  it("puts, gets, lists and deletes values", async () => {
    expect(await dbGet(STORES.cards, "a")).toBeNull();
    expect(await dbPut(STORES.cards, "a", { n: 1 })).toBe(true);
    expect(await dbPut(STORES.cards, "b", { n: 2 })).toBe(true);
    expect(await dbGet(STORES.cards, "a")).toEqual({ n: 1 });
    expect(await dbGetAll(STORES.cards)).toEqual([{ n: 1 }, { n: 2 }]);
    expect(await dbCollect<{ n: number }, string>(STORES.cards, (v, k) => (v.n > 1 ? k : undefined))).toEqual(["b"]);
    expect(await dbDelete(STORES.cards, "a")).toBe(true);
    expect(await dbGetAll(STORES.cards)).toEqual([{ n: 2 }]);
  });

  it("keeps stores separate", async () => {
    await dbPut(STORES.plan, "current", { week: 1 });
    expect(await dbGet(STORES.summaries, "current")).toBeNull();
    expect(await dbGet(STORES.plan, "current")).toEqual({ week: 1 });
  });
});

describe("analysis cache", () => {
  it("round-trips an analysis", async () => {
    await saveCachedAnalysis(analysis("cc_2"));
    expect((await loadCachedAnalysis("cc_2"))?.gameId).toBe("cc_2");
    expect(await loadCachedAnalysis("cc_missing")).toBeNull();
  });

  it("reads the evaluation after move 10 from analyzed games", async () => {
    const ply = (i: number, evalAfter: number | null, mateAfter: number | null = null): Partial<MoveAnalysis> => ({
      color: i % 2 === 0 ? PlayerColor.WHITE : PlayerColor.BLACK,
      evalAfter,
      mateAfter,
    });
    const twenty = (last: Partial<MoveAnalysis>) => [...Array.from({ length: 19 }, (_, i) => ply(i, 0)), last];

    await saveCachedAnalysis(analysis("long", twenty(ply(19, 135))));
    await saveCachedAnalysis(analysis("mate", twenty(ply(19, 0, -3))));
    await saveCachedAnalysis(analysis("short", [ply(0, 20), ply(1, 30)]));
    // An entry from an older cache format is ignored.
    await dbPut(STORES.analyses, "old:v1", analysis("old", twenty(ply(19, 500))));

    const evals = await loadMoveTenEvals();
    expect(evals.get("long")).toBe(1.35);
    expect(evals.get("mate")).toBe(-10);
    expect(evals.has("short")).toBe(false);
    expect(evals.has("old")).toBe(false);
  });
});
