import { describe, expect, it } from "vitest";
import { combineTotals, formatAmount, pickNutrients, scaleNutrients, sumNutrients } from "@/lib/nutrients";
import { formatEnergy, fromUnit, kcalToKj, kjToKcal, toUnit } from "@/lib/energy";

describe("nutrients", () => {
  it("scales per-100 g values and keeps unknowns unknown", () => {
    const n = scaleNutrients({ energy_kj: 1000, protein_g: 10, iron_mg: null }, 150);
    expect(n).toEqual({ energy_kj: 1500, protein_g: 15 });
    expect("iron_mg" in n).toBe(false);
  });

  it("sums known values and counts missing ones", () => {
    const t = sumNutrients([{ energy_kj: 500, protein_g: 10 }, { energy_kj: 300 }, { energy_kj: 200, protein_g: 5, iron_mg: 2 }]);
    expect(t.totals.energy_kj).toBe(1000);
    expect(t.missing.energy_kj).toBe(0);
    expect(t.totals.protein_g).toBe(15);
    expect(t.missing.protein_g).toBe(1);
    expect(t.totals.iron_mg).toBe(2);
    expect(t.missing.iron_mg).toBe(2);
    // No item had vitamin D data: the total is unknown, not zero.
    expect(t.totals.vit_d_ug).toBeNull();
    expect(t.missing.vit_d_ug).toBe(3);
  });

  it("an empty list totals to unknown with nothing missing", () => {
    const t = sumNutrients([]);
    expect(t.totals.energy_kj).toBeNull();
    expect(t.missing.energy_kj).toBe(0);
  });

  it("combines group totals", () => {
    const a = sumNutrients([{ energy_kj: 100 }, {}]);
    const b = sumNutrients([{ energy_kj: 50, protein_g: 3 }]);
    const c = combineTotals([a, b]);
    expect(c.totals.energy_kj).toBe(150);
    expect(c.missing.energy_kj).toBe(1);
    expect(c.totals.protein_g).toBe(3);
    expect(c.missing.protein_g).toBe(2);
    expect(c.count).toBe(3);
  });

  it("parses numeric strings from Postgres and drops junk", () => {
    expect(pickNutrients({ energy_kj: "1234.50", protein_g: null, fat_g: "", carbs_g: "abc", name: "x" })).toEqual({ energy_kj: 1234.5 });
  });

  it('formats unknown values as "no data", never zero', () => {
    expect(formatAmount(null, "iron_mg")).toBe("no data");
    expect(formatAmount(undefined, "protein_g")).toBe("no data");
    expect(formatAmount(0, "protein_g")).toBe("0 g");
    expect(formatEnergy(null, "kj")).toBe("no data");
  });
});

describe("energy units", () => {
  it("uses 1 kcal = 4.184 kJ", () => {
    expect(kcalToKj(100)).toBeCloseTo(418.4);
    expect(kjToKcal(4184)).toBeCloseTo(1000);
    expect(toUnit(4184, "kcal")).toBeCloseTo(1000);
    expect(toUnit(4184, "kj")).toBe(4184);
    expect(fromUnit(1000, "kcal")).toBeCloseTo(4184);
  });

  it("formats in the preferred unit", () => {
    expect(formatEnergy(8700, "kj")).toBe("8,700 kJ");
    expect(formatEnergy(8368, "kcal")).toBe("2,000 kcal");
  });
});
