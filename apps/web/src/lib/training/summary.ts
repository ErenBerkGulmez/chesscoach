/**
 * Per-game coaching summaries and the weakness profile built from them.
 *
 * A summary is the small part of a game's report that is worth keeping for
 * every analyzed game: what each skill cost, and whether a win slipped away.
 */
import { baseTimeMs } from '@/lib/chess/clock';
import { SKILLS, buildGameReport, type Conversion, type GameReport, type SkillCost, type SkillKey } from '@/lib/coach/report';
import type { GameAnalysis, GameResult, ParsedGame, PlayerColor } from '@/types/chess';

export const SUMMARY_VERSION = 1;

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
}

export function reportForGame(game: ParsedGame, analysis: GameAnalysis): GameReport {
  return buildGameReport(analysis.moves, game.playerColor, {
    clocks: game.moves.map((m) => m.clockMs),
    baseMs: baseTimeMs(game.timeControl),
  });
}

export function summarizeGame(game: ParsedGame, analysis: GameAnalysis, report: GameReport, now = Date.now()): GameSummary {
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
