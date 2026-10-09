/**
 * Energy expenditure and macro targets.
 *
 * - BMR: Mifflin-St Jeor.
 * - TDEE: BMR × activity factor.
 * - Targets: goal adjustment, protein constant (g/kg), fat constant (share of
 *   energy), carbs flex between training and rest days so the weekly average
 *   matches the goal.
 */
import { KJ_PER_KCAL } from "./energy";
import type { ActivityLevel, DayTargets, GoalType, Sex } from "./types";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

/** Fraction of TDEE added (surplus) or removed (deficit) per goal. */
export const GOAL_ADJUSTMENT: Record<GoalType, number> = {
  cut: -0.2,
  recomp: -0.1,
  maintain: 0,
  bulk: 0.1,
};

/** FSANZ energy factors, kJ per gram. */
export const KJ_PER_G = { protein: 17, fat: 37, carbs: 16, fibre: 8 } as const;

export const PROTEIN_G_PER_KG = { default: 2.0, min: 1.6, max: 2.2 } as const;

/** Mifflin-St Jeor BMR in kcal/day. */
export function bmrKcal({ sex, weightKg, heightCm, age }: { sex: Sex; weightKg: number; heightCm: number; age: number }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

export function tdeeKj(input: { sex: Sex; weightKg: number; heightCm: number; age: number; activity: ActivityLevel }) {
  return bmrKcal(input) * ACTIVITY_FACTORS[input.activity] * KJ_PER_KCAL;
}

export type TargetPlan = {
  /** Average daily energy target across the week. */
  averageKj: number;
  training: DayTargets;
  rest: DayTargets;
  proteinRange: [number, number];
};

/**
 * Training/rest targets. Training days get `carbSwing` more energy (as
 * carbs); rest days get less so the 7-day average equals the goal energy.
 */
export function macroTargets({
  tdeeKj: tdee,
  goal,
  weightKg,
  sex,
  trainingDaysPerWeek = 4,
  proteinPerKg = PROTEIN_G_PER_KG.default,
  fatShare = 0.25,
  carbSwing = 0.1,
}: {
  tdeeKj: number;
  goal: GoalType;
  weightKg: number;
  sex: Sex | null;
  trainingDaysPerWeek?: number;
  proteinPerKg?: number;
  fatShare?: number;
  carbSwing?: number;
}): TargetPlan {
  const n = Math.min(7, Math.max(0, Math.round(trainingDaysPerWeek)));
  const averageKj = tdee * (1 + GOAL_ADJUSTMENT[goal]);
  const protein = Math.round(proteinPerKg * weightKg);
  const fat = Math.round((averageKj * fatShare) / KJ_PER_G.fat);
  const fibre = sex === "male" ? 30 : sex === "female" ? 25 : 28; // NHMRC adequate intake (adults)

  let trainingKj = averageKj;
  let restKj = averageKj;
  if (n > 0 && n < 7) {
    trainingKj = averageKj * (1 + carbSwing);
    restKj = averageKj - (carbSwing * averageKj * n) / (7 - n);
  }

  const day = (kj: number): DayTargets => ({
    energy_kj: Math.round(kj),
    protein_g: protein,
    fat_g: fat,
    carbs_g: Math.max(0, Math.round((kj - protein * KJ_PER_G.protein - fat * KJ_PER_G.fat) / KJ_PER_G.carbs)),
    fibre_g: fibre,
  });

  return {
    averageKj: Math.round(averageKj),
    training: day(trainingKj),
    rest: day(restKj),
    proteinRange: [Math.round(PROTEIN_G_PER_KG.min * weightKg), Math.round(PROTEIN_G_PER_KG.max * weightKg)],
  };
}

/**
 * Race carb loading: for the 1–2 days before a race, raise carbs to
 * `gPerKg` (7–10 g/kg; default 8) and add the extra carb energy.
 */
export function applyCarbLoading(t: DayTargets, weightKg: number, gPerKg = 8): DayTargets {
  const carbs = Math.round(gPerKg * weightKg);
  if (carbs <= t.carbs_g) return t;
  return { ...t, carbs_g: carbs, energy_kj: Math.round(t.energy_kj + (carbs - t.carbs_g) * KJ_PER_G.carbs) };
}
