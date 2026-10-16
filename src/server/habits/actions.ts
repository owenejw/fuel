"use server";

import { z } from "zod";
import { addDays, isValidDate } from "@/lib/dates";
import { packEntries } from "@/lib/habits/pack";
import { AUTO_SOURCES, HABIT_TIMES, type Habit, type HabitPrefs, type PackedHabitData } from "@/lib/habits/types";
import { db, json } from "../db";
import { requireProfileId } from "../session";
import { loadHabitData, toHabit } from "./store";

const DateStr = z.string().refine(isValidDate, "Invalid date");
const Time = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .nullable();
const Id = z.uuid();

const HabitInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    icon: z.string().min(1).max(30),
    color: z.string().min(1).max(20),
    kind: z.enum(["build", "break"]),
    target: z.number().int().min(1).max(100),
    unit: z.string().trim().max(20).nullable(),
    time_of_day: z.enum(HABIT_TIMES),
    schedule: z.enum(["daily", "weekdays", "per_week"]),
    weekdays: z.number().int().min(1).max(127),
    per_week: z.number().int().min(1).max(7),
    start_date: DateStr,
    end_date: DateStr.nullable(),
    reminder_time: Time,
    auto_source: z.enum(AUTO_SOURCES).nullable(),
  })
  .refine((h) => !h.end_date || h.end_date >= h.start_date, { message: "The end date is before the start date", path: ["end_date"] });

/** Everything the habits section shows, with history packed to keep the download small. */
export async function fetchHabitData(today: string): Promise<PackedHabitData> {
  const pid = await requireProfileId();
  const day = DateStr.parse(today);
  const data = await loadHabitData(pid, day);
  return { ...data, entries: packEntries(data.entries, data.entries[0]?.date ?? day) };
}

export async function saveHabit(input: z.input<typeof HabitInput>, id?: string): Promise<Habit> {
  const pid = await requireProfileId();
  const h = HabitInput.parse(input);
  // Habits to break are daily yes/no habits; auto habits are yes/no.
  if (h.kind === "break" || h.auto_source) {
    h.target = 1;
    h.unit = null;
  }
  if (h.kind === "break") {
    h.schedule = "daily";
    h.auto_source = null;
  }
  const values = [
    h.name,
    h.icon,
    h.color,
    h.kind,
    h.target,
    h.unit || null,
    h.time_of_day,
    h.schedule,
    h.weekdays,
    h.per_week,
    h.start_date,
    h.end_date,
    h.reminder_time,
    h.auto_source,
  ];
  const d = await db();
  const rows = id
    ? await d.query(
        `update habits set name = $1, icon = $2, color = $3, kind = $4, target = $5, unit = $6, time_of_day = $7, schedule = $8,
           weekdays = $9, per_week = $10, start_date = $11, end_date = $12, reminder_time = $13, auto_source = $14
         where id = $15 and profile_id = $16 returning *`,
        [...values, Id.parse(id), pid],
      )
    : await d.query(
        `insert into habits (profile_id, name, icon, color, kind, target, unit, time_of_day, schedule, weekdays, per_week, start_date,
           end_date, reminder_time, auto_source, position)
         values ($15, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           coalesce((select max(position) + 1 from habits where profile_id = $15), 0))
         returning *`,
        [...values, pid],
      );
  if (!rows[0]) throw new Error("Habit not found");
  return toHabit(rows[0]);
}

export async function setHabitArchived(id: string, archived: boolean) {
  const pid = await requireProfileId();
  await (
    await db()
  ).query(
    `update habits set archived_at = case when $3 then now() else null end, routine_id = case when $3 then null else routine_id end
     where id = $1 and profile_id = $2`,
    [Id.parse(id), pid, archived],
  );
}

export async function deleteHabit(id: string) {
  const pid = await requireProfileId();
  await (await db()).query(`delete from habits where id = $1 and profile_id = $2`, [Id.parse(id), pid]);
}

/** Saves the order of the given habits (first = top). */
export async function reorderHabits(ids: string[]) {
  const pid = await requireProfileId();
  const list = z.array(Id).max(500).parse(ids);
  await (
    await db()
  ).query(
    `update habits h set position = o.pos - 1 from jsonb_array_elements_text($1::jsonb) with ordinality as o(id, pos) where h.id = o.id::uuid and h.profile_id = $2`,
    [json(list), pid],
  );
}

const Entry = z.object({ status: z.enum(["done", "skipped", "slip"]), count: z.number().int().min(0).max(1000) });

/** Records what happened with a habit on a day; null clears it. */
export async function setHabitEntry(habitId: string, date: string, entry: z.input<typeof Entry> | null) {
  const pid = await requireProfileId();
  const d = await db();
  const hid = Id.parse(habitId);
  const day = DateStr.parse(date);
  if (!entry || (entry.status === "done" && entry.count === 0)) {
    await d.query(`delete from habit_entries where habit_id = $1 and date = $2 and profile_id = $3`, [hid, day, pid]);
    return;
  }
  const e = Entry.parse(entry);
  await d.query(
    `insert into habit_entries (habit_id, profile_id, date, count, status)
     select id, profile_id, $2, $3, $4 from habits where id = $1 and profile_id = $5
     on conflict (habit_id, date) do update set count = excluded.count, status = excluded.status, updated_at = now()`,
    [hid, day, e.count, e.status, pid],
  );
}

export async function saveHabitDay(date: string, patch: { note: string | null; mood: number | null }) {
  const pid = await requireProfileId();
  const day = DateStr.parse(date);
  const note = z.string().trim().max(140).nullable().parse(patch.note) || null;
  const mood = z.number().int().min(1).max(5).nullable().parse(patch.mood);
  const d = await db();
  if (!note && mood == null) {
    await d.query(`delete from habit_days where profile_id = $1 and date = $2`, [pid, day]);
    return;
  }
  await d.query(
    `insert into habit_days (profile_id, date, note, mood) values ($1, $2, $3, $4)
     on conflict (profile_id, date) do update set note = excluded.note, mood = excluded.mood`,
    [pid, day, note, mood],
  );
}

/** Vacation mode. Turning it off ends the pause yesterday, so today counts again. */
export async function setVacation(on: boolean, today: string, until: string | null = null) {
  const pid = await requireProfileId();
  const day = DateStr.parse(today);
  const end = until == null ? null : DateStr.parse(until);
  const d = await db();
  const active = await d.query<{ id: string; start_date: string }>(
    `select id, start_date from habit_pauses where profile_id = $1 and start_date <= $2 and (end_date is null or end_date >= $2)`,
    [pid, day],
  );
  if (on) {
    if (active[0]) await d.query(`update habit_pauses set end_date = $2 where id = $1`, [active[0].id, end]);
    else await d.query(`insert into habit_pauses (profile_id, start_date, end_date) values ($1, $2, $3)`, [pid, day, end]);
    return;
  }
  for (const p of active) {
    if (p.start_date >= day) await d.query(`delete from habit_pauses where id = $1`, [p.id]);
    else await d.query(`update habit_pauses set end_date = $2 where id = $1`, [p.id, addDays(day, -1)]);
  }
}

export async function saveHabitPrefs(patch: Partial<HabitPrefs>) {
  const pid = await requireProfileId();
  const p = z.object({ nudge_time: Time.optional(), weekly_review: z.boolean().optional() }).parse(patch);
  await (
    await db()
  ).query(
    `insert into habit_prefs (profile_id, nudge_time, weekly_review) values ($1, $2, coalesce($3, true))
     on conflict (profile_id) do update set
       nudge_time = case when $4 then excluded.nudge_time else habit_prefs.nudge_time end,
       weekly_review = coalesce($3, habit_prefs.weekly_review)`,
    [pid, p.nudge_time ?? null, p.weekly_review ?? null, p.nudge_time !== undefined],
  );
}

const RoutineInput = z.object({
  name: z.string().trim().min(1).max(40),
  time_of_day: z.enum(HABIT_TIMES),
  habitIds: z.array(Id).min(1).max(30),
});

/** Creates or updates a routine; `habitIds` are its steps in order. */
export async function saveRoutine(input: z.input<typeof RoutineInput>, id?: string): Promise<string> {
  const pid = await requireProfileId();
  const r = RoutineInput.parse(input);
  const d = await db();
  let rid: string;
  if (id) {
    const rows = await d.query<{ id: string }>(
      `update habit_routines set name = $1, time_of_day = $2 where id = $3 and profile_id = $4 returning id`,
      [r.name, r.time_of_day, Id.parse(id), pid],
    );
    if (!rows[0]) throw new Error("Routine not found");
    rid = rows[0].id;
  } else {
    const rows = await d.query<{ id: string }>(
      `insert into habit_routines (profile_id, name, time_of_day, position)
       values ($1, $2, $3, coalesce((select max(position) + 1 from habit_routines where profile_id = $1), 0)) returning id`,
      [pid, r.name, r.time_of_day],
    );
    rid = rows[0].id;
  }
  await d.query(
    `update habits set routine_id = null where routine_id = $1 and profile_id = $2 and not (id::text in (select jsonb_array_elements_text($3::jsonb)))`,
    [rid, pid, json(r.habitIds)],
  );
  // Steps take the routine's time of day so they show together.
  await d.query(
    `update habits h set routine_id = $1, routine_position = o.pos - 1, time_of_day = $4
     from jsonb_array_elements_text($2::jsonb) with ordinality as o(id, pos) where h.id = o.id::uuid and h.profile_id = $3 and h.kind = 'build'`,
    [rid, json(r.habitIds), pid, r.time_of_day],
  );
  return rid;
}

export async function deleteRoutine(id: string) {
  const pid = await requireProfileId();
  await (await db()).query(`delete from habit_routines where id = $1 and profile_id = $2`, [Id.parse(id), pid]);
}

export async function reorderRoutines(ids: string[]) {
  const pid = await requireProfileId();
  const list = z.array(Id).max(100).parse(ids);
  await (
    await db()
  ).query(
    `update habit_routines r set position = o.pos - 1 from jsonb_array_elements_text($1::jsonb) with ordinality as o(id, pos)
     where r.id = o.id::uuid and r.profile_id = $2`,
    [json(list), pid],
  );
}

/** Remembers that a milestone was celebrated. Returns false if it had already been shown today. */
export async function recordMilestone(habitId: string, days: number, date: string): Promise<boolean> {
  const pid = await requireProfileId();
  const rows = await (
    await db()
  ).query(
    `insert into habit_milestones (habit_id, days, reached_on)
     select id, $2, $3 from habits where id = $1 and profile_id = $4
     on conflict (habit_id, days) do update set reached_on = excluded.reached_on where habit_milestones.reached_on <> excluded.reached_on
     returning days`,
    [Id.parse(habitId), z.number().int().parse(days), DateStr.parse(date), pid],
  );
  return rows.length > 0;
}
