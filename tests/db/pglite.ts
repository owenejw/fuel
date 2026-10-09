import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const root = path.resolve(__dirname, "../..");

/** Fresh in-memory Postgres with the Supabase shim and all migrations applied. */
export async function createTestDb() {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(readFileSync(path.join(__dirname, "supabase-shim.sql"), "utf8"));
  const dir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createTestDb>>;

/** Run `fn` as an authenticated user (or anon when userId is null), like PostgREST does. */
export async function asUser<T>(db: Db, userId: string | null, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    return fn(tx as unknown as Db);
  });
}
