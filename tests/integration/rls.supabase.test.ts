/**
 * RLS check against a real Supabase project (your dev project, never prod).
 * Creates two throwaway users, has user A write a row to every table, and
 * confirms user B can't read, change or delete any of it. Users are deleted
 * afterwards.
 *
 *   RUN_SUPABASE_RLS_TESTS=1 npm run test:rls:live
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
 * SUPABASE_SECRET_KEY in .env.local, and email+password sign-in enabled.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
const enabled = process.env.RUN_SUPABASE_RLS_TESTS === "1" && url && anonKey && secret;

const ROWS: Record<string, Record<string, unknown>> = {
  profiles: { name: "A" },
  custom_foods: { name: "A secret food", energy_kj: 100 },
  recipes: { name: "A recipe", servings: 2 },
  meals_saved: { name: "A meal", items: [] },
  log_entries: { date: "2026-01-01", slot: "lunch", kind: "quick", name: "A lunch", nutrients: { energy_kj: 1000 } },
  weights: { date: "2026-01-01", kg: 80 },
  workouts: { date: "2026-01-01", type: "run", intensity: "easy" },
  goals: {
    effective_date: "2026-01-01",
    training_kj: 1,
    training_protein_g: 1,
    training_carbs_g: 1,
    training_fat_g: 1,
    training_fibre_g: 1,
    rest_kj: 1,
    rest_protein_g: 1,
    rest_carbs_g: 1,
    rest_fat_g: 1,
    rest_fibre_g: 1,
  },
  water_logs: { date: "2026-01-01", ml: 250 },
};
const UPDATES: Record<string, Record<string, unknown>> = {
  profiles: { name: "hacked" },
  custom_foods: { name: "hacked" },
  recipes: { name: "hacked" },
  meals_saved: { name: "hacked" },
  log_entries: { name: "hacked" },
  weights: { kg: 50 },
  workouts: { duration_min: 1 },
  goals: { rest_kj: 2 },
  water_logs: { ml: 1 },
};
const pk = (t: string) => (t === "profiles" ? "user_id" : "id");

describe.skipIf(!enabled)("RLS on live Supabase", () => {
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const users: { id: string; client: SupabaseClient }[] = [];
  const ids: Record<string, string> = {};

  async function makeUser(tag: string) {
    const email = `rls-test-${tag}-${Date.now()}@example.com`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    users.push({ id: data.user.id, client });
    return { id: data.user.id, client };
  }

  beforeAll(async () => {
    const a = await makeUser("a");
    await makeUser("b");
    for (const [table, row] of Object.entries(ROWS)) {
      const { data, error } = await a.client
        .from(table)
        .insert({ ...row, user_id: a.id })
        .select(pk(table))
        .single();
      if (error) throw new Error(`${table}: ${error.message}`);
      ids[table] = (data as Record<string, string>)[pk(table)];
    }
  });

  afterAll(async () => {
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
  });

  for (const table of Object.keys(ROWS)) {
    it(`${table}: user B cannot read, update, delete or forge A's rows`, async () => {
      const [a, b] = users;
      const read = await b.client.from(table).select("*").eq(pk(table), ids[table]);
      expect(read.data).toEqual([]);

      const upd = await b.client.from(table).update(UPDATES[table]).eq(pk(table), ids[table]).select();
      expect(upd.data ?? []).toEqual([]);

      const del = await b.client.from(table).delete().eq(pk(table), ids[table]).select();
      expect(del.data ?? []).toEqual([]);

      const forged = await b.client.from(table).insert({ ...ROWS[table], user_id: a.id });
      expect(forged.error).not.toBeNull();

      const still = await admin.from(table).select("*").eq(pk(table), ids[table]);
      expect(still.data).toHaveLength(1);
    });
  }

  it("reference_foods is read-only and invites are invisible", async () => {
    const [, b] = users;
    const ins = await b.client.from("reference_foods").insert({ source: "usda", source_id: `x-${Date.now()}`, name: "x" });
    expect(ins.error).not.toBeNull();
    const inv = await b.client.from("invites").select("*");
    expect(inv.data ?? []).toEqual([]);
  });

  it("anonymous clients see nothing", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    for (const table of Object.keys(ROWS)) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
  });
});
