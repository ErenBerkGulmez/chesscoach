import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DB_NAME, closeDb } from "@/lib/storage/db";
import type { SkillKey } from "@/lib/coach/report";
import { GameResult, PlayerColor, TimeClass } from "@/types/chess";
import {
  PLAN_WEEKS,
  checkIn,
  checkInDue,
  completeSession,
  createPlan,
  deletePlan,
  loadPlan,
  planFinished,
  planFocus,
  planWeek,
  ratingBand,
  savePlan,
  sessionDoneToday,
  sessionSteps,
  weekProgress,
} from "./plan";
import { buildProfile, type GameSummary } from "./summary";

const DAY = 86_400_000;
const START = new Date(2026, 2, 2, 9).getTime(); // Monday 2 March 2026, 09:00

function game(id: string, playedAt: number, costs: Partial<Record<SkillKey, number>>): GameSummary {
  return {
    v: 2,
    gameId: id,
    username: "me",
    playedAt,
    analyzedAt: playedAt,
    playerColor: PlayerColor.WHITE,
    result: GameResult.LOSS,
    opponent: "them",
    playerMoves: 40,
    accuracy: 75,
    skills: Object.entries(costs).map(([skill, cost]) => ({ skill: skill as SkillKey, cost: cost!, count: 1, examples: [] })),
    conversion: null,
    playerRating: 1250,
    timeClass: TimeClass.RAPID,
    blunders: 1,
    mistakes: 1,
    lostTotal: 40,
    phaseAccuracy: { opening: null, middlegame: null, endgame: null },
    endgame: null,
    openingMoves: [],
  };
}

/** Games before the plan: tactics cost 20% a game, endgames 10%, king safety 4%. */
const history = [1, 2, 3, 4].map((i) => game(`old${i}`, START - i * DAY, { "own-tactics": 20, endgame: 10, "king-safety": 4 }));
const profile = buildProfile(history);
const plan = () => createPlan("Me", profile, 1250, START);
const none = { dueMistakes: 0, dueOpenings: 0, openConversions: 0 };

describe("creating a plan", () => {
  it("focuses on the two costliest skills, then the rest in order", () => {
    const p = plan();
    expect(p.username).toBe("me");
    expect(p.skills.slice(0, 3)).toEqual(["own-tactics", "endgame", "king-safety"]);
    expect(p.skills).toHaveLength(6);
    expect(new Set(p.skills).size).toBe(6);
    expect(planFocus(p)).toBe("own-tactics");
    expect(p.baseline["own-tactics"]).toBe(20);
    expect(p.baseline.plans).toBe(0);
  });

  it("sets the session length from the rating", () => {
    expect([ratingBand(800), ratingBand(1000), ratingBand(1599), ratingBand(1600)]).toEqual(["beginner", "club", "club", "advanced"]);
    expect(createPlan("me", profile, 800, START).minutes).toBe(20);
    expect(plan().minutes).toBe(25);
    expect(createPlan("me", profile, 1900, START).minutes).toBe(30);
  });

  it("falls back to blunder checks and tactics without a profile", () => {
    const p = createPlan("me", buildProfile([]), 1200, START);
    expect(p.skills.slice(0, 2)).toEqual(["blunder-check", "own-tactics"]);
  });

  it("starts week one on the day it is made and ends after four weeks", () => {
    const p = plan();
    expect(new Date(p.startsAt).getHours()).toBe(0);
    expect(planWeek(p, START)).toBe(1);
    expect(planWeek(p, START + 6 * DAY)).toBe(1);
    expect(planWeek(p, START + 7 * DAY)).toBe(2);
    expect(planWeek(p, START + 27 * DAY)).toBe(4);
    expect(planFinished(p, START + 27 * DAY)).toBe(false);
    expect(planFinished(p, START + 28 * DAY)).toBe(true);
  });
});

describe("the daily session", () => {
  it("has reviews, the focus drill and a third part that fit the time", () => {
    const steps = sessionSteps(plan(), { dueMistakes: 6, dueOpenings: 2, openConversions: 0 }, 0);
    expect(steps).toHaveLength(3);
    expect(steps.reduce((s, x) => s + x.minutes, 0)).toBe(25);
    expect(steps[0]).toMatchObject({ title: "Due reviews", target: { mode: "deck" } });
    expect(steps[0].detail).toBe("6 mistakes from your games to retry, then 2 opening positions.");
    expect(steps[1].target).toEqual({ mode: "puzzles", skill: "own-tactics" });
    expect(steps[2].target).toEqual({ mode: "puzzles", skill: "mixed" });
  });

  it("alternates mixed puzzles with a game to play and review", () => {
    expect(sessionSteps(plan(), none, 1)[2]).toMatchObject({ title: "Play one game and review it", target: { mode: "game" } });
    expect(sessionSteps(plan(), none, 2)[2].target).toEqual({ mode: "puzzles", skill: "mixed" });
  });

  it("drills the skill in focus with the matching trainer", () => {
    const p = plan();
    expect(sessionSteps({ ...p, focusIndex: 1 }, none, 0)[1].target).toEqual({ mode: "endgames" });
    const threats = createPlan("me", buildProfile([game("g", START - DAY, { "blunder-check": 30 })]), 1200, START);
    expect(sessionSteps(threats, none, 0)[1].target).toEqual({ mode: "threats" });
  });

  it("sends every third session to win it again while positions are waiting", () => {
    const waiting = { ...none, openConversions: 2 };
    expect(sessionSteps(plan(), waiting, 2)[1].target).toEqual({ mode: "convert" });
    expect(sessionSteps(plan(), waiting, 1)[1].target).toEqual({ mode: "puzzles", skill: "own-tactics" });
    expect(sessionSteps(plan(), none, 2)[1].target).toEqual({ mode: "puzzles", skill: "own-tactics" });
  });

  it("goes straight to the opening drill when only openings are due, and says so when nothing is", () => {
    expect(sessionSteps(plan(), { ...none, dueOpenings: 3 }, 0)[0]).toMatchObject({ title: "Opening drill", minutes: 5 });
    expect(sessionSteps(plan(), none, 0)[0].detail).toContain("Nothing is due today");
  });

  it("counts a day once", () => {
    let p = completeSession(plan(), START);
    p = completeSession(p, START + 3_600_000);
    expect(p.sessions).toEqual(["2026-03-02"]);
    expect(sessionDoneToday(p, START)).toBe(true);
    expect(sessionDoneToday(p, START + DAY)).toBe(false);
  });
});

/** A plan with sessions on the given day offsets from the start. */
function withSessions(days: number[]) {
  return days.reduce((p, d) => completeSession(p, START + d * DAY), plan());
}

describe("the weekly goal", () => {
  it("is met with four sessions out of five", () => {
    const p = withSessions([0, 1, 3, 4]);
    const weeks = weekProgress(p, START + 8 * DAY);
    expect(weeks).toHaveLength(PLAN_WEEKS);
    expect(weeks[0]).toEqual({ week: 1, sessions: 4, status: "met", repairable: false });
    expect(weeks[1]).toMatchObject({ week: 2, status: "current" });
    expect(weeks[2].status).toBe("upcoming");
  });

  it("lets a week that ended one short be repaired with an extra session the week after", () => {
    const short = withSessions([0, 1, 3]);
    const during = weekProgress(short, START + 8 * DAY);
    expect(during[0]).toEqual({ week: 1, sessions: 3, status: "missed", repairable: true });

    // Week two: its own four sessions, plus one more to repair week one.
    const repaired = withSessions([0, 1, 3, 7, 8, 9, 10, 11]);
    const after = weekProgress(repaired, START + 15 * DAY);
    expect(after[0].status).toBe("repaired");
    expect(after[1]).toMatchObject({ sessions: 5, status: "met" });
  });

  it("does not repair a week that was two or more short, or once the next week is over", () => {
    const farShort = withSessions([0, 1, 7, 8, 9, 10, 11]);
    expect(weekProgress(farShort, START + 15 * DAY)[0]).toMatchObject({ status: "missed", repairable: false });
    const tooLate = withSessions([0, 1, 3, 7, 8, 9, 10]);
    expect(weekProgress(tooLate, START + 15 * DAY)[0]).toMatchObject({ status: "missed", repairable: false });
  });

  it("has no streak: days off inside a week cost nothing", () => {
    expect(weekProgress(withSessions([0, 2, 4, 6]), START + 8 * DAY)[0].status).toBe("met");
  });
});

describe("the weekly check-in", () => {
  it("is due once a plan week has ended, and only once", () => {
    const p = plan();
    expect(checkInDue(p, START + 6 * DAY)).toBeNull();
    expect(checkInDue(p, START + 7 * DAY)).toBe(1);
    const done = checkIn(p, [], START + 7 * DAY);
    expect(done.checkIns).toHaveLength(1);
    expect(checkInDue(done, START + 8 * DAY)).toBeNull();
    expect(checkIn(done, [], START + 8 * DAY)).toBe(done);
    expect(checkInDue(done, START + 14 * DAY)).toBe(2);
    // After the plan, the last week can still be checked, and nothing beyond it.
    expect(checkInDue(p, START + 60 * DAY)).toBe(4);
  });

  it("moves to the next skill when the focus costs a quarter less on new games", () => {
    const fresh = [1, 2, 3].map((i) => game(`new${i}`, START + i * DAY, { "own-tactics": 15, endgame: 12 }));
    const after = checkIn(plan(), [...history, ...fresh], START + 7 * DAY);
    const record = after.checkIns[0];
    expect(record).toMatchObject({ week: 1, skill: "own-tactics", games: 3, before: 20, after: 15, moved: true });
    expect(record.note).toContain("down from 20%");
    expect(planFocus(after)).toBe("endgame");
    // The new focus is measured from where it stands now.
    expect(after.baseline.endgame).toBe(12);
    expect(after.focusSince).toBe(START + 7 * DAY);
  });

  it("stays on the skill when the drop is smaller than a quarter", () => {
    const fresh = [1, 2, 3].map((i) => game(`new${i}`, START + i * DAY, { "own-tactics": 16 }));
    const after = checkIn(plan(), [...history, ...fresh], START + 7 * DAY);
    expect(after.checkIns[0]).toMatchObject({ after: 16, moved: false });
    expect(after.checkIns[0].note).toContain("The focus stays where it is.");
    expect(planFocus(after)).toBe("own-tactics");
  });

  it("does not judge by fewer than three new games", () => {
    const fresh = [game("new1", START + DAY, { "own-tactics": 0 })];
    const after = checkIn(plan(), [...history, ...fresh], START + 7 * DAY);
    expect(after.checkIns[0]).toMatchObject({ games: 1, after: null, moved: false });
    expect(after.checkIns[0].note).toContain("too few to judge by");
  });

  it("gives the second skill its turn after two weeks either way", () => {
    const week1 = [1, 2, 3].map((i) => game(`a${i}`, START + i * DAY, { "own-tactics": 19 }));
    const week2 = [8, 9, 10].map((i) => game(`b${i}`, START + i * DAY, { "own-tactics": 21, endgame: 9 }));
    const first = checkIn(plan(), [...history, ...week1], START + 7 * DAY);
    expect(first.checkIns[0].moved).toBe(false);
    const second = checkIn(first, [...history, ...week1, ...week2], START + 14 * DAY);
    // Only the games since the first check-in are measured.
    expect(second.checkIns[1]).toMatchObject({ week: 2, games: 3, after: 21, moved: true });
    expect(second.checkIns[1].note).toContain("so that it gets its two weeks");
    expect(planFocus(second)).toBe("endgame");
  });
});

describe("plan storage", () => {
  afterEach(async () => {
    await closeDb();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });

  it("keeps the plan between visits", async () => {
    expect(await loadPlan("me")).toBeNull();
    const p = completeSession(plan(), START);
    await savePlan(p);
    expect(await loadPlan("ME")).toEqual(p);
    await deletePlan("me");
    expect(await loadPlan("me")).toBeNull();
  });
});
