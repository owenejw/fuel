import "server-only";
import { db, json, type Row } from "@/server/db";
import { recipeToFood, toRecipe } from "@/server/repo";
import { parseOffProduct, parseUsdaFood, type ReferenceFoodRow, type UsdaFood } from "./parsers";
import { rowToFood } from "./shared";
import { UPSERT_REFERENCE_FOODS, wordMatch } from "./sql";
import type { Food } from "../types";

const OFF_USER_AGENT = process.env.OFF_USER_AGENT || "Fuel/0.1 (household nutrition app)";
const USDA_KEY = process.env.USDA_API_KEY;
const FETCH_TIMEOUT_MS = 6000;

/** Write public-source rows into the shared reference cache. */
async function cacheReferenceFoods(rows: ReferenceFoodRow[]): Promise<Row[]> {
  if (!rows.length) return [];
  // Same food can appear twice in one USDA page; keep one per source_id.
  const unique = [...new Map(rows.map((r) => [`${r.source}:${r.source_id}`, r])).values()];
  try {
    return await (await db()).query(UPSERT_REFERENCE_FOODS, [json(unique)]);
  } catch (err) {
    console.error("reference cache upsert failed", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Barcode: household foods → cache → Open Food Facts → USDA (GTIN)
// ---------------------------------------------------------------------------

export async function lookupBarcode(code: string): Promise<Food | null> {
  const d = await db();
  const custom = await d.query(`select * from custom_foods where barcode = $1 order by updated_at desc limit 1`, [code]);
  if (custom[0]) return rowToFood(custom[0], "custom");

  const cached = await d.query(`select * from reference_foods where barcode = $1 order by source limit 1`, [code]);
  if (cached[0]) return rowToFood(cached[0], "reference");

  const off = await fetchOff(code);
  if (off) {
    const [saved] = await cacheReferenceFoods([off]);
    if (saved) return rowToFood(saved, "reference");
  }

  const usda = (await usdaSearch(code, ["Branded"])).filter((r) => r.barcode && sameBarcode(r.barcode, code));
  if (usda.length) {
    const [saved] = await cacheReferenceFoods([{ ...usda[0], barcode: code }]);
    if (saved) return rowToFood(saved, "reference");
  }
  return null;
}

const sameBarcode = (a: string, b: string) => a.replace(/^0+/, "") === b.replace(/^0+/, "");

async function fetchOff(code: string): Promise<ReferenceFoodRow | null> {
  try {
    const fields = "code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,serving_quantity_unit,nutriments";
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`, {
      headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OFF ${res.status}`);
    return parseOffProduct(code, await res.json());
  } catch (err) {
    console.error("Open Food Facts lookup failed", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Text search: household foods + recipes → cache → USDA fallback
// ---------------------------------------------------------------------------

const USDA_MIN_LOCAL_RESULTS = 8;
const usdaFetched = new Map<string, number>();
const USDA_MEMO_MS = 24 * 60 * 60 * 1000;

export async function searchFoods(q: string): Promise<Food[]> {
  const query = q.trim().slice(0, 100);
  if (query.length < 2) return [];
  const d = await db();

  const [custom, recipes, reference] = await Promise.all([
    d.query(`select c.* from custom_foods c where ${wordMatch("c", "$1")} order by similarity(c.name, $1) desc, length(c.name) limit 15`, [
      query,
    ]),
    d.query(`select r.* from recipes r where r.name ilike '%' || $1 || '%' order by similarity(r.name, $1) desc limit 5`, [query]),
    d.query(
      `select r.* from reference_foods r where ${wordMatch("r", "$1")}
       order by (r.source = 'afcd') desc, similarity(r.name, $1) desc, length(r.name) limit 30`,
      [query],
    ),
  ]);
  let referenceRows = reference;

  const key = query.toLowerCase();
  const memo = usdaFetched.get(key);
  if (referenceRows.length < USDA_MIN_LOCAL_RESULTS && query.length >= 3 && (!memo || Date.now() - memo > USDA_MEMO_MS)) {
    usdaFetched.set(key, Date.now());
    if (usdaFetched.size > 5000) usdaFetched.delete(usdaFetched.keys().next().value!);
    const saved = await cacheReferenceFoods(await usdaSearch(query));
    const seen = new Set(referenceRows.map((r) => r.id));
    referenceRows = [...referenceRows, ...saved.filter((r) => !seen.has(r.id))];
  }

  return [
    ...custom.map((r) => rowToFood(r, "custom")),
    ...recipes.map((r) => recipeToFood(toRecipe(r))),
    ...referenceRows.map((r) => rowToFood(r, "reference")),
  ];
}

const USDA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"];

async function usdaSearch(query: string, dataTypes = USDA_TYPES): Promise<ReferenceFoodRow[]> {
  if (!USDA_KEY) return [];
  try {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(USDA_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, dataType: dataTypes, pageSize: 20 }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`USDA ${res.status}`);
    const body = (await res.json()) as { foods?: UsdaFood[] };
    return (body.foods ?? []).map(parseUsdaFood).filter((r): r is ReferenceFoodRow => r !== null && r.energy_kj !== undefined);
  } catch (err) {
    console.error("USDA search failed", err);
    return [];
  }
}

export async function getFood(kind: Food["kind"], id: string): Promise<Food | null> {
  const d = await db();
  if (kind === "recipe") {
    const rows = await d.query(`select * from recipes where id = $1`, [id]);
    return rows[0] ? recipeToFood(toRecipe(rows[0])) : null;
  }
  const rows = await d.query(`select * from ${kind === "custom" ? "custom_foods" : "reference_foods"} where id = $1`, [id]);
  return rows[0] ? rowToFood(rows[0], kind) : null;
}
