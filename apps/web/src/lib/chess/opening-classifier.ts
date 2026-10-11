/**
 * Opening Classifier & Analytics Engine
 * 
 * Accurately categorizes games into four independent opening datasets:
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

/** Known Black defense keywords */
const BLACK_DEFENSE_KEYWORDS = [
  'defense',
  'defence',
  'countergambit',
  'counterattack',
  'declined',
  'accepted',
  'sicilian',
  'french',
  'caro-kann',
  'scandinavian',
  'king\'s indian',
  'nimzo-indian',
  'queen\'s indian',
  'bogo-indian',
  'grünfeld',
  'grunfeld',
  'slav',
  'semi-slav',
  'dutch',
  'pirc',
  'alekhine',
  'petrov',
  'benoni',
  'modern',
  'englund',
  'chigorin',
  'budapest',
  'albin',
  'stafford',
  'lasker',
  'tartakower',
  'cambridge',
  'tarrasch',
  'horwitz',
  'rat',
  'owen',
];

/**
 * Classify a game's opening into White Choice vs Black Choice.
 */
export function classifyGameOpening(game: ParsedGame): ClassifiedOpening {
  const rawName = (game.openingName || 'Unknown Opening').trim();
  const eco = (game.eco || '').trim();

  // Split into main family and variation
  const parts = rawName.split(':');
  const mainFamily = parts[0].trim();
  const subVariation = parts[1] ? parts[1].trim() : '';

  const lowerName = rawName.toLowerCase();
  const lowerFamily = mainFamily.toLowerCase();

  const isBlackDefenseName = BLACK_DEFENSE_KEYWORDS.some((kw) =>
    lowerFamily.includes(kw)
  );

  let whiteFamily = '';
  let whiteDetailed = '';

  let blackFamily = '';
  let blackDetailed = '';

  if (isBlackDefenseName) {
    // The opening name describes Black's defense
    blackFamily = mainFamily;
    blackDetailed = rawName;

    // Determine White's system from move 1 or variation
    if (subVariation) {
      whiteFamily = `${mainFamily} (${subVariation})`;
      whiteDetailed = rawName;
    } else {
      whiteFamily = getFirstMoveSystem(game.moves[0]?.san) || mainFamily;
      whiteDetailed = whiteFamily;
    }
  } else {
    // The opening name describes White's opening system
    whiteFamily = mainFamily;
    whiteDetailed = rawName;

    if (subVariation) {
      blackFamily = subVariation;
      blackDetailed = rawName;
    } else {
      blackFamily = getFirstMoveBlackResponse(game.moves[1]?.san) || `${mainFamily} Response`;
      blackDetailed = blackFamily;
    }
  }

  return {
    whiteChoice: {
      family: whiteFamily,
      detailed: whiteDetailed,
      eco,
    },
    blackChoice: {
      family: blackFamily,
      detailed: blackDetailed,
      eco,
    },
  };
}

/**
 * Fallback to determine White's 1st move opening system
 */
function getFirstMoveSystem(san?: string): string {
  if (!san) return 'White System';
  if (san === 'e4') return 'King\'s Pawn Opening (1.e4)';
  if (san === 'd4') return 'Queen\'s Pawn Opening (1.d4)';
  if (san === 'c4') return 'English Opening (1.c4)';
  if (san === 'Nf3') return 'Réti Opening (1.Nf3)';
  if (san === 'f4') return 'Bird\'s Opening (1.f4)';
  if (san === 'b3') return 'Nimzowitsch-Larsen Attack (1.b3)';
  if (san === 'g3') return 'Hungarian Opening (1.g3)';
  if (san === 'b4') return 'Sokolsky / Polish Opening (1.b4)';
  return 'Flank Opening';
}

/**
 * Fallback to determine Black's 1st move response
 */
function getFirstMoveBlackResponse(san?: string): string {
  if (!san) return 'Black Response';
  if (san === 'e5') return 'Open Game (1...e5)';
  if (san === 'c5') return 'Sicilian Defense (1...c5)';
  if (san === 'e6') return 'French Defense (1...e6)';
  if (san === 'c6') return 'Caro-Kann Defense (1...c6)';
  if (san === 'd5') return 'Closed Game (1...d5)';
  if (san === 'Nf6') return 'Indian Defense (1...Nf6)';
  if (san === 'd6') return 'Pirc Defense (1...d6)';
  if (san === 'g6') return 'Modern Defense (1...g6)';
  if (san === 'f5') return 'Dutch Defense (1...f5)';
  return 'Black Defense';
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
    const classified = classifyGameOpening(game);

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
