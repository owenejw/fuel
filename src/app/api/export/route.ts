import { NextResponse, type NextRequest } from "next/server";
import { NUTRIENT_KEYS } from "@/lib/nutrients";
import { db } from "@/server/db";
import { getProfile } from "@/server/repo";
import { currentProfileId } from "@/server/session";

function csv(rows: Record<string, unknown>[], cols: string[]) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/** CSV export of the current profile's logs, weights or workouts. */
export async function GET(request: NextRequest) {
  const pid = await currentProfileId();
  if (!pid) return NextResponse.json({ error: "No profile selected" }, { status: 401 });
  const type = request.nextUrl.searchParams.get("type");
  const d = await db();
  let body: string;
  if (type === "logs") {
    const rows = await d.query(
      `select date, time, slot, kind, name, grams, nutrients from log_entries where profile_id = $1 order by date, time`,
      [pid],
    );
    // Unknown nutrients stay blank (no data), never 0.
    const flat = rows.map((r) => ({ ...r, ...(r.nutrients as object) }));
    body = csv(flat, ["date", "time", "slot", "kind", "name", "grams", ...NUTRIENT_KEYS]);
  } else if (type === "weights") {
    body = csv(await d.query(`select date, kg from weights where profile_id = $1 order by date`, [pid]), ["date", "kg"]);
  } else if (type === "workouts") {
    body = csv(
      await d.query(
        `select date, start_time, duration_min, type, intensity, is_race, completed, title, source from workouts where profile_id = $1 order by date, start_time`,
        [pid],
      ),
      ["date", "start_time", "duration_min", "type", "intensity", "is_race", "completed", "title", "source"],
    );
  } else {
    return NextResponse.json({ error: "type must be logs, weights or workouts" }, { status: 400 });
  }
  const name = ((await getProfile(pid))?.name ?? "fuel").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${type}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
