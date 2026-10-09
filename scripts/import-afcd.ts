/**
 * Import the FSANZ Australian Food Composition Database (AFCD) into
 * reference_foods.
 *
 *   npm run seed:afcd                       # downloads Release 3 from FSANZ
 *   npm run seed:afcd -- ./path/to/file.xlsx
 *   npm run seed:afcd -- --dry-run          # parse only, print a sample
 *
 * Writes to DATABASE_URL (from .env.local), or the local PGlite database when unset.
 */
import { config } from "dotenv";
import ExcelJS from "exceljs";
import { mapAfcdHeaders, parseAfcdRow, type ReferenceFoodRow } from "../src/lib/foods/parsers";
import { UPSERT_REFERENCE_FOODS } from "../src/lib/foods/sql";
import { runMigrations } from "../src/server/migrations";
import { openScriptDb } from "./script-db";

config({ path: ".env.local" });
config();

const DEFAULT_URL = "https://www.foodstandards.gov.au/sites/default/files/2025-12/AFCD%20Release%203%20-%20Nutrient%20profiles.xlsx";
const SHEET = /solids.*per 100 ?g/i;

export async function parseAfcdWorkbook(buffer: ArrayBuffer): Promise<ReferenceFoodRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets.find((w) => SHEET.test(w.name));
  if (!ws) throw new Error(`No sheet matching ${SHEET} (found: ${wb.worksheets.map((w) => w.name).join(", ")})`);

  let headerRow = 0;
  for (let r = 1; r <= 10 && !headerRow; r++) {
    const values = ws.getRow(r).values as unknown[];
    if (
      values.some(
        (v) =>
          String(v ?? "")
            .trim()
            .toLowerCase() === "public food key",
      )
    )
      headerRow = r;
  }
  if (!headerRow) throw new Error("Could not find the header row (expected a 'Public Food Key' column)");
  const cols = mapAfcdHeaders(ws.getRow(headerRow).values as unknown[]);

  const rows: ReferenceFoodRow[] = [];
  ws.eachRow((row, n) => {
    if (n <= headerRow) return;
    const cells = (row.values as unknown[]).map((v) =>
      v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v,
    );
    const parsed = parseAfcdRow(cells, cols);
    if (parsed) rows.push(parsed);
  });
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const source = args.find((a) => !a.startsWith("--")) ?? DEFAULT_URL;

  console.log(`Reading ${source}`);
  let buffer: ArrayBuffer;
  if (/^https?:/.test(source)) {
    const res = await fetch(source, { headers: { "User-Agent": "Mozilla/5.0 (AFCD import script)" } });
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    buffer = await res.arrayBuffer();
  } else {
    const { readFile } = await import("node:fs/promises");
    const file = await readFile(source);
    buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  }

  const rows = await parseAfcdWorkbook(buffer);
  console.log(`Parsed ${rows.length} foods`);
  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  const db = await openScriptDb();
  await runMigrations(db, console.log);
  const BATCH = 250;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.query(UPSERT_REFERENCE_FOODS, [JSON.stringify(rows.slice(i, i + BATCH))]);
    process.stdout.write(`\rImported ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  await db.close();
  console.log("\nDone.");
}

if (process.argv[1]?.includes("import-afcd")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
