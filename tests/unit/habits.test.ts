import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { findPatterns, reviewWeekStart, weekdayRates, weeklyReview } from "@/lib/habits/insights";
import { blankHabit, groupOrder, scheduleLabel } from "@/lib/habits/meta";
import {
  MILESTONES,
  analyse,
  challengeDay,
  crossedMilestones,
  dayProgress,
  indexEntries,
  isScheduledDay,
  weekStart,
  weekdayIndex,
} from "@/lib/habits/progress";
import type { Habit, HabitEntry, Pause } from "@/lib/habits/types";

// 2026-10-12 is a Monday.
const MON = "2026-10-12";

function habit(patch: Partial<Habit> = {}): Habit {
  return { ...blankHabit("2026-01-01"), id: "h1", position: 0, archived: false, routine_id: null, routine_position: 0, ...patch };
}

const done = (date: string, count = 1, id = "h1"): HabitEntry => ({ habit_id: id, date, count, status: "done" });
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

function run(h: Habit, entries: HabitEntry[], today: string, pauses: Pause[] = [], auto = {}) {
  return analyse(h, { pauses, auto }, indexEntries(entries), today);
}

describe("dates", () => {
  it("weeks start on Monday", () => {
    expect(weekdayIndex(MON)).toBe(0);
    expect(weekdayIndex(addDays(MON, 6))).toBe(6);
    expect(weekStart(addDays(MON, 4))).toBe(MON);
  });
});

describe("schedules", () => {
  it("only expects weekday habits on their days", () => {
    const h = habit({ schedule: "weekdays", weekdays: 0b0010101 }); // Mon, Wed, Fri
    expect(isScheduledDay(h, MON)).toBe(true);
    expect(isScheduledDay(h, addDays(MON, 1))).toBe(false);
    expect(scheduleLabel(h)).toBe("Mon, Wed, Fri");
    const a = run({ ...h, start_date: MON }, [], addDays(MON, 3));
    expect(a.byDate.get(addDays(MON, 1))?.state).toBe("off");
    expect(a.byDate.get(MON)?.state).toBe("missed");
  });

  it("labels schedules", () => {
    expect(scheduleLabel(habit())).toBe("Every day");
    expect(scheduleLabel(habit({ schedule: "weekdays", weekdays: 0b0011111 }))).toBe("Weekdays");
    expect(scheduleLabel(habit({ schedule: "per_week", per_week: 3 }))).toBe("3 times a week");
  });

  it("puts the current part of the day first", () => {
    expect(groupOrder(7)[0]).toBe("morning");
    expect(groupOrder(14)[0]).toBe("anytime");
    expect(groupOrder(20)[0]).toBe("evening");
  });
});

describe("strength", () => {
  it("rises with completions and never resets to zero on a miss", () => {
    const h = habit({ start_date: "2026-08-01" });
    const all = days("2026-08-01", 60).map((d) => done(d));
    const a = run(h, all, addDays("2026-08-01", 59));
    expect(a.strength).toBeGreaterThan(0.8);
    const missOne = run(h, all.slice(0, -1), addDays("2026-08-01", 60));
    // One miss (yesterday) knocks a little off, not everything.
    expect(missOne.strength).toBeGreaterThan(0.75);
    expect(missOne.strength).toBeLessThan(a.strength);
    // A long run of misses decays towards zero but never reaches it.
    const lapsed = run(h, all, addDays("2026-08-01", 200));
    expect(lapsed.strength).toBeGreaterThan(0);
    expect(lapsed.strength).toBeLessThan(0.05);
  });

  it("doesn't count today until it's done", () => {
    const h = habit({ start_date: MON });
    const a = run(h, [done(MON)], addDays(MON, 1));
    expect(a.byDate.get(addDays(MON, 1))?.state).toBe("pending");
    expect(a.series.at(-1)!.value).toBe(a.series.at(-2)!.value);
  });

  it("gives partial credit to count habits", () => {
    const h = habit({ start_date: MON, target: 8 });
    const half = run(h, [done(MON, 4)], addDays(MON, 1));
    const full = run(h, [done(MON, 8)], addDays(MON, 1));
    expect(half.byDate.get(MON)?.state).toBe("partial");
    expect(half.strength).toBeCloseTo(full.strength / 2, 5);
  });

  it("builds over similar calendar time whatever the schedule", () => {
    const daily = run(
      habit({ start_date: "2026-08-03" }),
      days("2026-08-03", 56).map((d) => done(d)),
      addDays("2026-08-03", 55),
    );
    const mwf = habit({ start_date: "2026-08-03", schedule: "weekdays", weekdays: 0b0010101 });
    const mwfDone = days("2026-08-03", 56)
      .filter((d) => isScheduledDay(mwf, d))
      .map((d) => done(d));
    const a = run(mwf, mwfDone, addDays("2026-08-03", 55));
    expect(Math.abs(a.strength - daily.strength)).toBeLessThan(0.05);
  });
});

describe("skips and vacation", () => {
  it("skipped days don't count as misses or break the streak", () => {
    const h = habit({ start_date: MON });
    const entries = [done(MON), { habit_id: "h1", date: addDays(MON, 1), count: 0, status: "skipped" as const }, done(addDays(MON, 2))];
    const a = run(h, entries, addDays(MON, 2));
    expect(a.streak).toBe(2);
    expect(a.byDate.get(addDays(MON, 1))?.state).toBe("skipped");
    const noSkip = run(h, [done(MON), done(addDays(MON, 2))], addDays(MON, 2));
    expect(noSkip.streak).toBe(1);
    expect(a.strength).toBeGreaterThan(noSkip.strength);
  });

  it("vacation freezes the streak and strength", () => {
    const h = habit({ start_date: MON });
    const before = run(
      h,
      days(MON, 5).map((d) => done(d)),
      addDays(MON, 4),
    );
    const pause: Pause = { id: "p", start_date: addDays(MON, 5), end_date: addDays(MON, 14) };
    const after = run(
      h,
      days(MON, 5).map((d) => done(d)),
      addDays(MON, 14),
      [pause],
    );
    expect(after.streak).toBe(5);
    expect(after.strength).toBeCloseTo(before.strength, 10);
    // An open-ended pause covers today too.
    const open = run(h, [], addDays(MON, 20), [{ id: "p", start_date: addDays(MON, 20), end_date: null }]);
    expect(open.byDate.get(addDays(MON, 20))?.state).toBe("paused");
  });
});

describe("streaks and milestones", () => {
  it("keeps the streak alive while today is still to do", () => {
    const h = habit({ start_date: MON });
    const a = run(
      h,
      days(MON, 7).map((d) => done(d)),
      addDays(MON, 7),
    );
    expect(a.streak).toBe(7);
    expect(a.best).toBe(7);
    expect(a.milestoneCount).toBe(7);
  });

  it("finds milestones crossed", () => {
    expect(crossedMilestones(6, 7)).toEqual([7]);
    expect(crossedMilestones(7, 8)).toEqual([]);
    expect(crossedMilestones(0, 400)).toEqual([...MILESTONES]);
  });

  it("counts break habits as days since the last slip", () => {
    const h = habit({ kind: "break", start_date: MON });
    const slip: HabitEntry = { habit_id: "h1", date: addDays(MON, 3), count: 0, status: "slip" };
    const a = run(h, [slip], addDays(MON, 9));
    expect(a.streak).toBe(6);
    expect(a.best).toBe(6);
    expect(a.byDate.get(addDays(MON, 3))?.state).toBe("slip");
  });
});

describe("N times a week", () => {
  const h = habit({ start_date: MON, schedule: "per_week", per_week: 3 });

  it("never marks single days as missed", () => {
    const a = run(h, [done(MON)], addDays(MON, 5));
    expect([...a.byDate.values()].some((d) => d.state === "missed")).toBe(false);
    expect(a.week).toEqual({ done: 1, quota: 3 });
  });

  it("streaks in weeks and stops nagging once the quota is met", () => {
    const entries = [MON, addDays(MON, 2), addDays(MON, 4), addDays(MON, 7), addDays(MON, 8), addDays(MON, 9)].map((d) => done(d));
    const a = run(h, entries, addDays(MON, 10));
    expect(a.streak).toBe(2);
    expect(a.streakUnit).toBe("weeks");
    expect(a.milestoneCount).toBe(6);
    expect(a.byDate.get(addDays(MON, 10))?.state).toBe("off");
  });

  it("breaks the streak on a week below quota", () => {
    const entries = [MON, addDays(MON, 1), addDays(MON, 2), addDays(MON, 7)].map((d) => done(d));
    const a = run(h, entries, addDays(MON, 14));
    expect(a.streak).toBe(0);
    expect(a.best).toBe(1);
  });

  it("lowers the quota for skipped days", () => {
    const skips = days(MON, 5).map((d) => ({ habit_id: "h1", date: d, count: 0, status: "skipped" as const }));
    const a = run(h, [...skips, done(addDays(MON, 5)), done(addDays(MON, 6))], addDays(MON, 7));
    // Only Saturday and Sunday were available, so 2 of 2 meets it.
    expect(a.streak).toBe(1);
  });
});

describe("auto-complete from nutrition", () => {
  it("counts a day as done when the nutrition goal was met", () => {
    const h = habit({ start_date: MON, auto_source: "water_goal" });
    const a = run(h, [], addDays(MON, 1), [], { [MON]: { water_goal: true } });
    expect(a.byDate.get(MON)?.state).toBe("done");
    expect(a.byDate.get(MON)?.auto).toBe(true);
    expect(a.byDate.get(addDays(MON, 1))?.state).toBe("pending");
  });
});

describe("challenges", () => {
  it("counts the day of the challenge and stops at the end date", () => {
    const h = habit({ start_date: MON, end_date: addDays(MON, 29) });
    expect(challengeDay(h, addDays(MON, 8))).toEqual({ day: 9, total: 30 });
    const a = run(h, [], addDays(MON, 40));
    expect(a.byDate.has(addDays(MON, 30))).toBe(false);
  });
});

describe("insights", () => {
  it("spots a weekday that usually gets missed", () => {
    const h = habit({ name: "Skincare", start_date: "2026-07-20" });
    const today = "2026-10-12";
    const entries = days("2026-07-20", 84)
      .filter((d) => weekdayIndex(d) !== 4) // never on Fridays
      .map((d) => done(d));
    const a = run(h, entries, today);
    const { rates } = weekdayRates(a, today);
    expect(rates[4]).toBe(0);
    const p = findPatterns(a, today);
    expect(p[0].text).toBe("You usually miss Skincare on Fridays");
  });

  it("says nothing without enough data", () => {
    const h = habit({ start_date: addDays(MON, -7) });
    expect(findPatterns(run(h, [], MON), MON)).toEqual([]);
  });

  it("reviews the week: best and most missed", () => {
    const today = addDays(MON, 6); // Sunday
    const a1 = run(
      habit({ id: "a", name: "Read", start_date: MON }),
      days(MON, 7).map((d) => done(d, 1, "a")),
      today,
    );
    const a2 = run(habit({ id: "b", name: "Stretch", start_date: MON }), [done(MON, 1, "b")], today);
    const r = weeklyReview([a1, a2], [{ date: MON, note: "Good start", mood: 4 }], [], MON, today);
    expect(r.best?.habitId).toBe("a");
    expect(r.mostMissed?.habitId).toBe("b");
    expect(r.mood).toBe(4);
    expect(r.notes).toHaveLength(1);
  });

  it("reviews this week on Sunday and last week otherwise", () => {
    expect(reviewWeekStart(addDays(MON, 6))).toBe(MON);
    expect(reviewWeekStart(addDays(MON, 7))).toBe(MON);
    expect(reviewWeekStart(addDays(MON, 9))).toBe(MON);
  });

  it("totals a day's progress for the rings", () => {
    const a1 = run(habit({ id: "a", start_date: MON }), [done(MON, 1, "a")], MON);
    const a2 = run(habit({ id: "b", start_date: MON }), [], MON);
    const brk = run(habit({ id: "c", kind: "break", start_date: MON }), [], MON);
    expect(dayProgress([a1, a2, brk], MON)).toEqual({ done: 1, due: 2 });
  });
});
