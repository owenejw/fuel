import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { addDays, isValidDate } from "@/lib/dates";
import { KJ_PER_KCAL } from "@/lib/energy";
import type { WorkoutType } from "@/lib/types";
import { db, json } from "./db";

/**
 * Apple Health sync, driven by an iPhone Shortcut. The shortcut authenticates with a per-profile sync key,
 * sends weight / active energy / workouts in, and gets back food and water to write into Health.
 */

const TZ = process.env.APP_TIMEZONE || "Australia/Sydney";

export const hashKey = (key: string) => createHash("sha256").update(`kilojol-health:${key.trim()}`).digest("hex");

export function newKey() {
  return `kj_${randomBytes(18).toString("base64url")}`;
}

/** The profile a sync key belongs to, or null. */
export async function profileForKey(key: string | null): Promise<string | null> {
  if (!key || key.length < 10 || key.length > 200) return null;
  const rows = await (await db()).query<{ id: string }>(`select id from profiles where health_key_hash = $1`, [hashKey(key)]);
  return rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Parsing: Shortcuts sends numbers as numbers or text ("78.4", "78.4 kg") and dates in several formats.
// ---------------------------------------------------------------------------

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Local calendar date (YYYY-MM-DD in the app's timezone) for an ISO-ish date string. */
export function localDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  if (isValidDate(s)) return s;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

function localTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));
}

/** "2026-10-12" + "08:30:00" in the app's timezone → ISO 8601 with offset, e.g. 2026-10-12T08:30:00+11:00. */
export function isoLocal(date: string, time = "12:00:00"): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss || 0);
  const offsetMin = tzOffsetMinutes(guess);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date}T${pad(hh)}:${pad(mm)}:${pad(ss || 0)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function tzOffsetMinutes(utcMs: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

const WORKOUT_MAP: [RegExp, WorkoutType][] = [
  [/soccer|football|futsal/i, "soccer"],
  [/run|jog/i, "run"],
  [/strength|weight|gym|functional|core|hiit|cross/i, "gym"],
];

export function workoutType(name: string, minutes: number | null): WorkoutType {
  for (const [re, t] of WORKOUT_MAP) if (re.test(name)) return t === "run" && (minutes ?? 0) >= 75 ? "long_run" : t;
  return "gym";
}

// ---------------------------------------------------------------------------
// Inbound
// ---------------------------------------------------------------------------

const Inbound = z
  .object({
    date: z.unknown(),
    weight_kg: z.unknown(),
    weight_date: z.unknown(),
    active_energy_kj: z.unknown(),
    active_energy_kcal: z.unknown(),
    workouts: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  })
  .partial()
  .passthrough();

export async function importFromHealth(pid: string, body: unknown, today: string) {
  const b = Inbound.parse(body ?? {});
  const q = await db();
  const imported = { weight: false, active_energy: false, workouts: 0 };
  const day = localDate(b.date) ?? today;

  const kg = num(b.weight_kg);
  if (kg && kg >= 20 && kg <= 400) {
    const wd = localDate(b.weight_date) ?? day;
    await q.query(
      `insert into weights (profile_id, date, kg) values ($1, $2, $3) on conflict (profile_id, date) do update set kg = excluded.kg`,
      [pid, wd, Math.round(kg * 100) / 100],
    );
    imported.weight = true;
  }

  const kj = num(b.active_energy_kj) ?? (num(b.active_energy_kcal) != null ? num(b.active_energy_kcal)! * KJ_PER_KCAL : null);
  if (kj != null && kj >= 0 && kj < 100000) {
    await q.query(
      `insert into activity_days (profile_id, date, active_kj) values ($1, $2, $3)
       on conflict (profile_id, date) do update set active_kj = excluded.active_kj, updated_at = now()`,
      [pid, day, Math.round(kj)],
    );
    imported.active_energy = true;
  }

  for (const w of b.workouts ?? []) {
    const start = typeof w.start === "string" ? w.start : typeof w.start_date === "string" ? w.start_date : null;
    const d = localDate(start);
    if (!start || !d) continue;
    const name = String(w.type ?? w.name ?? "Workout").slice(0, 80);
    let minutes = num(w.duration_min) ?? num(w.minutes);
    if (minutes == null) {
      const end = typeof w.end === "string" ? Date.parse(w.end) : NaN;
      if (!Number.isNaN(end)) minutes = (end - Date.parse(start)) / 60000;
    }
    minutes = minutes != null ? Math.max(0, Math.min(1440, Math.round(minutes))) : null;
    const res = await q.query(
      `insert into workouts (profile_id, date, start_time, duration_min, type, intensity, completed, title, source, external_id)
       values ($1, $2, $3, $4, $5, 'moderate', true, $6, 'healthkit', $7)
       on conflict (profile_id, external_id) do update set duration_min = excluded.duration_min, completed = true
       returning id`,
      [pid, d, localTime(start), minutes, workoutType(name, minutes), name, `health:${start}`],
    );
    imported.workouts += res.length;
  }

  await q.query(`update profiles set health_synced_at = now() where id = $1`, [pid]);
  return imported;
}

// ---------------------------------------------------------------------------
// Outbound: food and water not yet written to Health
// ---------------------------------------------------------------------------

type Sample = { value: number; date: string };

/** Only recent days go out, so a first sync doesn't flood Health with old history. */
const EXPORT_DAYS = 2;

export async function pendingForHealth(pid: string, today: string) {
  const q = await db();
  const from = addDays(today, -(EXPORT_DAYS - 1));
  const entries = await q.query<{ id: string; date: string; time: string; nutrients: Record<string, number | null> }>(
    `select id, to_char(date, 'YYYY-MM-DD') as date, to_char(time, 'HH24:MI:SS') as time, nutrients
       from log_entries where profile_id = $1 and date between $2 and $3 and health_exported_at is null order by date, time`,
    [pid, from, today],
  );
  const water = await q.query<{ date: string; total: number; sent: number }>(
    `select to_char(w.date, 'YYYY-MM-DD') as date, sum(w.ml)::int as total, coalesce(max(e.ml), 0)::int as sent
       from water_logs w left join health_water_exports e on e.profile_id = w.profile_id and e.date = w.date
      where w.profile_id = $1 and w.date between $2 and $3 group by w.date order by w.date`,
    [pid, from, today],
  );

  const out = {
    energy_kj: [] as Sample[],
    protein_g: [] as Sample[],
    carbs_g: [] as Sample[],
    fat_g: [] as Sample[],
    fibre_g: [] as Sample[],
    water_ml: [] as Sample[],
  };
  for (const e of entries) {
    const at = isoLocal(e.date, e.time);
    for (const k of ["energy_kj", "protein_g", "carbs_g", "fat_g", "fibre_g"] as const) {
      const v = e.nutrients?.[k];
      if (v != null && v > 0) out[k].push({ value: Math.round(v * 10) / 10, date: at });
    }
  }
  const waterAck: { d: string; ml: number }[] = [];
  for (const w of water) {
    const delta = w.total - w.sent;
    if (delta > 0) {
      out.water_ml.push({ value: delta, date: isoLocal(w.date, w.date === today ? currentLocalTime() : "20:00:00") });
      waterAck.push({ d: w.date, ml: w.total });
    }
  }
  const ack = Buffer.from(JSON.stringify({ e: entries.map((e) => e.id), w: waterAck })).toString("base64url");
  return { ...out, ack, count: entries.length + waterAck.length };
}

function currentLocalTime() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(
    new Date(),
  );
}

const Ack = z.object({
  e: z.array(z.string().uuid()).max(2000),
  w: z.array(z.object({ d: z.string().refine(isValidDate), ml: z.number().int().min(0).max(100000) })).max(30),
});

/** Mark what the shortcut has written to Health. */
export async function acknowledge(pid: string, token: string) {
  let parsed: z.infer<typeof Ack>;
  try {
    parsed = Ack.parse(JSON.parse(Buffer.from(token, "base64url").toString("utf8")));
  } catch {
    throw new Error("Invalid ack");
  }
  const q = await db();
  if (parsed.e.length)
    await q.query(
      `update log_entries set health_exported_at = now()
        where profile_id = $1 and id in (select (jsonb_array_elements_text($2::jsonb))::uuid)`,
      [pid, json(parsed.e)],
    );
  for (const w of parsed.w)
    await q.query(
      `insert into health_water_exports (profile_id, date, ml) values ($1, $2, $3)
       on conflict (profile_id, date) do update set ml = greatest(health_water_exports.ml, excluded.ml)`,
      [pid, w.d, w.ml],
    );
  return { entries: parsed.e.length, water_days: parsed.w.length };
}

/** Today's date in the app's timezone. */
export function todayLocal() {
  return localDate(new Date().toISOString())!;
}
