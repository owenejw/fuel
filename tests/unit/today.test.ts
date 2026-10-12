import { describe, expect, it } from "vitest";
import { dayPart, greeting } from "@/lib/greeting";
import { computeStreak } from "@/lib/streak";

describe("greeting", () => {
  it("splits the day into parts", () => {
    expect(dayPart(4)).toBe("night");
    expect(dayPart(5)).toBe("morning");
    expect(dayPart(11)).toBe("morning");
    expect(dayPart(12)).toBe("afternoon");
    expect(dayPart(17)).toBe("evening");
    expect(dayPart(22)).toBe("night");
  });

  it("is stable within a day and uses the name", () => {
    const a = greeting("Jez", "2026-10-12", 8, "p1");
    expect(a).toBe(greeting("Jez", "2026-10-12", 9, "p1"));
    expect(a).toContain("Jez");
  });

  it("changes across days", () => {
    const picks = new Set(Array.from({ length: 14 }, (_, i) => greeting("Jez", `2026-10-${String(i + 1).padStart(2, "0")}`, 8, "p1")));
    expect(picks.size).toBeGreaterThan(1);
  });

  it("falls back when the name is blank", () => {
    expect(greeting("  ", "2026-10-12", 14)).toContain("there");
  });
});

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    const s = computeStreak(["2026-10-12", "2026-10-11", "2026-10-10", "2026-10-08"], "2026-10-12");
    expect(s.days).toBe(3);
    expect(s.loggedToday).toBe(true);
  });

  it("keeps the streak alive until today is logged", () => {
    const s = computeStreak(["2026-10-11", "2026-10-10"], "2026-10-12");
    expect(s.days).toBe(2);
    expect(s.loggedToday).toBe(false);
  });

  it("is zero after a missed day", () => {
    expect(computeStreak(["2026-10-10"], "2026-10-12").days).toBe(0);
  });

  it("lays out Monday to Sunday of the current week", () => {
    // 2026-10-12 is a Monday.
    const s = computeStreak(["2026-10-12"], "2026-10-14");
    expect(s.week.map((d) => d.date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(s.week[0].logged).toBe(true);
    expect(s.week[3].future).toBe(true);
    expect(s.week[2].future).toBe(false);
  });
});
