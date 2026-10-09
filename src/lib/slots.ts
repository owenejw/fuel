import type { MealSlot } from "./types";

/** Sensible default meal slot for the current time of day. */
export function defaultSlot(d = new Date()): MealSlot {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return "breakfast";
  if (h < 14.5) return "lunch";
  if (h < 17) return "snack";
  if (h < 21) return "dinner";
  return "snack";
}
