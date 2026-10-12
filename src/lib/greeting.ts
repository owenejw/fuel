/** Time-of-day greetings for the top of Today. The pick changes daily but stays put within a day. */

export type DayPart = "morning" | "afternoon" | "evening" | "night";

const GREETINGS: Record<DayPart, string[]> = {
  morning: [
    "Morning, {name}",
    "Good morning, {name}",
    "Rise and shine, {name}",
    "Top of the morning, {name}",
    "G'day, {name}",
    "Morning {name}, let's get after it",
    "Fresh start, {name}",
  ],
  afternoon: [
    "Arvo, {name}",
    "Good afternoon, {name}",
    "How's the arvo, {name}?",
    "Afternoon, {name}",
    "Keep it rolling, {name}",
    "Halfway there, {name}",
  ],
  evening: [
    "Evening, {name}",
    "Good evening, {name}",
    "Nearly done for the day, {name}",
    "Dinner time, {name}?",
    "Winding down, {name}",
    "Nice work today, {name}",
  ],
  night: ["Late one, {name}?", "Night owl mode, {name}", "Still up, {name}?", "Burning the midnight oil, {name}"],
};

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** Small stable string hash (FNV-1a), so the same day + person gives the same greeting. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function greeting(name: string, date: string, hour: number, seed = ""): string {
  const part = dayPart(hour);
  const options = GREETINGS[part];
  const pick = options[hash(`${date}:${part}:${seed}`) % options.length];
  return pick.replace("{name}", name.trim() || "there");
}
