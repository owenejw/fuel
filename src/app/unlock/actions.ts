"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { PASS_COOKIE } from "@/lib/passcode";

export async function unlock(passcode: string): Promise<boolean> {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return true;
  const a = createHash("sha256").update(passcode).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) return false;
  (await cookies()).set(PASS_COOKIE, createHash("sha256").update(`fuel:${expected}`).digest("hex"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 400 * 24 * 60 * 60,
  });
  return true;
}
