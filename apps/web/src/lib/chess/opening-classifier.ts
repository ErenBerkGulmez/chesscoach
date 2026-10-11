/**
 * Opening Classifier & Analytics Engine
 * 
 * Categorizes games into four independent opening datasets:
 * 1. Openings I played as White (White Opening Choice)
 * 2. Defenses opponents played against my White games (Black Defenses vs my White)
 * 3. Openings I played as Black (Black Defenses I chose)
 * 4. Openings opponents played against my Black games (White Openings vs my Black)
 */

import {
  ParsedGame,
  PlayerColor,
  GameResult,
  OpeningCategoryKey,
  CategorizedOpeningStat,
} from '@/types/chess';
import { openingFamily, sideChoices, type OpeningBook } from './opening-book';

export interface ClassifiedOpening {
  /** The opening system chosen by White */
  whiteChoice: {
    family: string;
    detailed: string;
    eco: string;
  };
  /** The defense/response chosen by Black */
  blackChoice: {
    family: string;
    detailed: string;
    eco: string;
  };
}

/**
 * Classify a game's opening into White's choice and Black's choice.
 *
 * With the opening book, each side's choice is the deepest named position
 * that arose from one of its own moves. Without it (still loading, or the
 * game left book on move one) both fall back to the name Chess.com gave.
 */
export function classifyGameOpening(game: ParsedGame, book?: OpeningBook | null): ClassifiedOpening {
  const rawName = (game.openingName || 'Unknown Opening').trim();
  const fallback = { family: openingFamily(rawName), detailed: rawName, eco: (game.eco || '').trim() };
  if (!book) return { whiteChoice: fallback, blackChoice: fallback };

  const { white, black } = sideChoices(game.moves, book);
  const choice = (entry: { name: string; eco: string } | null) =>
    entry ? { family: openingFamily(entry.name), detailed: entry.name, eco: entry.eco } : fallback;
  return { whiteChoice: choice(white ?? black), blackChoice: choice(black ?? white) };
}

export type OpeningSortBy =
  | 'games'
  | 'winRate'
  | 'performance'
  | 'accuracy'
  | 'cpl'
  | 'recent'
  | 'name';

export interface ComputeOpeningStatsOptions {
  category: OpeningCategoryKey;
  groupMode?: 'family' | 'detailed';
  searchQuery?: string;
  sortBy?: OpeningSortBy;
  sortOrder?: 'asc' | 'desc';
  /** Opening names by position. Without it, the names from Chess.com are used. */
  book?: OpeningBook | null;
}

/**
 * Filter and compute statistics for a specific category of openings.
 */
export function computeOpeningCategoryStats(
  games: ParsedGame[],
  options: ComputeOpeningStatsOptions
): {
  stats: CategorizedOpeningStat[];
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  winRate: number;
} {
  const {
    category,
    groupMode = 'family',
    searchQuery = '',
    sortBy = 'games',
    sortOrder = 'desc',
    book = null,
  } = options;

  // 1. Filter games by player color according to category
  const isWhiteCategory =
    category === OpeningCategoryKey.WHITE_PLAYER_OPENINGS ||
    category === OpeningCategoryKey.WHITE_OPPONENT_DEFENSES;

  const categoryGames = games.filter((g) =>
    isWhiteCategory
      ? g.playerColor === PlayerColor.WHITE
      : g.playerColor === PlayerColor.BLACK
  );

  const totalGames = categoryGames.length;
  let totalWins = 0;
  let totalLosses = 0;
  let totalDraws = 0;

  for (const g of categoryGames) {
    if (g.result === GameResult.WIN) totalWins++;
    else if (g.result === GameResult.LOSS) totalLosses++;
    else totalDraws++;
  }

  const categoryWinRate =
    totalGames > 0 ? Math.round((totalWins / totalGames) * 1000) / 10 : 0;

  if (totalGames === 0) {
    return {
      stats: [],
      totalGames: 0,
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
      winRate: 0,
    };
  }

  // 2. Group games by opening name according to category
  const map = new Map<
    string,
    {
      ecoCounts: Map<string, number>;
      gamesList: ParsedGame[];
    }
  >();

  for (const game of categoryGames) {
    const classified = classifyGameOpening(game, book);

    let openingData: { family: string; detailed: string; eco: string };

    switch (category) {
      case OpeningCategoryKey.WHITE_PLAYER_OPENINGS:
        openingData = classified.whiteChoice;
        break;
      case OpeningCategoryKey.WHITE_OPPONENT_DEFENSES:
        openingData = classified.blackChoice;
        break;
      case OpeningCategoryKey.BLACK_PLAYER_DEFENSES:
        openingData = classified.blackChoice;
        break;
      case OpeningCategoryKey.BLACK_OPPONENT_OPENINGS:
        openingData = classified.whiteChoice;
        break;
    }

    const key =
      groupMode === 'detailed'
        ? openingData.detailed
        : openingData.family;

    if (!map.has(key)) {
      map.set(key, {
        ecoCounts: new Map(),
        gamesList: [],
      });
    }

    const item = map.get(key)!;
    item.gamesList.push(game);

    if (openingData.eco) {
      item.ecoCounts.set(
        openingData.eco,
        (item.ecoCounts.get(openingData.eco) || 0) + 1
      );
    }
  }

  // 3. Compute detailed statistics per opening group
  const statsList: CategorizedOpeningStat[] = [];

  for (const [name, data] of map.entries()) {
    // Apply search query filter if provided
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = name.toLowerCase().includes(q);
      const matchEco = Array.from(data.ecoCounts.keys()).some((eco) =>
        eco.toLowerCase().includes(q)
      );
      if (!matchName && !matchEco) continue;
    }

    const gList = data.gamesList;
    const gCount = gList.length;

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalOpponentRating = 0;
    let totalMoveCount = 0;
    let accuracySum = 0;
    let accuracyCount = 0;
    const cplSum = 0;
    const cplCount = 0;

    let lastPlayed = new Date(0);

    for (const g of gList) {
      if (g.result === GameResult.WIN) wins++;
      else if (g.result === GameResult.LOSS) losses++;
      else draws++;

      totalOpponentRating += g.opponentRating;
      totalMoveCount += g.moveCount;

      if (g.playedAt > lastPlayed) {
        lastPlayed = g.playedAt;
      }

      if (typeof g.accuracy === 'number') {
        accuracySum += g.accuracy;
        accuracyCount++;
      }
    }

    // Determine primary ECO code
    let primaryEco = '';
    let maxEcoCount = 0;
    for (const [eco, count] of data.ecoCounts.entries()) {
      if (count > maxEcoCount) {
        maxEcoCount = count;
        primaryEco = eco;
      }
    }

    const percentageOfCategory =
      Math.round((gCount / totalGames) * 1000) / 10;
    const winRate = Math.round((wins / gCount) * 1000) / 10;
    const avgOpponentRating = Math.round(totalOpponentRating / gCount);
    const avgMoveCount = Math.round(totalMoveCount / gCount);

    // Performance Rating calculation (FIDE dp approximation)
    const scoreRate = (wins + 0.5 * draws) / gCount;
    const dp = calculatePerformanceDp(scoreRate);
    const performanceRating = Math.max(0, avgOpponentRating + dp);

    const avgAccuracy =
      accuracyCount > 0
        ? Math.round((accuracySum / accuracyCount) * 10) / 10
        : null;

    const avgCpl = cplCount > 0 ? Math.round(cplSum / cplCount) : null;

    statsList.push({
      name,
      eco: primaryEco,
      games: gCount,
      percentageOfCategory,
      wins,
      losses,
      draws,
      winRate,
      performanceRating,
      avgOpponentRating,
      avgCpl,
      avgAccuracy,
      avgMoveCount,
      lastPlayed,
      gamesList: gList,
    });
  }

  // 4. Sort results
  statsList.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'winRate':
        comparison = a.winRate - b.winRate;
        break;
      case 'performance':
        comparison = a.performanceRating - b.performanceRating;
        break;
      case 'accuracy':
        comparison = (a.avgAccuracy ?? 0) - (b.avgAccuracy ?? 0);
        break;
      case 'cpl':
        comparison = (a.avgCpl ?? 999) - (b.avgCpl ?? 999);
        break;
      case 'recent':
        comparison = a.lastPlayed.getTime() - b.lastPlayed.getTime();
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'games':
      default:
        comparison = a.games - b.games;
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return {
    stats: statsList,
    totalGames,
    totalWins,
    totalLosses,
    totalDraws,
    winRate: categoryWinRate,
  };
}

/**
 * FIDE rating difference lookup approximation based on score percentage (0 - 1)
 */
function calculatePerformanceDp(scorePct: number): number {
  if (scorePct >= 1) return 800;
  if (scorePct <= 0) return -800;
  if (scorePct === 0.5) return 0;
  // FIDE formula approximation: 400 * log10(p / (1 - p))
  const dp = Math.round(400 * Math.log10(scorePct / (1 - scorePct)));
  return Math.max(-800, Math.min(800, dp));
}
