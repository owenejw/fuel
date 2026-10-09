import { describe, expect, it } from "vitest";
import { ACTIVITY_FACTORS, applyCarbLoading, bmrKcal, KJ_PER_G, macroTargets, tdeeKj } from "@/lib/tdee";
import { adaptiveTdee, KJ_PER_KG, weightTrend } from "@/lib/weight";

describe("Mifflin-St Jeor TDEE", () => {
  it("computes BMR for men and women", () => {
    expect(bmrKcal({ sex: "male", weightKg: 80, heightCm: 180, age: 30 })).toBe(1780);
    expect(bmrKcal({ sex: "female", weightKg: 60, heightCm: 165, age: 30 })).toBeCloseTo(1320.25);
  });

  it("multiplies by the activity factor and converts to kJ", () => {
    expect(ACTIVITY_FACTORS).toEqual({ sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 });
    expect(tdeeKj({ sex: "male", weightKg: 80, heightCm: 180, age: 30, activity: "moderate" })).toBeCloseTo(1780 * 1.55 * 4.184, 3);
  });
});

describe("macro targets", () => {
  const base = { tdeeKj: 12000, weightKg: 80, sex: "male" as const, trainingDaysPerWeek: 4 };

  it("applies the goal adjustment to the weekly average", () => {
    expect(macroTargets({ ...base, goal: "maintain" }).averageKj).toBe(12000);
    expect(macroTargets({ ...base, goal: "cut" }).averageKj).toBe(9600);
    expect(macroTargets({ ...base, goal: "recomp" }).averageKj).toBe(10800);
    expect(macroTargets({ ...base, goal: "bulk" }).averageKj).toBe(13200);
  });

  it("defaults protein to 2.0 g/kg and keeps it constant across day types", () => {
    const p = macroTargets({ ...base, goal: "maintain" });
    expect(p.training.protein_g).toBe(160);
    expect(p.rest.protein_g).toBe(160);
    expect(p.proteinRange).toEqual([128, 176]);
    expect(macroTargets({ ...base, goal: "maintain", proteinPerKg: 1.6 }).training.protein_g).toBe(128);
  });

  it("puts more carbs on training days and keeps the weekly average on target", () => {
    const p = macroTargets({ ...base, goal: "maintain" });
    expect(p.training.carbs_g).toBeGreaterThan(p.rest.carbs_g);
    expect(p.training.fat_g).toBe(p.rest.fat_g);
    const weekly = 4 * p.training.energy_kj + 3 * p.rest.energy_kj;
    expect(Math.abs(weekly / 7 - 12000)).toBeLessThan(2);
  });

  it("derives carbs from the remaining energy", () => {
    const t = macroTargets({ ...base, goal: "maintain" }).training;
    const fromMacros = t.protein_g * KJ_PER_G.protein + t.fat_g * KJ_PER_G.fat + t.carbs_g * KJ_PER_G.carbs;
    expect(Math.abs(fromMacros - t.energy_kj)).toBeLessThan(KJ_PER_G.carbs);
  });

  it("uses the same targets when every day (or no day) is a training day", () => {
    for (const n of [0, 7]) {
      const p = macroTargets({ ...base, goal: "maintain", trainingDaysPerWeek: n });
      expect(p.training).toEqual(p.rest);
    }
  });

  it("raises carbs to 8 g/kg for race carb loading", () => {
    const t = macroTargets({ ...base, goal: "maintain" }).training;
    const loaded = applyCarbLoading(t, 80);
    expect(loaded.carbs_g).toBe(640);
    expect(loaded.energy_kj).toBe(t.energy_kj + (640 - t.carbs_g) * 16);
    expect(loaded.protein_g).toBe(t.protein_g);
  });
});

describe("weight trend", () => {
  it("is an EWMA with alpha 0.1", () => {
    const t = weightTrend([
      { date: "2026-01-02", kg: 81 },
      { date: "2026-01-01", kg: 80 },
    ]);
    expect(t.map((p) => p.trend)).toEqual([80, 80.1]);
  });
});

describe("adaptive TDEE", () => {
  const days = (n: number, kj: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, kj }));

  it("needs at least 14 days of data", () => {
    expect(
      adaptiveTdee({
        intake: days(13, 10000),
        weights: [
          { date: "2026-01-01", kg: 80 },
          { date: "2026-01-13", kg: 80 },
        ],
      }),
    ).toBeNull();
  });

  it("equals intake when weight is stable", () => {
    const w = days(20, 0).map((d) => ({ date: d.date, kg: 80 }));
    expect(adaptiveTdee({ intake: days(20, 10000), weights: w })!.tdeeKj).toBe(10000);
  });

  it("adds back the energy from weight lost", () => {
    // Weight steadily falling 0.1 kg/day: trend falls a little less due to smoothing.
    const w = days(29, 0).map((d, i) => ({ date: d.date, kg: 85 - i * 0.1 }));
    const r = adaptiveTdee({ intake: days(29, 9000), weights: w })!;
    expect(r.days).toBe(28);
    expect(r.trendChangeKg).toBeLessThan(0);
    expect(r.tdeeKj).toBe(Math.round(9000 - (r.trendChangeKg * KJ_PER_KG) / 28));
    expect(r.tdeeKj).toBeGreaterThan(9000);
  });

  it("ignores days with no food logged", () => {
    const intake = [...days(14, 10000), { date: "2026-01-15", kj: 0 }];
    const w = days(15, 0).map((d) => ({ date: d.date, kg: 80 }));
    expect(adaptiveTdee({ intake, weights: w })!.avgIntakeKj).toBe(10000);
  });
});
