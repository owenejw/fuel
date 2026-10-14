"use server";

import { z } from "zod";
import { addDays, isValidDate, parseDate } from "@/lib/dates";
import { sumNutrients, type Nutrients } from "@/lib/nutrients";
import type { DayTargets } from "@/lib/types";
import { db } from "../db";
import { dayPlans, getLog } from "../repo";
import { weeklyMicros } from "../micros";
import { microState } from "@/lib/nrv";
import { requireProfileId } from "../session";

const date = z.string().refine(isValidDate, "Invalid date");

export type WeekDay = { date: string; totals: Nutrients; targets: DayTargets; logged: boolean; training: boolean };

async function week(pid: string, d: string): Promise<WeekDay[]> {
  const monday = addDays(d, -((parseDate(d).getDay() + 6) % 7));
  const sunday = addDays(monday, 6);
  const [entries, plans] = await Promise.all([getLog(pid, monday, sunday), dayPlans(pid, monday, sunday)]);
  return plans.map((p) => {
    const mine = entries.filter((e) => e.date === p.date);
    return {
      date: p.date,
      totals: sumNutrients(mine.map((e) => e.nutrients)).totals,
      targets: p.targets,
      logged: mine.length > 0,
      training: p.training,
    };
  });
}

/** Monday-to-Sunday totals against each day's targets. One round trip. */
export async function fetchWeek(d: string): Promise<WeekDay[]> {
  return week(await requireProfileId(), date.parse(d));
}

/** Everything Today's tiles need besides the day itself, in one round trip. */
export async function fetchSummary(d: string) {
  const pid = await requireProfileId();
  const day = date.parse(d);
  const q = await db();
  const [days, logged, weights, activity, micros, prev] = await Promise.all([
    week(pid, day),
    q.query<{ d: string }>(
      `select distinct to_char(date, 'YYYY-MM-DD') as d from log_entries where profile_id = $1 and date between $2 and $3 order by d desc`,
      [pid, addDays(day, -120), day],
    ),
    q.query<{ date: string; kg: number }>(`select date, kg from weights where profile_id = $1 and date between $2 and $3 order by date`, [
      pid,
      addDays(day, -30),
      day,
    ]),
    q.query<{ active_kj: number }>(`select active_kj from activity_days where profile_id = $1 and date = $2`, [pid, day]),
    weeklyMicros(pid, day),
    week(pid, addDays(day, -7)),
  ]);
  const prevLogged = prev.filter((d) => d.logged);
  const weightIn = (from: string, to: string) =>
    weights.filter((w) => String(w.date).slice(0, 10) >= from && String(w.date).slice(0, 10) <= to);
  const prevWeights = weightIn(prev[0].date, prev[6].date);
  const recap = {
    weekStart: prev[0].date,
    daysLogged: prevLogged.length,
    avgKj: prevLogged.length ? Math.round(prevLogged.reduce((a, d) => a + (d.totals.energy_kj ?? 0), 0) / prevLogged.length) : 0,
    avgTargetKj: Math.round(prev.reduce((a, d) => a + d.targets.energy_kj, 0) / 7),
    proteinDays: prevLogged.filter((d) => (d.totals.protein_g ?? 0) >= d.targets.protein_g * 0.9).length,
    trainingDays: prev.filter((d) => d.training).length,
    weightChange: prevWeights.length >= 2 ? Math.round((Number(prevWeights.at(-1)!.kg) - Number(prevWeights[0].kg)) * 10) / 10 : null,
  };
  return {
    week: days,
    loggedDays: logged.map((r) => r.d),
    weights: weights.map((w) => ({ date: String(w.date).slice(0, 10), kg: Number(w.kg) })),
    /** Last Monday–Sunday in numbers, for the weekly recap. */
    recap,
    /** Active energy burned today, from Apple Health (null if never synced). */
    activeKj: activity[0] ? Number(activity[0].active_kj) : null,
    /** Vitamins and minerals under 70 % all week, and the number tracked. */
    micros: {
      low: micros.status.filter((m) => microState(m) === "low").length,
      over: micros.status.filter((m) => microState(m) === "over").length,
      tracked: micros.status.filter((m) => microState(m) !== "none").length,
    },
  };
}

/** 7-day vitamin and mineral status for the Vitamins & minerals page. */
export async function fetchMicros(end: string) {
  const pid = await requireProfileId();
  const { status, days } = await weeklyMicros(pid, date.parse(end));
  return { status, daysLogged: days.filter((d) => d.count > 0).length };
}
