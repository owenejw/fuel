/**
 * Client-side data access. Everything goes through the browser Supabase
 * client, so Row Level Security limits every query to the signed-in user.
 */
import { supabaseBrowser } from "./supabase/client";
import { addDays, nowTime } from "./dates";
import { pickNutrients, type Nutrients } from "./nutrients";
import { rowToFood } from "./foods/shared";
import type { DayTargets, Food, Goal, LogEntry, LogKind, MealSlot, Profile, SavedMeal, SavedMealItem } from "./types";

const sb = () => supabaseBrowser();

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function fetchProfile(): Promise<Profile | null> {
  const data = check(await sb().from("profiles").select("*").maybeSingle());
  if (!data) return null;
  return { ...data, height_cm: data.height_cm == null ? null : Number(data.height_cm) } as Profile;
}

export async function saveProfile(p: Profile) {
  check(await sb().from("profiles").upsert(p, { onConflict: "user_id" }).select().single());
}

// ---------------------------------------------------------------------------
// Log entries
// ---------------------------------------------------------------------------

function toEntry(row: Record<string, unknown>): LogEntry {
  return {
    ...(row as unknown as LogEntry),
    grams: row.grams == null ? null : Number(row.grams),
    nutrients: pickNutrients((row.nutrients as Record<string, unknown>) ?? {}),
  };
}

const ENTRY_COLS = "id,date,time,slot,kind,reference_food_id,custom_food_id,recipe_id,name,grams,nutrients,created_at";

export async function fetchLog(date: string): Promise<LogEntry[]> {
  const data = check(await sb().from("log_entries").select(ENTRY_COLS).eq("date", date).order("time").order("created_at"));
  return (data ?? []).map(toEntry);
}

export async function fetchLogRange(from: string, to: string): Promise<LogEntry[]> {
  const data = check(
    await sb().from("log_entries").select(ENTRY_COLS).gte("date", from).lte("date", to).order("date").order("time").limit(5000),
  );
  return (data ?? []).map(toEntry);
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

function entryRow(e: NewEntry) {
  const id = e.food_id && UUID.test(e.food_id) ? e.food_id : null;
  return {
    date: e.date,
    time: e.time ?? nowTime(),
    slot: e.slot,
    kind: e.kind,
    reference_food_id: e.kind === "reference" ? id : null,
    custom_food_id: e.kind === "custom" ? id : null,
    recipe_id: e.kind === "recipe" ? id : null,
    name: e.name,
    grams: e.kind === "quick" ? null : e.grams,
    nutrients: e.nutrients,
  };
}

export async function addEntries(entries: NewEntry[]): Promise<LogEntry[]> {
  if (!entries.length) return [];
  const data = check(await sb().from("log_entries").insert(entries.map(entryRow)).select(ENTRY_COLS));
  return (data ?? []).map(toEntry);
}

export async function updateEntry(id: string, patch: Partial<Pick<LogEntry, "slot" | "date" | "grams" | "nutrients" | "name">>) {
  const data = check(await sb().from("log_entries").update(patch).eq("id", id).select(ENTRY_COLS).single());
  return toEntry(data as Record<string, unknown>);
}

export async function deleteEntries(ids: string[]) {
  check(await sb().from("log_entries").delete().in("id", ids));
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

/** Copy every entry (or one slot) from one day to another. */
export async function copyEntries(fromDate: string, toDate: string, opts: { fromSlot?: MealSlot; toSlot?: MealSlot } = {}) {
  let entries = await fetchLog(fromDate);
  if (opts.fromSlot) entries = entries.filter((e) => e.slot === opts.fromSlot);
  return addEntries(entries.map((e) => entryToNew(e, { date: toDate, slot: opts.toSlot ?? e.slot, time: undefined })));
}

/** Previous days' meals in a slot, newest first, for "copy a previous meal". */
export async function fetchRecentMeals(beforeDate: string, slot: MealSlot, days = 14) {
  const entries = (await fetchLogRange(addDays(beforeDate, -days), addDays(beforeDate, -1))).filter((e) => e.slot === slot);
  const byDate = new Map<string, LogEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, items]) => ({ date, items }));
}

// ---------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------

export async function searchFoods(q: string, signal?: AbortSignal): Promise<Food[]> {
  const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error("Search failed");
  return (await res.json()).foods;
}

export async function lookupBarcode(code: string): Promise<Food | null> {
  const res = await fetch(`/api/foods/barcode/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(res.status === 400 ? "That doesn't look like a product barcode" : "Barcode lookup failed");
  return (await res.json()).food;
}

export async function fetchFood(kind: "reference" | "custom", id: string): Promise<Food | null> {
  const table = kind === "custom" ? "custom_foods" : "reference_foods";
  const data = check(await sb().from(table).select("*").eq("id", id).maybeSingle());
  return data ? rowToFood(data, kind) : null;
}

export async function fetchCustomFoods(): Promise<Food[]> {
  const data = check(await sb().from("custom_foods").select("*").order("name"));
  return (data ?? []).map((r) => rowToFood(r, "custom"));
}

export type CustomFoodInput = {
  name: string;
  brand: string | null;
  barcode: string | null;
  serve_size_g: number | null;
  serve_label: string | null;
} & Nutrients;

export async function saveCustomFood(input: CustomFoodInput, id?: string): Promise<Food> {
  const q = id ? sb().from("custom_foods").update(input).eq("id", id) : sb().from("custom_foods").insert(input);
  return rowToFood(check(await q.select().single()) as Record<string, unknown>, "custom");
}

export async function deleteCustomFood(id: string) {
  check(await sb().from("custom_foods").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Saved meals
// ---------------------------------------------------------------------------

export async function fetchSavedMeals(): Promise<SavedMeal[]> {
  const data = check(await sb().from("meals_saved").select("*").order("name"));
  return (data ?? []) as SavedMeal[];
}

export async function saveMeal(name: string, entries: LogEntry[]) {
  const items: SavedMealItem[] = entries.map((e) => ({
    kind: e.kind,
    food_id: e.reference_food_id ?? e.custom_food_id ?? e.recipe_id,
    name: e.name,
    grams: e.grams,
    nutrients: e.nutrients,
  }));
  check(await sb().from("meals_saved").insert({ name, items }));
}

export async function deleteSavedMeal(id: string) {
  check(await sb().from("meals_saved").delete().eq("id", id));
}

export function savedMealToEntries(meal: SavedMeal, date: string, slot: MealSlot): NewEntry[] {
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

// ---------------------------------------------------------------------------
// Goals / targets
// ---------------------------------------------------------------------------

/** Placeholder targets until the user sets goals (Phase 2 calculates them). */
export const DEFAULT_TARGETS: DayTargets = { energy_kj: 8700, protein_g: 120, carbs_g: 250, fat_g: 70, fibre_g: 30 };

export async function fetchGoalFor(date: string): Promise<Goal | null> {
  const data = check(
    await sb().from("goals").select("*").lte("effective_date", date).order("effective_date", { ascending: false }).limit(1),
  );
  if (!data?.length) return null;
  const g = data[0] as Record<string, unknown>;
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, k.endsWith("_g") || k.endsWith("_kj") ? Number(v) : v])) as Goal;
}

export async function isTrainingDay(date: string): Promise<boolean> {
  const data = check(await sb().from("workouts").select("type").eq("date", date));
  return (data ?? []).some((w) => w.type !== "rest");
}

export function targetsFromGoal(goal: Goal | null, training: boolean): DayTargets {
  if (!goal) return DEFAULT_TARGETS;
  const p = training ? "training" : "rest";
  return {
    energy_kj: goal[`${p}_kj`],
    protein_g: goal[`${p}_protein_g`],
    carbs_g: goal[`${p}_carbs_g`],
    fat_g: goal[`${p}_fat_g`],
    fibre_g: goal[`${p}_fibre_g`],
  };
}

export async function saveGoal(userId: string, goal: Omit<Goal, "id">) {
  check(
    await sb()
      .from("goals")
      .upsert({ ...goal, user_id: userId }, { onConflict: "user_id,effective_date" })
      .select()
      .single(),
  );
}
