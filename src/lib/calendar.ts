/** Turning calendar events into workouts (pure; parsing happens server-side). */
import type { Intensity, WorkoutType } from "./types";

export function parseKeywords(s: string) {
  return s
    .split(/[,\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

const RACE = /\b(race|city2surf|city to surf|marathon|half marathon|10k|5k|fun run|triathlon|grand final)\b/i;

/** Classify an event title, or null when it matches none of the keywords. */
export function classifyEvent(title: string, keywords: string[]): { type: WorkoutType; intensity: Intensity; isRace: boolean } | null {
  const t = title.toLowerCase();
  if (!keywords.some((k) => t.includes(k))) return null;
  let type: WorkoutType = "gym";
  if (/long run/.test(t)) type = "long_run";
  else if (/\b(run|jog|parkrun|marathon|city2surf|10k|5k)\b/.test(t)) type = "run";
  else if (/\b(soccer|football|futsal|training|match|game)\b/.test(t)) type = "soccer";
  else if (/\b(gym|weights|strength|lift)/.test(t)) type = "gym";
  const isRace = RACE.test(t);
  const intensity: Intensity =
    isRace || /\b(match|game|race|intervals|tempo|hard)\b/.test(t) ? "hard" : /\b(easy|recovery|light)\b/.test(t) ? "easy" : "moderate";
  return { type, intensity, isRace };
}

/** Date and HH:MM of an instant in a time zone. */
export function localParts(d: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
