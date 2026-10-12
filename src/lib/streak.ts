import { addDays, parseDate } from "./dates";

export type Streak = {
  /** Consecutive days logged, ending today (or yesterday if today isn't logged yet). */
  days: number;
  loggedToday: boolean;
  /** Monday-to-Sunday of the current week: true where something was logged. */
  week: { date: string; logged: boolean; future: boolean }[];
};

export function computeStreak(loggedDates: Iterable<string>, today: string): Streak {
  const logged = new Set(loggedDates);
  const loggedToday = logged.has(today);
  let days = 0;
  for (let d = loggedToday ? today : addDays(today, -1); logged.has(d); d = addDays(d, -1)) days++;

  const mondayOffset = (parseDate(today).getDay() + 6) % 7;
  const monday = addDays(today, -mondayOffset);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, logged: logged.has(date), future: date > today };
  });
  return { days, loggedToday, week };
}
