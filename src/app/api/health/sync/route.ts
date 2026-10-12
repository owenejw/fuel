import { NextResponse, type NextRequest } from "next/server";
import { importFromHealth, pendingForHealth, profileForKey, todayLocal } from "@/server/health";

const keyFrom = (req: NextRequest) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("key");

/**
 * Called by the "kilo JOL Sync" iPhone Shortcut with `Authorization: Bearer <sync key>`.
 * Body (all optional): weight_kg, weight_date, active_energy_kj | active_energy_kcal, date, workouts[].
 * Returns food and water to write into Apple Health, plus an `ack` to send back once written.
 */
export async function POST(req: NextRequest) {
  const pid = await profileForKey(keyFrom(req));
  if (!pid)
    return NextResponse.json({ error: "Unknown sync key. Copy it again from kilo JOL → Settings → Apple Health." }, { status: 401 });
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  try {
    const today = todayLocal();
    const imported = await importFromHealth(pid, body, today);
    const pending = await pendingForHealth(pid, today);
    return NextResponse.json({ ok: true, imported, ...pending }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("health sync", err);
    return NextResponse.json({ error: "Couldn't read that data" }, { status: 400 });
  }
}
