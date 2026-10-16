import "server-only";
/**
 * Habit reminders, worked out on each run of the reminders cron (about every 15 minutes, so they arrive within
 * ~15 minutes of the time set). iPhone web apps can't schedule notifications themselves; everything is web push.
 */
import { localParts } from "@/lib/calendar";
import { timeToMinutes } from "@/lib/fuelling";
import { analyse, indexEntries, isPaused, onChecklist, weekStart } from "@/lib/habits/progress";
import type { Habit } from "@/lib/habits/types";
import { db } from "../db";
import type { DueReminder } from "../reminders";
import { nutritionSignals } from "./nutrition-signals";
import { getEntries, getHabits, getPauses, getPrefs } from "./store";

const TZ = process.env.APP_TIMEZONE || "Australia/Sydney";
/** Matches the nutrition reminders: a reminder can go out up to an hour late if a run was missed. */
const WINDOW_MIN = 60;

/** Habits still to do today, in their order. */
export async function openHabits(pid: string, date: string): Promise<Habit[]> {
  const habits = (await getHabits(pid)).filter((h) => h.kind === "build" && onChecklist(h, date));
  if (!habits.length) return [];
  const ws = weekStart(date);
  const [entries, pauses] = await Promise.all([getEntries(pid, ws, date), getPauses(pid)]);
  if (isPaused(pauses, date)) return [];
  const sources = new Set(habits.flatMap((h) => (h.auto_source ? [h.auto_source] : [])));
  const auto = await nutritionSignals(pid, date, date, sources);
  const index = indexEntries(entries);
  return habits.filter((h) => {
    // Only this week matters for whether it's due today.
    const a = analyse({ ...h, start_date: h.start_date > ws ? h.start_date : ws }, { pauses, auto }, index, date);
    return a.byDate.get(date)?.state === "pending";
  });
}

export async function habitReminders(now = new Date()): Promise<DueReminder[]> {
  const { date, time } = localParts(now, TZ);
  const nowMin = timeToMinutes(time);
  const inWindow = (t: string | null) => {
    if (!t) return false;
    const at = timeToMinutes(t);
    return nowMin >= at && nowMin < at + WINDOW_MIN;
  };

  const d = await db();
  const pids = (await d.query<{ profile_id: string }>(`select distinct profile_id from push_subscriptions`)).map((r) => r.profile_id);
  const due: DueReminder[] = [];
  for (const pid of pids) {
    const [habits, prefs] = await Promise.all([getHabits(pid), getPrefs(pid)]);
    const wantsHabit = habits.some((h) => inWindow(h.reminder_time));
    const wantsNudge = inWindow(prefs.nudge_time);
    if (!wantsHabit && !wantsNudge) continue;

    const open = await openHabits(pid, date);
    for (const h of open) {
      if (!inWindow(h.reminder_time)) continue;
      due.push({
        pid,
        key: `habit:${h.id}:${date}`,
        title: h.name,
        body: h.target > 1 ? `Time for ${h.target}${h.unit ? ` ${h.unit}` : ""} today.` : "Time to tick this one off.",
        url: `/habits?h=${h.id}`,
      });
    }
    if (wantsNudge && open.length) {
      const names = open.slice(0, 3).map((h) => h.name);
      due.push({
        pid,
        key: `habit-nudge:${date}`,
        title: open.length === 1 ? "1 habit left today" : `${open.length} habits left today`,
        body: names.join(", ") + (open.length > 3 ? ` and ${open.length - 3} more` : ""),
        url: "/habits",
      });
    }
  }
  return due;
}
