import { addDays, parseDate } from "../dates";
import type { HabitEntry, HabitStatus } from "./types";

/**
 * History goes over the wire (and into the offline cache) packed: per habit, a flat list of
 * [days since `base`, count, status] triples. About an eighth of the size of the plain objects.
 */
export type PackedEntries = { base: string; byHabit: Record<string, number[]> };

const STATUS: HabitStatus[] = ["done", "skipped", "slip"];
const DAY = 86_400_000;

export function packEntries(entries: HabitEntry[], base: string): PackedEntries {
  const t0 = parseDate(base).getTime();
  const byHabit: Record<string, number[]> = {};
  for (const e of entries) {
    (byHabit[e.habit_id] ??= []).push(Math.round((parseDate(e.date).getTime() - t0) / DAY), e.count, STATUS.indexOf(e.status));
  }
  return { base, byHabit };
}

export function unpackEntries(p: PackedEntries): HabitEntry[] {
  const dates = new Map<number, string>();
  const dateOf = (n: number) => {
    let d = dates.get(n);
    if (!d) dates.set(n, (d = addDays(p.base, n)));
    return d;
  };
  const out: HabitEntry[] = [];
  for (const [habit_id, v] of Object.entries(p.byHabit))
    for (let i = 0; i < v.length; i += 3) out.push({ habit_id, date: dateOf(v[i]), count: v[i + 1], status: STATUS[v[i + 2]] });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
