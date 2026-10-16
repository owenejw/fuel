import { addDays } from "../dates";
import { completionRate, weekStart, weekdayIndex, type Analysis } from "./progress";
import type { HabitDay, Pause } from "./types";

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** At least this many counted days on a weekday before we say anything about it. */
const MIN_SAMPLES = 4;
/** A weekday this far below the habit's average is a pattern. */
const GAP = 0.25;

export type WeekdayRates = { rates: (number | null)[]; samples: number[]; overall: number | null };

/**
 * Completion rate for each weekday over the last `weeks` weeks.
 * Daily/weekday habits: done ÷ counted days. "N per week": share of weeks with a check-in on that day.
 * Habits to break: share of days without a slip.
 */
export function weekdayRates(a: Analysis, today: string, weeks = 12): WeekdayRates {
  const good = Array(7).fill(0);
  const total = Array(7).fill(0);
  const perWeek = a.habit.kind === "build" && a.habit.schedule === "per_week";
  const from = addDays(today, -weeks * 7 + 1);
  for (let d = from; d < today; d = addDays(d, 1)) {
    const info = a.byDate.get(d);
    if (!info) continue;
    const i = weekdayIndex(d);
    const s = info.state;
    if (perWeek) {
      if (s === "paused" || s === "skipped") continue;
      total[i]++;
      if (s === "done") good[i]++;
    } else if (s === "done" || s === "clean") {
      good[i]++;
      total[i]++;
    } else if (s === "missed" || s === "partial" || s === "slip") total[i]++;
  }
  const sumGood = good.reduce((x, y) => x + y, 0);
  const sumTotal = total.reduce((x, y) => x + y, 0);
  return {
    rates: total.map((t, i) => (t ? good[i] / t : null)),
    samples: total,
    overall: sumTotal ? sumGood / sumTotal : null,
  };
}

export type Pattern = { habitId: string; weekday: number; text: string; kind: "miss" | "slip" | "strong" };

/** Plain-English patterns, e.g. "You usually miss Skincare on Fridays". */
export function findPatterns(a: Analysis, today: string): Pattern[] {
  const h = a.habit;
  const { rates, samples, overall } = weekdayRates(a, today);
  if (overall == null) return [];
  const out: Pattern[] = [];
  if (h.kind === "build" && h.schedule === "per_week") {
    // No misses to find; say which day it usually happens on instead.
    const best = rates.reduce<number>((bi, r, i) => ((r ?? -1) > (rates[bi] ?? -1) ? i : bi), 0);
    if (samples[best] >= MIN_SAMPLES && (rates[best] ?? 0) >= 0.6)
      out.push({ habitId: h.id, weekday: best, kind: "strong", text: `${h.name} usually happens on ${WEEKDAY_NAMES[best]}s` });
    return out;
  }
  for (let i = 0; i < 7; i++) {
    const r = rates[i];
    if (r == null || samples[i] < MIN_SAMPLES || r > overall - GAP) continue;
    const day = `${WEEKDAY_NAMES[i]}s`;
    if (h.kind === "break") out.push({ habitId: h.id, weekday: i, kind: "slip", text: `Slips with ${h.name} happen most on ${day}` });
    else
      out.push({
        habitId: h.id,
        weekday: i,
        kind: "miss",
        text: r < 0.5 ? `You usually miss ${h.name} on ${day}` : `${h.name} is harder on ${day}`,
      });
  }
  // The worst day first, at most two per habit.
  return out.sort((x, y) => (rates[x.weekday] ?? 0) - (rates[y.weekday] ?? 0)).slice(0, 2);
}

export type HabitWeek = { habitId: string; rate: number; missed: number; done: number; strengthChange: number };

export type WeeklyReview = {
  weekStart: string;
  weekEnd: string;
  habits: HabitWeek[];
  best: HabitWeek | null;
  mostMissed: HabitWeek | null;
  overall: number | null;
  patterns: Pattern[];
  mood: number | null;
  notes: HabitDay[];
};

const strengthOn = (a: Analysis, date: string) => {
  let v = 0;
  for (const p of a.series) {
    if (p.date > date) break;
    v = p.value;
  }
  return v;
};

/** Best habit, most missed, patterns and mood for one Monday–Sunday week. */
export function weeklyReview(analyses: Analysis[], days: HabitDay[], pauses: Pause[], ws: string, today: string): WeeklyReview {
  const we = addDays(ws, 6);
  const to = we < today ? we : today;
  const habits: HabitWeek[] = [];
  for (const a of analyses) {
    if (a.habit.archived) continue;
    const rate = completionRate(a.habit, a.byDate, pauses, ws, to);
    if (rate == null) continue;
    let missed = 0;
    let done = 0;
    for (let d = ws; d <= to; d = addDays(d, 1)) {
      const s = a.byDate.get(d)?.state;
      if (s === "missed" || s === "partial" || s === "slip") missed++;
      if (s === "done" || s === "extra" || s === "clean") done++;
    }
    habits.push({ habitId: a.habit.id, rate, missed, done, strengthChange: strengthOn(a, to) - strengthOn(a, addDays(ws, -1)) });
  }
  const best = [...habits].sort((x, y) => y.rate - x.rate || y.strengthChange - x.strengthChange)[0] ?? null;
  const missedOnes = habits.filter((h) => h.missed > 0).sort((x, y) => y.missed - x.missed || x.rate - y.rate);
  const mostMissed = missedOnes.find((h) => h.habitId !== best?.habitId) ?? null;
  const overall = habits.length ? habits.reduce((s, h) => s + h.rate, 0) / habits.length : null;
  const weekDays = days.filter((d) => d.date >= ws && d.date <= we);
  const moods = weekDays.map((d) => d.mood).filter((m): m is number => m != null);
  return {
    weekStart: ws,
    weekEnd: we,
    habits,
    best,
    mostMissed,
    overall,
    patterns: analyses.filter((a) => !a.habit.archived).flatMap((a) => findPatterns(a, today)),
    mood: moods.length ? moods.reduce((s, m) => s + m, 0) / moods.length : null,
    notes: weekDays.filter((d) => d.note),
  };
}

/** The week the Sunday review is about: this week on Sunday, otherwise last week. */
export function reviewWeekStart(today: string) {
  return weekdayIndex(today) === 6 ? weekStart(today) : addDays(weekStart(today), -7);
}

/** Show the review card on Sunday and Monday. */
export const showReviewCard = (today: string) => [6, 0].includes(weekdayIndex(today));
