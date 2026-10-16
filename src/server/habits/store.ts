import "server-only";
/** Habits data access. Every query is scoped to one profile. */
import { addDays } from "@/lib/dates";
import type { AutoSource, Habit, HabitData, HabitDay, HabitEntry, HabitPrefs, Milestone, Pause, Routine } from "@/lib/habits/types";
import { db, type Row } from "../db";
import { nutritionSignals } from "./nutrition-signals";

/** How far back history (and strength) is loaded. */
export const HISTORY_DAYS = 730;
/** How far back nutrition goals are checked for auto-completing habits. */
const AUTO_DAYS = 400;

const HABIT_COLS = `id, name, icon, color, kind, target, unit, time_of_day, schedule, weekdays, per_week, start_date, end_date,
  reminder_time, auto_source, routine_id, routine_position, position, archived_at`;

export function toHabit(r: Row): Habit {
  return {
    id: String(r.id),
    name: String(r.name),
    icon: String(r.icon),
    color: String(r.color),
    kind: r.kind as Habit["kind"],
    target: Number(r.target),
    unit: (r.unit as string | null) ?? null,
    time_of_day: r.time_of_day as Habit["time_of_day"],
    schedule: r.schedule as Habit["schedule"],
    weekdays: Number(r.weekdays),
    per_week: Number(r.per_week),
    start_date: String(r.start_date),
    end_date: (r.end_date as string | null) ?? null,
    reminder_time: r.reminder_time ? String(r.reminder_time).slice(0, 5) : null,
    auto_source: (r.auto_source as AutoSource | null) ?? null,
    routine_id: (r.routine_id as string | null) ?? null,
    routine_position: Number(r.routine_position),
    position: Number(r.position),
    archived: r.archived_at != null,
  };
}

export async function getHabits(pid: string): Promise<Habit[]> {
  const rows = await (await db()).query(`select ${HABIT_COLS} from habits where profile_id = $1 order by position, created_at`, [pid]);
  return rows.map(toHabit);
}

export async function getEntries(pid: string, from: string, to: string): Promise<HabitEntry[]> {
  const rows = await (
    await db()
  ).query<HabitEntry>(
    `select habit_id, date, count, status from habit_entries where profile_id = $1 and date between $2 and $3 order by date`,
    [pid, from, to],
  );
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

export async function getPauses(pid: string): Promise<Pause[]> {
  return (await db()).query<Pause>(`select id, start_date, end_date from habit_pauses where profile_id = $1 order by start_date`, [pid]);
}

export async function getPrefs(pid: string): Promise<HabitPrefs> {
  const rows = await (await db()).query<Row>(`select nudge_time, weekly_review from habit_prefs where profile_id = $1`, [pid]);
  const r = rows[0];
  return { nudge_time: r?.nudge_time ? String(r.nudge_time).slice(0, 5) : null, weekly_review: r ? Boolean(r.weekly_review) : true };
}

/** Everything the habits section shows, for one profile, as of `today`. */
export async function loadHabitData(pid: string, today: string): Promise<HabitData> {
  const d = await db();
  const habits = await getHabits(pid);
  const earliest = habits.reduce((m, h) => (h.start_date < m ? h.start_date : m), today);
  const historyFrom = earliest < addDays(today, -HISTORY_DAYS) ? addDays(today, -HISTORY_DAYS) : earliest;

  const autoHabits = habits.filter((h) => h.auto_source && !h.archived);
  const autoStart = autoHabits.reduce((m, h) => (h.start_date < m ? h.start_date : m), today);
  const autoFrom = autoStart < addDays(today, -AUTO_DAYS) ? addDays(today, -AUTO_DAYS) : autoStart;

  const [routines, entries, days, pauses, prefs, milestones, auto] = await Promise.all([
    d.query<Routine>(`select id, name, time_of_day, position from habit_routines where profile_id = $1 order by position, created_at`, [
      pid,
    ]),
    getEntries(pid, historyFrom, today),
    d.query<HabitDay>(`select date, note, mood from habit_days where profile_id = $1 and date >= $2 order by date`, [
      pid,
      addDays(today, -400),
    ]),
    getPauses(pid),
    getPrefs(pid),
    d.query<Milestone>(
      `select m.habit_id, m.days, m.reached_on from habit_milestones m join habits h on h.id = m.habit_id where h.profile_id = $1`,
      [pid],
    ),
    nutritionSignals(pid, autoFrom, today, new Set(autoHabits.map((h) => h.auto_source!))),
  ]);
  return {
    habits,
    routines,
    entries,
    days: days.map((x) => ({ ...x, mood: x.mood == null ? null : Number(x.mood) })),
    pauses,
    prefs,
    milestones: milestones.map((m) => ({ ...m, days: Number(m.days) })),
    auto,
  };
}
