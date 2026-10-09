import { pickNutrients, scaleNutrients, type Nutrients } from "../nutrients";
import type { Food } from "../types";

/** Map a reference_foods or custom_foods row to the UI's Food shape. */
export function rowToFood(row: Record<string, unknown>, kind: "reference" | "custom"): Food {
  const serve = row.serve_size_g == null ? null : Number(row.serve_size_g);
  return {
    kind,
    id: String(row.id),
    source: kind === "custom" ? "custom" : (row.source as Food["source"]),
    name: String(row.name),
    brand: (row.brand as string | null) ?? null,
    barcode: (row.barcode as string | null) ?? null,
    serve_size_g: serve && serve > 0 ? serve : null,
    serve_label: (row.serve_label as string | null) ?? null,
    per100: pickNutrients(row),
  };
}

export function nutrientsFor(food: Food, grams: number): Nutrients {
  return scaleNutrients(food.per100, grams);
}

export const SOURCE_LABELS: Record<Food["source"], string> = {
  custom: "My food",
  afcd: "AFCD",
  off: "Open Food Facts",
  usda: "USDA",
  history: "Recent",
};
