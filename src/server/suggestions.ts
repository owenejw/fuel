import "server-only";
import { addDays } from "@/lib/dates";
import { rankFrequentFoods } from "@/lib/frequent";
import { activeWindow, type FuelItem } from "@/lib/fuelling";
import { NUTRIENTS, sumNutrients, type NutrientKey } from "@/lib/nutrients";
import { periodForTime, recommend, type Candidate, type Remaining, type Scored } from "@/lib/recommend";
import { rowToFood } from "@/lib/foods/shared";
import type { Food } from "@/lib/types";
import { db } from "./db";
import { getDayBundle, getLog, getSavedMeals } from "./repo";
import { weeklyMicros } from "./micros";

export type MicroSuggestion = { nutrient: NutrientKey; label: string; food: Food; per100: number; unit: string };

export type Suggestions = {
  remaining: Remaining;
  window: FuelItem | null;
  items: Scored[];
  micro: MicroSuggestion[];
  flagged: NutrientKey[];
};

/** Build candidates from this profile's own last 60 days of logs and saved meals. */
export async function candidatesFor(pid: string, date: string): Promise<Candidate[]> {
  const [history, meals] = await Promise.all([getLog(pid, addDays(date, -60), date), getSavedMeals(pid)]);
  const foods: Candidate[] = rankFrequentFoods(history, 60).map((f) => ({
    key: f.key,
    kind: f.kind,
    food_id: f.food_id,
    name: f.name,
    grams: f.lastGrams,
    nutrients: f.lastNutrients,
    count: f.count,
    slots: f.slots,
  }));
  const mealCands: Candidate[] = meals.map((m) => ({
    key: `meal:${m.id}`,
    kind: "meal",
    food_id: m.id,
    name: m.name,
    grams: null,
    nutrients: sumNutrients(m.items.map((i) => i.nutrients)).totals,
    count: 1,
    slots: {},
    items: m.items,
  }));
  return [...foods, ...mealCands];
}

export async function getSuggestions(pid: string, date: string, nowMin: number): Promise<Suggestions> {
  const [bundle, candidates, micro] = await Promise.all([getDayBundle(pid, date), candidatesFor(pid, date), weeklyMicros(pid, date)]);
  const eaten = sumNutrients(bundle.entries.map((e) => e.nutrients)).totals;
  const t = bundle.plan.targets;
  const remaining: Remaining = {
    energy_kj: t.energy_kj - (eaten.energy_kj ?? 0),
    protein_g: t.protein_g - (eaten.protein_g ?? 0),
    carbs_g: t.carbs_g - (eaten.carbs_g ?? 0),
    fat_g: t.fat_g - (eaten.fat_g ?? 0),
  };
  const window = activeWindow(bundle.fuelling, nowMin);
  const items = recommend(candidates, remaining, t, { period: periodForTime(nowMin), window: window?.kind ?? null }, 5);

  // 1–2 never-logged foods that close a flagged micronutrient gap.
  const flagged = micro.status.filter((s) => s.flagged).map((s) => s.key);
  const loggedIds = new Set(candidates.map((c) => c.food_id).filter(Boolean));
  const microSuggestions: MicroSuggestion[] = [];
  for (const key of flagged.slice(0, 2)) {
    const target = micro.nrv[key]?.target ?? 0;
    const rows = await (
      await db()
    ).query(
      `select * from reference_foods
       where source = 'afcd' and ${key} >= $1 and energy_kj between 40 and 1500
         and name !~* '(powder|dried, ground|supplement|extract|fortified, as purchased|raw, flesh and skin|baby|infant)'
       order by ${key} / energy_kj desc limit 15`,
      [target * 0.15],
    );
    const pick = rows
      .map((r) => rowToFood(r, "reference"))
      .find((f) => !loggedIds.has(f.id) && !microSuggestions.some((m) => m.food.id === f.id));
    if (pick) {
      const def = NUTRIENTS.find((n) => n.key === key)!;
      microSuggestions.push({ nutrient: key, label: def.label, food: pick, per100: pick.per100[key] ?? 0, unit: def.unit });
    }
  }

  return { remaining, window, items, micro: microSuggestions, flagged };
}
