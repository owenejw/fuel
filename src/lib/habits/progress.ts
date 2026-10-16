import { addDays, parseDate } from "../dates";
import type { AutoSignals, Habit, HabitData, HabitEntry, Pause } from "./types";

/** Streak lengths that get a celebration. */
export const MILESTONES = [7, 14, 21, 30, 50, 100, 365] as const;

/**
 * Habit strength is an exponential moving average of completions: each counted day moves the score a step
 * towards 1 (done) or 0 (missed). A miss takes off a share of the current score, so it drops gradually and never
 * resets to zero. α is per day for a daily habit (≈ 80 % after about 6 weeks of perfect days); habits that count
 * less often take bigger steps so they build over the same calendar time.
 */
export const STRENGTH_ALPHA = 0.035;

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (date: string) => (parseDate(date).getDay() + 6) % 7;
export const weekStart = (date: string) => addDays(date, -weekdayIndex(date));
export const weekdayCount = (mask: number) => Array.from({ length: 7 }, (_, i) => (mask >> i) & 1).reduce((a, b) => a + b, 0);

export function isPaused(pauses: Pause[], date: string) {
  return pauses.some((p) => p.start_date <= date && (!p.end_date || date <= p.end_date));
}

export function inRange(h: Pick<Habit, "start_date" | "end_date">, date: string) {
  return date >= h.start_date && (!h.end_date || date <= h.end_date);
}

/** Whether the habit is expected on this weekday. "N per week" habits can be done on any day. */
export function isScheduledDay(h: Pick<Habit, "kind" | "schedule" | "weekdays">, date: string) {
  if (h.kind === "break" || h.schedule !== "weekdays") return true;
  return ((h.weekdays >> weekdayIndex(date)) & 1) === 1;
}

export type EntryIndex = Map<string, HabitEntry>;
export const indexEntries = (entries: HabitEntry[]): EntryIndex => new Map(entries.map((e) => [`${e.habit_id}|${e.date}`, e]));

/** The amount done that day: the recorded count, or the full target when the nutrition side completed it. */
export function dayCount(h: Habit, entry: HabitEntry | undefined, auto: AutoSignals | undefined) {
  const count = entry?.status === "done" ? entry.count : 0;
  if (h.auto_source && auto?.[h.auto_source]) return Math.max(count, h.target);
  return count;
}

export const isAutoDone = (h: Habit, auto: AutoSignals | undefined) => !!h.auto_source && !!auto?.[h.auto_source];

export type DayState =
  | "done" // target reached on a day that counts
  | "extra" // done on a day it wasn't scheduled
  | "partial" // some of a count habit's target, on a past day
  | "missed"
  | "pending" // due today and not done yet
  | "skipped"
  | "paused" // vacation
  | "off" // not scheduled (or an "N per week" day with nothing done)
  | "clean" // habit to break: no slip
  | "slip"; // habit to break: slipped

export type DayInfo = { date: string; state: DayState; count: number; auto: boolean };

export type Analysis = {
  habit: Habit;
  byDate: Map<string, DayInfo>;
  /** 0–1. */
  strength: number;
  /** Strength at the end of each day from the start date to the last day. */
  series: { date: string; value: number }[];
  streak: number;
  best: number;
  /** "weeks" for "N per week" habits, "days" otherwise. */
  streakUnit: "days" | "weeks";
  /** What milestones are measured in: streak days, or check-ins during a weekly streak. */
  milestoneCount: number;
  /** "N per week" habits: progress through the current week. */
  week: { done: number; quota: number } | null;
  /** Share of counted days done in the last 30 days, or null with nothing to count. */
  rate30: number | null;
};

const DONE_STATES: DayState[] = ["done", "extra", "clean"];
export const isDoneState = (s: DayState | undefined) => !!s && DONE_STATES.includes(s);

/**
 * Walks a habit's history day by day up to `today` (or its end date) and works out each day's state, the
 * strength score, streaks and milestone progress. Skipped and vacation days are left out of everything.
 */
export function analyse(h: Habit, data: Pick<HabitData, "pauses" | "auto">, index: EntryIndex, today: string): Analysis {
  const last = h.end_date && h.end_date < today ? h.end_date : today;
  const byDate = new Map<string, DayInfo>();
  const series: { date: string; value: number }[] = [];
  let score = 0;
  const step = (value: number, alpha: number) => (score = score * (1 - alpha) + value * alpha);

  const infoFor = (date: string): DayInfo => {
    const entry = index.get(`${h.id}|${date}`);
    const auto = data.auto[date];
    const count = dayCount(h, entry, auto);
    const base = { date, count, auto: isAutoDone(h, auto) && !(entry?.status === "done" && entry.count >= h.target) };
    if (isPaused(data.pauses, date)) return { ...base, state: "paused" };
    if (h.kind === "break") return { ...base, state: entry?.status === "slip" ? "slip" : "clean" };
    if (entry?.status === "skipped") return { ...base, state: "skipped" };
    const done = count >= h.target;
    if (h.schedule === "per_week") return { ...base, state: done ? "done" : date === today ? "pending" : "off" };
    if (!isScheduledDay(h, date)) return { ...base, state: done ? "extra" : "off" };
    if (done) return { ...base, state: "done" };
    if (date === today) return { ...base, state: "pending" };
    return { ...base, state: count > 0 ? "partial" : "missed" };
  };

  let week: Analysis["week"] = null;

  if (h.kind === "break" || h.schedule !== "per_week") {
    const alpha =
      h.kind === "break" || h.schedule === "daily" ? STRENGTH_ALPHA : 1 - (1 - STRENGTH_ALPHA) ** (7 / weekdayCount(h.weekdays));
    for (let d = h.start_date; d <= last; d = addDays(d, 1)) {
      const info = infoFor(d);
      byDate.set(d, info);
      if (info.state === "done" || info.state === "clean") step(1, alpha);
      else if (info.state === "slip" || info.state === "missed") step(0, alpha);
      else if (info.state === "partial") step(Math.min(1, info.count / h.target), alpha);
      series.push({ date: d, value: score });
    }
  } else {
    // "N per week": each Monday–Sunday week is one step, done count against the quota.
    const alpha = 1 - (1 - STRENGTH_ALPHA) ** 7;
    for (let d = h.start_date; d <= last; d = addDays(d, 1)) byDate.set(d, infoFor(d));
    for (let ws = weekStart(h.start_date); ws <= last; ws = addDays(ws, 7)) {
      const { done, quota } = weekProgress(h, byDate, data.pauses, ws);
      const we = addDays(ws, 6);
      const finished = we < today || (h.end_date != null && we >= h.end_date && h.end_date < today);
      const stepDay = finished ? (we < last ? we : last) : done >= quota ? last : null;
      for (let d = ws < h.start_date ? h.start_date : ws; d <= we && d <= last; d = addDays(d, 1)) {
        if (d === stepDay && quota > 0) step(Math.min(1, done / quota), alpha);
        series.push({ date: d, value: score });
      }
      if (ws === weekStart(today)) {
        week = { done, quota };
        // Quota met: nothing more is due this week.
        const t = byDate.get(today);
        if (t?.state === "pending" && done >= quota) byDate.set(today, { ...t, state: "off" });
      }
    }
  }

  const { streak, best, milestoneCount } = streaks(h, byDate, data.pauses, today, last);
  return {
    habit: h,
    byDate,
    strength: score,
    series,
    streak,
    best,
    streakUnit: h.kind === "build" && h.schedule === "per_week" ? "weeks" : "days",
    milestoneCount,
    week,
    rate30: completionRate(h, byDate, data.pauses, addDays(today, -29), today),
  };
}

/** Done days and the quota for one week of an "N per week" habit. Skipped, vacation and out-of-range days lower the quota. */
export function weekProgress(h: Habit, byDate: Map<string, DayInfo>, pauses: Pause[], ws: string) {
  let done = 0;
  let available = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    if (!inRange(h, d) || isPaused(pauses, d)) continue;
    const s = byDate.get(d)?.state;
    if (s === "skipped") continue;
    available++;
    if (s === "done") done++;
  }
  return { done, quota: Math.min(h.per_week, available) };
}

function streaks(h: Habit, byDate: Map<string, DayInfo>, pauses: Pause[], today: string, last: string) {
  if (h.kind === "build" && h.schedule === "per_week") {
    // Consecutive weeks meeting the quota. The current week only counts once met, and never breaks the streak.
    const weeks: { met: boolean; neutral: boolean; done: number; current: boolean }[] = [];
    for (let ws = weekStart(h.start_date); ws <= last; ws = addDays(ws, 7)) {
      const { done, quota } = weekProgress(h, byDate, pauses, ws);
      weeks.push({ met: quota > 0 && done >= quota, neutral: quota === 0, done, current: ws === weekStart(today) });
    }
    let streak = 0;
    let count = 0;
    for (let i = weeks.length - 1; i >= 0; i--) {
      const w = weeks[i];
      if (w.met) {
        streak++;
        count += w.done;
      } else if (w.neutral || w.current) {
        count += w.done;
      } else break;
    }
    let best = 0;
    let run = 0;
    for (const w of weeks) {
      if (w.met) best = Math.max(best, ++run);
      else if (!w.neutral && !w.current) run = 0;
    }
    return { streak, best, milestoneCount: count };
  }

  // Days: done (or clean) days in a row. Skipped, vacation and unscheduled days don't break it; today still pending doesn't either.
  const counts = (s: DayState) => s === "done" || s === "extra" || s === "clean";
  const breaks = (s: DayState) => s === "missed" || s === "partial" || s === "slip";
  let streak = 0;
  for (let d = last; d >= h.start_date; d = addDays(d, -1)) {
    const s = byDate.get(d)?.state;
    if (!s) continue;
    if (counts(s)) streak++;
    else if (breaks(s)) break;
  }
  let best = 0;
  let run = 0;
  for (let d = h.start_date; d <= last; d = addDays(d, 1)) {
    const s = byDate.get(d)?.state;
    if (!s) continue;
    if (counts(s)) best = Math.max(best, ++run);
    else if (breaks(s)) run = 0;
  }
  return { streak, best, milestoneCount: streak };
}

/** Share of the days that counted which were done, between two dates. */
export function completionRate(h: Habit, byDate: Map<string, DayInfo>, pauses: Pause[], from: string, to: string): number | null {
  if (h.kind === "build" && h.schedule === "per_week") {
    let done = 0;
    let quota = 0;
    for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) {
      if (addDays(ws, 6) > to) {
        // The current week counts only as far as it's got.
        const p = weekProgress(h, byDate, pauses, ws);
        if (p.done >= p.quota) {
          done += p.quota;
          quota += p.quota;
        }
        continue;
      }
      const p = weekProgress(h, byDate, pauses, ws);
      done += Math.min(p.done, p.quota);
      quota += p.quota;
    }
    return quota ? done / quota : null;
  }
  let good = 0;
  let total = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const s = byDate.get(d)?.state;
    if (s === "done" || s === "clean") good++;
    if (s === "done" || s === "clean" || s === "missed" || s === "partial" || s === "slip") total++;
  }
  return total ? good / total : null;
}

/** Milestones passed when the milestone count goes from `before` to `after`. */
export function crossedMilestones(before: number, after: number) {
  return MILESTONES.filter((m) => before < m && after >= m);
}

/** Whether the habit belongs on the checklist for this date. */
export function onChecklist(h: Habit, date: string) {
  return !h.archived && inRange(h, date);
}

/** "Day 9 of 30" for a habit with an end date. */
export function challengeDay(h: Habit, date: string) {
  if (!h.end_date) return null;
  const total = Math.round((parseDate(h.end_date).getTime() - parseDate(h.start_date).getTime()) / 86_400_000) + 1;
  const day = Math.round((parseDate(date).getTime() - parseDate(h.start_date).getTime()) / 86_400_000) + 1;
  return { day: Math.min(Math.max(day, 1), total), total };
}

/** Done and due habits to build on a date, for the day rings. */
export function dayProgress(analyses: Iterable<Analysis>, date: string) {
  let done = 0;
  let due = 0;
  for (const a of analyses) {
    if (a.habit.kind === "break" || a.habit.archived) continue;
    const s = a.byDate.get(date)?.state;
    if (s === "done" || s === "extra") {
      done++;
      due++;
    } else if (s === "pending" || s === "missed" || s === "partial") due++;
  }
  return { done, due };
}
