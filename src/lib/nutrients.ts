/**
 * Nutrient definitions and arithmetic.
 *
 * Unknown values are `null`/absent and must never be treated as zero for
 * display. Sums track how many items were missing each nutrient so the UI can
 * mark a total as incomplete.
 */

export const NUTRIENTS = [
  { key: "energy_kj", label: "Energy", unit: "kJ", macro: true },
  { key: "protein_g", label: "Protein", unit: "g", macro: true },
  { key: "fat_g", label: "Fat", unit: "g", macro: true },
  { key: "sat_fat_g", label: "Saturated fat", unit: "g", macro: false },
  { key: "carbs_g", label: "Carbohydrate", unit: "g", macro: true },
  { key: "sugars_g", label: "Sugars", unit: "g", macro: false },
  { key: "fibre_g", label: "Fibre", unit: "g", macro: false },
  { key: "sodium_mg", label: "Sodium", unit: "mg", macro: false },
  { key: "potassium_mg", label: "Potassium", unit: "mg", macro: false },
  { key: "calcium_mg", label: "Calcium", unit: "mg", macro: false },
  { key: "iron_mg", label: "Iron", unit: "mg", macro: false },
  { key: "magnesium_mg", label: "Magnesium", unit: "mg", macro: false },
  { key: "zinc_mg", label: "Zinc", unit: "mg", macro: false },
  { key: "vit_a_ug", label: "Vitamin A", unit: "µg", macro: false },
  { key: "vit_c_mg", label: "Vitamin C", unit: "mg", macro: false },
  { key: "vit_d_ug", label: "Vitamin D", unit: "µg", macro: false },
  { key: "vit_e_mg", label: "Vitamin E", unit: "mg", macro: false },
  { key: "vit_b12_ug", label: "Vitamin B12", unit: "µg", macro: false },
  { key: "folate_ug", label: "Folate", unit: "µg", macro: false },
  { key: "water_ml", label: "Water", unit: "ml", macro: false },
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number]["key"];
export const NUTRIENT_KEYS: NutrientKey[] = NUTRIENTS.map((n) => n.key);

/** The seven values an Australian nutrition information panel must show. */
export const PANEL_KEYS: NutrientKey[] = ["energy_kj", "protein_g", "fat_g", "sat_fat_g", "carbs_g", "sugars_g", "sodium_mg"];

/** Nutrient values; a missing key or null means "no data". */
export type Nutrients = Partial<Record<NutrientKey, number | null>>;

export function nutrientDef(key: NutrientKey) {
  return NUTRIENTS.find((n) => n.key === key)!;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pull nutrient columns out of a DB row (numeric columns may arrive as strings). */
export function pickNutrients(row: Record<string, unknown>): Nutrients {
  const out: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    const n = toNumber(row[key]);
    if (n !== null) out[key] = n;
  }
  return out;
}

/** Scale per-100 g values to an amount in grams. Unknowns stay unknown. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const out: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    const v = per100[key];
    if (v !== null && v !== undefined) out[key] = round((v * grams) / 100, key === "energy_kj" ? 0 : 2);
  }
  return out;
}

export type NutrientTotals = {
  /** Sum of known values; null when no item had data for that nutrient. */
  totals: Record<NutrientKey, number | null>;
  /** Number of items with no data for each nutrient. */
  missing: Record<NutrientKey, number>;
  count: number;
};

export function sumNutrients(items: Nutrients[]): NutrientTotals {
  const totals = {} as Record<NutrientKey, number | null>;
  const missing = {} as Record<NutrientKey, number>;
  for (const key of NUTRIENT_KEYS) {
    let sum: number | null = null;
    let miss = 0;
    for (const item of items) {
      const v = item[key];
      if (v === null || v === undefined) miss++;
      else sum = (sum ?? 0) + v;
    }
    totals[key] = sum === null ? null : round(sum, 2);
    missing[key] = miss;
  }
  return { totals, missing, count: items.length };
}

export function isIncomplete(t: NutrientTotals, key: NutrientKey) {
  return t.missing[key] > 0;
}

/** Merge totals from several groups (e.g. meal slots) into one. */
export function combineTotals(groups: NutrientTotals[]): NutrientTotals {
  const totals = {} as Record<NutrientKey, number | null>;
  const missing = {} as Record<NutrientKey, number>;
  for (const key of NUTRIENT_KEYS) {
    let sum: number | null = null;
    let miss = 0;
    for (const g of groups) {
      if (g.totals[key] !== null) sum = (sum ?? 0) + (g.totals[key] as number);
      miss += g.missing[key];
    }
    totals[key] = sum === null ? null : round(sum, 2);
    missing[key] = miss;
  }
  return { totals, missing, count: groups.reduce((n, g) => n + g.count, 0) };
}

export function round(n: number, dp = 1) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Format a nutrient amount for display; unknown → "no data". */
export function formatAmount(v: number | null | undefined, key: NutrientKey, opts: { unit?: boolean } = {}) {
  if (v === null || v === undefined) return "no data";
  const def = nutrientDef(key);
  const dp = def.unit === "g" ? (Math.abs(v) < 10 ? 1 : 0) : def.unit === "µg" || (def.unit === "mg" && Math.abs(v) < 10) ? 1 : 0;
  const text = round(v, dp).toLocaleString("en-AU", { maximumFractionDigits: dp });
  return opts.unit === false ? text : `${text} ${def.unit}`;
}
