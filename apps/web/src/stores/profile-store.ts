/**
 * Background queue that analyzes a batch of games for the weakness profile.
 *
 * Games are analyzed one at a time with the same analyzer as the review page.
 * Each finished game is saved straight away (analysis, summary and deck
 * cards), so pausing or closing the page never loses more than the game in
 * progress, and resuming skips what is already done.
 */
import { create } from 'zustand';
import { loadCachedAnalysis, saveCachedAnalysis } from '@/lib/analysis/cache';
import { loadSummary, recordGame } from '@/lib/training/store';
import type { ParsedGame } from '@/types/chess';

/** Games shorter than this many half-moves are skipped: there is nothing to learn from them. */
const MIN_PLIES = 10;

type Status = 'idle' | 'running' | 'paused' | 'done' | 'error';

interface ProfileQueueState {
  status: Status;
  /** Games in the batch that have a summary. */
  done: number;
  total: number;
  /** Opponent of the game being analyzed. */
  current: string | null;
  /** Progress within the current game, 0-100. */
  currentProgress: number;
  /** New deck cards created by this run. */
  cardsAdded: number;
  error: string | null;
  /** Goes up every time a summary is saved, so views know to reload. */
  version: number;

  start: (games: ParsedGame[]) => Promise<void>;
  pause: () => void;
}

let controller: AbortController | null = null;

export const useProfileQueue = create<ProfileQueueState>((set, get) => ({
  status: 'idle',
  done: 0,
  total: 0,
  current: null,
  currentProgress: 0,
  cardsAdded: 0,
  error: null,
  version: 0,

  start: async (games) => {
    if (get().status === 'running') return;
    const batch = games.filter((g) => g.moves.length >= MIN_PLIES);
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    set({ status: 'running', total: batch.length, done: 0, error: null, current: null, currentProgress: 0 });

    try {
      const pending: ParsedGame[] = [];
      for (const game of batch) {
        if (await loadSummary(game.id)) set((s) => ({ done: s.done + 1 }));
        else pending.push(game);
      }

      const { analyzeGame } = await import('@/lib/stockfish/analyzer');
      for (const game of pending) {
        if (mine.signal.aborted) break;
        set({ current: game.opponentUsername, currentProgress: 0 });

        let analysis = await loadCachedAnalysis(game.id);
        if (!analysis) {
          analysis = await analyzeGame(game.moves, game.id, {
            playerColor: game.playerColor,
            signal: mine.signal,
            onProgress: (done, total) => {
              if (!mine.signal.aborted) set({ currentProgress: Math.round((done / total) * 100) });
            },
          });
          if (mine.signal.aborted) break;
          await saveCachedAnalysis(analysis);
        }

        const { added } = await recordGame(game, analysis);
        set((s) => ({ done: s.done + 1, cardsAdded: s.cardsAdded + added, version: s.version + 1 }));
      }

      if (controller === mine) {
        set({ status: mine.signal.aborted ? 'paused' : 'done', current: null, currentProgress: 0 });
      }
    } catch (err) {
      if (controller !== mine) return;
      if (mine.signal.aborted) set({ status: 'paused', current: null, currentProgress: 0 });
      else set({ status: 'error', current: null, error: err instanceof Error ? err.message : 'Analysis failed' });
    }
  },

  pause: () => {
    if (get().status !== 'running') return;
    controller?.abort();
    set({ status: 'paused', current: null, currentProgress: 0 });
  },
}));
