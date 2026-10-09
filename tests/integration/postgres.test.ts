/**
 * Runs the app's real data layer against a real Postgres server (the
 * production driver path), which local PGlite can't cover.
 *
 *   TEST_DATABASE_URL=postgres://… npm run test:postgres
 *
 * Use a throwaway database: it is migrated and written to. CI provides one.
 */
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("real Postgres", () => {
  let repo: typeof import("@/server/repo");
  let db: Awaited<ReturnType<typeof import("@/server/db").db>>;
  let owen: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { runMigrations } = await import("@/server/migrations");
    const { openScriptDb } = await import("../../scripts/script-db");
    const script = await openScriptDb();
    await runMigrations(script);
    await script.close();
    db = await (await import("@/server/db")).db();
    repo = await import("@/server/repo");
    owen = (await db.query<{ id: string }>(`select id from profiles where name = 'Owen'`))[0].id;
  });

  it("returns dates as strings and numerics as numbers", async () => {
    const [row] = await db.query<{ d: unknown; n: unknown; t: unknown }>(`select '2026-10-09'::date as d, 12.5::numeric as n, now() as t`);
    expect(row.d).toBe("2026-10-09");
    expect(row.n).toBe(12.5);
    expect(typeof row.t).toBe("string");
  });

  it("round-trips JSON parameters without double-encoding", async () => {
    const [row] = await db.query<{ v: unknown; k: string }>(`select $1::jsonb as v, jsonb_typeof($1::jsonb) as k`, [
      JSON.stringify({ a: 1 }),
    ]);
    expect(row.v).toEqual({ a: 1 });
    expect(row.k).toBe("object");
  });

  it("inserts and reads log entries through the repo", async () => {
    const saved = await repo.insertEntries(owen, [
      {
        date: "2026-10-09",
        slot: "lunch",
        kind: "quick",
        name: "Test lunch",
        grams: null,
        nutrients: { energy_kj: 2000, protein_g: 30 },
        time: "12:30",
      },
    ]);
    expect(saved[0]).toMatchObject({ date: "2026-10-09", time: "12:30:00", slot: "lunch", nutrients: { energy_kj: 2000, protein_g: 30 } });
    const log = await repo.getLog(owen, "2026-10-09");
    expect(log.map((e) => e.name)).toContain("Test lunch");
  });

  it("upserts reference foods from the seed/cache SQL", async () => {
    const { UPSERT_REFERENCE_FOODS } = await import("@/lib/foods/sql");
    const rows = [
      {
        source: "afcd",
        source_id: "TEST1",
        barcode: null,
        name: "Test apple",
        brand: null,
        serve_size_g: null,
        serve_label: null,
        energy_kj: 220,
      },
    ];
    await db.query(UPSERT_REFERENCE_FOODS, [JSON.stringify(rows)]);
    const again = await db.query<{ name: string; energy_kj: number }>(UPSERT_REFERENCE_FOODS, [
      JSON.stringify([{ ...rows[0], name: "Test apple v2" }]),
    ]);
    expect(again[0]).toMatchObject({ name: "Test apple v2", energy_kj: 220 });
  });

  it("builds a day bundle with targets and workouts", async () => {
    await db.query(
      `insert into workouts (profile_id, date, start_time, duration_min, type, intensity) values ($1, '2026-10-09', '18:00', 60, 'soccer', 'hard')`,
      [owen],
    );
    const day = await repo.getDayBundle(owen, "2026-10-09");
    expect(day.plan.training).toBe(true);
    expect(day.plan.workouts[0].start_time).toBe("18:00");
    expect(day.fuelling.length).toBeGreaterThan(0);
  });
});
