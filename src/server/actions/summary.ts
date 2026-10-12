"use server";

import { z } from "zod";
import { addDays, isValidDate, parseDate } from "@/lib/dates";
import { sumNutrients, type Nutrients } from "@/lib/nutrients";
import type { DayTargets } from "@/lib/types";
import { db } from "../db";
import { dayPlans, getLog } from "../repo";
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
  const [days, logged, weights] = await Promise.all([
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
  ]);
  return {
    week: days,
    loggedDays: logged.map((r) => r.d),
    weights: weights.map((w) => ({ date: String(w.date).slice(0, 10), kg: Number(w.kg) })),
  };
}
