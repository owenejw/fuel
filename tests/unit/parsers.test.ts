import { describe, expect, it } from "vitest";
import { isValidBarcode, mapAfcdHeaders, parseAfcdRow, parseOffProduct, parseUsdaFood } from "@/lib/foods/parsers";

describe("Open Food Facts parser", () => {
  const payload = {
    status: 1,
    product: {
      product_name: "Weet-Bix",
      brands: "Sanitarium, Weet-Bix",
      serving_size: "2 biscuits (30 g)",
      serving_quantity: 30,
      nutriments: {
        "energy-kj_100g": 1490,
        proteins_100g: 12.4,
        fat_100g: 1.4,
        "saturated-fat_100g": 0.3,
        carbohydrates_100g: 67,
        sugars_100g: 2.8,
        fiber_100g: 10.6,
        sodium_100g: 0.27, // grams → mg
        iron_100g: 0.012, // grams → mg
        "vitamin-b12_100g": 0, // known zero stays zero
      },
    },
  };

  it("maps panel nutrients and converts units", () => {
    const row = parseOffProduct("9300652010012", payload)!;
    expect(row).toMatchObject({
      source: "off",
      source_id: "9300652010012",
      barcode: "9300652010012",
      name: "Weet-Bix",
      brand: "Sanitarium",
      serve_size_g: 30,
      serve_label: "2 biscuits (30 g)",
      energy_kj: 1490,
      protein_g: 12.4,
      sodium_mg: 270,
      iron_mg: 12,
      vit_b12_ug: 0,
    });
  });

  it("leaves nutrients missing from the panel undefined, not zero", () => {
    const row = parseOffProduct("9300652010012", payload)!;
    expect(row.calcium_mg).toBeUndefined();
    expect(row.vit_d_ug).toBeUndefined();
  });

  it("converts kcal-only energy", () => {
    const row = parseOffProduct("1", { status: 1, product: { product_name: "X", nutriments: { "energy-kcal_100g": 100 } } })!;
    expect(row.energy_kj).toBeCloseTo(418.4);
  });

  it("returns null for a miss", () => {
    expect(parseOffProduct("1", { status: 0 })).toBeNull();
    expect(parseOffProduct("1", { status: 1, product: { product_name: "" } })).toBeNull();
  });
});

describe("USDA parser", () => {
  it("maps by nutrient number and converts kcal", () => {
    const row = parseUsdaFood({
      fdcId: 171705,
      description: "BANANAS, RAW",
      dataType: "SR Legacy",
      foodNutrients: [
        { nutrientNumber: "208", value: 89, unitName: "KCAL" },
        { nutrientNumber: "203", value: 1.09, unitName: "G" },
        { nutrientNumber: "306", value: 358, unitName: "MG" },
        { nutrientNumber: "401", value: 8.7, unitName: "MG" },
        { nutrientNumber: "435", value: 20, unitName: "UG" },
        { nutrientNumber: "255", value: 74.9, unitName: "G" },
      ],
    })!;
    expect(row.source).toBe("usda");
    expect(row.source_id).toBe("171705");
    expect(row.name).toBe("Bananas, Raw");
    expect(row.energy_kj).toBeCloseTo(372.4, 1);
    expect(row.protein_g).toBe(1.09);
    expect(row.potassium_mg).toBe(358);
    expect(row.vit_c_mg).toBe(8.7);
    expect(row.folate_ug).toBe(20);
    expect(row.water_ml).toBe(74.9);
    expect(row.iron_mg).toBeUndefined();
  });

  it("prefers kJ and falls back to Atwater energy", () => {
    expect(
      parseUsdaFood({
        fdcId: 1,
        description: "a",
        foodNutrients: [
          { nutrientNumber: "268", value: 500 },
          { nutrientNumber: "208", value: 1 },
        ],
      })!.energy_kj,
    ).toBe(500);
    expect(parseUsdaFood({ fdcId: 1, description: "a", foodNutrients: [{ nutrientNumber: "958", value: 100 }] })!.energy_kj).toBeCloseTo(
      418.4,
    );
  });
});

describe("AFCD parser", () => {
  // Header text as it appears in the Release 3 workbook (with embedded newlines).
  const headers = [
    null,
    "Public Food Key",
    "Classification",
    "Food Name",
    "Energy with dietary fibre, equated \n(kJ)",
    "Protein \n(g)",
    "Fat, total \n(g)",
    "Total saturated fatty acids, equated (%T)",
    "Total saturated fatty acids, equated \n(g)",
    "Available carbohydrate, with sugar alcohols \n(g)",
    "Total sugars (g)",
    "Total dietary fibre \n(g)",
    "Sodium (Na) \n(mg)",
    "Potassium (K) \n(mg)",
    "Calcium (Ca) \n(mg)",
    "Iron (Fe) \n(mg)",
    "Magnesium (Mg) \n(mg)",
    "Zinc (Zn) \n(mg)",
    "Vitamin A retinol equivalents \n(ug)",
    "Vitamin C \n(mg)",
    "Vitamin D3 equivalents \n(ug)",
    "Vitamin E \n(mg)",
    "Cobalamin (B12) \n(ug)",
    "Dietary folate equivalents \n(ug)",
    "Moisture (water) \n(g)",
  ];

  it("maps headers, using grams (not %T) for saturated fat", () => {
    const cols = mapAfcdHeaders(headers);
    expect(cols.sat_fat_g).toBe(8);
    const row = parseAfcdRow(
      [
        null,
        "F002258",
        31302,
        "Cardamom seed, dried, ground",
        1236,
        10.8,
        6.7,
        34.34,
        2.2,
        34.4,
        4.4,
        28,
        18,
        1119,
        383,
        13.97,
        229,
        7.47,
        4,
        21,
        null,
        2.85,
        0,
        3,
        8.3,
      ],
      cols,
    )!;
    expect(row).toMatchObject({
      source: "afcd",
      source_id: "F002258",
      energy_kj: 1236,
      sat_fat_g: 2.2,
      iron_mg: 13.97,
      water_ml: 8.3,
      vit_b12_ug: 0,
    });
    expect(row.vit_d_ug).toBeUndefined();
  });

  it("fails loudly when the file layout changes", () => {
    expect(() => mapAfcdHeaders(["Public Food Key", "Food Name"])).toThrow(/missing expected columns/);
  });
});

describe("barcodes", () => {
  it("accepts retail barcode lengths only", () => {
    expect(isValidBarcode("9300652010012")).toBe(true);
    expect(isValidBarcode("12345678")).toBe(true);
    expect(isValidBarcode("123")).toBe(false);
    expect(isValidBarcode("93006520100a2")).toBe(false);
  });
});
