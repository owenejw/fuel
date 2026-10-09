"use server";

import { z } from "zod";
import { NUTRIENT_KEYS, sumNutrients, type Nutrients } from "@/lib/nutrients";
import { rowToFood } from "@/lib/foods/shared";
import { getFood, lookupBarcode as lookup } from "@/lib/foods/server";
import type { Food, LogEntry, Recipe, SavedMeal, SavedMealItem } from "@/lib/types";
import { db, json } from "../db";
import { getRecipes, getSavedMeals, recipeToFood, toRecipe } from "../repo";
import { isUuid, requireProfileId } from "../session";

export async function fetchFood(kind: Food["kind"], id: string): Promise<Food | null> {
  await requireProfileId();
  if (!isUuid(id)) return null;
  return getFood(z.enum(["reference", "custom", "recipe"]).parse(kind), id);
}

export async function lookupBarcode(code: string): Promise<Food | null> {
  await requireProfileId();
  return lookup(
    z
      .string()
      .regex(/^\d{8,14}$/)
      .parse(code),
  );
}

// ---------------------------------------------------------------------------
// Custom foods (shared with the household)
// ---------------------------------------------------------------------------

export async function fetchCustomFoods(): Promise<Food[]> {
  await requireProfileId();
  return (await (await db()).query(`select * from custom_foods order by name`)).map((r) => rowToFood(r, "custom"));
}

const nutrientShape = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, z.number().min(0).max(100000).nullable().optional()]));
const CustomFood = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(100).nullable(),
  barcode: z
    .string()
    .regex(/^\d{6,14}$/)
    .nullable(),
  serve_size_g: z.number().positive().max(10000).nullable(),
  serve_label: z.string().max(60).nullable(),
  ...nutrientShape,
});
export type CustomFoodInput = z.infer<typeof CustomFood>;

export async function saveCustomFood(input: CustomFoodInput, id?: string): Promise<Food> {
  const pid = await requireProfileId();
  const f = CustomFood.parse(input);
  const cols = ["name", "brand", "barcode", "serve_size_g", "serve_label", ...NUTRIENT_KEYS];
  const values = cols.map((c) => (f as Record<string, unknown>)[c] ?? null);
  const d = await db();
  const rows = id
    ? await d.query(`update custom_foods set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1 returning *`, [
        id,
        ...values,
      ])
    : await d.query(
        `insert into custom_foods (profile_id, ${cols.join(", ")}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) returning *`,
        [pid, ...values],
      );
  if (!rows[0]) throw new Error("Food not found");
  return rowToFood(rows[0], "custom");
}

export async function deleteCustomFood(id: string) {
  await requireProfileId();
  await (await db()).query(`delete from custom_foods where id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Recipes (shared with the household)
// ---------------------------------------------------------------------------

export async function fetchRecipes(): Promise<Recipe[]> {
  await requireProfileId();
  return getRecipes();
}

const Item = z.object({
  kind: z.enum(["reference", "custom", "recipe", "quick"]),
  food_id: z.string().nullable(),
  name: z.string().max(200),
  grams: z.number().positive().nullable(),
  nutrients: z.record(z.string(), z.number().nullable()),
});

export async function saveRecipe(input: { name: string; servings: number; ingredients: SavedMealItem[] }, id?: string): Promise<Food> {
  const pid = await requireProfileId();
  const r = z
    .object({
      name: z.string().trim().min(1).max(200),
      servings: z.number().positive().max(100),
      ingredients: z.array(Item).min(1).max(100),
    })
    .parse(input);
  const total = sumNutrients(r.ingredients.map((i) => i.nutrients as Nutrients)).totals;
  const nutrients = Object.fromEntries(Object.entries(total).filter(([, v]) => v !== null));
  const grams = r.ingredients.reduce((s, i) => s + (i.grams ?? 0), 0);
  if (grams <= 0) throw new Error("Add ingredient amounts in grams");
  const d = await db();
  const rows = id
    ? await d.query(
        `update recipes set name=$2, servings=$3, ingredients=$4::jsonb, total_grams=$5, nutrients=$6::jsonb where id=$1 returning *`,
        [id, r.name, r.servings, json(r.ingredients), grams, json(nutrients)],
      )
    : await d.query(
        `insert into recipes (profile_id, name, servings, ingredients, total_grams, nutrients) values ($1,$2,$3,$4::jsonb,$5,$6::jsonb) returning *`,
        [pid, r.name, r.servings, json(r.ingredients), grams, json(nutrients)],
      );
  return recipeToFood(toRecipe(rows[0]));
}

export async function deleteRecipe(id: string) {
  await requireProfileId();
  await (await db()).query(`delete from recipes where id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Saved meals (per profile)
// ---------------------------------------------------------------------------

export async function fetchSavedMeals(): Promise<SavedMeal[]> {
  return getSavedMeals(await requireProfileId());
}

export async function saveMeal(name: string, entries: LogEntry[]) {
  const pid = await requireProfileId();
  const items: SavedMealItem[] = entries.map((e) => ({
    kind: e.kind,
    food_id: e.reference_food_id ?? e.custom_food_id ?? e.recipe_id,
    name: e.name,
    grams: e.grams,
    nutrients: e.nutrients,
  }));
  await (
    await db()
  ).query(`insert into meals_saved (profile_id, name, items) values ($1, $2, $3::jsonb)`, [
    pid,
    z.string().trim().min(1).max(100).parse(name),
    json(z.array(Item).parse(items)),
  ]);
}

export async function deleteSavedMeal(id: string) {
  const pid = await requireProfileId();
  await (await db()).query(`delete from meals_saved where id = $1 and profile_id = $2`, [id, pid]);
}
