/**
 * The four-week training plan.
 *
 * It is built from the two skills the weakness profile ranks highest and the
 * player's rating. Each session has three parts: due reviews, a drill for
 * the skill in focus, then mixed puzzles or a game with its review. Once a
 * week a check-in looks at the games played since the last one and moves the
 * focus on when the skill's cost has dropped by a quarter.
 *
 * The goal is four sessions a week out of five. A week that ends one short
 * can be repaired with an extra session the week after. There is no daily
 * streak: missing a day costs nothing.
 */
import { SKILLS, type SkillKey } from '@/lib/coach/report';
import { STORES, dbDelete, dbGet, dbPut } from '@/lib/storage/db';
import { dateKey } from './progress';
import { buildProfile, type GameSummary, type WeaknessProfile } from './summary';

export const PLAN_VERSION = 1;
export const PLAN_WEEKS = 4;
/** Sessions planned per week, and how many of them meet the goal. */
export const SESSIONS_PER_WEEK = 5;
export const WEEKLY_GOAL = 4;
/** The focus moves on when the skill costs this share less than at the last check-in. */
export const IMPROVED_BY = 0.25;
/** A check-in needs at least this many new games to judge by. */
export const MIN_GAMES_FOR_CHECKIN = 3;
/** The focus also moves on after this many weeks on one skill, so the second skill gets its turn. */
export const MAX_WEEKS_ON_SKILL = 2;

const DAY = 24 * 60 * 60 * 1000;

export type RatingBand = 'beginner' | 'club' | 'advanced';

export interface CheckIn {
  /** The plan week that had just ended (1-based). */
  week: number;
  at: number;
  skill: SkillKey;
  /** Games played since the previous check-in. */
  games: number;
  /** Winning chances the skill cost per game, before and now. Null without enough games. */
  before: number;
  after: number | null;
  /** Whether the focus moved to the next skill. */
  moved: boolean;
  note: string;
}

export interface TrainingPlan {
  v: number;
  username: string;
  createdAt: number;
  /** Midnight (local) of the day the plan started. Week 1 runs for seven days from here. */
  startsAt: number;
  rating: number;
  band: RatingBand;
  /** Minutes a session should take. */
  minutes: number;
  /** Skills in the order they are worked on. The first two are the plan's focus. */
  skills: SkillKey[];
  focusIndex: number;
  /** When the current focus started. */
  focusSince: number;
  /** Cost per game of each skill when the plan was made or the focus last moved. */
  baseline: Record<SkillKey, number>;
  /** Days with a completed session, as local dates ("2026-03-04"). */
  sessions: string[];
  checkIns: CheckIn[];
}

export function ratingBand(rating: number): RatingBand {
  if (rating < 1000) return 'beginner';
  if (rating < 1600) return 'club';
  return 'advanced';
}

const MINUTES: Record<RatingBand, number> = { beginner: 20, club: 25, advanced: 30 };

/** Used when there is no profile yet: the two skills that decide most games below master level. */
const DEFAULT_FOCUS: SkillKey[] = ['blunder-check', 'own-tactics'];

function startOfDay(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Add days on the calendar, so a daylight saving change does not shift the boundary. */
function addDays(time: number, days: number): number {
  const d = new Date(time);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function createPlan(username: string, profile: WeaknessProfile, rating: number, now = Date.now()): TrainingPlan {
  const ranked = profile.skills.filter((s) => s.lostPerGame > 0).map((s) => s.skill);
  const focus = [...ranked.slice(0, 2)];
  for (const skill of DEFAULT_FOCUS) if (focus.length < 2 && !focus.includes(skill)) focus.push(skill);
  const rest = (Object.keys(SKILLS) as SkillKey[]).filter((s) => !focus.includes(s));
  // After the two focus skills, the others follow in the order the profile ranks them.
  rest.sort((a, b) => {
    const ia = ranked.indexOf(a);
    const ib = ranked.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const band = ratingBand(rating);
  const baseline = Object.fromEntries(
    (Object.keys(SKILLS) as SkillKey[]).map((s) => [s, profile.skills.find((p) => p.skill === s)?.lostPerGame ?? 0])
  ) as Record<SkillKey, number>;

  return {
    v: PLAN_VERSION,
    username: username.toLowerCase(),
    createdAt: now,
    startsAt: startOfDay(now),
    rating,
    band,
    minutes: MINUTES[band],
    skills: [...focus, ...rest],
    focusIndex: 0,
    focusSince: now,
    baseline,
    sessions: [],
    checkIns: [],
  };
}

/** The plan week `now` falls in, 1-based. Past week four the plan is over and this keeps counting. */
export function planWeek(plan: TrainingPlan, now = Date.now()): number {
  for (let week = 1; ; week++) {
    if (now < addDays(plan.startsAt, week * 7)) return week;
    if (week > 520) return week;
  }
}

export const planFinished = (plan: TrainingPlan, now = Date.now()) => planWeek(plan, now) > PLAN_WEEKS;

export const planFocus = (plan: TrainingPlan): SkillKey => plan.skills[Math.min(plan.focusIndex, plan.skills.length - 1)];

// ─── Sessions ───────────────────────────────────────────────────

/** Where a step of the session is done on the Train page. */
export type StepTarget =
  | { mode: 'deck' | 'openings' | 'threats' | 'endgames' | 'convert' }
  | { mode: 'puzzles'; skill: SkillKey | 'mixed' }
  | { mode: 'game' };

export interface SessionStep {
  title: string;
  detail: string;
  minutes: number;
  target: StepTarget;
}

export interface SessionContext {
  dueMistakes: number;
  dueOpenings: number;
  /** Winning positions from the player's games that are still to be won again. */
  openConversions: number;
}

/** The trainer that drills each skill. */
const DRILL: Record<SkillKey, { title: string; detail: string; target: StepTarget }> = {
  'blunder-check': {
    title: 'Threat spotter',
    detail: 'Find everything that is in danger before you move. This is the blunder check, practised on its own.',
    target: { mode: 'threats' },
  },
  'opponent-threats': {
    title: 'Threat spotter',
    detail: "See your opponent's forks and checks coming before they land.",
    target: { mode: 'threats' },
  },
  'own-tactics': {
    title: 'Puzzles: mates and combinations',
    detail: 'Look at every check and capture before any quiet move.',
    target: { mode: 'puzzles', skill: 'own-tactics' },
  },
  'king-safety': {
    title: 'Puzzles: attacks on the king',
    detail: 'Seeing how attacks on the king work is how you learn what not to allow.',
    target: { mode: 'puzzles', skill: 'king-safety' },
  },
  endgame: {
    title: 'Endgame trainer',
    detail: 'Play the textbook positions and your own endgames until no move changes the result.',
    target: { mode: 'endgames' },
  },
  plans: {
    title: 'Puzzles: quiet and defensive moves',
    detail: 'Positions where the best move is not a capture or a check.',
    target: { mode: 'puzzles', skill: 'plans' },
  },
};

/**
 * Today's session: due reviews, the focus drill, then mixed puzzles or a game.
 * `sessionNumber` is how many sessions the plan has had before this one.
 */
export function sessionSteps(plan: TrainingPlan, context: SessionContext, sessionNumber = plan.sessions.length): SessionStep[] {
  const total = plan.minutes;
  const reviewMinutes = Math.round(total * 0.3);
  const drillMinutes = Math.round(total * 0.4);
  const lastMinutes = total - reviewMinutes - drillMinutes;

  const steps: SessionStep[] = [];
  const due = context.dueMistakes + context.dueOpenings;
  steps.push(
    context.dueMistakes === 0 && context.dueOpenings > 0
      ? {
          title: 'Opening drill',
          detail: `${context.dueOpenings} opening ${context.dueOpenings === 1 ? 'position is' : 'positions are'} due.`,
          minutes: Math.min(5, reviewMinutes),
          target: { mode: 'openings' },
        }
      : {
          title: 'Due reviews',
          detail:
            due === 0
              ? 'Nothing is due today. Skip this step, or look through the deck anyway.'
              : `${context.dueMistakes} ${context.dueMistakes === 1 ? 'mistake' : 'mistakes'} from your games to retry` +
                (context.dueOpenings ? `, then ${context.dueOpenings} opening ${context.dueOpenings === 1 ? 'position' : 'positions'}.` : '.'),
          minutes: reviewMinutes,
          target: { mode: 'deck' },
        }
  );

  // Every third session, winning a lost win again takes the drill's place while there are any.
  const skill = planFocus(plan);
  if (context.openConversions > 0 && sessionNumber % 3 === 2) {
    steps.push({
      title: 'Win it again',
      detail: 'A winning position from one of your games that got away. Play it out against the engine.',
      minutes: drillMinutes,
      target: { mode: 'convert' },
    });
  } else {
    steps.push({ ...DRILL[skill], minutes: drillMinutes });
  }

  steps.push(
    sessionNumber % 2 === 0
      ? {
          title: 'Mixed puzzles',
          detail: 'Any theme, at your level. This keeps the other skills warm.',
          minutes: lastMinutes,
          target: { mode: 'puzzles', skill: 'mixed' },
        }
      : {
          title: 'Play one game and review it',
          detail: `Play a game, then open its review. Watch for the focus of this plan: ${SKILLS[skill].title.toLowerCase()}.`,
          minutes: lastMinutes,
          target: { mode: 'game' },
        }
  );
  return steps;
}

/** Record that today's session was done. A day counts once. */
export function completeSession(plan: TrainingPlan, now = Date.now()): TrainingPlan {
  const today = dateKey(now);
  if (plan.sessions.includes(today)) return plan;
  return { ...plan, sessions: [...plan.sessions, today].sort() };
}

export const sessionDoneToday = (plan: TrainingPlan, now = Date.now()) => plan.sessions.includes(dateKey(now));

export type WeekStatus = 'met' | 'repaired' | 'missed' | 'current' | 'upcoming';

export interface WeekProgress {
  week: number;
  sessions: number;
  status: WeekStatus;
  /** True while a week that ended one short can still be repaired this week. */
  repairable: boolean;
}

/**
 * Sessions per plan week against the goal of four. A week that ended with
 * three is repaired when the following week has a session beyond its own four.
 */
export function weekProgress(plan: TrainingPlan, now = Date.now()): WeekProgress[] {
  const current = planWeek(plan, now);
  const counts = Array.from({ length: PLAN_WEEKS }, (_, i) => {
    const from = dateKey(addDays(plan.startsAt, i * 7));
    const to = dateKey(addDays(plan.startsAt, (i + 1) * 7));
    return plan.sessions.filter((d) => d >= from && d < to).length;
  });

  return counts.map((sessions, i) => {
    const week = i + 1;
    if (week > current) return { week, sessions, status: 'upcoming', repairable: false };
    if (week === current) return { week, sessions, status: 'current', repairable: false };
    if (sessions >= WEEKLY_GOAL) return { week, sessions, status: 'met', repairable: false };
    const oneShort = sessions === WEEKLY_GOAL - 1;
    const next = counts[i + 1];
    const repaired = oneShort && next !== undefined && next > WEEKLY_GOAL;
    if (repaired) return { week, sessions, status: 'repaired', repairable: false };
    // Only the week just ended can still be repaired, and only during the week after it.
    return { week, sessions, status: 'missed', repairable: oneShort && week === current - 1 && week < PLAN_WEEKS };
  });
}

// ─── Weekly check-in ────────────────────────────────────────────

/** The plan week whose check-in is waiting, or null. A week is checked once it has ended. */
export function checkInDue(plan: TrainingPlan, now = Date.now()): number | null {
  const ended = Math.min(planWeek(plan, now) - 1, PLAN_WEEKS);
  if (ended < 1) return null;
  const done = plan.checkIns.reduce((max, c) => Math.max(max, c.week), 0);
  return done < ended ? ended : null;
}

/**
 * The weekly check-in: measure the focus skill on the games played since the
 * last check-in, and move to the next skill if it now costs a quarter less,
 * or if it has had two weeks.
 */
export function checkIn(plan: TrainingPlan, summaries: GameSummary[], now = Date.now()): TrainingPlan {
  const week = checkInDue(plan, now);
  if (week === null) return plan;

  const since = plan.checkIns.length ? plan.checkIns[plan.checkIns.length - 1].at : plan.createdAt;
  const recent = summaries.filter((s) => s.playedAt >= since);
  const skill = planFocus(plan);
  const before = plan.baseline[skill] ?? 0;
  const enough = recent.length >= MIN_GAMES_FOR_CHECKIN;
  const profile = buildProfile(recent);
  const after = enough ? profile.skills.find((s) => s.skill === skill)?.lostPerGame ?? 0 : null;

  const improved = after !== null && (before === 0 ? after === 0 : after <= before * (1 - IMPROVED_BY));
  const weeksOnSkill = Math.floor((now - plan.focusSince) / (7 * DAY) + 0.5);
  const timeUp = weeksOnSkill >= MAX_WEEKS_ON_SKILL;
  const hasNext = plan.focusIndex < plan.skills.length - 1;
  const moved = hasNext && (improved || timeUp);
  const title = SKILLS[skill].title;

  let note: string;
  if (after === null) {
    note = `Only ${recent.length} analyzed ${recent.length === 1 ? 'game' : 'games'} since the last check-in, which is too few to judge by.`;
  } else if (improved) {
    note = `"${title}" cost ${after}% per game over ${recent.length} games, down from ${before}%. That is the improvement the plan was after.`;
  } else {
    note = `"${title}" cost ${after}% per game over ${recent.length} games, against ${before}% before.`;
  }
  if (moved) {
    note += ` The focus moves to "${SKILLS[plan.skills[plan.focusIndex + 1]].title}"${improved ? '' : ', so that it gets its two weeks'}.`;
  } else {
    note += ' The focus stays where it is.';
  }

  const baseline = { ...plan.baseline };
  if (moved) {
    // The next skill is measured from where it stands now.
    const nextSkill = plan.skills[plan.focusIndex + 1];
    const current = enough ? profile.skills.find((s) => s.skill === nextSkill)?.lostPerGame : undefined;
    if (current !== undefined) baseline[nextSkill] = current;
  }

  return {
    ...plan,
    focusIndex: moved ? plan.focusIndex + 1 : plan.focusIndex,
    focusSince: moved ? now : plan.focusSince,
    baseline,
    checkIns: [...plan.checkIns, { week, at: now, skill, games: recent.length, before, after, moved, note }],
  };
}

// ─── Storage ────────────────────────────────────────────────────

const planKey = (username: string) => username.toLowerCase();

export async function loadPlan(username: string): Promise<TrainingPlan | null> {
  const plan = await dbGet<TrainingPlan>(STORES.plan, planKey(username));
  return plan && plan.v === PLAN_VERSION ? plan : null;
}

export function savePlan(plan: TrainingPlan): Promise<boolean> {
  return dbPut(STORES.plan, planKey(plan.username), plan);
}

export function deletePlan(username: string): Promise<boolean> {
  return dbDelete(STORES.plan, planKey(username));
}
