import { describe, expect, it } from "vitest";
import { isoLocal, localDate, num, workoutType } from "@/server/health";

describe("Apple Health parsing", () => {
  it("reads numbers the way Shortcuts sends them", () => {
    expect(num(78.4)).toBe(78.4);
    expect(num("78.4")).toBe(78.4);
    expect(num("78.4 kg")).toBe(78.4);
    expect(num("1,250")).toBe(1250);
    expect(num("")).toBeNull();
    expect(num(null)).toBeNull();
  });

  it("turns dates into local (Sydney) calendar days", () => {
    expect(localDate("2026-10-12")).toBe("2026-10-12");
    // 22:30 UTC on the 12th is 09:30 on the 13th in Sydney (AEDT, +11).
    expect(localDate("2026-10-12T22:30:00Z")).toBe("2026-10-13");
    expect(localDate("not a date")).toBeNull();
  });

  it("writes ISO times with the local offset", () => {
    expect(isoLocal("2026-10-12", "08:30:00")).toBe("2026-10-12T08:30:00+11:00");
    expect(isoLocal("2026-07-01", "19:05:00")).toBe("2026-07-01T19:05:00+10:00");
  });

  it("maps Health workout names to plan types", () => {
    expect(workoutType("Soccer", 90)).toBe("soccer");
    expect(workoutType("Outdoor Run", 40)).toBe("run");
    expect(workoutType("Outdoor Run", 95)).toBe("long_run");
    expect(workoutType("Traditional Strength Training", 50)).toBe("gym");
    expect(workoutType("Yoga", 30)).toBe("gym");
  });
});
