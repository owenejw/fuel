"use server";

import { z } from "zod";
import { addDays, isValidDate } from "@/lib/dates";
import { MEAL_SLOTS, type LogEntry, type MealSlot } from "@/lib/types";
import { db, json } from "../db";
import { getDayBundle, getLog, insertEntries, toEntry, type DayBundle, type NewEntry } from "../repo";
import { isUuid, requireProfileId } from "../session";

const date = z.string().refine(isValidDate, "Invalid date");
const slot = z.enum(MEAL_SLOTS);

const Entry = z.object({
  date,
  slot,
  kind: z.enum(["reference", "custom", "recipe", "quick"]),
  food_id: z.string().nullish(),
  name: z.string().min(1).max(200),
  grams: z.number().positive().max(10000).nullable(),
  nutrients: z.record(z.string(), z.number().nullable()),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
});

export async function getDay(d: string): Promise<DayBundle> {
  return getDayBundle(await requireProfileId(), date.parse(d));
}

export async function fetchLog(d: string): Promise<LogEntry[]> {
  return getLog(await requireProfileId(), date.parse(d));
}

export async function fetchLogRange(from: string, to: string): Promise<LogEntry[]> {
  return getLog(await requireProfileId(), date.parse(from), date.parse(to));
}

export async function addEntries(entries: NewEntry[]): Promise<LogEntry[]> {
  const pid = await requireProfileId();
  const parsed = z.array(Entry).max(100).parse(entries);
  return insertEntries(pid, parsed.map((e) => ({ ...e, food_id: isUuid(e.food_id) ? e.food_id : null })) as NewEntry[]);
}

export async function updateEntry(id: string, patch: Partial<Pick<LogEntry, "slot" | "date" | "grams" | "nutrients" | "name">>) {
  const pid = await requireProfileId();
  const p = Entry.pick({ slot: true, date: true, grams: true, nutrients: true, name: true }).partial().parse(patch);
  const rows = await (
    await db()
  ).query(
    `update log_entries set
       slot = coalesce($3::meal_slot, slot), date = coalesce($4::date, date),
       grams = case when $5::boolean then $6::numeric else grams end,
       nutrients = coalesce($7::jsonb, nutrients), name = coalesce($8, name)
     where id = $1 and profile_id = $2
     returning id, date, time, slot, kind, reference_food_id, custom_food_id, recipe_id, name, grams, nutrients, created_at`,
    [id, pid, p.slot ?? null, p.date ?? null, "grams" in p, p.grams ?? null, p.nutrients ? json(p.nutrients) : null, p.name ?? null],
  );
  if (!rows[0]) throw new Error("Entry not found");
  return toEntry(rows[0]);
}

export async function deleteEntries(ids: string[]) {
  const pid = await requireProfileId();
  await (
    await db()
  ).query(`delete from log_entries where profile_id = $1 and id in (select (jsonb_array_elements_text($2::jsonb))::uuid)`, [
    pid,
    json(ids.filter(isUuid)),
  ]);
}

/** Copy a whole day (or one meal) to another day. */
export async function copyEntries(fromDate: string, toDate: string, opts: { fromSlot?: MealSlot; toSlot?: MealSlot } = {}) {
  const pid = await requireProfileId();
  let entries = await getLog(pid, date.parse(fromDate));
  if (opts.fromSlot) entries = entries.filter((e) => e.slot === opts.fromSlot);
  return insertEntries(
    pid,
    entries.map((e) => ({
      date: date.parse(toDate),
      slot: opts.toSlot ?? e.slot,
      kind: e.kind,
      food_id: e.reference_food_id ?? e.custom_food_id ?? e.recipe_id,
      name: e.name,
      grams: e.grams,
      nutrients: e.nutrients,
    })),
  );
}

/** Previous days' meals in a slot (newest first) for "copy a previous meal". */
export async function fetchRecentMeals(beforeDate: string, s: MealSlot, days = 14) {
  const pid = await requireProfileId();
  const d = date.parse(beforeDate);
  const entries = (await getLog(pid, addDays(d, -days), addDays(d, -1))).filter((e) => e.slot === slot.parse(s));
  const byDate = new Map<string, LogEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([d2, items]) => ({ date: d2, items }));
}

// ---------------------------------------------------------------------------
// Water and day type
// ---------------------------------------------------------------------------

export async function addWater(d: string, ml: number) {
  const pid = await requireProfileId();
  const amount = z.number().int().min(-5000).max(5000).parse(ml);
  await (await db()).query(`insert into water_logs (profile_id, date, ml) values ($1, $2, $3)`, [pid, date.parse(d), amount]);
  const rows = await (
    await db()
  ).query<{ ml: number }>(`select coalesce(sum(ml), 0)::int as ml from water_logs where profile_id = $1 and date = $2`, [pid, d]);
  return Math.max(0, Number(rows[0].ml));
}

/** Manually mark a day as training or rest (null = automatic from workouts). */
export async function setDayType(d: string, type: "training" | "rest" | null) {
  const pid = await requireProfileId();
  const dd = date.parse(d);
  if (type === null) await (await db()).query(`delete from day_types where profile_id = $1 and date = $2`, [pid, dd]);
  else
    await (
      await db()
    ).query(
      `insert into day_types (profile_id, date, type) values ($1, $2, $3) on conflict (profile_id, date) do update set type = excluded.type`,
      [pid, dd, z.enum(["training", "rest"]).parse(type)],
    );
}
