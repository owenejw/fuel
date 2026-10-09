import { describe, expect, it } from "vitest";
import { classifyEvent, localParts, parseKeywords } from "@/lib/calendar";
import { activeWindow, fuellingTimeline, upcomingRace } from "@/lib/fuelling";
import { microStatus, nrvFor } from "@/lib/nrv";
import type { Workout } from "@/lib/types";

const w = (over: Partial<Workout>): Workout => ({
  id: "w1",
  date: "2026-10-09",
  start_time: "18:00",
  duration_min: 60,
  type: "soccer",
  intensity: "moderate",
  is_race: false,
  completed: false,
  title: null,
  source: "manual",
  ...over,
});

describe("fuelling timeline", () => {
  it("places a carb meal 2–3 h before and recovery within 2 h after", () => {
    const items = fuellingTimeline([w({})], 80);
    const pre = items.find((i) => i.kind === "pre_meal")!;
    expect([pre.start, pre.end]).toEqual([15 * 60, 16 * 60]);
    const post = items.find((i) => i.kind === "post")!;
    expect([post.start, post.end]).toEqual([19 * 60, 21 * 60]);
    expect(post.detail).toContain("24 g protein"); // 0.3 g/kg × 80
    expect(items.some((i) => i.kind === "pre_snack")).toBe(false);
  });

  it("adds a fast-carb top-up 30–60 min before hard or long sessions", () => {
    const snack = fuellingTimeline([w({ intensity: "hard" })], 80).find((i) => i.kind === "pre_snack")!;
    expect([snack.start, snack.end]).toEqual([17 * 60, 17 * 60 + 30]);
    expect(fuellingTimeline([w({ duration_min: 75 })], 80).some((i) => i.kind === "pre_snack")).toBe(true);
  });

  it("adds carbs during runs over 90 min", () => {
    const during = fuellingTimeline([w({ type: "long_run", duration_min: 120, start_time: "07:00" })], 70).find(
      (i) => i.kind === "during",
    )!;
    expect(during.detail).toContain("60–120 g");
  });

  it("finds the active window and ignores rest days", () => {
    const items = fuellingTimeline([w({})], 80);
    expect(activeWindow(items, 15 * 60 + 30)?.kind).toBe("pre_meal");
    expect(activeWindow(items, 12 * 60)).toBeNull();
    expect(fuellingTimeline([w({ type: "rest" })], 80)).toEqual([]);
  });

  it("flags carb loading on the 1–2 days before a race", () => {
    const race = [{ date: "2026-08-09", is_race: true, title: "City2Surf" }];
    expect(upcomingRace("2026-08-07", race)?.title).toBe("City2Surf");
    expect(upcomingRace("2026-08-08", race)?.title).toBe("City2Surf");
    expect(upcomingRace("2026-08-06", race)).toBeNull();
    expect(upcomingRace("2026-08-09", race)).toBeNull();
  });
});

describe("calendar events", () => {
  const kw = parseKeywords("soccer, training, run, long run, gym");
  it("matches keywords and classifies workouts", () => {
    expect(classifyEvent("Soccer training", kw)).toEqual({ type: "soccer", intensity: "moderate", isRace: false });
    expect(classifyEvent("Sunday long run", kw)?.type).toBe("long_run");
    expect(classifyEvent("Easy run", kw)).toMatchObject({ type: "run", intensity: "easy" });
    expect(classifyEvent("Gym — legs", kw)?.type).toBe("gym");
    expect(classifyEvent("City2Surf run", kw)).toMatchObject({ type: "run", isRace: true, intensity: "hard" });
    expect(classifyEvent("Dentist", kw)).toBeNull();
  });

  it("converts instants to Sydney local time", () => {
    expect(localParts(new Date("2026-10-09T07:30:00Z"), "Australia/Sydney")).toEqual({ date: "2026-10-09", time: "18:30" });
  });
});

describe("NRVs and micronutrient flags", () => {
  it("varies by sex and age", () => {
    expect(nrvFor("female", 30).iron_mg!.target).toBe(18);
    expect(nrvFor("male", 30).iron_mg!.target).toBe(8);
    expect(nrvFor("female", 60).calcium_mg!.target).toBe(1300);
    expect(nrvFor("male", 25).zinc_mg!.target).toBe(14);
    expect(nrvFor(null, 30).iron_mg!.target).toBe(18);
  });

  it("flags nutrients consistently under 70% of target", () => {
    const nrv = nrvFor("male", 30);
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-0${i + 1}`,
      totals: { energy_kj: 9000, iron_mg: 4, vit_c_mg: 90, sodium_mg: 2600 },
      missing: {},
    }));
    const s = microStatus(nrv, days, "2026-10-07");
    expect(s.find((m) => m.key === "iron_mg")!.flagged).toBe(true);
    expect(s.find((m) => m.key === "vit_c_mg")!.flagged).toBe(false);
    const sodium = s.find((m) => m.key === "sodium_mg")!;
    expect(sodium.flagged).toBe(false);
    expect(sodium.over).toBe(true);
  });

  it("doesn't flag from too little data", () => {
    const s = microStatus(nrvFor("male", 30), [{ date: "2026-10-07", totals: { energy_kj: 9000, iron_mg: 1 }, missing: {} }], "2026-10-07");
    expect(s.find((m) => m.key === "iron_mg")!.flagged).toBe(false);
  });
});
