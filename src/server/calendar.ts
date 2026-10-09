import "server-only";
import ical from "node-ical";
import { classifyEvent, localParts, parseKeywords } from "@/lib/calendar";
import { db, json } from "./db";
import { getProfile } from "./repo";

const TZ = process.env.APP_TIMEZONE || "Australia/Sydney";

function assertSafeUrl(raw: string) {
  const url = new URL(raw.replace(/^webcal:/i, "https:"));
  if (url.protocol !== "https:") throw new Error("Calendar URL must be https");
  const host = url.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1)/.test(host) || host.endsWith(".local")) {
    throw new Error("Calendar URL must be a public address");
  }
  return url.toString();
}

/**
 * Read the profile's private calendar (iCal) feed and upsert workouts for
 * events matching their keywords, 7 days back to 28 days ahead. Calendar
 * workouts that disappeared from the feed are removed (future ones only).
 */
export async function syncCalendar(pid: string) {
  const profile = await getProfile(pid);
  if (!profile?.calendar_ics_url) throw new Error("Add your calendar's secret iCal address in Settings first");
  const res = await fetch(assertSafeUrl(profile.calendar_ics_url), { signal: AbortSignal.timeout(10_000), redirect: "follow" });
  if (!res.ok) throw new Error(`Couldn't read the calendar (${res.status})`);
  const text = await res.text();
  if (text.length > 10_000_000) throw new Error("Calendar feed is too large");

  const data = ical.sync.parseICS(text);
  const keywords = parseKeywords(profile.calendar_keywords);
  const from = new Date(Date.now() - 7 * 86400_000);
  const to = new Date(Date.now() + 28 * 86400_000);
  const rows: Record<string, unknown>[] = [];

  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== "VEVENT") continue;
    const instances = ical.expandRecurringEvent(ev, { from, to });
    for (const inst of instances) {
      const title = typeof inst.summary === "string" ? inst.summary : String((inst.summary as { val?: string })?.val ?? "");
      const kind = classifyEvent(title, keywords);
      if (!kind) continue;
      const start = localParts(inst.start, TZ);
      const minutes = inst.end ? Math.round((inst.end.getTime() - inst.start.getTime()) / 60000) : null;
      rows.push({
        external_id: `${ev.uid}|${inst.start.toISOString()}`,
        date: start.date,
        start_time: inst.isFullDay ? null : start.time,
        duration_min: inst.isFullDay ? null : minutes && minutes > 0 && minutes <= 1440 ? minutes : null,
        type: kind.type,
        intensity: kind.intensity,
        is_race: kind.isRace,
        title: title.slice(0, 120),
      });
    }
  }

  const d = await db();
  await d.query(
    `insert into workouts (profile_id, external_id, date, start_time, duration_min, type, intensity, is_race, title, source)
     select $1, x.external_id, x.date, x.start_time, x.duration_min, x.type, x.intensity, x.is_race, x.title, 'calendar'
     from jsonb_to_recordset($2::jsonb) as x(external_id text, date date, start_time time, duration_min int, type workout_type,
          intensity workout_intensity, is_race boolean, title text)
     on conflict (profile_id, external_id) do update set date = excluded.date, start_time = excluded.start_time,
       duration_min = excluded.duration_min, title = excluded.title`,
    [pid, json(rows)],
  );
  const today = localParts(new Date(), TZ).date;
  await d.query(
    `delete from workouts where profile_id = $1 and source = 'calendar' and date >= $2
       and external_id not in (select jsonb_array_elements_text($3::jsonb))`,
    [pid, today, json(rows.map((r) => r.external_id))],
  );
  await d.query(`update profiles set calendar_synced_at = now() where id = $1`, [pid]);
  return rows.length;
}
