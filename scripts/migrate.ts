/**
 * Apply supabase/migrations/*.sql to the database in DATABASE_URL (or the
 * local PGlite database when it's unset). Safe to re-run.
 *
 *   npm run db:migrate
 */
import { config } from "dotenv";
import { runMigrations } from "../src/server/migrations";
import { openScriptDb } from "./script-db";

config({ path: ".env.local" });
config();

const db = await openScriptDb();
await runMigrations(db, console.log);
console.log("Migrations up to date.");
await db.close();
