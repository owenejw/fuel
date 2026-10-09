import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";

export const PROFILE_COOKIE = "fuel_profile";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class NoProfileError extends Error {
  constructor() {
    super("NO_PROFILE");
  }
}

/** The profile this device has chosen, or null. */
export async function currentProfileId(): Promise<string | null> {
  const id = (await cookies()).get(PROFILE_COOKIE)?.value;
  if (!id || !UUID.test(id)) return null;
  const rows = await (await db()).query<{ id: string }>(`select id from profiles where id = $1`, [id]);
  return rows[0]?.id ?? null;
}

export async function requireProfileId(): Promise<string> {
  const id = await currentProfileId();
  if (!id) throw new NoProfileError();
  return id;
}

export async function rememberProfile(id: string) {
  (await cookies()).set(PROFILE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 400 * 24 * 60 * 60, // browsers cap cookies at 400 days; refreshed on each visit
  });
}

export async function forgetProfile() {
  (await cookies()).delete(PROFILE_COOKIE);
}

export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
