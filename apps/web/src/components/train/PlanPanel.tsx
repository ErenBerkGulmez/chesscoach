"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SKILLS } from "@/lib/coach/report";
import {
  PLAN_WEEKS,
  SESSIONS_PER_WEEK,
  WEEKLY_GOAL,
  checkIn,
  checkInDue,
  completeSession,
  createPlan,
  deletePlan,
  loadPlan,
  planFinished,
  planFocus,
  planWeek,
  savePlan,
  sessionDoneToday,
  sessionSteps,
  weekProgress,
  type SessionContext,
  type StepTarget,
  type TrainingPlan,
  type WeekStatus,
} from "@/lib/training/plan";
import { buildProfile, type GameSummary } from "@/lib/training/summary";

const STATUS_TEXT: Record<WeekStatus, string> = {
  met: "Goal met",
  repaired: "Repaired",
  missed: "Missed",
  current: "This week",
  upcoming: "",
};

/** Start a plan, stamped with the current time. */
function startPlan(username: string, summaries: GameSummary[], rating: number): TrainingPlan {
  const plan = createPlan(username, buildProfile(summaries), rating, Date.now());
  void savePlan(plan);
  return plan;
}

/** Apply a change that depends on the current time, and save it. */
function update(plan: TrainingPlan, change: (plan: TrainingPlan, now: number) => TrainingPlan): TrainingPlan {
  const next = change(plan, Date.now());
  if (next !== plan) void savePlan(next);
  return next;
}

/**
 * The four-week plan: what to do today, how the week is going, and the weekly
 * check-in that decides whether the focus moves on.
 */
export default function PlanPanel({
  username,
  summaries,
  context,
  now,
  onGo,
}: {
  username: string;
  summaries: GameSummary[];
  context: SessionContext;
  /** The time the page was opened. */
  now: number;
  /** Open a trainer for a step of the session. */
  onGo: (target: StepTarget) => void;
}) {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPlan(username).then((stored) => {
      if (cancelled) return;
      setPlan(stored);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const rating = useMemo(() => {
    const rated = summaries.filter((s) => s.playerRating);
    return rated.length ? Math.round(rated.reduce((s, g) => s + g.playerRating, 0) / rated.length) : 1200;
  }, [summaries]);

  if (!loaded) return <p className="text-sm text-text-muted py-10 text-center">Loading your plan...</p>;

  if (!plan) {
    const profile = buildProfile(summaries);
    const top = profile.skills.filter((s) => s.lostPerGame > 0).slice(0, 2);
    return (
      <div className="glass-card p-5 sm:p-6 space-y-3 max-w-2xl">
        <h2 className="text-lg font-bold text-text-primary">A four-week plan</h2>
        <p className="text-sm text-text-secondary">
          Four weeks of short sessions built around what costs you most. Each session has three parts: your due
          reviews, a drill for the skill in focus, then mixed puzzles or a game with its review. The goal is four
          sessions a week. There is no daily streak to keep.
        </p>
        {top.length > 0 ? (
          <p className="text-sm text-text-secondary">
            From your {profile.games} analyzed games, the plan would focus on{" "}
            <strong className="text-text-primary">{top.map((s) => s.title.toLowerCase()).join(" and ")}</strong>.
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            You have no analyzed games yet, so the plan would start with blunder checks and tactics. For a plan built on
            your own games, run the weakness profile on the{" "}
            <Link href={`/dashboard/${username}`} className="text-accent hover:underline">
              Statistics tab
            </Link>{" "}
            first.
          </p>
        )}
        <button
          type="button"
          onClick={() => setPlan(startPlan(username, summaries, rating))}
          className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
        >
          Start the plan
        </button>
      </div>
    );
  }

  const week = planWeek(plan, now);
  const finished = planFinished(plan, now);
  const focus = planFocus(plan);
  const weeks = weekProgress(plan, now);
  const due = checkInDue(plan, now);
  const doneToday = sessionDoneToday(plan, now);
  const steps = sessionSteps(plan, context, doneToday ? plan.sessions.length - 1 : plan.sessions.length);
  const lastCheckIn = plan.checkIns[plan.checkIns.length - 1];
  const repair = weeks.find((w) => w.repairable);

  const restart = () => {
    void deletePlan(username);
    setPlan(null);
  };

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="space-y-4">
        <section className="glass-card p-4 sm:p-5 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-text-muted">
              {finished ? "Plan complete" : `Week ${week} of ${PLAN_WEEKS}`}
            </h2>
            <span className="text-xs text-text-muted">{plan.minutes} minutes a session</span>
          </div>
          <p className="text-lg font-bold text-text-primary">Focus: {SKILLS[focus].title}</p>
          <p className="text-sm text-text-secondary">{SKILLS[focus].drill}</p>
          {plan.skills[plan.focusIndex + 1] && !finished && (
            <p className="text-xs text-text-muted">Next: {SKILLS[plan.skills[plan.focusIndex + 1]].title.toLowerCase()}.</p>
          )}
        </section>

        {due !== null && (
          <section className="glass-card p-4 sm:p-5 space-y-2 border border-accent/40">
            <h2 className="text-sm font-semibold text-text-primary">Weekly check-in for week {due}</h2>
            <p className="text-sm text-text-secondary">
              The check-in measures the focus skill on the games you have played since the last one, and moves to the
              next skill if it costs a quarter less. It only sees analyzed games, so run the weakness profile on the{" "}
              <Link href={`/dashboard/${username}`} className="text-accent hover:underline">
                Statistics tab
              </Link>{" "}
              first if you have played since.
            </p>
            <button
              type="button"
              onClick={() => setPlan(update(plan, (p, t) => checkIn(p, summaries, t)))}
              className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
            >
              Do the check-in
            </button>
          </section>
        )}

        {finished ? (
          <section className="glass-card p-4 sm:p-5 space-y-2">
            <h2 className="text-sm font-semibold text-text-primary">Four weeks done</h2>
            <p className="text-sm text-text-secondary">
              You did {plan.sessions.length} sessions. Start a new plan to pick the focus again from your latest games.
            </p>
            <button
              type="button"
              onClick={restart}
              className="px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
            >
              Start a new plan
            </button>
          </section>
        ) : (
          <section className="glass-card p-4 sm:p-5 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">{doneToday ? "Today's session (done)" : "Today's session"}</h2>
              <span className="text-xs text-text-muted">about {steps.reduce((s, x) => s + x.minutes, 0)} min</span>
            </div>
            <ol className="space-y-3">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-text-primary">
                      {step.title} <span className="font-normal text-text-muted">· {step.minutes} min</span>
                    </p>
                    <p className="text-sm text-text-secondary">{step.detail}</p>
                    {step.target.mode === "game" ? (
                      <Link href={`/dashboard/${username}`} className="inline-block text-sm text-accent hover:underline">
                        Open your games to review it ▸
                      </Link>
                    ) : (
                      <button type="button" onClick={() => onGo(step.target)} className="text-sm text-accent hover:underline">
                        Open ▸
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-xs text-text-muted">
                {doneToday ? "Counted for today. Come back tomorrow, or take the day off." : "Tick it off when you have done the three parts."}
              </p>
              {!doneToday && (
                <button
                  type="button"
                  onClick={() => setPlan(update(plan, completeSession))}
                  className="shrink-0 px-4 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent-hover text-black font-semibold transition-colors"
                >
                  Session done
                </button>
              )}
            </div>
          </section>
        )}

        {lastCheckIn && (
          <section className="glass-card p-4 sm:p-5 space-y-1">
            <h2 className="text-xs font-semibold text-text-muted">Last check-in (week {lastCheckIn.week})</h2>
            <p className="text-sm text-text-secondary">{lastCheckIn.note}</p>
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <section className="glass-card p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Weekly goal</h2>
            <p className="text-xs text-text-muted">
              {WEEKLY_GOAL} sessions out of {SESSIONS_PER_WEEK} each week. Days off cost nothing.
            </p>
          </div>
          <ul className="space-y-2">
            {weeks.map((w) => (
              <li key={w.week} className="flex items-center gap-3">
                <span className="w-14 text-xs text-text-muted">Week {w.week}</span>
                <span className="flex gap-1" aria-label={`${w.sessions} sessions`}>
                  {Array.from({ length: SESSIONS_PER_WEEK }, (_, i) => (
                    <span
                      key={i}
                      className={`w-3 h-3 rounded-full ${
                        i < w.sessions ? "bg-accent" : i < WEEKLY_GOAL ? "bg-border" : "bg-border/50"
                      }`}
                    />
                  ))}
                </span>
                <span
                  className={`text-xs ${
                    w.status === "met" || w.status === "repaired" ? "text-accent" : w.status === "missed" ? "text-inaccuracy" : "text-text-muted"
                  }`}
                >
                  {STATUS_TEXT[w.status]}
                </span>
              </li>
            ))}
          </ul>
          {repair && (
            <p className="text-xs text-text-secondary bg-background/50 rounded-md p-2">
              Week {repair.week} ended one session short. A fifth session this week repairs it.
            </p>
          )}
        </section>

        <section className="glass-card p-4 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">The order of work</h2>
          <ol className="space-y-1 text-sm">
            {plan.skills.map((skill, i) => (
              <li
                key={skill}
                className={i === plan.focusIndex ? "font-semibold text-accent" : i < plan.focusIndex ? "text-text-muted line-through" : "text-text-secondary"}
              >
                {i + 1}. {SKILLS[skill].title}
              </li>
            ))}
          </ol>
          <button type="button" onClick={restart} className="text-xs text-text-muted hover:text-text-secondary underline">
            Drop this plan and start over
          </button>
        </section>
      </aside>
    </div>
  );
}
