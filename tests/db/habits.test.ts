import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "./pglite";

let test: Db;
let current = "";
vi.mock("@/server/db", () => ({
  db: async () => ({ query: async (s: string, p?: unknown[]) => (await test.query(s, p)).rows }),
  json: (v: unknown) => JSON.stringify(v ?? null),
}));
vi.mock("@/server/session", () => ({ requireProfileId: async () => current }));

const actions = await import("@/server/habits/actions");
const { openHabits } = await import("@/server/habits/reminders");
const { blankHabit } = await import("@/lib/habits/meta");
const { unpackEntries } = await import("@/lib/habits/pack");

const today = "2026-10-12";
const as = (pid: string) => (current = pid);
const load = async () => {
  const d = await actions.fetchHabitData(today);
  return { ...d, entries: unpackEntries(d.entries) };
};

describe("habits data", () => {
  let owen: string;
  let jez: string;

  beforeAll(async () => {
    test = await createTestDb();
    const rows = (await test.query<{ id: string; name: string }>(`select id, name from profiles`)).rows;
    owen = rows.find((r) => r.name === "Owen")!.id;
    jez = rows.find((r) => r.name === "Jez")!.id;
  });

  it("creates habits in order and keeps them per profile", async () => {
    as(owen);
    const a = await actions.saveHabit(blankHabit(today, { name: "Stretch", time_of_day: "morning", reminder_time: "07:30" }));
    const b = await actions.saveHabit(blankHabit(today, { name: "Water", target: 8, unit: "glasses" }));
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
    expect(a.reminder_time).toBe("07:30");
    as(jez);
    expect((await load()).habits).toHaveLength(0);
    as(owen);
    expect((await load()).habits.map((h) => h.name)).toEqual(["Stretch", "Water"]);
  });

  it("records, updates and clears a day's entry", async () => {
    as(owen);
    const [stretch] = (await load()).habits;
    await actions.setHabitEntry(stretch.id, today, { status: "done", count: 1 });
    await actions.setHabitEntry(stretch.id, today, { status: "skipped", count: 0 });
    let data = await load();
    expect(data.entries).toEqual([{ habit_id: stretch.id, date: today, count: 0, status: "skipped" }]);
    await actions.setHabitEntry(stretch.id, today, null);
    data = await load();
    expect(data.entries).toHaveLength(0);
  });

  it("won't let one profile touch another's habits", async () => {
    as(owen);
    const [stretch] = (await load()).habits;
    as(jez);
    await actions.setHabitEntry(stretch.id, today, { status: "done", count: 1 });
    await actions.deleteHabit(stretch.id);
    await expect(actions.saveHabit(blankHabit(today, { name: "Hijack" }), stretch.id)).rejects.toThrow(/not found/);
    as(owen);
    const data = await load();
    expect(data.habits.find((h) => h.id === stretch.id)?.name).toBe("Stretch");
    expect(data.entries).toHaveLength(0);
  });

  it("reorders habits", async () => {
    as(owen);
    const ids = (await load()).habits.map((h) => h.id);
    await actions.reorderHabits([...ids].reverse());
    expect((await load()).habits.map((h) => h.id)).toEqual([...ids].reverse());
  });

  it("chains habits into a routine in order", async () => {
    as(owen);
    const teeth = await actions.saveHabit(blankHabit(today, { name: "Brush teeth" }));
    const face = await actions.saveHabit(blankHabit(today, { name: "Wash face" }));
    const rid = await actions.saveRoutine({ name: "Wind down", time_of_day: "evening", habitIds: [teeth.id, face.id] });
    let data = await load();
    const steps = data.habits.filter((h) => h.routine_id === rid).sort((a, b) => a.routine_position - b.routine_position);
    expect(steps.map((h) => h.name)).toEqual(["Brush teeth", "Wash face"]);
    expect(steps.every((h) => h.time_of_day === "evening")).toBe(true);
    // Reorder and drop a step.
    await actions.saveRoutine({ name: "Wind down", time_of_day: "evening", habitIds: [face.id] }, rid);
    data = await load();
    expect(data.habits.find((h) => h.id === teeth.id)?.routine_id).toBeNull();
    await actions.deleteRoutine(rid);
    data = await load();
    expect(data.habits.find((h) => h.id === face.id)?.routine_id).toBeNull();
  });

  it("turns vacation mode on and off", async () => {
    as(owen);
    await actions.setVacation(true, "2026-10-01");
    expect((await load()).pauses).toEqual([expect.objectContaining({ start_date: "2026-10-01", end_date: null })]);
    await actions.setVacation(false, today);
    expect((await load()).pauses).toEqual([expect.objectContaining({ start_date: "2026-10-01", end_date: "2026-10-11" })]);
    // Started and ended the same day: no pause left behind.
    await actions.setVacation(true, today);
    await actions.setVacation(false, today);
    expect((await load()).pauses).toHaveLength(1);
  });

  it("saves a note and mood, and clears them", async () => {
    as(owen);
    await actions.saveHabitDay(today, { note: "  Felt good  ", mood: 4 });
    expect((await load()).days).toEqual([{ date: today, note: "Felt good", mood: 4 }]);
    await actions.saveHabitDay(today, { note: null, mood: null });
    expect((await load()).days).toHaveLength(0);
  });

  it("saves preferences", async () => {
    as(owen);
    await actions.saveHabitPrefs({ nudge_time: "20:30" });
    await actions.saveHabitPrefs({ weekly_review: false });
    expect((await load()).prefs).toEqual({ nudge_time: "20:30", weekly_review: false });
    await actions.saveHabitPrefs({ nudge_time: null });
    expect((await load()).prefs.nudge_time).toBeNull();
  });

  it("records a milestone once per day", async () => {
    as(owen);
    const [h] = (await load()).habits;
    expect(await actions.recordMilestone(h.id, 7, today)).toBe(true);
    expect(await actions.recordMilestone(h.id, 7, today)).toBe(false);
    expect(await actions.recordMilestone(h.id, 7, "2026-11-01")).toBe(true);
  });

  it("completes auto habits from nutrition data without writing to it", async () => {
    as(owen);
    const h = await actions.saveHabit(blankHabit(today, { name: "Drink water", auto_source: "water_goal", target: 5 }));
    expect(h.target).toBe(1);
    await test.query(`insert into water_logs (profile_id, date, ml) values ($1, $2, 3000)`, [owen, today]);
    await test.query(
      `insert into log_entries (profile_id, date, slot, kind, name) values ($1, $2, 'breakfast', 'quick', 'a'), ($1, $2, 'lunch', 'quick', 'b')`,
      [owen, today],
    );
    const before = (await test.query(`select count(*)::int as n from water_logs`)).rows;
    const data = await load();
    expect(data.auto[today]?.water_goal).toBe(true);
    expect((await test.query(`select count(*)::int as n from water_logs`)).rows).toEqual(before);
    // And it isn't due any more, so no reminder.
    expect((await openHabits(owen, today)).map((x) => x.name)).not.toContain("Drink water");
  });

  it("lists open habits for reminders, and none on vacation", async () => {
    as(owen);
    const open = (await openHabits(owen, today)).map((h) => h.name);
    expect(open).toContain("Water");
    await actions.setVacation(true, today);
    expect(await openHabits(owen, today)).toHaveLength(0);
    await actions.setVacation(false, today);
  });

  it("removes everything when the profile is deleted", async () => {
    const [{ id }] = (await test.query<{ id: string }>(`insert into profiles (name) values ('Temp habits') returning id`)).rows;
    as(id);
    const h = await actions.saveHabit(blankHabit(today, { name: "Temp" }));
    await actions.setHabitEntry(h.id, today, { status: "done", count: 1 });
    await actions.saveHabitDay(today, { note: "x", mood: null });
    await actions.setVacation(true, today);
    await test.query(`delete from profiles where id = $1`, [id]);
    for (const t of ["habits", "habit_entries", "habit_days", "habit_pauses", "habit_prefs", "habit_routines"])
      expect((await test.query(`select * from ${t} where profile_id = $1`, [id])).rows, t).toHaveLength(0);
  });
});
