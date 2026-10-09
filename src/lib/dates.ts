/** Dates are stored as local calendar dates (YYYY-MM-DD) in the user's timezone. */

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateString(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today() {
  return toDateString(new Date());
}

export function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, days: number) {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

export function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function isValidDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime());
}

export function friendlyDate(s: string) {
  const t = today();
  if (s === t) return "Today";
  if (s === addDays(t, -1)) return "Yesterday";
  if (s === addDays(t, 1)) return "Tomorrow";
  return parseDate(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

export function ageOn(birthDate: string, on: string) {
  const b = parseDate(birthDate);
  const d = parseDate(on);
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}
