"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "../app-provider";
import { useToast } from "../toast";
import { today as localToday } from "@/lib/dates";
import { cacheGet, cacheSet, handleRequestFailure } from "@/lib/offline";
import { packEntries, unpackEntries } from "@/lib/habits/pack";
import { analyse, crossedMilestones, indexEntries, type Analysis } from "@/lib/habits/progress";
import type { Habit, HabitData, HabitEntry, HabitPrefs, HabitStatus, PackedHabitData } from "@/lib/habits/types";
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
  /** Applies a change locally right away, then saves it. */
  setEntry: (h: Habit, date: string, next: EntryPatch, opts?: { toast?: string }) => Promise<void>;
  /** Tick (or untick) a yes/no habit; add one to a count habit. */
  tick: (h: Habit, date: string, opts?: { toast?: string }) => Promise<void>;
  saveDay: (date: string, patch: { note: string | null; mood: number | null }) => Promise<void>;
  setVacation: (on: boolean, until?: string | null) => Promise<void>;
  savePrefs: (patch: Partial<HabitPrefs>) => Promise<void>;
  /**
   * Runs a server change. `before` updates the screen straight away; `after` applies the result once the server
   * has it. Everything is then reloaded in the background, without holding anything up.
   */
  mutate: <T>(
    fn: () => Promise<T>,
    opts?: { before?: (d: HabitData) => HabitData; after?: (d: HabitData, result: T) => HabitData },
  ) => Promise<T>;
};

const Ctx = createContext<HabitsState | null>(null);

export function useHabits() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHabits must be used inside HabitsProvider");
  return v;
}

const CACHE_KEY = "habits";
/** Coming back to the app reloads at most this often, unless the date has changed. */
const REFRESH_EVERY_MS = 60_000;

const unpack = (p: PackedHabitData | HabitData): HabitData =>
  Array.isArray(p.entries) ? (p as HabitData) : { ...p, entries: unpackEntries((p as PackedHabitData).entries) };

/**
 * Analyses are cached per habit and only redone when that habit's entries (or the shared inputs) change, so a tick
 * recomputes one habit's history rather than all of them.
 */
type Cached = { entries: HabitEntry[]; pauses: HabitData["pauses"]; auto: HabitData["auto"]; today: string; a: Analysis };
const analysisCache = new WeakMap<Habit, Cached>();
const EMPTY: HabitEntry[] = [];

function analyseCached(h: Habit, entries: HabitEntry[], d: HabitData, today: string): Analysis {
  const c = analysisCache.get(h);
  if (
    c &&
    c.pauses === d.pauses &&
    c.auto === d.auto &&
    c.today === today &&
    c.entries.length === entries.length &&
    c.entries.every((e, i) => e === entries[i])
  )
    return c.a;
  const a = analyse(h, d, indexEntries(entries), today);
  analysisCache.set(h, { entries, pauses: d.pauses, auto: d.auto, today, a });
  return a;
}

const entriesOf = (d: HabitData, id: string) => d.entries.filter((e) => e.habit_id === id);

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { profileId } = useApp();
  const toast = useToast();
  const [today, setToday] = useState(localToday);
  const [data, setDataState] = useState<HabitData | null>(() => {
    const cached = cacheGet<PackedHabitData | HabitData>(profileId, CACHE_KEY);
    return cached ? unpack(cached) : null;
  });
  const [celebrate, setCelebrate] = useState<{ habit: Habit; days: number } | null>(null);
  const latest = useRef(data);
  // Bumped on every local change, so a reload that started before it doesn't overwrite it.
  const version = useRef(0);
  const lastFetch = useRef({ at: 0, day: "" });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  // The offline copy is written a moment after changes settle, packed, rather than on every tick.
  const persist = useCallback(
    (d: HabitData) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const first = d.entries[0]?.date;
        cacheSet(profileId, CACHE_KEY, { ...d, entries: packEntries(d.entries, first ?? localToday()) } satisfies PackedHabitData);
      }, 800);
    },
    [profileId],
  );

  const setData = useCallback(
    (fn: (d: HabitData) => HabitData) => {
      const cur = latest.current;
      if (!cur) return;
      const next = fn(cur);
      latest.current = next;
      version.current++;
      setDataState(next);
      persist(next);
    },
    [persist],
  );

  const refresh = useCallback(async () => {
    const t = localToday();
    setToday(t);
    const started = version.current;
    lastFetch.current = { at: Date.now(), day: t };
    try {
      const d = unpack(await fetchHabitData(t));
      // Something changed while this was loading: load again so nothing is lost.
      if (version.current !== started) return void refreshRef.current?.();
      latest.current = d;
      setDataState(d);
      persist(d);
    } catch {
      if (handleRequestFailure() && !latest.current) toast("You're offline");
    }
  }, [persist, toast]);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    // Initial load from the server; a cached copy may already be showing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Coming back to the app: reload if it's been a while, or the date has changed.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetch.current.at > REFRESH_EVERY_MS || localToday() !== lastFetch.current.day) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [refresh]);

  const analyses = useMemo(() => {
    const m = new Map<string, Analysis>();
    if (!data) return m;
    const groups = new Map<string, HabitEntry[]>();
    for (const e of data.entries) {
      const g = groups.get(e.habit_id);
      if (g) g.push(e);
      else groups.set(e.habit_id, [e]);
    }
    for (const h of data.habits) m.set(h.id, analyseCached(h, groups.get(h.id) ?? EMPTY, data, today));
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
      const before = analyseCached(h, entriesOf(d, h.id), d, today).milestoneCount;
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
      const after = analyseCached(h, entriesOf(now, h.id), now, today).milestoneCount;
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
    async (fn, opts) => {
      if (opts?.before) setData(opts.before);
      try {
        const result = await fn();
        if (opts?.after) setData((d) => opts.after!(d, result));
        return result;
      } finally {
        void refresh();
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
    async (on, until = null) => {
      const t = localToday();
      await mutate(() => saveVacation(on, t, until), {
        // Show it straight away; the reload brings the real rows.
        before: (d) => ({
          ...d,
          pauses: on
            ? [
                ...d.pauses.filter((p) => !(p.start_date <= t && (!p.end_date || p.end_date >= t))),
                { id: "pending", start_date: t, end_date: until },
              ]
            : d.pauses.filter((p) => !(p.start_date <= t && (!p.end_date || p.end_date >= t))),
        }),
      });
    },
    [mutate],
  );
  const savePrefs = useCallback<HabitsState["savePrefs"]>(
    async (patch) => {
      await mutate(() => saveHabitPrefs(patch), { before: (d) => ({ ...d, prefs: { ...d.prefs, ...patch } }) });
    },
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
