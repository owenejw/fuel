import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "./pglite";

let test: Db;
vi.mock("@/server/db", () => ({
  db: async () => ({ query: async (s: string, p?: unknown[]) => (await test.query(s, p)).rows }),
  json: (v: unknown) => JSON.stringify(v ?? null),
}));

const { acknowledge, hashKey, importFromHealth, pendingForHealth, profileForKey } = await import("@/server/health");

describe("Apple Health sync", () => {
  let pid: string;
  const today = "2026-10-12";

  beforeAll(async () => {
    test = await createTestDb();
    pid = (
      await test.query<{ id: string }>(`insert into profiles (name, health_key_hash) values ('Health Test', $1) returning id`, [
        hashKey("kj_secret_test_key"),
      ])
    ).rows[0].id;
    await test.query(
      `insert into log_entries (profile_id, date, time, slot, kind, name, grams, nutrients) values
        ($1, $2, '08:00', 'breakfast', 'quick', 'Oats', 60, '{"energy_kj": 950, "protein_g": 8, "carbs_g": 40, "fat_g": 5}'),
        ($1, $2, '12:30', 'lunch', 'quick', 'Mystery', null, '{"energy_kj": 1200}'),
        ($1, '2026-09-01', '12:00', 'lunch', 'quick', 'Old', null, '{"energy_kj": 500}')`,
      [pid, today],
    );
    await test.query(`insert into water_logs (profile_id, date, ml) values ($1, $2, 500), ($1, $2, 250), ($1, $2, -250)`, [pid, today]);
  });

  it("finds the profile from its sync key only", async () => {
    expect(await profileForKey("kj_secret_test_key")).toBe(pid);
    expect(await profileForKey("kj_wrong_key")).toBeNull();
    expect(await profileForKey(null)).toBeNull();
  });

  it("imports weight, active energy and workouts", async () => {
    const r = await importFromHealth(
      pid,
      {
        weight_kg: "78.4",
        active_energy_kcal: 500,
        workouts: [{ start: "2026-10-12T07:00:00+11:00", end: "2026-10-12T08:00:00+11:00", type: "Soccer" }],
      },
      today,
    );
    expect(r).toEqual({ weight: true, active_energy: true, workouts: 1 });
    expect((await test.query(`select kg from weights where profile_id = $1`, [pid])).rows).toEqual([{ kg: 78.4 }]);
    expect((await test.query(`select active_kj from activity_days where profile_id = $1`, [pid])).rows).toEqual([{ active_kj: 2092 }]);
    const w = (
      await test.query<{ type: string; duration_min: number; source: string }>(
        `select type, duration_min, source from workouts where profile_id = $1`,
        [pid],
      )
    ).rows;
    expect(w).toEqual([{ type: "soccer", duration_min: 60, source: "healthkit" }]);
    // Re-sending the same workout doesn't duplicate it.
    await importFromHealth(pid, { workouts: [{ start: "2026-10-12T07:00:00+11:00", minutes: 60, type: "Soccer" }] }, today);
    expect((await test.query(`select count(*)::int as n from workouts where profile_id = $1`, [pid])).rows[0]).toEqual({ n: 1 });
  });

  it("sends recent food and net water once, never unknown values, and not again after ack", async () => {
    const out = await pendingForHealth(pid, today);
    expect(out.energy_kj.map((s) => s.value)).toEqual([950, 1200]);
    expect(out.protein_g).toEqual([{ value: 8, date: "2026-10-12T08:00:00+11:00" }]);
    expect(out.fibre_g).toEqual([]); // no data → not written as zero
    expect(out.water_ml.map((s) => s.value)).toEqual([500]);

    await acknowledge(pid, out.ack);
    const again = await pendingForHealth(pid, today);
    expect(again.count).toBe(0);

    // More water later the same day: only the increase goes out.
    await test.query(`insert into water_logs (profile_id, date, ml) values ($1, $2, 300)`, [pid, today]);
    expect((await pendingForHealth(pid, today)).water_ml.map((s) => s.value)).toEqual([300]);
  });

  it("rejects a tampered ack", async () => {
    await expect(acknowledge(pid, "not-base64-json")).rejects.toThrow("Invalid ack");
  });
});
