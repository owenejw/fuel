import "server-only";
/**
 * Data access shared by server actions and route handlers. Every function
 * takes the profile id explicitly; callers get it from the device cookie.
 */
import { addDays, ageOn, nowTime } from "@/lib/dates";
import { rankFrequentFoods } from "@/lib/frequent";
import { fuellingTimeline, upcomingRace, type FuelItem } from "@/lib/fuelling";
import { NUTRIENT_KEYS, pickNutrients, sumNutrients, type Nutrients } from "@/lib/nutrients";
import { applyCarbLoading, macroTargets, tdeeKj } from "@/lib/tdee";
import type { DayTargets, DayType, Food, Goal, LogEntry, LogKind, MealSlot, Profile, Recipe, SavedMeal, Workout } from "@/lib/types";
import { db, json, type Row } from "./db";

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const PROFILE_COLS = `id, name, sex, birth_date, height_cm, activity_level, goal, energy_unit, training_days_per_week, ai_enabled,
  calendar_ics_url, calendar_keywords, calendar_synced_at, remind_log_time, remind_workouts`;

export async function getProfile(id: string): Promise<Profile | null> {
  const rows = await (await db()).query<Profile>(`select ${PROFILE_COLS} from profiles where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function latestWeight(pid: string, onOrBefore: string): Promise<number | null> {
  const rows = await (
    await db()
  ).query<{ kg: number }>(`select kg from weights where profile_id = $1 and date <= $2 order by date desc limit 1`, [pid, onOrBefore]);
  if (rows[0]) return rows[0].kg;
  const any = await (await db()).query<{ kg: number }>(`select kg from weights where profile_id = $1 order by date asc limit 1`, [pid]);
  return any[0]?.kg ?? null;
}

/** Formula TDEE (Mifflin-St Jeor × activity) when the profile has enough data. */
export function formulaTdee(p: Profile, weightKg: number | null, onDate: string): number | null {
  if (!p.sex || !p.birth_date || !p.height_cm || !weightKg) return null;
  return Math.round(tdeeKj({ sex: p.sex, weightKg, heightCm: p.height_cm, age: ageOn(p.birth_date, onDate), activity: p.activity_level }));
}

// ---------------------------------------------------------------------------
// Log entries
// ---------------------------------------------------------------------------

const ENTRY_COLS = `id, date, time, slot, kind, reference_food_id, custom_food_id, recipe_id, name, grams, nutrients, created_at`;

export function toEntry(r: Row): LogEntry {
  return {
    ...(r as unknown as LogEntry),
    time: String(r.time).slice(0, 8),
    grams: r.grams == null ? null : Number(r.grams),
    nutrients: pickNutrients((r.nutrients as Row) ?? {}),
  };
}

export async function getLog(pid: string, from: string, to = from): Promise<LogEntry[]> {
  const rows = await (
    await db()
  ).query(`select ${ENTRY_COLS} from log_entries where profile_id = $1 and date between $2 and $3 order by date, time, created_at`, [
    pid,
    from,
    to,
  ]);
  return rows.map(toEntry);
}

export type NewEntry = {
  date: string;
  slot: MealSlot;
  kind: LogKind;
  food_id?: string | null;
  name: string;
  grams: number | null;
  nutrients: Nutrients;
  time?: string;
};

function cleanNutrients(n: Nutrients): Nutrients {
  const out: Nutrients = {};
  for (const k of NUTRIENT_KEYS) {
    const v = n[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export async function insertEntries(pid: string, entries: NewEntry[]): Promise<LogEntry[]> {
  if (!entries.length) return [];
  const payload = entries.map((e) => ({
    date: e.date,
    time: e.time ?? nowTime(),
    slot: e.slot,
    kind: e.kind,
    reference_food_id: e.kind === "reference" ? (e.food_id ?? null) : null,
    custom_food_id: e.kind === "custom" ? (e.food_id ?? null) : null,
    recipe_id: e.kind === "recipe" ? (e.food_id ?? null) : null,
    name: String(e.name).slice(0, 200),
    grams: e.grams && e.grams > 0 ? e.grams : null,
    nutrients: cleanNutrients(e.nutrients ?? {}),
  }));
  // Unknown/stale food ids become null rather than failing the insert.
  const rows = await (
    await db()
  ).query(
    `insert into log_entries (profile_id, date, time, slot, kind, reference_food_id, custom_food_id, recipe_id, name, grams, nutrients)
     select $1, x.date, x.time, x.slot, x.kind,
            (select id from reference_foods where id = x.reference_food_id),
            (select id from custom_foods where id = x.custom_food_id),
            (select id from recipes where id = x.recipe_id),
            x.name, x.grams, coalesce(x.nutrients, '{}'::jsonb)
     from jsonb_to_recordset($2::jsonb) as x(date date, time time, slot meal_slot, kind log_kind, reference_food_id uuid,
          custom_food_id uuid, recipe_id uuid, name text, grams numeric, nutrients jsonb)
     returning ${ENTRY_COLS}`,
    [pid, json(payload)],
  );
  return rows.map(toEntry);
}

// ---------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------

export function recipeToFood(r: Recipe): Food {
  const per100: Nutrients = {};
  for (const [k, v] of Object.entries(r.nutrients)) if (typeof v === "number") per100[k as keyof Nutrients] = (v / r.total_grams) * 100;
  return {
    kind: "recipe",
    id: r.id,
    source: "recipe",
    name: r.name,
    brand: null,
    barcode: null,
    serve_size_g: Math.round((r.total_grams / r.servings) * 10) / 10,
    serve_label: `1 of ${r.servings} serves`,
    per100,
  };
}

export function toRecipe(r: Row): Recipe {
  return {
    id: String(r.id),
    name: String(r.name),
    servings: Number(r.servings),
    total_grams: Number(r.total_grams),
    ingredients: (r.ingredients as Recipe["ingredients"]) ?? [],
    nutrients: pickNutrients((r.nutrients as Row) ?? {}),
  };
}

export async function getRecipes(): Promise<Recipe[]> {
  return (await (await db()).query(`select * from recipes order by name`)).map(toRecipe);
}

// ---------------------------------------------------------------------------
// Saved meals
// ---------------------------------------------------------------------------

export async function getSavedMeals(pid: string): Promise<SavedMeal[]> {
  return (await db()).query<SavedMeal>(`select id, name, items, created_at from meals_saved where profile_id = $1 order by name`, [pid]);
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

const WORKOUT_COLS = `id, date, start_time, duration_min, type, intensity, is_race, completed, title, source`;

export function toWorkout(r: Row): Workout {
  return { ...(r as unknown as Workout), start_time: r.start_time ? String(r.start_time).slice(0, 5) : null };
}

export async function getWorkouts(pid: string, from: string, to: string): Promise<Workout[]> {
  const rows = await (
    await db()
  ).query(`select ${WORKOUT_COLS} from workouts where profile_id = $1 and date between $2 and $3 order by date, start_time nulls last`, [
    pid,
    from,
    to,
  ]);
  return rows.map(toWorkout);
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** Placeholder targets when there's neither a saved goal nor enough profile data. */
export const DEFAULT_TARGETS: DayTargets = { energy_kj: 8700, protein_g: 120, carbs_g: 250, fat_g: 70, fibre_g: 30 };

function toGoal(r: Row): Goal {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k.endsWith("_g") || k.endsWith("_kj") ? Number(v) : v])) as Goal;
}

export function goalTargets(goal: Goal, training: boolean): DayTargets {
  const p = training ? "training" : "rest";
  return {
    energy_kj: goal[`${p}_kj`],
    protein_g: goal[`${p}_protein_g`],
    carbs_g: goal[`${p}_carbs_g`],
    fat_g: goal[`${p}_fat_g`],
    fibre_g: goal[`${p}_fibre_g`],
  };
}

export type TargetSource = "goal" | "estimated" | "placeholder";

export type DayPlan = {
  date: string;
  targets: DayTargets;
  training: boolean;
  dayType: DayType;
  dayTypeOverridden: boolean;
  source: TargetSource;
  carbLoadingFor: string | null;
  workouts: Workout[];
};

/** Targets, day type and workouts for every date in [from, to]. Batched queries. */
export async function dayPlans(pid: string, from: string, to: string): Promise<DayPlan[]> {
  const d = await db();
  const [profile, goals, overrides, workouts, weight] = await Promise.all([
    getProfile(pid),
    d.query(`select * from goals where profile_id = $1 and effective_date <= $2 order by effective_date`, [pid, to]),
    d.query<{ date: string; type: DayType }>(`select date, type from day_types where profile_id = $1 and date between $2 and $3`, [
      pid,
      from,
      to,
    ]),
    getWorkouts(pid, from, addDays(to, 2)),
    latestWeight(pid, to),
  ]);
  const goalRows = goals.map(toGoal);
  const plans: DayPlan[] = [];

  for (let date = from; date <= to; date = addDays(date, 1)) {
    const dayWorkouts = workouts.filter((w) => w.date === date);
    const override = overrides.find((o) => o.date === date);
    const training = override ? override.type === "training" : dayWorkouts.some((w) => w.type !== "rest");
    const goal = [...goalRows].reverse().find((g) => g.effective_date <= date);

    let targets: DayTargets;
    let source: TargetSource;
    if (goal) {
      targets = goalTargets(goal, training);
      source = "goal";
    } else {
      const tdee = profile ? formulaTdee(profile, weight, date) : null;
      if (profile && tdee && weight) {
        const plan = macroTargets({
          tdeeKj: tdee,
          goal: profile.goal,
          weightKg: weight,
          sex: profile.sex,
          trainingDaysPerWeek: profile.training_days_per_week,
        });
        targets = training ? plan.training : plan.rest;
        source = "estimated";
      } else {
        targets = DEFAULT_TARGETS;
        source = "placeholder";
      }
    }

    const race = upcomingRace(date, workouts);
    if (race && weight) targets = applyCarbLoading(targets, weight);

    plans.push({
      date,
      targets,
      training,
      dayType: training ? "training" : "rest",
      dayTypeOverridden: !!override,
      source,
      carbLoadingFor: race ? (race.title ?? "race") : null,
      workouts: dayWorkouts,
    });
  }
  return plans;
}

export async function waterByDay(pid: string, from: string, to: string) {
  const rows = await (
    await db()
  ).query<{ date: string; ml: number }>(
    `select date, sum(ml)::int as ml from water_logs where profile_id = $1 and date between $2 and $3 group by date`,
    [pid, from, to],
  );
  return new Map(rows.map((r) => [r.date, Number(r.ml)]));
}

// ---------------------------------------------------------------------------
// Day bundle for Today
// ---------------------------------------------------------------------------

export type DayBundle = {
  entries: LogEntry[];
  plan: DayPlan;
  waterMl: number;
  weightKg: number | null;
  fuelling: FuelItem[];
};

export async function getDayBundle(pid: string, date: string): Promise<DayBundle> {
  const [entries, plans, water, weight] = await Promise.all([
    getLog(pid, date),
    dayPlans(pid, date, date),
    waterByDay(pid, date, date),
    latestWeight(pid, date),
  ]);
  return {
    entries,
    plan: plans[0],
    waterMl: water.get(date) ?? 0,
    weightKg: weight,
    fuelling: fuellingTimeline(plans[0].workouts, weight),
  };
}

// ---------------------------------------------------------------------------
// Daily totals for trends
// ---------------------------------------------------------------------------

export async function dailyTotals(pid: string, from: string, to: string) {
  const [entries, water] = await Promise.all([getLog(pid, from, to), waterByDay(pid, from, to)]);
  const days: {
    date: string;
    totals: ReturnType<typeof sumNutrients>["totals"];
    missing: ReturnType<typeof sumNutrients>["missing"];
    count: number;
  }[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const t = sumNutrients(entries.filter((e) => e.date === date).map((e) => e.nutrients));
    // Total water = water in food + drinks logged.
    const drinks = water.get(date) ?? 0;
    if (drinks) t.totals.water_ml = (t.totals.water_ml ?? 0) + drinks;
    days.push({ date, totals: t.totals, missing: t.missing, count: t.count });
  }
  return { days, entries };
}

export { rankFrequentFoods };
