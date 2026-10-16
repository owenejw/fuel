/** Habits section types. Nothing in the nutrition side imports these. */

import type { PackedEntries } from "./pack";

export const HABIT_TIMES = ["morning", "anytime", "evening"] as const;
export type HabitTime = (typeof HABIT_TIMES)[number];
export type HabitKind = "build" | "break";
export type HabitSchedule = "daily" | "weekdays" | "per_week";
export type HabitStatus = "done" | "skipped" | "slip";
export const AUTO_SOURCES = ["water_goal", "protein_target", "all_meals", "trained"] as const;
export type AutoSource = (typeof AUTO_SOURCES)[number];

export type Habit = {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: HabitKind;
  target: number;
  unit: string | null;
  time_of_day: HabitTime;
  schedule: HabitSchedule;
  /** Bit 0 = Monday … bit 6 = Sunday. */
  weekdays: number;
  per_week: number;
  start_date: string;
  end_date: string | null;
  /** "HH:MM", or null for no reminder. */
  reminder_time: string | null;
  auto_source: AutoSource | null;
  routine_id: string | null;
  routine_position: number;
  position: number;
  archived: boolean;
};

export type HabitInput = Omit<Habit, "id" | "position" | "archived" | "routine_id" | "routine_position">;

export type Routine = { id: string; name: string; time_of_day: HabitTime; position: number };

export type HabitEntry = { habit_id: string; date: string; count: number; status: HabitStatus };

export type HabitDay = { date: string; note: string | null; mood: number | null };

export type Pause = { id: string; start_date: string; end_date: string | null };

export type HabitPrefs = { nudge_time: string | null; weekly_review: boolean };

/** What the nutrition side says about a day, for habits that complete themselves. Read only. */
export type AutoSignals = Partial<Record<AutoSource, boolean>>;

/** HabitData as sent to the browser and kept offline: history packed (see pack.ts). */
export type PackedHabitData = Omit<HabitData, "entries"> & { entries: PackedEntries };

export type Milestone = { habit_id: string; days: number; reached_on: string };

export type HabitData = {
  habits: Habit[];
  routines: Routine[];
  entries: HabitEntry[];
  days: HabitDay[];
  pauses: Pause[];
  prefs: HabitPrefs;
  /** date → signals, only for dates where an auto habit could use them. */
  auto: Record<string, AutoSignals>;
  milestones: Milestone[];
};
