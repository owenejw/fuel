/**
 * Rule-based food recommendations from the user's own history.
 *
 * Candidates are foods and saved meals logged in the last 60 days, weighted by
 * frequency. Each is scored by how well a typical serve closes the remaining
 * protein/carb/fat gaps without overshooting kJ, weighted toward the
 * proportionally largest gap. When protein is the largest gap and kJ are
 * tight, candidates are ranked by protein per 100 kJ instead. Foods are only
 * suggested at times of day they've historically been eaten.
 */
import type { FuelWindowKind } from "./fuelling";
import type { Nutrients } from "./nutrients";
import type { DayTargets, LogKind, MealSlot, SavedMealItem } from "./types";

export type Candidate = {
  key: string;
  kind: LogKind | "meal";
  food_id: string | null;
  name: string;
  grams: number | null;
  /** Nutrients of a typical serve. */
  nutrients: Nutrients;
  count: number;
  slots: Partial<Record<MealSlot, number>>;
  items?: SavedMealItem[];
};

export type Remaining = { energy_kj: number; protein_g: number; carbs_g: number; fat_g: number };

export type Period = "morning" | "midday" | "afternoon" | "evening" | "late";

export function periodForTime(minutes: number): Period {
  if (minutes < 10.5 * 60) return "morning";
  if (minutes < 14.5 * 60) return "midday";
  if (minutes < 17 * 60) return "afternoon";
  if (minutes < 21.5 * 60) return "evening";
  return "late";
}

/** Meal slots that make sense at each time of day. */
export const COMPATIBLE_SLOTS: Record<Period, MealSlot[]> = {
  morning: ["breakfast", "snack", "pre_workout", "post_workout"],
  midday: ["lunch", "snack", "pre_workout", "post_workout"],
  afternoon: ["snack", "lunch", "pre_workout", "post_workout"],
  evening: ["dinner", "snack", "pre_workout", "post_workout"],
  late: ["snack", "dinner", "post_workout"],
};

/** Share of a candidate's history that falls in slots compatible with now (1 when no history). */
export function slotCompatibility(slots: Partial<Record<MealSlot, number>>, period: Period) {
  const total = Object.values(slots).reduce((s, n) => s + (n ?? 0), 0);
  if (!total) return 1;
  const ok = COMPATIBLE_SLOTS[period].reduce((s, slot) => s + (slots[slot] ?? 0), 0);
  return ok / total;
}

const MACROS = ["protein_g", "carbs_g", "fat_g"] as const;
type Macro = (typeof MACROS)[number];

export type Mode = "gaps" | "protein_density";

export type Scored = {
  candidate: Candidate;
  score: number;
  mode: Mode;
  reason: string;
  after: Remaining;
};

export function isKjTight(remaining: Remaining, targets: DayTargets) {
  return remaining.energy_kj < Math.max(1500, 0.25 * targets.energy_kj);
}

/**
 * Macro weights from each gap's share of its target, squared so the
 * proportionally largest gap dominates the score.
 */
export function gapWeights(remaining: Remaining, targets: DayTargets, window?: FuelWindowKind | null) {
  const frac = Object.fromEntries(MACROS.map((m) => [m, Math.max(0, remaining[m]) / Math.max(targets[m], 1)])) as Record<Macro, number>;
  if (window === "pre_meal" || window === "pre_snack" || window === "during") frac.carbs_g *= 2.5;
  if (window === "post") {
    frac.protein_g *= 1.5;
    frac.carbs_g *= 1.5;
  }
  const sum = MACROS.reduce((s, m) => s + frac[m] ** 2, 0);
  const weights = Object.fromEntries(MACROS.map((m) => [m, sum ? frac[m] ** 2 / sum : 1 / 3])) as Record<Macro, number>;
  const largest = MACROS.reduce((a, b) => (frac[b] > frac[a] ? b : a));
  return { weights, largest, frac };
}

export function scoreCandidate(
  c: Candidate,
  remaining: Remaining,
  targets: DayTargets,
  ctx: { period: Period; window?: FuelWindowKind | null; maxCount?: number },
): Scored | null {
  const kj = c.nutrients.energy_kj;
  if (kj == null || kj <= 0) return null;

  const compat = slotCompatibility(c.slots, ctx.period);
  if (compat < 0.2) return null; // e.g. dinner-type food at 7am

  const v = (m: Macro) => c.nutrients[m] ?? 0;
  const { weights, largest } = gapWeights(remaining, targets, ctx.window);
  const kjOver = Math.max(0, kj - Math.max(0, remaining.energy_kj)) / targets.energy_kj;
  const after: Remaining = {
    energy_kj: remaining.energy_kj - kj,
    protein_g: remaining.protein_g - v("protein_g"),
    carbs_g: remaining.carbs_g - v("carbs_g"),
    fat_g: remaining.fat_g - v("fat_g"),
  };
  // Frequency is a tie-breaker, not a driver.
  const freq = 0.08 * (Math.log(1 + c.count) / Math.log(1 + Math.max(ctx.maxCount ?? c.count, 1)));
  const timeFactor = 0.5 + 0.5 * compat;

  // Protein is the biggest gap and kJ are tight → protein per 100 kJ.
  if (largest === "protein_g" && remaining.protein_g > 0 && isKjTight(remaining, targets)) {
    const density = v("protein_g") / (kj / 100);
    const score = (density / 5 - 3 * kjOver + freq) * timeFactor;
    return { candidate: c, score, mode: "protein_density", reason: `${density.toFixed(1)} g protein per 100 kJ`, after };
  }

  // How much of a meal-sized share of each gap one serve closes (so a big
  // afternoon carb gap doesn't make every single serve look negligible).
  let closing = 0;
  let macroOver = 0;
  for (const m of MACROS) {
    const gap = Math.max(0, remaining[m]);
    const mealShare = Math.max(1, Math.min(gap, targets[m] / 3));
    closing += weights[m] * (gap > 0 ? Math.min(v(m), mealShare) / mealShare : 0);
    macroOver += Math.max(0, v(m) - gap) / Math.max(targets[m], 1);
  }
  let score = closing - 0.5 * macroOver - 3 * kjOver + freq;
  const preWindow = ctx.window === "pre_meal" || ctx.window === "pre_snack" || ctx.window === "during";
  if (preWindow) {
    score -= 0.01 * v("fat_g") + 0.01 * (c.nutrients.fibre_g ?? 0);
    if (v("carbs_g") < 10) score -= 0.3; // not useful fuel before a session
  }
  score *= timeFactor;

  // Explain with the macro this serve contributes most to (weighted by need).
  const labels = { protein_g: "protein", carbs_g: "carbs", fat_g: "fat" } as const;
  const best = MACROS.reduce((a, b) =>
    weights[b] * Math.min(v(b), Math.max(0, remaining[b])) > weights[a] * Math.min(v(a), Math.max(0, remaining[a])) ? b : a,
  );
  const left = Math.max(0, remaining[best]);
  const share = left > 0 ? Math.round((Math.min(v(best), left) / left) * 100) : 0;
  const reason =
    preWindow && v("carbs_g") >= 10
      ? `${Math.round(v("carbs_g"))} g carbs for your session`
      : ctx.window === "post" && v("protein_g") >= 10
        ? `${Math.round(v("protein_g"))} g protein for recovery`
        : share > 0
          ? `${Math.round(v(best))} g ${labels[best]} · ${share}% of what's left`
          : "Fits your remaining kJ";
  return { candidate: c, score, mode: "gaps", reason, after };
}

export function recommend(
  candidates: Candidate[],
  remaining: Remaining,
  targets: DayTargets,
  ctx: { period: Period; window?: FuelWindowKind | null },
  limit = 5,
): Scored[] {
  const maxCount = Math.max(1, ...candidates.map((c) => c.count));
  return candidates
    .map((c) => scoreCandidate(c, remaining, targets, { ...ctx, maxCount }))
    .filter((s): s is Scored => s !== null && s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
