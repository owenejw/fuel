import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { runMigrations } from "@/server/migrations";

/** Roles Supabase exposes through its REST API; the schema must lock them out. */
const SUPABASE_ROLES = `
  create role anon nologin;
  create role authenticated nologin;
  -- Supabase grants table privileges to these roles by default.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

/** Fresh in-memory Postgres with the migrations applied (as on Supabase). */
export async function createTestDb() {
  const db = await PGlite.create({ extensions: { pg_trgm }, parsers: { 1082: (x: string) => x, 1700: (x: string) => Number(x) } });
  await db.exec(SUPABASE_ROLES);
  await runMigrations({ exec: (s) => db.exec(s), query: async <T>(s: string, p?: unknown[]) => (await db.query<T>(s, p)).rows });
  return db;
}

export type Db = Awaited<ReturnType<typeof createTestDb>>;

export async function asRole<T>(db: Db, role: "anon" | "authenticated", fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    return fn(tx as unknown as Db);
  });
}
