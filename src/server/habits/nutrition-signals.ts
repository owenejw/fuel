import "server-only";
/**
 * The only place the habits section reads nutrition data. Read only: nothing here writes, and nothing in the
 * nutrition side imports the habits section.
 */
import { addDays } from "@/lib/dates";
import { fluidTargetMl } from "@/lib/nrv";
import type { AutoSignals, AutoSource } from "@/lib/habits/types";
import { dayPlans, getLog, getProfile, getWorkouts, waterByDay } from "../repo";

const MAIN_MEALS = ["breakfast", "lunch", "dinner"] as const;

/** For each date in [from, to], whether each requested nutrition goal was met. */
export async function nutritionSignals(pid: string, from: string, to: string, sources: Set<AutoSource>) {
  const out: Record<string, AutoSignals> = {};
  if (!sources.size || from > to) return out;
  const needLog = sources.has("protein_target") || sources.has("all_meals");
  const [profile, water, entries, plans, workouts] = await Promise.all([
    sources.has("water_goal") ? getProfile(pid) : null,
    sources.has("water_goal") ? waterByDay(pid, from, to) : null,
    needLog ? getLog(pid, from, to) : null,
    sources.has("protein_target") ? dayPlans(pid, from, to) : null,
    sources.has("trained") ? getWorkouts(pid, from, to) : null,
  ]);
  const waterTarget = fluidTargetMl(profile?.sex ?? null);
  const protein = new Map<string, number>();
  const slots = new Map<string, Set<string>>();
  for (const e of entries ?? []) {
    protein.set(e.date, (protein.get(e.date) ?? 0) + (e.nutrients.protein_g ?? 0));
    if (!slots.has(e.date)) slots.set(e.date, new Set());
    slots.get(e.date)!.add(e.slot);
  }
  const proteinTarget = new Map((plans ?? []).map((p) => [p.date, p.targets.protein_g]));

  for (let date = from; date <= to; date = addDays(date, 1)) {
    const s: AutoSignals = {};
    if (water) s.water_goal = (water.get(date) ?? 0) >= waterTarget;
    if (plans) s.protein_target = (protein.get(date) ?? 0) >= (proteinTarget.get(date) ?? Infinity);
    if (entries) s.all_meals = MAIN_MEALS.every((m) => slots.get(date)?.has(m));
    if (workouts) s.trained = workouts.some((w) => w.date === date && w.type !== "rest" && (w.completed || w.source === "healthkit"));
    if (Object.values(s).some(Boolean)) out[date] = s;
  }
  return out;
}
