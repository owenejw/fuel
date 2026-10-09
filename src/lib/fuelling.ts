/**
 * Workout fuelling guidance laid out on the day's timeline.
 *
 * - 2–3 h before: carb-focused meal, moderate protein, low fat and fibre
 * - 30–60 min before (hard sessions or > 60 min): small serve of fast carbs
 * - During (> 90 min): 30–60 g carbs per hour
 * - Within 1–2 h after: ~0.3 g/kg protein plus carbs
 * - Race: 7–10 g/kg carbs for the 1–2 days before
 */
import { addDays } from "./dates";
import type { Workout } from "./types";

export type FuelWindowKind = "pre_meal" | "pre_snack" | "during" | "post";

export type FuelItem = {
  kind: FuelWindowKind;
  workoutId: string;
  /** Minutes from midnight; null when the workout has no start time. */
  start: number | null;
  end: number | null;
  title: string;
  detail: string;
};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const fmtMin = (m: number) => {
  const h = Math.floor((((m % 1440) + 1440) % 1440) / 60);
  const mm = ((m % 60) + 60) % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, "0")}${ampm}`;
};

export function fuellingTimeline(workouts: Workout[], weightKg: number | null): FuelItem[] {
  const items: FuelItem[] = [];
  for (const w of workouts) {
    if (w.type === "rest") continue;
    const start = w.start_time ? toMin(w.start_time) : null;
    const duration = w.duration_min ?? (w.type === "long_run" ? 100 : 60);
    const end = start === null ? null : start + duration;
    const kg = weightKg ?? 75;
    const label = w.title || w.type.replace("_", " ");

    const early = start !== null && start - 180 < 5 * 60;
    items.push({
      kind: "pre_meal",
      workoutId: w.id,
      start: start === null ? null : Math.max(0, start - 180),
      end: start === null ? null : Math.max(0, start - 120),
      title: `Pre-${label} meal`,
      detail: early
        ? `Early start: make the evening before carb-focused, then a light carb snack on waking. Keep fat and fibre low.`
        : `Carb-focused meal (~${Math.round(kg * 1)}–${Math.round(kg * 2)} g carbs), moderate protein, low fat and fibre.`,
    });

    if (w.intensity === "hard" || duration > 60 || w.is_race) {
      items.push({
        kind: "pre_snack",
        workoutId: w.id,
        start: start === null ? null : start - 60,
        end: start === null ? null : start - 30,
        title: "Top-up snack",
        detail: "Small serve of fast carbs (~20–30 g): banana, white bread with honey, sports drink or lollies.",
      });
    }

    if (duration > 90) {
      const h = duration / 60;
      items.push({
        kind: "during",
        workoutId: w.id,
        start,
        end,
        title: "During",
        detail: `30–60 g carbs per hour — about ${Math.round(30 * h)}–${Math.round(60 * h)} g over ${Math.round(duration)} min (gels, chews, sports drink).`,
      });
    }

    items.push({
      kind: "post",
      workoutId: w.id,
      start: end,
      end: end === null ? null : end + 120,
      title: "Recovery",
      detail: `Within 1–2 h: ~${Math.round(0.3 * kg)} g protein plus ~${Math.round(kg * 1)} g carbs.`,
    });
  }
  return items.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

/** The fuelling window that contains `nowMin`, if any. */
export function activeWindow(items: FuelItem[], nowMin: number): FuelItem | null {
  return items.find((i) => i.start !== null && i.end !== null && nowMin >= i.start && nowMin <= i.end) ?? null;
}

/** Is `date` one of the 1–2 days before a race in `workouts`? Returns the race. */
export function upcomingRace(date: string, workouts: Pick<Workout, "date" | "is_race" | "title">[]) {
  return workouts.find((w) => w.is_race && (w.date === addDays(date, 1) || w.date === addDays(date, 2))) ?? null;
}

export { toMin as timeToMinutes };
