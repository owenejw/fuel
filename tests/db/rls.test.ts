import { beforeAll, describe, expect, it } from "vitest";
import { asRole, createTestDb, type Db } from "./pglite";

/**
 * The app has no sign-in; only the server's own connection may touch data.
 * These tests check that Supabase's public API roles can't read or write
 * anything, and that profiles' data is scoped and cleaned up correctly.
 */
describe("database access", () => {
  let db: Db;
  let jez: string;
  let owen: string;

  beforeAll(async () => {
    db = await createTestDb();
    const rows = (await db.query<{ id: string; name: string }>(`select id, name from profiles order by name`)).rows;
    jez = rows.find((r) => r.name === "Jez")!.id;
    owen = rows.find((r) => r.name === "Owen")!.id;
    await db.query(
      `insert into log_entries (profile_id, date, slot, kind, name, nutrients) values ($1, '2026-10-09', 'lunch', 'quick', 'Lunch', '{"energy_kj": 2000}')`,
      [owen],
    );
    await db.query(`insert into weights (profile_id, date, kg) values ($1, '2026-10-09', 80)`, [owen]);
  });

  it("seeds the household profiles", async () => {
    const names = (await db.query<{ name: string }>(`select name from profiles order by name`)).rows.map((r) => r.name);
    expect(names).toEqual(["Jez", "Levi", "Owen"]);
  });

  it("enables RLS on every table", async () => {
    const res = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    expect(res.rows.length).toBeGreaterThan(10);
    for (const r of res.rows) expect(r.rowsecurity, r.tablename).toBe(true);
  });

  for (const role of ["anon", "authenticated"] as const) {
    it(`gives the Supabase "${role}" role no access to any table`, async () => {
      const tables = (await db.query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public'`)).rows.map(
        (r) => r.tablename,
      );
      for (const t of tables) {
        await expect(
          asRole(db, role, (tx) => tx.query(`select * from ${t} limit 1`)),
          `${role} select ${t}`,
        ).rejects.toThrow(/permission denied/);
        await expect(
          asRole(db, role, (tx) => tx.query(`delete from ${t}`)),
          `${role} delete ${t}`,
        ).rejects.toThrow(/permission denied/);
      }
    });
  }

  it("keeps each profile's log separate", async () => {
    const jezLog = await db.query(`select * from log_entries where profile_id = $1`, [jez]);
    expect(jezLog.rows).toHaveLength(0);
  });

  it("allows one weigh-in per profile per day", async () => {
    await expect(db.query(`insert into weights (profile_id, date, kg) values ($1, '2026-10-09', 81)`, [owen])).rejects.toThrow(/duplicate/);
    await db.query(`insert into weights (profile_id, date, kg) values ($1, '2026-10-09', 70)`, [jez]);
  });

  it("stores unknown nutrients as absent, not zero", async () => {
    const row = (await db.query<{ nutrients: Record<string, number> }>(`select nutrients from log_entries where profile_id = $1`, [owen]))
      .rows[0];
    expect(row.nutrients).toEqual({ energy_kj: 2000 });
  });

  it("removes a profile's personal data when the profile is deleted, keeping shared foods", async () => {
    const [{ id }] = (await db.query<{ id: string }>(`insert into profiles (name) values ('Temp') returning id`)).rows;
    await db.query(`insert into log_entries (profile_id, date, slot, kind, name) values ($1, '2026-10-09', 'snack', 'quick', 'x')`, [id]);
    await db.query(`insert into custom_foods (profile_id, name, energy_kj) values ($1, 'Shared bar', 900)`, [id]);
    await db.query(`delete from profiles where id = $1`, [id]);
    expect((await db.query(`select * from log_entries where profile_id = $1`, [id])).rows).toHaveLength(0);
    const food = (await db.query<{ profile_id: string | null }>(`select profile_id from custom_foods where name = 'Shared bar'`)).rows[0];
    expect(food.profile_id).toBeNull();
  });

  it("re-running migrations is a no-op", async () => {
    const { runMigrations } = await import("@/server/migrations");
    await runMigrations({ exec: (s) => db.exec(s), query: async <T>(s: string, p?: unknown[]) => (await db.query<T>(s, p)).rows });
    expect((await db.query(`select * from profiles`)).rows).toHaveLength(3);
  });
});
