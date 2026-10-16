import type { AutoSource, Habit, HabitInput, HabitTime } from "./types";

/** Habit colours: Apple's dark-mode system colours, each with a lighter partner for gradients. */
export const HABIT_COLORS = {
  red: ["#ff453a", "#ff7b73"],
  orange: ["#ff9f0a", "#ffc266"],
  yellow: ["#ffd60a", "#ffe866"],
  green: ["#30d158", "#7ae696"],
  mint: ["#63e6e2", "#a6f2ef"],
  cyan: ["#40c8e0", "#8fe0ee"],
  blue: ["#0a84ff", "#64b5ff"],
  indigo: ["#7d7aff", "#aaa8ff"],
  purple: ["#bf5af2", "#da8fff"],
  pink: ["#ff375f", "#ff7a95"],
} as const;
export type HabitColor = keyof typeof HABIT_COLORS;
export const COLOR_KEYS = Object.keys(HABIT_COLORS) as HabitColor[];

export const habitColor = (c: string) => HABIT_COLORS[(c in HABIT_COLORS ? c : "indigo") as HabitColor][0];
export const habitColor2 = (c: string) => HABIT_COLORS[(c in HABIT_COLORS ? c : "indigo") as HabitColor][1];

export const TIME_LABELS: Record<HabitTime, string> = { morning: "Morning", anytime: "Anytime", evening: "Evening" };

/** Group order for the checklist: the part of the day you're in comes first. */
export function groupOrder(hour: number): HabitTime[] {
  if (hour < 12) return ["morning", "anytime", "evening"];
  if (hour < 17) return ["anytime", "evening", "morning"];
  return ["evening", "anytime", "morning"];
}

export const AUTO_LABELS: Record<AutoSource, { label: string; hint: string }> = {
  water_goal: { label: "Water goal", hint: "Done when you've drunk your daily water target" },
  protein_target: { label: "Protein target", hint: "Done when you reach the day's protein target" },
  all_meals: { label: "Logged all meals", hint: "Done when breakfast, lunch and dinner are logged" },
  trained: { label: "Trained today", hint: "Done when a workout is ticked off or comes from Apple Health" },
};

export const WEEKDAY_SHORT = ["M", "T", "W", "T", "F", "S", "S"] as const;
export const WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** "Every day", "Mon, Wed, Fri", "3 times a week". */
export function scheduleLabel(h: Pick<Habit, "kind" | "schedule" | "weekdays" | "per_week">) {
  if (h.kind === "break") return "Every day";
  if (h.schedule === "daily") return "Every day";
  if (h.schedule === "per_week") return h.per_week === 1 ? "Once a week" : `${h.per_week} times a week`;
  if (h.weekdays === 0b0011111) return "Weekdays";
  if (h.weekdays === 0b1100000) return "Weekends";
  return WEEKDAY_ABBR.filter((_, i) => (h.weekdays >> i) & 1).join(", ");
}

export const MOODS = [
  { value: 1, emoji: "😞", label: "Rough" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
] as const;

/** One-tap starters for an empty list. */
export const TEMPLATES: (Partial<HabitInput> & { name: string })[] = [
  { name: "Drink water", icon: "droplet", color: "blue", auto_source: "water_goal" },
  { name: "Hit protein", icon: "beef", color: "green", auto_source: "protein_target" },
  { name: "Read", icon: "book", color: "orange", time_of_day: "evening", target: 10, unit: "pages" },
  { name: "Stretch", icon: "person", color: "mint", time_of_day: "morning" },
  { name: "Meditate", icon: "flower", color: "purple", time_of_day: "morning" },
  { name: "Brush teeth", icon: "smile", color: "cyan", time_of_day: "evening" },
  { name: "Skincare", icon: "sparkles", color: "pink", time_of_day: "evening" },
  { name: "No phone in bed", icon: "phone-off", color: "indigo", kind: "break" },
];

export function blankHabit(today: string, patch: Partial<HabitInput> = {}): HabitInput {
  return {
    name: "",
    icon: "check",
    color: "indigo",
    kind: "build",
    target: 1,
    unit: null,
    time_of_day: "anytime",
    schedule: "daily",
    weekdays: 127,
    per_week: 3,
    start_date: today,
    end_date: null,
    reminder_time: null,
    auto_source: null,
    ...patch,
  };
}
