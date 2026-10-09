/**
 * Apply supabase/migrations/*.sql to the database in DATABASE_URL (or the
 * local PGlite database when it's unset). Safe to re-run.
 *
 *   npm run db:migrate            # local / manual
 *   npm run db:migrate:deploy     # run by Vercel before each build
 *
 * On Vercel:
 * - Production builds always migrate the production database.
 * - Preview builds migrate only when ALLOW_PREVIEW_MIGRATIONS=1, which should
 *   be set only when previews get their own database branch (Neon preview
 *   branching). Otherwise a pull request could change the live database.
 */
import { config } from "dotenv";
import { runMigrations } from "../src/server/migrations";
import { openScriptDb } from "./script-db";

config({ path: ".env.local" });
config();

if (process.argv.includes("--deploy")) {
  const env = process.env.VERCEL_ENV;
  if (!env) {
    console.log("Not on Vercel — skipping deploy migrations.");
    process.exit(0);
  }
  if (env !== "production" && process.env.ALLOW_PREVIEW_MIGRATIONS !== "1") {
    console.log(`Vercel ${env} build: skipping migrations (set ALLOW_PREVIEW_MIGRATIONS=1 once previews have their own database).`);
    process.exit(0);
  }
}

async function main() {
  const db = await openScriptDb();
  await runMigrations(db, console.log);
  console.log("Migrations up to date.");
  await db.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
