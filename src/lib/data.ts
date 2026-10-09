/**
 * Client-side data access: server actions plus a few pure helpers. All
 * queries run on the server against the profile this device has chosen.
 */
export {
  addEntries,
  copyEntries,
  deleteEntries,
  fetchLog,
  fetchLogRange,
  fetchRecentMeals,
  getDay,
  updateEntry,
  addWater,
  setDayType,
} from "@/server/actions/log";
export {
  deleteCustomFood,
  deleteRecipe,
  deleteSavedMeal,
  fetchCustomFoods,
  fetchFood,
  fetchRecipes,
  fetchSavedMeals,
  lookupBarcode,
  saveCustomFood,
  saveMeal,
  saveRecipe,
  type CustomFoodInput,
} from "@/server/actions/foods";
export type { NewEntry } from "@/server/repo";

import { pickNutrients } from "./nutrients";
import type { NewEntry } from "@/server/repo";
import type { Food, LogEntry, MealSlot, SavedMeal } from "./types";

export async function searchFoods(q: string, signal?: AbortSignal): Promise<Food[]> {
  const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error("Search failed");
  return (await res.json()).foods;
}

export function entryToNew(e: LogEntry, overrides: Partial<NewEntry> = {}): NewEntry {
  return {
    date: e.date,
    slot: e.slot,
    kind: e.kind,
    food_id: e.reference_food_id ?? e.custom_food_id ?? e.recipe_id,
    name: e.name,
    grams: e.grams,
    nutrients: e.nutrients,
    ...overrides,
  };
}

export function savedMealToEntries(meal: Pick<SavedMeal, "items">, date: string, slot: MealSlot): NewEntry[] {
  return meal.items.map((i) => ({
    date,
    slot,
    kind: i.kind,
    food_id: i.food_id,
    name: i.name,
    grams: i.grams,
    nutrients: pickNutrients(i.nutrients as Record<string, unknown>),
  }));
}
