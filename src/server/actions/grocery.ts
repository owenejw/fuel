"use server";

import { z } from "zod";
import { addDays, today } from "@/lib/dates";
import { rankFrequentFoods } from "@/lib/frequent";
import { db } from "../db";
import { getLog } from "../repo";
import { getSuggestions } from "../suggestions";
import { requireProfileId } from "../session";

export type GroceryItem = { id: string; name: string; reason: string | null; checked: boolean };

export async function fetchGrocery(): Promise<GroceryItem[]> {
  const pid = await requireProfileId();
  return (await db()).query(`select id, name, reason, checked from grocery_items where profile_id = $1 order by checked, created_at`, [
    pid,
  ]);
}

/** Staples from the last 14 days plus foods that close micronutrient gaps. Keeps existing items. */
export async function generateGrocery(): Promise<GroceryItem[]> {
  const pid = await requireProfileId();
  const t = today();
  const staples = rankFrequentFoods(await getLog(pid, addDays(t, -14), t), 20).filter((f) => f.count >= 2 && f.kind !== "quick");
  const now = new Date();
  const suggestions = await getSuggestions(pid, t, now.getHours() * 60 + now.getMinutes());
  const items = [
    ...staples.map((f) => ({ name: f.name.replace(/\s*\(.*\)$/, ""), reason: `Eaten ${f.count}× in 2 weeks` })),
    ...suggestions.micro.map((m) => ({ name: m.food.name, reason: `Boosts ${m.label.toLowerCase()}` })),
  ];
  const d = await db();
  for (const i of items) {
    await d.query(
      `insert into grocery_items (profile_id, name, reason) values ($1, $2, $3) on conflict (profile_id, name) do update set reason = excluded.reason`,
      [pid, i.name.slice(0, 200), i.reason],
    );
  }
  return fetchGrocery();
}

export async function addGroceryItem(name: string) {
  const pid = await requireProfileId();
  await (
    await db()
  ).query(`insert into grocery_items (profile_id, name) values ($1, $2) on conflict do nothing`, [
    pid,
    z.string().trim().min(1).max(200).parse(name),
  ]);
}

export async function toggleGrocery(id: string, checked: boolean) {
  const pid = await requireProfileId();
  await (await db()).query(`update grocery_items set checked = $3 where id = $1 and profile_id = $2`, [id, pid, checked]);
}

export async function clearCheckedGrocery() {
  const pid = await requireProfileId();
  await (await db()).query(`delete from grocery_items where profile_id = $1 and checked`, [pid]);
}
