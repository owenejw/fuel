import { NextResponse, type NextRequest } from "next/server";
import { habitReminders } from "@/server/habits/reminders";
import { sendDueReminders } from "@/server/reminders";

/** Hit every ~15 min by a scheduler with `Authorization: Bearer $CRON_SECRET`. Sends nutrition and habit reminders. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  // A problem with habit reminders mustn't stop the nutrition ones.
  const habits = await habitReminders(now).catch((err) => {
    console.error("Habit reminders failed", err);
    return [];
  });
  return NextResponse.json(await sendDueReminders(now, habits));
}
