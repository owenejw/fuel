/**
 * Pure parsers that turn public-source payloads into reference_foods rows.
 * No user data ever enters these rows.
 */
import { kcalToKj } from "../energy";
import { NUTRIENT_KEYS, round, type NutrientKey, type Nutrients } from "../nutrients";
import type { FoodSource } from "../types";

export type ReferenceFoodRow = {
  source: FoodSource;
  source_id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  serve_size_g: number | null;
  serve_label: string | null;
} & Nutrients;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function clean(row: ReferenceFoodRow): ReferenceFoodRow {
  for (const key of NUTRIENT_KEYS) {
    const v = row[key];
    if (v === undefined || v === null) delete row[key];
    else row[key] = round(v, key === "energy_kj" ? 1 : 3);
  }
  return row;
}

// ---------------------------------------------------------------------------
// Open Food Facts (API v2). `nutriments.*_100g` are normalised to grams for
// mass nutrients, and kJ for energy-kj.
// ---------------------------------------------------------------------------

const OFF_MAP: [NutrientKey, string[], number][] = [
  ["protein_g", ["proteins_100g"], 1],
  ["fat_g", ["fat_100g"], 1],
  ["sat_fat_g", ["saturated-fat_100g"], 1],
  ["carbs_g", ["carbohydrates_100g"], 1],
  ["sugars_g", ["sugars_100g"], 1],
  ["fibre_g", ["fiber_100g"], 1],
  ["sodium_mg", ["sodium_100g"], 1000],
  ["potassium_mg", ["potassium_100g"], 1000],
  ["calcium_mg", ["calcium_100g"], 1000],
  ["iron_mg", ["iron_100g"], 1000],
  ["magnesium_mg", ["magnesium_100g"], 1000],
  ["zinc_mg", ["zinc_100g"], 1000],
  ["vit_a_ug", ["vitamin-a_100g"], 1e6],
  ["vit_c_mg", ["vitamin-c_100g"], 1000],
  ["vit_d_ug", ["vitamin-d_100g"], 1e6],
  ["vit_e_mg", ["vitamin-e_100g"], 1000],
  ["vit_b12_ug", ["vitamin-b12_100g"], 1e6],
  ["folate_ug", ["folates_100g", "vitamin-b9_100g"], 1e6],
];

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  nutriments?: Record<string, unknown>;
};

export function parseOffProduct(barcode: string, payload: { status?: number; product?: OffProduct }): ReferenceFoodRow | null {
  const p = payload?.product;
  if (!p || payload.status === 0) return null;
  const name = (p.product_name_en || p.product_name || p.generic_name || "").trim();
  if (!name) return null;
  const n = p.nutriments ?? {};

  const row: ReferenceFoodRow = {
    source: "off",
    source_id: barcode,
    barcode,
    name,
    brand: p.brands?.split(",")[0]?.trim() || null,
    serve_size_g: null,
    serve_label: p.serving_size?.trim() || null,
  };

  let kj = num(n["energy-kj_100g"]);
  if (kj === null) {
    const kcal = num(n["energy-kcal_100g"]);
    if (kcal !== null) kj = kcalToKj(kcal);
    else if (n["energy_unit"] === "kJ" || n["energy_unit"] === undefined) kj = num(n["energy_100g"]);
  }
  if (kj !== null) row.energy_kj = kj;

  for (const [key, fields, factor] of OFF_MAP) {
    for (const f of fields) {
      const v = num(n[f]);
      if (v !== null) {
        row[key] = v * factor;
        break;
      }
    }
  }

  const sq = num(p.serving_quantity);
  const unit = (p.serving_quantity_unit || "g").toLowerCase();
  if (sq && sq > 0 && (unit === "g" || unit === "ml")) row.serve_size_g = sq;

  return clean(row);
}

// ---------------------------------------------------------------------------
// USDA FoodData Central. Values are per 100 g. Matched by nutrient number.
// ---------------------------------------------------------------------------

const USDA_MAP: [NutrientKey, string[]][] = [
  ["protein_g", ["203"]],
  ["fat_g", ["204"]],
  ["sat_fat_g", ["606"]],
  ["carbs_g", ["205"]],
  ["sugars_g", ["269", "539"]],
  ["fibre_g", ["291"]],
  ["sodium_mg", ["307"]],
  ["potassium_mg", ["306"]],
  ["calcium_mg", ["301"]],
  ["iron_mg", ["303"]],
  ["magnesium_mg", ["304"]],
  ["zinc_mg", ["309"]],
  ["vit_a_ug", ["320"]],
  ["vit_c_mg", ["401"]],
  ["vit_d_ug", ["328"]],
  ["vit_e_mg", ["323"]],
  ["vit_b12_ug", ["418"]],
  ["folate_ug", ["435", "417"]],
  ["water_ml", ["255"]],
];

type UsdaNutrient = {
  nutrientNumber?: string;
  value?: number;
  amount?: number;
  unitName?: string;
  nutrient?: { number?: string; unitName?: string };
};

export type UsdaFood = {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: UsdaNutrient[];
};

export function parseUsdaFood(food: UsdaFood): ReferenceFoodRow | null {
  if (!food?.fdcId || !food.description) return null;
  const byNumber = new Map<string, { value: number; unit: string }>();
  for (const fn of food.foodNutrients ?? []) {
    const number = fn.nutrientNumber ?? fn.nutrient?.number;
    const value = num(fn.value ?? fn.amount);
    if (!number || value === null) continue;
    if (!byNumber.has(number)) byNumber.set(number, { value, unit: (fn.unitName ?? fn.nutrient?.unitName ?? "").toUpperCase() });
  }

  const row: ReferenceFoodRow = {
    source: "usda",
    source_id: String(food.fdcId),
    barcode: food.gtinUpc?.replace(/\D/g, "") || null,
    name: titleCase(food.description),
    brand: food.brandName || food.brandOwner || null,
    serve_size_g: null,
    serve_label: food.householdServingFullText || null,
  };

  // Energy: prefer kJ (268), then kcal (208), then Atwater kcal (958, 957).
  const kj = byNumber.get("268");
  const kcal = byNumber.get("208") ?? byNumber.get("958") ?? byNumber.get("957");
  if (kj) row.energy_kj = kj.value;
  else if (kcal) row.energy_kj = kcalToKj(kcal.value);

  for (const [key, numbers] of USDA_MAP) {
    for (const nb of numbers) {
      const v = byNumber.get(nb);
      if (v) {
        row[key] = v.value;
        break;
      }
    }
  }

  const unit = food.servingSizeUnit?.toLowerCase();
  if (food.servingSize && (unit === "g" || unit === "grm" || unit === "ml" || unit === "mlt")) row.serve_size_g = food.servingSize;

  return clean(row);
}

function titleCase(s: string) {
  // FDC descriptions are often SHOUTING (branded) — soften them.
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s,(/-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

// ---------------------------------------------------------------------------
// AFCD (FSANZ Australian Food Composition Database), Release 3 "Nutrient
// profiles" sheet "All solids & liquids per 100 g". Headers are matched after
// normalising whitespace.
// ---------------------------------------------------------------------------

export const AFCD_COLUMNS: Record<string, NutrientKey | "key" | "name"> = {
  "public food key": "key",
  "food name": "name",
  "energy with dietary fibre, equated (kj)": "energy_kj",
  "protein (g)": "protein_g",
  "fat, total (g)": "fat_g",
  "total saturated fatty acids, equated (g)": "sat_fat_g",
  "available carbohydrate, with sugar alcohols (g)": "carbs_g",
  "total sugars (g)": "sugars_g",
  "total dietary fibre (g)": "fibre_g",
  "sodium (na) (mg)": "sodium_mg",
  "potassium (k) (mg)": "potassium_mg",
  "calcium (ca) (mg)": "calcium_mg",
  "iron (fe) (mg)": "iron_mg",
  "magnesium (mg) (mg)": "magnesium_mg",
  "zinc (zn) (mg)": "zinc_mg",
  "vitamin a retinol equivalents (ug)": "vit_a_ug",
  "vitamin c (mg)": "vit_c_mg",
  "vitamin d3 equivalents (ug)": "vit_d_ug",
  "vitamin e (mg)": "vit_e_mg",
  "cobalamin (b12) (ug)": "vit_b12_ug",
  "dietary folate equivalents (ug)": "folate_ug",
  "moisture (water) (g)": "water_ml",
};

export function normaliseHeader(h: unknown) {
  return String(h ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+\)/g, ")")
    .trim()
    .toLowerCase();
}

/** Map header row → column index for the fields we import. Throws if any are missing. */
export function mapAfcdHeaders(headers: unknown[]) {
  const index = new Map<string, number>();
  headers.forEach((h, i) => {
    const norm = normaliseHeader(h);
    if (norm in AFCD_COLUMNS && !index.has(norm)) index.set(norm, i);
  });
  const missing = Object.keys(AFCD_COLUMNS).filter((k) => !index.has(k));
  if (missing.length) throw new Error(`AFCD file is missing expected columns: ${missing.join("; ")}`);
  return Object.fromEntries([...index].map(([h, i]) => [AFCD_COLUMNS[h], i])) as Record<NutrientKey | "key" | "name", number>;
}

export function parseAfcdRow(cells: unknown[], cols: ReturnType<typeof mapAfcdHeaders>): ReferenceFoodRow | null {
  const key = String(cells[cols.key] ?? "").trim();
  const name = String(cells[cols.name] ?? "").trim();
  if (!key || !name) return null;
  const row: ReferenceFoodRow = {
    source: "afcd",
    source_id: key,
    barcode: null,
    name,
    brand: null,
    serve_size_g: null,
    serve_label: null,
  };
  for (const k of NUTRIENT_KEYS) {
    const v = num(cells[cols[k]]);
    if (v !== null) row[k] = v;
  }
  return clean(row);
}

/** Valid retail barcodes: EAN-8, UPC-A (12), EAN-13, GTIN-14. */
export function isValidBarcode(code: string) {
  return /^(\d{8}|\d{12,14})$/.test(code);
}
