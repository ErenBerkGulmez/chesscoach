/**
 * Player & Games Store (Zustand)
 * 
 * Manages Chess.com player data, game lists, and sync state.
 */

import { create } from 'zustand';
import type {
  ParsedGame,
  PlayerStats,
  GameFilter,
  ChessComPlayer,
} from '@/types/chess';

interface PlayerState {
  // ─── Player Data ──────────────────────────────────────────
  username: string | null;
  profile: ChessComPlayer | null;
  games: ParsedGame[];
  filteredGames: ParsedGame[];
  stats: PlayerStats | null;

  // ─── Sync State ───────────────────────────────────────────
  isSyncing: boolean;
  syncProgress: { completed: number; total: number };
  syncError: string | null;

  // ─── Filters ──────────────────────────────────────────────
  filters: GameFilter;
  searchQuery: string;
  sortBy: 'date' | 'accuracy' | 'rating' | 'result';
  sortOrder: 'asc' | 'desc';

  // ─── Actions ──────────────────────────────────────────────
  setUsername: (username: string) => void;
  setProfile: (profile: ChessComPlayer) => void;
  setGames: (games: ParsedGame[]) => void;
  addGames: (games: ParsedGame[]) => void;
  setStats: (stats: PlayerStats) => void;

  setIsSyncing: (syncing: boolean) => void;
  setSyncProgress: (completed: number, total: number) => void;
  setSyncError: (error: string | null) => void;

  setFilters: (filters: Partial<GameFilter>) => void;
  clearFilters: () => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sortBy: 'date' | 'accuracy' | 'rating' | 'result') => void;
  toggleSortOrder: () => void;

  applyFilters: () => void;
  reset: () => void;
}

const EMPTY_FILTERS: GameFilter = {};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  username: null,
  profile: null,
  games: [],
  filteredGames: [],
  stats: null,

  isSyncing: false,
  syncProgress: { completed: 0, total: 0 },
  syncError: null,

  filters: EMPTY_FILTERS,
  searchQuery: '',
  sortBy: 'date',
  sortOrder: 'desc',

  setUsername: (username) => set({ username }),
  setProfile: (profile) => set({ profile }),

  setGames: (games) => {
    set({ games });
    get().applyFilters();
  },

  addGames: (newGames) => {
    const existing = get().games;
    const existingUrls = new Set(existing.map((g) => g.chessComUrl));
    const uniqueNew = newGames.filter((g) => !existingUrls.has(g.chessComUrl));
    const allGames = [...existing, ...uniqueNew].sort(
      (a, b) => b.playedAt.getTime() - a.playedAt.getTime()
    );
    set({ games: allGames });
    get().applyFilters();
  },

  setStats: (stats) => set({ stats }),

  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  setSyncProgress: (completed, total) =>
    set({ syncProgress: { completed, total } }),
  setSyncError: (error) => set({ syncError: error }),

  setFilters: (newFilters) => {
    set((state) => ({ filters: { ...state.filters, ...newFilters } }));
    get().applyFilters();
  },

  clearFilters: () => {
    set({ filters: EMPTY_FILTERS, searchQuery: '' });
    get().applyFilters();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().applyFilters();
  },

  setSortBy: (sortBy) => {
    set({ sortBy });
    get().applyFilters();
  },

  toggleSortOrder: () => {
    set((state) => ({ sortOrder: state.sortOrder === 'asc' ? 'desc' : 'asc' }));
    get().applyFilters();
  },

  applyFilters: () => {
    const { games, filters, searchQuery, sortBy, sortOrder } = get();
    let result = [...games];

    // Apply search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.opponentUsername.toLowerCase().includes(q) ||
          g.openingName?.toLowerCase().includes(q) ||
          g.eco?.toLowerCase().includes(q)
      );
    }

    // Apply filters
    if (filters.timeClass) {
      result = result.filter((g) => g.timeClass === filters.timeClass);
    }
    if (filters.result) {
      result = result.filter((g) => g.result === filters.result);
    }
    if (filters.color) {
      result = result.filter((g) => g.playerColor === filters.color);
    }
    if (filters.opponent) {
      result = result.filter((g) =>
        g.opponentUsername.toLowerCase().includes(filters.opponent!.toLowerCase())
      );
    }
    if (filters.opening) {
      result = result.filter((g) =>
        g.openingName?.toLowerCase().includes(filters.opening!.toLowerCase())
      );
    }
    if (filters.ratingMin) {
      result = result.filter((g) => g.opponentRating >= filters.ratingMin!);
    }
    if (filters.ratingMax) {
      result = result.filter((g) => g.opponentRating <= filters.ratingMax!);
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      result = result.filter((g) => g.playedAt >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      result = result.filter((g) => g.playedAt <= to);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = a.playedAt.getTime() - b.playedAt.getTime();
          break;
        case 'rating':
          comparison = a.opponentRating - b.opponentRating;
          break;
        case 'result':
          comparison = a.result.localeCompare(b.result);
          break;
        default:
          comparison = a.playedAt.getTime() - b.playedAt.getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    set({ filteredGames: result });
  },

  reset: () =>
    set({
      username: null,
      profile: null,
      games: [],
      filteredGames: [],
      stats: null,
      isSyncing: false,
      syncProgress: { completed: 0, total: 0 },
      syncError: null,
      filters: EMPTY_FILTERS,
      searchQuery: '',
      sortBy: 'date',
      sortOrder: 'desc',
    }),
}));
