import { describe, expect, it } from "vitest";
import { rankFrequentFoods } from "@/lib/frequent";
import type { LogEntry } from "@/lib/types";

const entry = (over: Partial<LogEntry>): LogEntry => ({
  id: Math.random().toString(),
  date: "2026-10-01",
  time: "08:00:00",
  slot: "breakfast",
  kind: "reference",
  reference_food_id: "f1",
  custom_food_id: null,
  recipe_id: null,
  name: "Oats",
  grams: 50,
  nutrients: { energy_kj: 800, protein_g: 6 },
  ...over,
});

describe("rankFrequentFoods", () => {
  it("ranks by count, remembers the latest serving and slot history", () => {
    const ranked = rankFrequentFoods([
      entry({}),
      entry({ date: "2026-10-03", grams: 60, nutrients: { energy_kj: 960, protein_g: 7.2 } }),
      entry({ reference_food_id: "f2", name: "Banana", grams: 120, slot: "snack", nutrients: { energy_kj: 450 } }),
      entry({ kind: "quick", reference_food_id: null, name: "Quick add", grams: null }),
    ]);
    expect(ranked.map((f) => f.name)).toEqual(["Oats", "Banana"]);
    expect(ranked[0].count).toBe(2);
    expect(ranked[0].lastGrams).toBe(60);
    expect(ranked[0].per100.energy_kj).toBe(1600);
    expect(ranked[0].slots).toEqual({ breakfast: 2 });
  });
});
