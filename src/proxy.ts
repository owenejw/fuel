import { NextResponse, type NextRequest } from "next/server";
import { PASS_COOKIE } from "@/lib/passcode";

/** Paths reachable without a chosen profile. */
const OPEN_PATHS = ["/profiles", "/unlock", "/offline", "/api/cron"];

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * - Optional household passcode (APP_PASSCODE): asked once per device.
 * - Devices that haven't picked a profile are sent to the profile picker.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const open = (p: string) => pathname === p || pathname.startsWith(`${p}/`);

  const passcode = process.env.APP_PASSCODE;
  if (passcode && !open("/unlock") && !open("/api/cron")) {
    const ok = request.cookies.get(PASS_COOKIE)?.value === (await sha256(`fuel:${passcode}`));
    if (!ok) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Locked" }, { status: 401 });
      return NextResponse.redirect(new URL(`/unlock?next=${encodeURIComponent(pathname)}`, request.url));
    }
  }

  if (!request.cookies.get("fuel_profile") && !OPEN_PATHS.some(open)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No profile selected" }, { status: 401 });
    return NextResponse.redirect(new URL("/profiles", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|.*\\.(?:png|svg|ico|webp)$).*)"],
};
