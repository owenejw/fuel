"use server";

import { z } from "zod";
import { db, json } from "../db";
import { requireProfileId } from "../session";

const Sub = z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export async function savePushSubscription(sub: unknown) {
  const pid = await requireProfileId();
  const s = Sub.parse(sub);
  await (
    await db()
  ).query(
    `insert into push_subscriptions (endpoint, profile_id, keys) values ($1, $2, $3::jsonb)
     on conflict (endpoint) do update set profile_id = excluded.profile_id, keys = excluded.keys`,
    [s.endpoint, pid, json(s.keys)],
  );
}

export async function removePushSubscription(endpoint: string) {
  await requireProfileId();
  await (await db()).query(`delete from push_subscriptions where endpoint = $1`, [endpoint]);
}
