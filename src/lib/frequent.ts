import type { Nutrients } from "./nutrients";
import { scaleNutrients } from "./nutrients";
import type { LogEntry, LogKind, MealSlot } from "./types";

export type FrequentFood = {
  key: string;
  kind: LogKind;
  food_id: string | null;
  name: string;
  count: number;
  lastGrams: number | null;
  lastDate: string;
  /** Per 100 g, derived from the most recent snapshot. */
  per100: Nutrients;
  /** Nutrients of the most recent serving (used for quick re-log). */
  lastNutrients: Nutrients;
  slots: Partial<Record<MealSlot, number>>;
};

export function entryKey(e: Pick<LogEntry, "kind" | "reference_food_id" | "custom_food_id" | "recipe_id" | "name">) {
  const id = e.reference_food_id ?? e.custom_food_id ?? e.recipe_id;
  return id ? `${e.kind}:${id}` : `${e.kind}:name:${e.name.toLowerCase()}`;
}

/** Rank foods this user has logged by frequency (ties → most recent). Quick adds are excluded. */
export function rankFrequentFoods(entries: LogEntry[], limit = 30): FrequentFood[] {
  const map = new Map<string, FrequentFood>();
  const sorted = [...entries].sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
  for (const e of sorted) {
    if (e.kind === "quick") continue;
    const key = entryKey(e);
    let f = map.get(key);
    if (!f) {
      const per100: Nutrients = {};
      if (e.grams && e.grams > 0) Object.assign(per100, scaleNutrients(e.nutrients, 10000 / e.grams));
      f = {
        key,
        kind: e.kind,
        food_id: e.reference_food_id ?? e.custom_food_id ?? e.recipe_id,
        name: e.name,
        count: 0,
        lastGrams: e.grams,
        lastDate: e.date,
        per100,
        lastNutrients: e.nutrients,
        slots: {},
      };
      map.set(key, f);
    }
    f.count++;
    f.slots[e.slot] = (f.slots[e.slot] ?? 0) + 1;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : -1)).slice(0, limit);
}
