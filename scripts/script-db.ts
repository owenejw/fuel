/** Database connection for CLI scripts (same rules as the app: DATABASE_URL or local PGlite). */
import type { Queryable } from "../src/server/migrations";

export async function openScriptDb(): Promise<Queryable & { close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { prepare: false, max: 1, onnotice: () => undefined });
    return {
      exec: (s) => sql.unsafe(s),
      query: async <T>(s: string, p: unknown[] = []) => (await sql.unsafe(s, p as never[])) as unknown as T[],
      close: () => sql.end(),
    };
  }
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set for this Vercel environment");
  console.log("DATABASE_URL not set — using the local PGlite database in .data/pglite (stop `npm run dev` first).");
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const dataDir = process.env.PGLITE_DIR ?? ".data/pglite";
  (await import("node:fs")).mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create({ dataDir: dataDir, extensions: { pg_trgm } });
  return {
    exec: (s) => pg.exec(s),
    query: async <T>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows,
    close: () => pg.close(),
  };
}
