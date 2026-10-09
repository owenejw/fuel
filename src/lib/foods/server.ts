import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabase/admin";
import { parseOffProduct, parseUsdaFood, type ReferenceFoodRow, type UsdaFood } from "./parsers";
import { rowToFood } from "./shared";
import type { Food } from "../types";

const OFF_USER_AGENT = process.env.OFF_USER_AGENT || "NutritionTracker/0.1 (personal nutrition app)";
const USDA_KEY = process.env.USDA_API_KEY;
const FETCH_TIMEOUT_MS = 6000;

/**
 * Write public-source rows into the shared cache. Uses the service role
 * because reference_foods is not writable by users. Nothing about who caused
 * the lookup is stored.
 */
async function cacheReferenceFoods(rows: ReferenceFoodRow[]) {
  if (!rows.length) return [];
  const { data, error } = await supabaseAdmin()
    .from("reference_foods")
    .upsert(
      rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
      { onConflict: "source,source_id" },
    )
    .select();
  if (error) {
    console.error("reference cache upsert failed", error.message);
    return [];
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Barcode
// ---------------------------------------------------------------------------

export async function lookupBarcode(supabase: SupabaseClient, code: string): Promise<Food | null> {
  // 1. The user's own custom foods (RLS scopes this to the caller).
  const custom = await supabase.from("custom_foods").select("*").eq("barcode", code).limit(1);
  if (custom.data?.length) return rowToFood(custom.data[0], "custom");

  // 2. Shared reference cache.
  const cached = await supabase.from("reference_foods").select("*").eq("barcode", code).order("source").limit(1);
  if (cached.data?.length) return rowToFood(cached.data[0], "reference");

  // 3. Open Food Facts.
  const off = await fetchOff(code);
  if (off) {
    const [saved] = await cacheReferenceFoods([off]);
    return saved ? rowToFood(saved, "reference") : rowToFood({ ...off, id: `off:${code}` }, "reference");
  }

  // 4. USDA branded foods (GTIN/UPC) as a last resort.
  const usda = (await usdaSearch(code, ["Branded"])).filter((r) => r.barcode && sameBarcode(r.barcode, code));
  if (usda.length) {
    const [saved] = await cacheReferenceFoods([{ ...usda[0], barcode: code }]);
    if (saved) return rowToFood(saved, "reference");
  }
  return null;
}

function sameBarcode(a: string, b: string) {
  return a.replace(/^0+/, "") === b.replace(/^0+/, "");
}

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
// Text search
// ---------------------------------------------------------------------------

const USDA_MIN_LOCAL_RESULTS = 8;
// Remember which queries have already been pulled from USDA (per server
// instance) so repeated searches stay local. Holds query text only.
const usdaFetched = new Map<string, number>();
const USDA_MEMO_MS = 24 * 60 * 60 * 1000;

export async function searchFoods(supabase: SupabaseClient, q: string): Promise<Food[]> {
  const query = q.trim().slice(0, 100);
  if (query.length < 2) return [];

  const [custom, reference] = await Promise.all([
    supabase.rpc("search_custom_foods", { q: query, max_results: 15 }),
    supabase.rpc("search_reference_foods", { q: query, max_results: 30 }),
  ]);
  const customFoods = (custom.data ?? []).map((r: Record<string, unknown>) => rowToFood(r, "custom"));
  let referenceRows: Record<string, unknown>[] = reference.data ?? [];

  const key = query.toLowerCase();
  const memo = usdaFetched.get(key);
  if (referenceRows.length < USDA_MIN_LOCAL_RESULTS && query.length >= 3 && (!memo || Date.now() - memo > USDA_MEMO_MS)) {
    usdaFetched.set(key, Date.now());
    if (usdaFetched.size > 5000) usdaFetched.delete(usdaFetched.keys().next().value!);
    const saved = await cacheReferenceFoods(await usdaSearch(query));
    const seen = new Set(referenceRows.map((r) => r.id));
    referenceRows = [...referenceRows, ...saved.filter((r) => !seen.has(r.id))];
  }

  return [...customFoods, ...referenceRows.map((r) => rowToFood(r, "reference"))];
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
    const json = (await res.json()) as { foods?: UsdaFood[] };
    return (json.foods ?? []).map(parseUsdaFood).filter((r): r is ReferenceFoodRow => r !== null && r.energy_kj !== undefined);
  } catch (err) {
    console.error("USDA search failed", err);
    return [];
  }
}
