/**
 * Per-game coaching summaries and the weakness profile built from them.
 *
 * A summary is the small part of a game's report that is worth keeping for
 * every analyzed game: what each skill cost, and whether a win slipped away.
 */
import { baseTimeMs } from '@/lib/chess/clock';
import { positionKey } from '@/lib/chess/opening-book';
import { evalToWinPercent } from '@/lib/stockfish/engine';
import { SKILLS, buildGameReport, type Conversion, type GameReport, type SkillCost, type SkillKey } from '@/lib/coach/report';
import type { GameAnalysis, GameResult, MoveAnalysis, ParsedGame, TimeClass } from '@/types/chess';
import { MoveClassification, PlayerColor } from '@/types/chess';

export const SUMMARY_VERSION = 2;

/** Positions with this many pieces or fewer are covered by the endgame tablebase. */
export const TABLEBASE_PIECES = 7;
/** The player's moves up to this half-move are kept for the opening drill. */
export const OPENING_PLIES = 30;

/** One of the player's own opening moves, with what the engine preferred. */
export interface OpeningMove {
  /** The position before the move (see `positionKey`). */
  key: string;
  fen: string;
  /** Half-moves played before this one. */
  ply: number;
  played: string;
  best: string;
  /** Evaluation given up by the move, in centipawns. */
  loss: number;
  /** The engine's line, SAN. */
  line: string[];
}

export interface GameSummary {
  v: number;
  gameId: string;
  /** Lower-case Chess.com username the game belongs to. */
  username: string;
  playedAt: number;
  analyzedAt: number;
  playerColor: PlayerColor;
  result: GameResult;
  opponent: string;
  /** Moves the player made. */
  playerMoves: number;
  accuracy: number;
  skills: SkillCost[];
  conversion: Conversion | null;
  /** When the player last passed "win it again" for this game. */
  convertedAt?: number;
  playerRating: number;
  timeClass: TimeClass;
  blunders: number;
  mistakes: number;
  /** Winning chances given up over the whole game, summed over the player's moves (0-100 each). */
  lostTotal: number;
  phaseAccuracy: { opening: number | null; middlegame: number | null; endgame: number | null };
  /** The first position of the game with few enough pieces for the tablebase, with the player to move. */
  endgame: { fen: string; index: number } | null;
  openingMoves: OpeningMove[];
}

function winFor(a: MoveAnalysis, white: number | null, mate: number | null): number {
  const isWhite = a.color === PlayerColor.WHITE;
  return evalToWinPercent(white === null ? 0 : isWhite ? white : -white, mate === null ? null : isWhite ? mate : -mate);
}

function pieceCount(fen: string): number {
  return (fen.split(' ')[0].match(/[a-zA-Z]/g) ?? []).length;
}

export function reportForGame(game: ParsedGame, analysis: GameAnalysis): GameReport {
  return buildGameReport(analysis.moves, game.playerColor, {
    clocks: game.moves.map((m) => m.clockMs),
    baseMs: baseTimeMs(game.timeControl),
  });
}

export function summarizeGame(game: ParsedGame, analysis: GameAnalysis, report: GameReport, now = Date.now()): GameSummary {
  const mine = analysis.moves.map((a, index) => ({ a, index })).filter(({ a }) => a.color === game.playerColor);

  const endgameAt = mine.find(({ a }) => {
    const pieces = pieceCount(a.fenBefore);
    return pieces >= 3 && pieces <= TABLEBASE_PIECES;
  });

  const openingMoves: OpeningMove[] = mine
    .filter(({ a, index }) => index < OPENING_PLIES && a.bestMoveSan)
    .map(({ a, index }) => ({
      key: positionKey(a.fenBefore),
      fen: a.fenBefore,
      ply: index,
      played: a.sanMove,
      best: a.bestMoveSan!,
      loss: Math.max(0, Math.round(-(a.evalDelta ?? 0))),
      line: (a.pvLines[0]?.pvSan ?? [a.bestMoveSan!]).slice(0, 6),
    }));

  return {
    v: SUMMARY_VERSION,
    gameId: game.id,
    username: game.playerUsername.toLowerCase(),
    playedAt: game.playedAt.getTime(),
    analyzedAt: now,
    playerColor: game.playerColor,
    result: game.result,
    opponent: game.opponentUsername,
    playerMoves: analysis.moves.filter((m) => m.color === game.playerColor).length,
    accuracy: analysis.accuracy,
    // Keep the three costliest examples per skill; the profile shows no more than that.
    skills: report.skills.map((s) => ({ ...s, examples: s.examples.slice(0, 3) })),
    conversion: report.conversion,
    playerRating: game.playerRating,
    timeClass: game.timeClass,
    blunders: mine.filter(
      ({ a }) => a.classification === MoveClassification.BLUNDER || a.classification === MoveClassification.MISSED_MATE
    ).length,
    mistakes: mine.filter(
      ({ a }) => a.classification === MoveClassification.MISTAKE || a.classification === MoveClassification.MISSED_WIN
    ).length,
    lostTotal:
      Math.round(
        mine.reduce(
          (sum, { a }) => sum + Math.max(0, winFor(a, a.evalBefore, a.mateBefore) - winFor(a, a.evalAfter, a.mateAfter)),
          0
        ) * 10
      ) / 10,
    phaseAccuracy: {
      opening: analysis.openingAccuracy,
      middlegame: analysis.middlegameAccuracy,
      endgame: analysis.endgameAccuracy,
    },
    endgame: endgameAt ? { fen: endgameAt.a.fenBefore, index: endgameAt.index } : null,
    openingMoves,
  };
}

export interface ProfileExample {
  gameId: string;
  opponent: string;
  index: number;
  label: string;
  headline: string;
  winDrop: number;
}

export interface ProfileSkill {
  skill: SkillKey;
  title: string;
  drill: string;
  /** Winning chances lost to this skill per game, in percentage points. */
  lostPerGame: number;
  /** Number of mistakes across all games. */
  count: number;
  /** Games with at least one such mistake. */
  games: number;
  examples: ProfileExample[];
}

export interface WeaknessProfile {
  games: number;
  /** All six skills, the costliest first. */
  skills: ProfileSkill[];
}

/** Rank the six skills by how much winning chance each one costs per game. */
export function buildProfile(summaries: GameSummary[]): WeaknessProfile {
  const games = summaries.length;
  const skills = (Object.keys(SKILLS) as SkillKey[]).map((skill): ProfileSkill => {
    let cost = 0;
    let count = 0;
    let affected = 0;
    const examples: ProfileExample[] = [];
    for (const s of summaries) {
      const entry = s.skills.find((k) => k.skill === skill);
      if (!entry) continue;
      cost += entry.cost;
      count += entry.count;
      affected++;
      for (const e of entry.examples) examples.push({ ...e, gameId: s.gameId, opponent: s.opponent });
    }
    return {
      skill,
      title: SKILLS[skill].title,
      drill: SKILLS[skill].drill,
      lostPerGame: games ? Math.round((cost / games) * 10) / 10 : 0,
      count,
      games: affected,
      examples: examples.sort((a, b) => b.winDrop - a.winDrop).slice(0, 3),
    };
  });
  skills.sort((a, b) => b.lostPerGame - a.lostPerGame || b.count - a.count);
  return { games, skills };
}

/** Games where a winning position slipped and has not been won again yet, newest first. */
export function openConversions(summaries: GameSummary[]): GameSummary[] {
  return summaries
    .filter((s) => s.conversion && !s.convertedAt)
    .sort((a, b) => b.playedAt - a.playedAt);
}
