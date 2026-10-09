import "server-only";
import webpush from "web-push";
import { localParts } from "@/lib/calendar";
import { timeToMinutes } from "@/lib/fuelling";
import { WORKOUT_LABELS, type WorkoutType } from "@/lib/types";
import { db } from "./db";

const TZ = process.env.APP_TIMEZONE || "Australia/Sydney";

type Sub = { endpoint: string; profile_id: string; keys: { p256dh: string; auth: string } };

/**
 * Called by a scheduler every ~15 minutes. Sends:
 * - a logging nudge at the profile's reminder time if little is logged today
 * - a fuelling nudge ~2.5 h before a planned workout
 * Each reminder is sent at most once (reminders_sent).
 */
export async function sendDueReminders(now = new Date()) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return { sent: 0, skipped: "VAPID keys not configured" };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);

  const d = await db();
  const { date, time } = localParts(now, TZ);
  const nowMin = timeToMinutes(time);
  const subs = await d.query<Sub>(`select endpoint, profile_id, keys from push_subscriptions`);
  const profiles = await d.query<{ id: string; remind_log_time: string | null; remind_workouts: boolean }>(
    `select id, remind_log_time, remind_workouts from profiles where id in (select profile_id from push_subscriptions)`,
  );

  const due: { pid: string; key: string; title: string; body: string; url: string }[] = [];
  for (const p of profiles) {
    if (p.remind_log_time) {
      const at = timeToMinutes(String(p.remind_log_time).slice(0, 5));
      if (nowMin >= at && nowMin < at + 60) {
        const [{ n }] = await d.query<{ n: number }>(`select count(*)::int as n from log_entries where profile_id = $1 and date = $2`, [
          p.id,
          date,
        ]);
        if (Number(n) < 3)
          due.push({
            pid: p.id,
            key: `log:${date}`,
            title: "Log today's food",
            body: "A couple of taps keeps your targets accurate.",
            url: "/log",
          });
      }
    }
    if (p.remind_workouts) {
      const workouts = await d.query<{ id: string; start_time: string; type: WorkoutType; title: string | null }>(
        `select id, start_time, type, title from workouts where profile_id = $1 and date = $2 and start_time is not null and type <> 'rest'`,
        [p.id, date],
      );
      for (const w of workouts) {
        const start = timeToMinutes(String(w.start_time).slice(0, 5));
        if (start - nowMin <= 165 && start - nowMin > 90) {
          due.push({
            pid: p.id,
            key: `workout:${w.id}`,
            title: `${w.title || WORKOUT_LABELS[w.type]} at ${String(w.start_time).slice(0, 5)}`,
            body: "Time for a carb-focused pre-session meal — low fat and fibre.",
            url: "/",
          });
        }
      }
    }
  }

  let sent = 0;
  for (const r of due) {
    const claimed = await d.query(`insert into reminders_sent (profile_id, key) values ($1, $2) on conflict do nothing returning key`, [
      r.pid,
      r.key,
    ]);
    if (!claimed.length) continue;
    for (const s of subs.filter((x) => x.profile_id === r.pid)) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify({ title: r.title, body: r.body, url: r.url }),
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await d.query(`delete from push_subscriptions where endpoint = $1`, [s.endpoint]);
      }
    }
  }
  await d.query(`delete from reminders_sent where sent_at < now() - interval '3 days'`);
  return { sent, due: due.length };
}
