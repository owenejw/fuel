"use server";

import { z } from "zod";
import { addDays, isValidDate } from "@/lib/dates";
import type { MicroStatus } from "@/lib/nrv";
import type { NutrientKey } from "@/lib/nutrients";
import { adaptiveTdee, weightTrend, type AdaptiveTdee, type TrendPoint } from "@/lib/weight";
import type { DayTargets, Workout } from "@/lib/types";
import { db } from "../db";
import { dailyTotals, dayPlans, formulaTdee, getProfile, latestWeight } from "../repo";
import { weeklyMicros } from "../micros";
import { requireProfileId } from "../session";

export type TrendDay = {
  date: string;
  logged: boolean;
  totals: Record<"energy_kj" | "protein_g" | "carbs_g" | "fat_g" | "fibre_g", number>;
  incomplete: boolean;
  targets: DayTargets;
  training: boolean;
};

export type Trends = {
  week: TrendDay[];
  averages: { intake: TrendDay["totals"]; targets: DayTargets; daysLogged: number };
  micros: MicroStatus[];
  weights: TrendPoint[];
  adaptive: AdaptiveTdee | null;
  intakeDays28: number;
  formulaTdeeKj: number | null;
  workouts: { planned: Workout[]; completed: number };
};

const MACRO_KEYS = ["energy_kj", "protein_g", "carbs_g", "fat_g", "fibre_g"] as const;

export async function getTrends(end: string): Promise<Trends> {
  const pid = await requireProfileId();
  const e = z.string().refine(isValidDate).parse(end);
  const from = addDays(e, -6);

  const [plans, micro, weightsRaw, month, profile, weight] = await Promise.all([
    dayPlans(pid, from, e),
    weeklyMicros(pid, e),
    (await db()).query<{ date: string; kg: number }>(
      `select date, kg from weights where profile_id = $1 and date between $2 and $3 order by date`,
      [pid, addDays(e, -180), e],
    ),
    dailyTotals(pid, addDays(e, -27), e),
    getProfile(pid),
    latestWeight(pid, e),
  ]);

  const week: TrendDay[] = micro.days.map((d, i) => ({
    date: d.date,
    logged: d.count > 0,
    totals: Object.fromEntries(MACRO_KEYS.map((k) => [k, Math.round(d.totals[k] ?? 0)])) as TrendDay["totals"],
    incomplete: MACRO_KEYS.some((k) => d.missing[k as NutrientKey] > 0),
    targets: plans[i].targets,
    training: plans[i].training,
  }));
  const logged = week.filter((d) => d.logged);
  const avg = (f: (d: TrendDay) => number, list: TrendDay[]) =>
    list.length ? Math.round(list.reduce((s, d) => s + f(d), 0) / list.length) : 0;

  const intake = month.days.filter((d) => d.count > 0).map((d) => ({ date: d.date, kj: d.totals.energy_kj ?? 0 }));
  const workouts = plans.flatMap((p) => p.workouts).filter((w) => w.type !== "rest");

  return {
    week,
    averages: {
      intake: Object.fromEntries(MACRO_KEYS.map((k) => [k, avg((d) => d.totals[k], logged)])) as TrendDay["totals"],
      targets: Object.fromEntries(MACRO_KEYS.map((k) => [k, avg((d) => d.targets[k], week)])) as DayTargets,
      daysLogged: logged.length,
    },
    micros: micro.status,
    weights: weightTrend(weightsRaw),
    adaptive: adaptiveTdee({ intake, weights: weightsRaw }),
    intakeDays28: intake.length,
    formulaTdeeKj: profile ? formulaTdee(profile, weight, e) : null,
    workouts: { planned: workouts, completed: workouts.filter((w) => w.completed).length },
  };
}
