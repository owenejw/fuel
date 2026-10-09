import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, type Db } from "./pglite";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/**
 * One row per user-owned table: the SQL to insert a row owned by the current
 * user (user_id defaults to auth.uid()), and a column that can be updated.
 */
const OWNED_TABLES: Record<string, { insert: string; update: string }> = {
  profiles: {
    insert: `insert into public.profiles (name, sex, birth_date, height_cm) values ('X', 'male', '1990-01-01', 180) returning user_id as id`,
    update: `name = 'hacked'`,
  },
  custom_foods: {
    insert: `insert into public.custom_foods (name, energy_kj, barcode) values ('Secret bar', 900, '9300000000001') returning id`,
    update: `name = 'hacked'`,
  },
  recipes: {
    insert: `insert into public.recipes (name, servings) values ('Secret curry', 4) returning id`,
    update: `name = 'hacked'`,
  },
  meals_saved: {
    insert: `insert into public.meals_saved (name, items) values ('Brekkie', '[]') returning id`,
    update: `name = 'hacked'`,
  },
  log_entries: {
    insert: `insert into public.log_entries (date, slot, kind, name, grams, nutrients) values ('2026-10-09', 'lunch', 'quick', 'Lunch', null, '{"energy_kj": 2000}') returning id`,
    update: `name = 'hacked'`,
  },
  weights: {
    insert: `insert into public.weights (date, kg) values ('2026-10-09', 80.5) returning id`,
    update: `kg = 50`,
  },
  workouts: {
    insert: `insert into public.workouts (date, type, intensity, duration_min) values ('2026-10-09', 'run', 'hard', 45) returning id`,
    update: `duration_min = 1`,
  },
  goals: {
    insert: `insert into public.goals (effective_date, training_kj, training_protein_g, training_carbs_g, training_fat_g, training_fibre_g, rest_kj, rest_protein_g, rest_carbs_g, rest_fat_g, rest_fibre_g)
             values ('2026-10-01', 11000, 160, 300, 70, 30, 9500, 160, 200, 70, 30) returning id`,
    update: `training_kj = 1`,
  },
  water_logs: {
    insert: `insert into public.water_logs (date, ml) values ('2026-10-09', 250) returning id`,
    update: `ml = 1`,
  },
};

const pk = (table: string) => (table === "profiles" ? "user_id" : "id");

describe("row level security", () => {
  let db: Db;
  const rowsOfA: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDb();
    await db.query(`insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')`, [A, B]);
    for (const [table, { insert }] of Object.entries(OWNED_TABLES)) {
      const res = await asUser(db, A, (tx) => tx.query<{ id: string }>(insert));
      rowsOfA[table] = res.rows[0].id;
    }
  });

  it("covers every table in the public schema", async () => {
    const res = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
    );
    for (const row of res.rows) expect(row.rowsecurity, `${row.tablename} has RLS`).toBe(true);
    const userOwned = res.rows.map((r) => r.tablename).filter((t) => !["reference_foods", "invites"].includes(t));
    expect(userOwned.sort()).toEqual(Object.keys(OWNED_TABLES).sort());
  });

  for (const table of Object.keys(OWNED_TABLES)) {
    describe(table, () => {
      it("owner can read their own row", async () => {
        const res = await asUser(db, A, (tx) => tx.query(`select * from public.${table} where ${pk(table)} = $1`, [rowsOfA[table]]));
        expect(res.rows).toHaveLength(1);
      });

      it("another user cannot read it", async () => {
        const one = await asUser(db, B, (tx) => tx.query(`select * from public.${table} where ${pk(table)} = $1`, [rowsOfA[table]]));
        expect(one.rows).toHaveLength(0);
        const all = await asUser(db, B, (tx) => tx.query(`select * from public.${table} where user_id = $1`, [A]));
        expect(all.rows).toHaveLength(0);
        const count = await asUser(db, B, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from public.${table}`));
        expect(count.rows[0].n).toBe(0);
      });

      it("another user cannot update it", async () => {
        const res = await asUser(db, B, (tx) =>
          tx.query(`update public.${table} set ${OWNED_TABLES[table].update} where ${pk(table)} = $1`, [rowsOfA[table]]),
        );
        expect(res.affectedRows).toBe(0);
        const check = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${pk(table)} = $1`, [
          rowsOfA[table],
        ]);
        expect(check.rows[0].n).toBe(1);
      });

      it("another user cannot reassign their own row to the victim", async () => {
        if (table === "profiles") return; // B has no profile row to reassign
        await asUser(db, B, (tx) => tx.query(OWNED_TABLES[table].insert));
        await expect(asUser(db, B, (tx) => tx.query(`update public.${table} set user_id = $1`, [A]))).rejects.toThrow(/row-level security/);
      });

      it("another user cannot delete it", async () => {
        const res = await asUser(db, B, (tx) => tx.query(`delete from public.${table} where ${pk(table)} = $1`, [rowsOfA[table]]));
        expect(res.affectedRows).toBe(0);
        const check = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${pk(table)} = $1`, [
          rowsOfA[table],
        ]);
        expect(check.rows[0].n).toBe(1);
      });

      it("another user cannot insert a row owned by the victim", async () => {
        const sql = OWNED_TABLES[table].insert.replace(/\(([^)]*)\)\s*values\s*\(/i, `(user_id, $1) values ('${A}', `);
        await expect(asUser(db, B, (tx) => tx.query(sql))).rejects.toThrow(/row-level security|duplicate key/);
      });

      it("anonymous visitors cannot read it", async () => {
        await expect(asUser(db, null, (tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
      });
    });
  }

  it("a log entry cannot reference another user's custom food", async () => {
    await expect(
      asUser(db, B, (tx) =>
        tx.query(
          `insert into public.log_entries (date, slot, kind, custom_food_id, name, grams) values ('2026-10-09', 'snack', 'custom', $1, 'x', 50)`,
          [rowsOfA.custom_foods],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("custom food search only returns the caller's foods", async () => {
    const res = await asUser(db, B, (tx) => tx.query(`select * from public.search_custom_foods('Secret', 25)`));
    expect(res.rows.every((r) => (r as { user_id: string }).user_id === B)).toBe(true);
    const a = await asUser(db, A, (tx) => tx.query(`select * from public.search_custom_foods('Secret', 25)`));
    expect(a.rows).toHaveLength(1);
  });

  describe("reference_foods", () => {
    beforeAll(async () => {
      await db.exec(`set role service_role`);
      await db.query(
        `insert into public.reference_foods (source, source_id, name, energy_kj) values ('afcd', 'F000001', 'Apple, raw', 220)`,
      );
      await db.exec(`reset role`);
    });

    it("has no user columns", async () => {
      const res = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'reference_foods'`,
      );
      const cols = res.rows.map((r) => r.column_name);
      expect(cols.some((c) => /user|owner|created_by|looked/.test(c))).toBe(false);
    });

    it("is readable by signed-in users", async () => {
      const res = await asUser(db, B, (tx) => tx.query(`select * from public.search_reference_foods('apple', 10)`));
      expect(res.rows).toHaveLength(1);
    });

    it("is not writable by signed-in users", async () => {
      await expect(
        asUser(db, A, (tx) => tx.query(`insert into public.reference_foods (source, source_id, name) values ('usda', '1', 'x')`)),
      ).rejects.toThrow(/row-level security/);
      const upd = await asUser(db, A, (tx) => tx.query(`update public.reference_foods set name = 'hacked'`));
      expect(upd.affectedRows).toBe(0);
      const del = await asUser(db, A, (tx) => tx.query(`delete from public.reference_foods`));
      expect(del.affectedRows).toBe(0);
    });

    it("is not readable anonymously", async () => {
      await expect(asUser(db, null, (tx) => tx.query(`select * from public.reference_foods`))).rejects.toThrow(/permission denied/);
    });
  });

  it("invites are invisible to signed-in users", async () => {
    await db.query(`insert into public.invites (code) values ('SECRET-CODE')`);
    const res = await asUser(db, A, (tx) => tx.query(`select * from public.invites`));
    expect(res.rows).toHaveLength(0);
    await expect(asUser(db, A, (tx) => tx.query(`insert into public.invites (code) values ('MINE')`))).rejects.toThrow(
      /row-level security/,
    );
    const upd = await asUser(db, A, (tx) => tx.query(`update public.invites set used_at = now()`));
    expect(upd.affectedRows).toBe(0);
  });

  it("deleting a user removes all of their data", async () => {
    const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await db.query(`insert into auth.users (id, email) values ($1, 'c@example.com')`, [C]);
    for (const { insert } of Object.values(OWNED_TABLES)) await asUser(db, C, (tx) => tx.query(insert));
    await db.query(`delete from auth.users where id = $1`, [C]);
    for (const table of Object.keys(OWNED_TABLES)) {
      const res = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [C]);
      expect(res.rows[0].n, table).toBe(0);
    }
  });
});

describe("invite claiming", () => {
  it("claims a valid code exactly once and rejects expired codes", async () => {
    const db = await createTestDb();
    await db.query(
      `insert into public.invites (code, expires_at) values ('GOOD', now() + interval '1 day'), ('OLD', now() - interval '1 day')`,
    );
    await db.exec(`set role service_role`);
    const claim = async (code: string) => (await db.query<{ ok: boolean }>(`select public.claim_invite($1) as ok`, [code])).rows[0].ok;
    expect(await claim("GOOD")).toBe(true);
    expect(await claim("GOOD")).toBe(false);
    expect(await claim("OLD")).toBe(false);
    expect(await claim("MISSING")).toBe(false);
    await db.exec(`reset role`);
  });

  it("cannot be called by signed-in users", async () => {
    const db = await createTestDb();
    await db.query(`insert into auth.users (id) values ($1)`, [A]);
    await expect(asUser(db, A, (tx) => tx.query(`select public.claim_invite('X')`))).rejects.toThrow(/permission denied/);
  });
});
