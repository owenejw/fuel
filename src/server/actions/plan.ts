"use server";

import { z } from "zod";
import { isValidDate, today } from "@/lib/dates";
import { macroTargets, PROTEIN_G_PER_KG, type TargetPlan } from "@/lib/tdee";
import { WORKOUT_TYPES, type Goal, type Workout, type WorkoutInput } from "@/lib/types";
import { syncCalendar as sync } from "../calendar";
import { db } from "../db";
import { dayPlans, formulaTdee, getProfile, getWorkouts, latestWeight, type DayPlan } from "../repo";
import { requireProfileId } from "../session";

const date = z.string().refine(isValidDate, "Invalid date");

// ---------------------------------------------------------------------------
// Goals & targets
// ---------------------------------------------------------------------------

export type GoalContext = {
  goal: Goal | null;
  weightKg: number | null;
  formulaTdeeKj: number | null;
  /** Suggested plan from the formula TDEE (or the override passed in). */
  suggested: TargetPlan | null;
  missing: string[];
};

export async function getGoalContext(opts: { tdeeKj?: number; proteinPerKg?: number } = {}): Promise<GoalContext> {
  const pid = await requireProfileId();
  const t = today();
  const [profile, goalRows, weight] = await Promise.all([
    getProfile(pid),
    (await db()).query(`select * from goals where profile_id = $1 and effective_date <= $2 order by effective_date desc limit 1`, [pid, t]),
    latestWeight(pid, t),
  ]);
  const p = profile!;
  const missing = [!p.sex && "sex", !p.birth_date && "date of birth", !p.height_cm && "height", !weight && "a weigh-in"].filter(
    Boolean,
  ) as string[];
  const formula = formulaTdee(p, weight, t);
  const base = opts.tdeeKj ?? formula;
  const goal = goalRows[0]
    ? (Object.fromEntries(Object.entries(goalRows[0]).map(([k, v]) => [k, k.endsWith("_g") || k.endsWith("_kj") ? Number(v) : v])) as Goal)
    : null;
  return {
    goal,
    weightKg: weight,
    formulaTdeeKj: formula,
    suggested:
      base && weight
        ? macroTargets({
            tdeeKj: base,
            goal: p.goal,
            weightKg: weight,
            sex: p.sex,
            trainingDaysPerWeek: p.training_days_per_week,
            proteinPerKg: Math.min(PROTEIN_G_PER_KG.max, Math.max(PROTEIN_G_PER_KG.min, opts.proteinPerKg ?? PROTEIN_G_PER_KG.default)),
          })
        : null,
    missing,
  };
}

const GoalInput = z.object({
  training_kj: z.number().positive().max(60000),
  training_protein_g: z.number().min(0).max(1000),
  training_carbs_g: z.number().min(0).max(2000),
  training_fat_g: z.number().min(0).max(1000),
  training_fibre_g: z.number().min(0).max(200),
  rest_kj: z.number().positive().max(60000),
  rest_protein_g: z.number().min(0).max(1000),
  rest_carbs_g: z.number().min(0).max(2000),
  rest_fat_g: z.number().min(0).max(1000),
  rest_fibre_g: z.number().min(0).max(200),
});

/** Save targets effective from today. */
export async function saveGoal(input: Omit<Goal, "id" | "effective_date">) {
  const pid = await requireProfileId();
  const g = GoalInput.parse(input);
  const cols = Object.keys(g);
  await (
    await db()
  ).query(
    `insert into goals (profile_id, effective_date, ${cols.join(", ")}) values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")})
     on conflict (profile_id, effective_date) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}`,
    [pid, today(), ...cols.map((c) => g[c as keyof typeof g])],
  );
}

export async function getDayPlans(from: string, to: string): Promise<DayPlan[]> {
  return dayPlans(await requireProfileId(), date.parse(from), date.parse(to));
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

export async function fetchWeights(from: string, to: string) {
  const pid = await requireProfileId();
  return (await db()).query<{ id: string; date: string; kg: number }>(
    `select id, date, kg from weights where profile_id = $1 and date between $2 and $3 order by date`,
    [pid, date.parse(from), date.parse(to)],
  );
}

export async function saveWeight(d: string, kg: number) {
  const pid = await requireProfileId();
  await (
    await db()
  ).query(`insert into weights (profile_id, date, kg) values ($1, $2, $3) on conflict (profile_id, date) do update set kg = excluded.kg`, [
    pid,
    date.parse(d),
    z.number().min(20).max(400).parse(kg),
  ]);
}

export async function deleteWeight(id: string) {
  const pid = await requireProfileId();
  await (await db()).query(`delete from weights where id = $1 and profile_id = $2`, [id, pid]);
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

const WorkoutSchema = z.object({
  date,
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  duration_min: z.number().int().min(0).max(1440).nullable(),
  type: z.enum(WORKOUT_TYPES),
  intensity: z.enum(["easy", "moderate", "hard"]),
  is_race: z.boolean(),
  completed: z.boolean(),
  title: z.string().trim().max(120).nullable(),
});

export async function fetchWorkouts(from: string, to: string): Promise<Workout[]> {
  return getWorkouts(await requireProfileId(), date.parse(from), date.parse(to));
}

export async function saveWorkout(input: WorkoutInput, id?: string) {
  const pid = await requireProfileId();
  const w = WorkoutSchema.parse(input);
  const vals = [w.date, w.start_time, w.duration_min, w.type, w.intensity, w.is_race, w.completed, w.title || null];
  if (id)
    await (
      await db()
    ).query(
      `update workouts set date=$3, start_time=$4, duration_min=$5, type=$6, intensity=$7, is_race=$8, completed=$9, title=$10
       where id = $1 and profile_id = $2`,
      [id, pid, ...vals],
    );
  else
    await (
      await db()
    ).query(
      `insert into workouts (profile_id, date, start_time, duration_min, type, intensity, is_race, completed, title, source)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual')`,
      [pid, ...vals],
    );
}

export async function setWorkoutCompleted(id: string, completed: boolean) {
  const pid = await requireProfileId();
  await (await db()).query(`update workouts set completed = $3 where id = $1 and profile_id = $2`, [id, pid, completed]);
}

export async function deleteWorkout(id: string) {
  const pid = await requireProfileId();
  await (await db()).query(`delete from workouts where id = $1 and profile_id = $2`, [id, pid]);
}

export async function syncCalendar(): Promise<number> {
  return sync(await requireProfileId());
}
