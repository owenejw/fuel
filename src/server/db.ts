import "server-only";
import { runMigrations, type Queryable } from "./migrations";
import { PGLITE_PARSERS, POSTGRES_TYPES } from "./pg-types";

export type Row = Record<string, unknown>;
export type Db = {
  query: <T = Row>(text: string, params?: unknown[]) => Promise<T[]>;
};

const g = globalThis as { __fuelDb?: Promise<Db> };

/** Shared connection: Postgres (Supabase) when DATABASE_URL is set, otherwise local PGlite. */
export function db(): Promise<Db> {
  g.__fuelDb ??= connect().catch((err) => {
    g.__fuelDb = undefined;
    throw err;
  });
  return g.__fuelDb;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, {
      prepare: false, // required by Supabase's transaction pooler
      max: 5,
      idle_timeout: 20,
      types: POSTGRES_TYPES,
    });
    return { query: async <T>(text: string, params: unknown[] = []) => (await sql.unsafe(text, params as never[])) as unknown as T[] };
  }

  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set");
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const dataDir = process.env.PGLITE_DIR ?? ".data/pglite";
  (await import("node:fs")).mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create({
    dataDir: dataDir,
    extensions: { pg_trgm },
    parsers: PGLITE_PARSERS,
  });
  const q: Queryable = {
    exec: (s) => pg.exec(s),
    query: async <T>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows,
  };
  await runMigrations(q, (m) => console.log(`[pglite] ${m}`));
  return { query: q.query };
}

/** Serialise a value for a `$n::jsonb` parameter. */
export const json = (v: unknown) => JSON.stringify(v ?? null);
