import { NextResponse, type NextRequest } from "next/server";
import { sendDueReminders } from "@/server/reminders";

/** Hit every ~15 min by a scheduler with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await sendDueReminders());
}
