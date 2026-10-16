"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "../app-provider";
import { useToast } from "../toast";
import { today as localToday } from "@/lib/dates";
import { cacheGet, cacheSet, handleRequestFailure } from "@/lib/offline";
import { analyse, crossedMilestones, indexEntries, type Analysis } from "@/lib/habits/progress";
import type { Habit, HabitData, HabitEntry, HabitPrefs, HabitStatus } from "@/lib/habits/types";
import {
  fetchHabitData,
  recordMilestone,
  saveHabitDay,
  saveHabitPrefs,
  setHabitEntry,
  setVacation as saveVacation,
} from "@/server/habits/actions";
import { Celebration } from "./celebration";

type EntryPatch = { status: HabitStatus; count: number } | null;

type HabitsState = {
  data: HabitData | null;
  today: string;
  /** Per habit, from its start to today. */
  analyses: Map<string, Analysis>;
  refresh: () => Promise<void>;
  /** Applies a change locally right away and saves it. Returns the entry it replaced. */
  setEntry: (h: Habit, date: string, next: EntryPatch, opts?: { toast?: string }) => Promise<void>;
  /** Tick (or untick) a yes/no habit; add one to a count habit. */
  tick: (h: Habit, date: string, opts?: { toast?: string }) => Promise<void>;
  saveDay: (date: string, patch: { note: string | null; mood: number | null }) => Promise<void>;
  setVacation: (on: boolean, until?: string | null) => Promise<void>;
  savePrefs: (patch: Partial<HabitPrefs>) => Promise<void>;
  /** Run a server change, then reload everything. */
  mutate: <T>(fn: () => Promise<T>, optimistic?: (d: HabitData) => HabitData) => Promise<T>;
};

const Ctx = createContext<HabitsState | null>(null);

export function useHabits() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHabits must be used inside HabitsProvider");
  return v;
}

const CACHE_KEY = "habits";

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { profileId } = useApp();
  const toast = useToast();
  const [today, setToday] = useState(localToday);
  const [data, setDataState] = useState<HabitData | null>(() => cacheGet<HabitData>(profileId, CACHE_KEY));
  const [celebrate, setCelebrate] = useState<{ habit: Habit; days: number } | null>(null);
  const latest = useRef(data);

  const setData = useCallback(
    (fn: (d: HabitData) => HabitData) =>
      setDataState((cur) => {
        if (!cur) return cur;
        const next = fn(cur);
        latest.current = next;
        cacheSet(profileId, CACHE_KEY, next);
        return next;
      }),
    [profileId],
  );

  const refresh = useCallback(async () => {
    const t = localToday();
    setToday(t);
    try {
      const d = await fetchHabitData(t);
      latest.current = d;
      setDataState(d);
      cacheSet(profileId, CACHE_KEY, d);
    } catch {
      if (handleRequestFailure() && !latest.current) toast("You're offline");
    }
  }, [profileId, toast]);

  useEffect(() => {
    // Initial load from the server; a cached copy may already be showing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Coming back to the app: the date may have changed, and nutrition goals may have been met elsewhere.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const analyses = useMemo(() => {
    const m = new Map<string, Analysis>();
    if (!data) return m;
    const index = indexEntries(data.entries);
    for (const h of data.habits) m.set(h.id, analyse(h, data, index, today));
    return m;
  }, [data, today]);

  const applyEntry = useCallback(
    (h: Habit, date: string, next: EntryPatch) =>
      setData((d) => {
        const entries = d.entries.filter((e) => !(e.habit_id === h.id && e.date === date));
        if (next && !(next.status === "done" && next.count === 0)) entries.push({ habit_id: h.id, date, ...next });
        return { ...d, entries };
      }),
    [setData],
  );

  const setEntry = useCallback<HabitsState["setEntry"]>(
    async (h, date, next, opts) => {
      const d = latest.current;
      if (!d) return;
      const prev: HabitEntry | undefined = d.entries.find((e) => e.habit_id === h.id && e.date === date);
      const before = analyse(h, d, indexEntries(d.entries), today).milestoneCount;
      applyEntry(h, date, next);
      try {
        await setHabitEntry(h.id, date, next);
      } catch {
        applyEntry(h, date, prev ? { status: prev.status, count: prev.count } : null);
        toast("Couldn't save. Check your connection.");
        return;
      }
      if (opts?.toast)
        toast(opts.toast, {
          label: "Undo",
          onClick: () => {
            const restore = prev ? { status: prev.status, count: prev.count } : null;
            applyEntry(h, date, restore);
            setHabitEntry(h.id, date, restore).catch(() => toast("Couldn't undo"));
          },
        });

      // Milestones are celebrated when today's tick crosses one.
      const now = latest.current;
      if (!now || date !== today) return;
      const after = analyse(h, now, indexEntries(now.entries), today).milestoneCount;
      const crossed = crossedMilestones(before, after).at(-1);
      if (crossed && (await recordMilestone(h.id, crossed, today).catch(() => false))) setCelebrate({ habit: h, days: crossed });
    },
    [applyEntry, today, toast],
  );

  const tick = useCallback<HabitsState["tick"]>(
    async (h, date, opts) => {
      const d = latest.current;
      if (!d) return;
      const cur = d.entries.find((e) => e.habit_id === h.id && e.date === date);
      const count = cur?.status === "done" ? cur.count : 0;
      if (h.target === 1) return setEntry(h, date, count >= 1 ? null : { status: "done", count: 1 }, count >= 1 ? undefined : opts);
      return setEntry(h, date, { status: "done", count: count + 1 }, count + 1 === h.target ? opts : undefined);
    },
    [setEntry],
  );

  const mutate = useCallback<HabitsState["mutate"]>(
    async (fn, optimistic) => {
      if (optimistic) setData(optimistic);
      try {
        return await fn();
      } finally {
        await refresh();
      }
    },
    [refresh, setData],
  );

  const saveDay = useCallback<HabitsState["saveDay"]>(
    async (date, patch) => {
      setData((d) => ({
        ...d,
        days: [...d.days.filter((x) => x.date !== date), ...(patch.note || patch.mood ? [{ date, ...patch }] : [])].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      }));
      await saveHabitDay(date, patch).catch(() => toast("Couldn't save your note"));
    },
    [setData, toast],
  );

  const setVacation = useCallback<HabitsState["setVacation"]>(
    (on, until = null) => mutate(() => saveVacation(on, localToday(), until)),
    [mutate],
  );
  const savePrefs = useCallback<HabitsState["savePrefs"]>(
    (patch) =>
      mutate(
        () => saveHabitPrefs(patch),
        (d) => ({ ...d, prefs: { ...d.prefs, ...patch } }),
      ),
    [mutate],
  );

  const value = useMemo(
    () => ({ data, today, analyses, refresh, setEntry, tick, saveDay, setVacation, savePrefs, mutate }),
    [data, today, analyses, refresh, setEntry, tick, saveDay, setVacation, savePrefs, mutate],
  );

  return (
    <Ctx value={value}>
      {children}
      {celebrate && <Celebration habit={celebrate.habit} days={celebrate.days} onClose={() => setCelebrate(null)} />}
    </Ctx>
  );
}
