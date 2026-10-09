import { describe, expect, it } from "vitest";
import { gapWeights, isKjTight, periodForTime, recommend, scoreCandidate, slotCompatibility, type Candidate } from "@/lib/recommend";
import type { DayTargets } from "@/lib/types";

const targets: DayTargets = { energy_kj: 10000, protein_g: 160, carbs_g: 250, fat_g: 70, fibre_g: 30 };

const food = (name: string, n: Candidate["nutrients"], over: Partial<Candidate> = {}): Candidate => ({
  key: name,
  kind: "reference",
  food_id: name,
  name,
  grams: 100,
  nutrients: n,
  count: 5,
  slots: {},
  ...over,
});

const chicken = food("Chicken breast", { energy_kj: 690, protein_g: 31, carbs_g: 0, fat_g: 3.6 });
const rice = food("White rice", { energy_kj: 1100, protein_g: 5, carbs_g: 56, fat_g: 0.6 });
const nuts = food("Almonds", { energy_kj: 1500, protein_g: 12, carbs_g: 5, fat_g: 31 });
const yoghurt = food("Greek yoghurt", { energy_kj: 400, protein_g: 10, carbs_g: 4, fat_g: 4 });
const pizza = food("Pizza", { energy_kj: 4500, protein_g: 40, carbs_g: 120, fat_g: 50 });

describe("recommendation scoring", () => {
  it("weights toward the proportionally largest gap", () => {
    const { largest, weights } = gapWeights({ energy_kj: 4000, protein_g: 80, carbs_g: 50, fat_g: 10 }, targets);
    expect(largest).toBe("protein_g");
    expect(weights.protein_g).toBeGreaterThan(weights.carbs_g);
    expect(weights.carbs_g).toBeGreaterThan(weights.fat_g);
  });

  it("prefers foods that close the biggest gap", () => {
    const remaining = { energy_kj: 4000, protein_g: 10, carbs_g: 150, fat_g: 20 };
    const top = recommend([chicken, rice, nuts], remaining, targets, { period: "midday" });
    expect(top[0].candidate.name).toBe("White rice");
  });

  it("penalises overshooting remaining kJ", () => {
    const remaining = { energy_kj: 2000, protein_g: 60, carbs_g: 100, fat_g: 30 };
    const p = scoreCandidate(pizza, remaining, targets, { period: "evening" })!;
    const c = scoreCandidate(chicken, remaining, targets, { period: "evening" })!;
    expect(c.score).toBeGreaterThan(p.score);
  });

  it("ranks by protein per 100 kJ when protein is the gap and kJ are tight", () => {
    const remaining = { energy_kj: 1200, protein_g: 50, carbs_g: 10, fat_g: 5 };
    expect(isKjTight(remaining, targets)).toBe(true);
    const top = recommend([nuts, yoghurt, chicken], remaining, targets, { period: "afternoon" });
    expect(top[0].mode).toBe("protein_density");
    expect(top.map((s) => s.candidate.name)).toEqual(["Chicken breast", "Greek yoghurt", "Almonds"]);
  });

  it("doesn't suggest dinner foods at breakfast time", () => {
    const stew = food("Beef stew", { energy_kj: 1500, protein_g: 30, carbs_g: 20, fat_g: 10 }, { slots: { dinner: 9, lunch: 1 } });
    const oats = food("Oats", { energy_kj: 1500, protein_g: 10, carbs_g: 60, fat_g: 6 }, { slots: { breakfast: 10 } });
    expect(periodForTime(7 * 60)).toBe("morning");
    expect(slotCompatibility(stew.slots, "morning")).toBe(0);
    const top = recommend([stew, oats], { energy_kj: 8000, protein_g: 140, carbs_g: 220, fat_g: 60 }, targets, { period: "morning" });
    expect(top.map((s) => s.candidate.name)).toEqual(["Oats"]);
  });

  it("prefers carbs and penalises fat in a pre-workout window", () => {
    const remaining = { energy_kj: 5000, protein_g: 80, carbs_g: 120, fat_g: 30 };
    const top = recommend([chicken, rice, nuts], remaining, targets, { period: "afternoon", window: "pre_meal" });
    expect(top[0].candidate.name).toBe("White rice");
    expect(top[0].reason).toMatch(/g carbs for your session/);
  });

  it("never suggests a no-carb food as pre-workout fuel, even if eaten often", () => {
    const remaining = { energy_kj: 5762, protein_g: 33, carbs_g: 337, fat_g: 65 };
    const often = { ...chicken, count: 30 };
    const banana = food("Banana", { energy_kj: 479, protein_g: 2, carbs_g: 24, fat_g: 0.4, fibre_g: 2.6 }, { count: 1 });
    const top = recommend([often, banana], remaining, targets, { period: "afternoon", window: "pre_meal" });
    expect(top.map((s) => s.candidate.name)).toEqual(["Banana"]);
    expect(top[0].reason).toBe("24 g carbs for your session");
  });

  it("reports the totals remaining if eaten", () => {
    const s = scoreCandidate(chicken, { energy_kj: 3000, protein_g: 60, carbs_g: 100, fat_g: 20 }, targets, { period: "evening" })!;
    expect(s.after).toEqual({ energy_kj: 2310, protein_g: 29, carbs_g: 100, fat_g: 16.4 });
  });

  it("skips candidates with no energy data and returns at most 5", () => {
    const many = Array.from({ length: 10 }, (_, i) => food(`F${i}`, { energy_kj: 500 + i, protein_g: 10 }));
    expect(
      recommend([food("Mystery", {}), ...many], { energy_kj: 5000, protein_g: 80, carbs_g: 100, fat_g: 30 }, targets, { period: "midday" }),
    ).toHaveLength(5);
  });

  it("favours frequently eaten foods when otherwise equal", () => {
    const a = food("A", { energy_kj: 500, protein_g: 10, carbs_g: 10, fat_g: 5 }, { count: 20 });
    const b = food("B", { energy_kj: 500, protein_g: 10, carbs_g: 10, fat_g: 5 }, { count: 1 });
    const top = recommend([b, a], { energy_kj: 5000, protein_g: 80, carbs_g: 100, fat_g: 30 }, targets, { period: "midday" });
    expect(top[0].candidate.name).toBe("A");
  });
});
