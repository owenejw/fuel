"use server";

import { db } from "../db";
import { hashKey, newKey } from "../health";
import { requireProfileId } from "../session";

export async function getHealthStatus(): Promise<{ hasKey: boolean; syncedAt: string | null }> {
  const pid = await requireProfileId();
  const rows = await (
    await db()
  ).query<{ has: boolean; synced: string | null }>(
    `select health_key_hash is not null as has, health_synced_at as synced from profiles where id = $1`,
    [pid],
  );
  return { hasKey: !!rows[0]?.has, syncedAt: rows[0]?.synced ?? null };
}

/** Creates (or replaces) this profile's sync key. The key itself is only shown now; we keep a hash. */
export async function createHealthKey(): Promise<string> {
  const pid = await requireProfileId();
  const key = newKey();
  await (await db()).query(`update profiles set health_key_hash = $2 where id = $1`, [pid, hashKey(key)]);
  return key;
}
