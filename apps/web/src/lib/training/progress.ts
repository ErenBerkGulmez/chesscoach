/**
 * Progress over time: how the player's games and practice are trending,
 * week by week, and a card comparing this week with the last one.
 */
import { STORES, dbCollect, dbGet, dbPut } from '@/lib/storage/db';
import type { GameSummary } from './summary';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

// ─── Practice log ───────────────────────────────────────────────

export type PracticeKind = 'deck' | 'opening' | 'puzzle' | 'threat' | 'endgame' | 'visualize';

/** What was practised on one day. */
export interface PracticeDay {
  username: string;
  /** Local date, "2026-03-01". */
  date: string;
  counts: Partial<Record<PracticeKind, { seen: number; correct: number }>>;
  /** Seconds spent on the opening drill, for its daily limit. */
  openingSeconds?: number;
}

export function dateKey(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const logKey = (username: string, date: string) => `log:${username.toLowerCase()}:${date}`;

export async function loadPracticeDay(username: string, now = Date.now()): Promise<PracticeDay> {
  const date = dateKey(now);
  const stored = await dbGet<PracticeDay>(STORES.puzzleStats, logKey(username, date));
  return stored ?? { username: username.toLowerCase(), date, counts: {} };
}

/** Add one answer to today's log. */
export function addPractice(day: PracticeDay, kind: PracticeKind, correct: boolean, openingSeconds = 0): PracticeDay {
  const current = day.counts[kind] ?? { seen: 0, correct: 0 };
  return {
    ...day,
    counts: { ...day.counts, [kind]: { seen: current.seen + 1, correct: current.correct + (correct ? 1 : 0) } },
    openingSeconds: (day.openingSeconds ?? 0) + openingSeconds,
  };
}

/** Record one answer for today and save it. Returns the updated day. */
export async function logPractice(
  username: string,
  kind: PracticeKind,
  correct: boolean,
  openingSeconds = 0,
  now = Date.now()
): Promise<PracticeDay> {
  const updated = addPractice(await loadPracticeDay(username, now), kind, correct, openingSeconds);
  await dbPut(STORES.puzzleStats, logKey(username, updated.date), updated);
  return updated;
}

export function loadPracticeLog(username: string): Promise<PracticeDay[]> {
  const prefix = `log:${username.toLowerCase()}:`;
  return dbCollect<PracticeDay, PracticeDay>(STORES.puzzleStats, (value, key) => (key.startsWith(prefix) ? value : undefined));
}

// ─── Game trends ────────────────────────────────────────────────

export interface WeekPoint {
  /** Start of the week (Monday, local time). */
  start: number;
  /** "3 Mar" */
  label: string;
  games: number;
  /** Blunders per 100 of the player's moves. Null without games. */
  blundersPer100: number | null;
  /** Winning chances given up per move, in percentage points. Null without games. */
  lostPerMove: number | null;
  /** Average rating in the player's most-played time control that week. Null without games. */
  rating: number | null;
}

/** Monday 00:00 local time of the week `time` falls in. */
export function weekStart(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekLabel = (start: number) => {
  const d = new Date(start);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function rates(games: GameSummary[]) {
  const moves = games.reduce((s, g) => s + g.playerMoves, 0);
  if (moves === 0) return { blundersPer100: null, lostPerMove: null };
  return {
    blundersPer100: round1((games.reduce((s, g) => s + (g.blunders ?? 0), 0) / moves) * 100),
    lostPerMove: round2(games.reduce((s, g) => s + (g.lostTotal ?? 0), 0) / moves),
  };
}

/** The time control with the most analyzed games. */
export function mainTimeClass(summaries: GameSummary[]): string | null {
  const counts = new Map<string, number>();
  for (const s of summaries) if (s.timeClass) counts.set(s.timeClass, (counts.get(s.timeClass) ?? 0) + 1);
  let best: string | null = null;
  for (const [k, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = k;
  return best;
}

/** One point per week for the last `weeks` weeks that end at `now`, oldest first. Weeks without games stay in, empty. */
export function weeklyTrend(summaries: GameSummary[], now = Date.now(), weeks = 12): WeekPoint[] {
  const main = mainTimeClass(summaries);
  const thisWeek = weekStart(now);
  const points: WeekPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    // Step back by calendar days so daylight saving changes do not shift the week.
    const start = weekStart(thisWeek - i * WEEK + DAY);
    const end = weekStart(start + WEEK + DAY);
    const games = summaries.filter((s) => s.playedAt >= start && s.playedAt < end);
    const rated = games.filter((g) => g.timeClass === main && g.playerRating);
    points.push({
      start,
      label: weekLabel(start),
      games: games.length,
      ...rates(games),
      rating: rated.length ? Math.round(rated.reduce((s, g) => s + g.playerRating, 0) / rated.length) : null,
    });
  }
  return points;
}

export interface PhaseAccuracy {
  phase: 'Opening' | 'Middlegame' | 'Endgame';
  accuracy: number | null;
  games: number;
}

/** Average accuracy per phase over the given games. */
export function phaseAccuracy(summaries: GameSummary[]): PhaseAccuracy[] {
  const phases = [
    ['Opening', 'opening'],
    ['Middlegame', 'middlegame'],
    ['Endgame', 'endgame'],
  ] as const;
  return phases.map(([phase, key]) => {
    const values = summaries.map((s) => s.phaseAccuracy?.[key]).filter((v): v is number => typeof v === 'number');
    return {
      phase,
      accuracy: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null,
      games: values.length,
    };
  });
}

// ─── Practice totals and the weekly card ────────────────────────

export interface PracticeTotals {
  seen: number;
  correct: number;
  /** Share correct, 0-100. Null before the first answer. */
  accuracy: number | null;
}

export function practiceTotals(days: PracticeDay[], kinds: PracticeKind[]): PracticeTotals {
  let seen = 0;
  let correct = 0;
  for (const day of days) {
    for (const kind of kinds) {
      seen += day.counts[kind]?.seen ?? 0;
      correct += day.counts[kind]?.correct ?? 0;
    }
  }
  return { seen, correct, accuracy: seen ? Math.round((correct / seen) * 100) : null };
}

export interface WeekCard {
  games: number;
  blundersPer100: number | null;
  lostPerMove: number | null;
  /** Days this week with any practice. */
  practiceDays: number;
  deck: PracticeTotals;
  puzzles: PracticeTotals;
  /** Change from last week; negative is better for both. Null when either week has no games. */
  blunderChange: number | null;
  lostChange: number | null;
  /** One sentence summing the week up. */
  headline: string;
}

export function weekCard(summaries: GameSummary[], log: PracticeDay[], now = Date.now()): WeekCard {
  const start = weekStart(now);
  const previous = weekStart(start - DAY);
  const inWeek = (from: number, to: number) => summaries.filter((s) => s.playedAt >= from && s.playedAt < to);
  const thisGames = inWeek(start, start + 2 * WEEK);
  const lastGames = inWeek(previous, start);
  const mine = rates(thisGames);
  const before = rates(lastGames);

  const startKey = dateKey(start);
  const days = log.filter((d) => d.date >= startKey);
  const active = days.filter((d) => Object.values(d.counts).some((c) => c && c.seen > 0)).length;

  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : round2(a - b));
  const blunderChange = diff(mine.blundersPer100, before.blundersPer100);
  const lostChange = diff(mine.lostPerMove, before.lostPerMove);

  let headline: string;
  if (thisGames.length === 0 && active === 0) headline = 'Nothing yet this week. One short session is enough to start.';
  else if (blunderChange !== null && blunderChange < 0) headline = `Fewer blunders than last week: ${mine.blundersPer100} per 100 moves, down from ${before.blundersPer100}.`;
  else if (blunderChange !== null && blunderChange > 0) headline = `More blunders than last week: ${mine.blundersPer100} per 100 moves, up from ${before.blundersPer100}.`;
  else if (active > 0) headline = `You practised on ${active} ${active === 1 ? 'day' : 'days'} this week.`;
  else headline = `${thisGames.length} analyzed ${thisGames.length === 1 ? 'game' : 'games'} this week.`;

  return {
    games: thisGames.length,
    ...mine,
    practiceDays: active,
    deck: practiceTotals(days, ['deck', 'opening']),
    puzzles: practiceTotals(days, ['puzzle']),
    blunderChange,
    lostChange,
    headline,
  };
}
