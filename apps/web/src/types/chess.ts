// ─── Chess Types ────────────────────────────────────────────────
// Shared type definitions for the Chess Coach AI platform

import type { Square, Color as ChessJsColor, PieceSymbol } from 'chess.js';

// ─── Enums ──────────────────────────────────────────────────────

export enum PlayerColor {
  WHITE = 'WHITE',
  BLACK = 'BLACK',
}

export enum TimeClass {
  BULLET = 'BULLET',
  BLITZ = 'BLITZ',
  RAPID = 'RAPID',
  DAILY = 'DAILY',
}

export enum GameResult {
  WIN = 'WIN',
  LOSS = 'LOSS',
  DRAW = 'DRAW',
}

export enum MoveClassification {
  BRILLIANT = 'BRILLIANT',
  GREAT = 'GREAT',
  BEST = 'BEST',
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  INACCURACY = 'INACCURACY',
  MISTAKE = 'MISTAKE',
  BLUNDER = 'BLUNDER',
  MISSED_WIN = 'MISSED_WIN',
  MISSED_MATE = 'MISSED_MATE',
}

export enum AnalysisStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ExplanationLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
  MASTER = 'MASTER',
}

// ─── Move Classification Styling ────────────────────────────────

export const CLASSIFICATION_CONFIG: Record<MoveClassification, {
  label: string;
  symbol: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  [MoveClassification.BRILLIANT]: {
    label: 'Brilliant',
    symbol: '!!',
    color: '#1bada6',
    bgColor: 'rgba(27, 173, 166, 0.15)',
    description: 'An exceptional move that requires deep calculation',
  },
  [MoveClassification.GREAT]: {
    label: 'Great',
    symbol: '!',
    color: '#5c8bb0',
    bgColor: 'rgba(92, 139, 176, 0.15)',
    description: 'A strong move that finds a non-obvious solution',
  },
  [MoveClassification.BEST]: {
    label: 'Best',
    symbol: '★',
    color: '#96bc4b',
    bgColor: 'rgba(150, 188, 75, 0.15)',
    description: 'The engine\'s top choice',
  },
  [MoveClassification.EXCELLENT]: {
    label: 'Excellent',
    symbol: '◆',
    color: '#96bc4b',
    bgColor: 'rgba(150, 188, 75, 0.10)',
    description: 'A very strong move with minimal evaluation loss',
  },
  [MoveClassification.GOOD]: {
    label: 'Good',
    symbol: '●',
    color: '#a3b86c',
    bgColor: 'rgba(163, 184, 108, 0.10)',
    description: 'A solid move',
  },
  [MoveClassification.INACCURACY]: {
    label: 'Inaccuracy',
    symbol: '?!',
    color: '#f7c631',
    bgColor: 'rgba(247, 198, 49, 0.15)',
    description: 'A suboptimal move that slightly worsens the position',
  },
  [MoveClassification.MISTAKE]: {
    label: 'Mistake',
    symbol: '?',
    color: '#e58f2a',
    bgColor: 'rgba(229, 143, 42, 0.15)',
    description: 'A bad move that significantly worsens the position',
  },
  [MoveClassification.BLUNDER]: {
    label: 'Blunder',
    symbol: '??',
    color: '#ca3431',
    bgColor: 'rgba(202, 52, 49, 0.15)',
    description: 'A terrible move that loses significant material or advantage',
  },
  [MoveClassification.MISSED_WIN]: {
    label: 'Missed Win',
    symbol: '△',
    color: '#ca3431',
    bgColor: 'rgba(202, 52, 49, 0.10)',
    description: 'Failed to convert a winning position',
  },
  [MoveClassification.MISSED_MATE]: {
    label: 'Missed Mate',
    symbol: '✕',
    color: '#ca3431',
    bgColor: 'rgba(202, 52, 49, 0.20)',
    description: 'Failed to play a forced checkmate',
  },
};

// ─── Core Data Types ────────────────────────────────────────────

export interface ChessComPlayer {
  username: string;
  player_id: number;
  avatar?: string;
  title?: string;
  url: string;
  country?: string;
  joined: number;
  last_online: number;
  status: string;
}

export interface ChessComPlayerStats {
  chess_bullet?: ChessComRatingStats;
  chess_blitz?: ChessComRatingStats;
  chess_rapid?: ChessComRatingStats;
  chess_daily?: ChessComRatingStats;
}

export interface ChessComRatingStats {
  last: { rating: number; date: number };
  best?: { rating: number; date: number };
  record: { win: number; loss: number; draw: number };
}

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  time_class: string;
  rated: boolean;
  end_time: number;
  accuracies?: { white: number; black: number };
  white: {
    username: string;
    rating: number;
    result: string;
    uuid?: string;
  };
  black: {
    username: string;
    rating: number;
    result: string;
    uuid?: string;
  };
}

export interface ParsedGame {
  id: string;
  chessComUrl: string;
  pgn: string;
  moves: ParsedMove[];
  playerColor: PlayerColor;
  playerUsername: string;
  opponentUsername: string;
  playerRating: number;
  opponentRating: number;
  timeControl: string;
  timeClass: TimeClass;
  result: GameResult;
  termination?: string;
  eco?: string;
  openingName?: string;
  openingVariation?: string;
  playedAt: Date;
  moveCount: number;
  accuracy?: number;
}

export interface ParsedMove {
  moveNumber: number;
  color: PlayerColor;
  san: string;
  uci: string;
  fen: string; // Position AFTER the move
  fenBefore: string; // Position BEFORE the move
  isCapture: boolean;
  isCheck: boolean;
  isCastle: boolean;
  isPromotion: boolean;
}

// ─── Analysis Types ─────────────────────────────────────────────

export interface EngineEvaluation {
  depth: number;
  score: number; // Centipawns from white's perspective
  mate: number | null;
  pv: string[]; // Principal variation (UCI moves)
  pvSan: string[]; // PV in SAN notation
  multipv: number;
  nodes?: number;
  nps?: number;
  time?: number;
}

export interface MoveAnalysis {
  moveNumber: number;
  color: PlayerColor;
  fen: string;
  fenBefore: string;
  sanMove: string;
  uciMove: string;

  // Evaluations
  evalBefore: number | null;
  evalAfter: number | null;
  evalDelta: number | null;
  mateBefore: number | null;
  mateAfter: number | null;

  // Best move
  bestMove: string | null;
  bestMoveSan: string | null;
  bestMoveEval: number | null;
  bestMoveMate: number | null;

  // Alternative lines
  pvLines: EngineEvaluation[];

  // Classification
  classification: MoveClassification;
  moveAccuracy: number;

  // Flags
  isCapture: boolean;
  isCheck: boolean;
  isCastle: boolean;
  isPromotion: boolean;
  isSacrifice: boolean;
}

export interface GameAnalysis {
  gameId: string;
  engineDepth: number;
  engineVersion: string;
  moves: MoveAnalysis[];

  // Aggregates
  averageCpl: number;
  accuracy: number;
  openingAccuracy: number | null;
  middlegameAccuracy: number | null;
  endgameAccuracy: number | null;

  // Classification counts
  classificationCounts: Record<MoveClassification, number>;

  status: AnalysisStatus;
  analyzedAt: Date | null;
}

// ─── AI Types ───────────────────────────────────────────────────

export interface AIExplanation {
  moveNumber: number | null;
  color: PlayerColor | null;
  level: ExplanationLevel;
  explanation: string;
  model: string;
}

export interface AIPerformanceReport {
  strengths: string[];
  weaknesses: string[];
  recurringErrors: string[];
  openingRecommendations: string[];
  endgameRecommendations: string[];
  tacticalRecommendations: string[];
  playingStyle: string;
  studyPlan: StudyPlanItem[];
  estimatedLevel: string;
  improvements: string[];
  gamesAnalyzed: number;
}

export interface StudyPlanItem {
  topic: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  suggestedResources?: string[];
}

// ─── Statistics Types ───────────────────────────────────────────

export interface PlayerStats {
  totalGames: number;
  analyzedGames: number;
  overallAccuracy: number | null;
  avgCpl: number | null;

  wins: number;
  losses: number;
  draws: number;

  whiteStats: ColorStats;
  blackStats: ColorStats;

  totalBrilliant: number;
  totalBlunders: number;
  totalMistakes: number;
  totalInaccuracies: number;

  openingStats: OpeningStats[];
  timeControlStats: TimeControlStats[];
  ratingHistory: RatingHistoryPoint[];
  monthlyAccuracy: MonthlyAccuracy[];
}

export interface ColorStats {
  wins: number;
  losses: number;
  draws: number;
  avgAccuracy: number | null;
}

export interface OpeningStats {
  eco: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgCpl: number;
  avgAccuracy: number;
}

export interface TimeControlStats {
  timeClass: TimeClass;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgAccuracy: number;
}

export interface RatingHistoryPoint {
  date: string;
  rating: number;
  timeClass: TimeClass;
}

export interface MonthlyAccuracy {
  month: string;
  accuracy: number;
  games: number;
}

// ─── Opening Types ──────────────────────────────────────────────

export enum OpeningCategoryKey {
  WHITE_PLAYER_OPENINGS = 'WHITE_PLAYER_OPENINGS',
  WHITE_OPPONENT_DEFENSES = 'WHITE_OPPONENT_DEFENSES',
  BLACK_PLAYER_DEFENSES = 'BLACK_PLAYER_DEFENSES',
  BLACK_OPPONENT_OPENINGS = 'BLACK_OPPONENT_OPENINGS',
}

export interface CategorizedOpeningStat {
  name: string;
  eco: string;
  games: number;
  percentageOfCategory: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  performanceRating: number;
  avgOpponentRating: number;
  avgCpl: number | null;
  avgAccuracy: number | null;
  avgMoveCount: number;
  lastPlayed: Date;
  gamesList: ParsedGame[];
}

export interface OpeningInfo {
  eco: string;
  name: string;
  variation?: string;
  moves: string;
  fen: string;
}

// ─── UI State Types ─────────────────────────────────────────────

export interface BoardState {
  fen: string;
  currentMoveIndex: number;
  isFlipped: boolean;
  showArrows: boolean;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  highlightedSquares: Map<Square, string>;
  arrows: BoardArrow[];
}

export interface BoardArrow {
  from: Square;
  to: Square;
  color: string;
}

export interface GameFilter {
  dateFrom?: string;
  dateTo?: string;
  opening?: string;
  result?: GameResult;
  opponent?: string;
  ratingMin?: number;
  ratingMax?: number;
  timeClass?: TimeClass;
  accuracyMin?: number;
  accuracyMax?: number;
  color?: PlayerColor;
  hasBlunders?: boolean;
}

// ─── Re-exports ─────────────────────────────────────────────────
export type { Square, PieceSymbol };
export type ChessColor = ChessJsColor;
