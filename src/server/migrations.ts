import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type Queryable = { exec: (sql: string) => Promise<unknown>; query: <T>(sql: string, params?: unknown[]) => Promise<T[]> };

const DIR = path.join(process.cwd(), "supabase/migrations");

/** Apply any migrations in supabase/migrations that haven't run yet. */
export async function runMigrations(db: Queryable, log: (msg: string) => void = () => undefined) {
  await db.exec(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query<{ name: string }>(`select name from _migrations`)).map((r) => r.name));
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    log(`Applying ${file}`);
    await db.exec(
      `begin;\n${readFileSync(path.join(DIR, file), "utf8")}\n;insert into _migrations (name) values ('${file.replace(/'/g, "''")}');\ncommit;`,
    );
  }
}
