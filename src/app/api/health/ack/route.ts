import { NextResponse, type NextRequest } from "next/server";
import { acknowledge, profileForKey } from "@/server/health";

/** The shortcut calls this after writing the food and water into Apple Health, so they aren't sent again. */
export async function POST(req: NextRequest) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("key");
  const pid = await profileForKey(key);
  if (!pid) return NextResponse.json({ error: "Unknown sync key" }, { status: 401 });
  let token: unknown;
  try {
    const text = await req.text();
    token = text.trim().startsWith("{") ? JSON.parse(text).ack : text.trim();
  } catch {
    return NextResponse.json({ error: "Body must be JSON with an ack" }, { status: 400 });
  }
  if (typeof token !== "string" || !token) return NextResponse.json({ error: "Missing ack" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await acknowledge(pid, token)) });
  } catch {
    return NextResponse.json({ error: "Invalid ack" }, { status: 400 });
  }
}
