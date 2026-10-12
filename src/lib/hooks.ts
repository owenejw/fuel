"use client";

import { useCallback, useEffect, useState } from "react";
import { addEntries, deleteEntries, fetchLogRange, getDay, updateEntry, type NewEntry } from "./data";
import { addDays, today } from "./dates";
import { fetchWeek, type WeekDay } from "@/server/actions/summary";
import { rankFrequentFoods, type FrequentFood } from "./frequent";
import { cacheGet, cachePruneLogs, cacheSet } from "./offline";
import type { LogEntry } from "./types";
import type { DayBundle } from "@/server/repo";
import { useApp } from "@/components/app-provider";

function optimisticEntry(it: NewEntry, id: string): LogEntry {
  return {
    id,
    date: it.date,
    time: it.time ?? "00:00:00",
    slot: it.slot,
    kind: it.kind,
    reference_food_id: it.kind === "reference" ? (it.food_id ?? null) : null,
    custom_food_id: it.kind === "custom" ? (it.food_id ?? null) : null,
    recipe_id: it.kind === "recipe" ? (it.food_id ?? null) : null,
    name: it.name,
    grams: it.grams,
    nutrients: it.nutrients,
  } as LogEntry;
}

/** Everything Today needs for one date, with an offline copy and optimistic updates. */
export function useDay(date: string) {
  const { profileId } = useApp();
  const cacheKey = `day:${date}`;
  const [state, setState] = useState<{ key: string; day: DayBundle | null }>(() => ({
    key: cacheKey,
    day: cacheGet<DayBundle>(profileId, cacheKey),
  }));
  const [offline, setOffline] = useState(false);

  // Switching days: show that day's cached copy immediately (adjusting state during render).
  if (state.key !== cacheKey) setState({ key: cacheKey, day: cacheGet<DayBundle>(profileId, cacheKey) });
  const day = state.key === cacheKey ? state.day : null;

  const setDay = useCallback(
    (fn: (cur: DayBundle) => DayBundle) =>
      setState((s) => {
        if (s.key !== cacheKey || !s.day) return s;
        const next = fn(s.day);
        cacheSet(profileId, cacheKey, next);
        return { key: cacheKey, day: next };
      }),
    [profileId, cacheKey],
  );

  const refresh = useCallback(
    () =>
      getDay(date).then(
        (d) => {
          setState({ key: cacheKey, day: d });
          cacheSet(profileId, cacheKey, d);
          setOffline(false);
        },
        () => setOffline(true),
      ),
    [date, cacheKey, profileId],
  );

  useEffect(() => {
    refresh();
    if (date === today()) cachePruneLogs(profileId, addDays(date, -7));
  }, [date, profileId, refresh]);

  const setEntries = useCallback((fn: (e: LogEntry[]) => LogEntry[]) => setDay((d) => ({ ...d, entries: fn(d.entries) })), [setDay]);

  // Optimistic: show new entries straight away with temporary ids, then swap in the saved rows.
  const add = useCallback(
    async (items: NewEntry[]) => {
      const tmp = items.map((it, i) => optimisticEntry(it, `tmp-${Date.now()}-${i}`));
      const tmpIds = new Set(tmp.map((e) => e.id));
      setEntries((cur) => [...cur, ...tmp.filter((e) => e.date === date)]);
      try {
        const saved = await addEntries(items);
        setEntries((cur) => [...cur.filter((e) => !tmpIds.has(e.id)), ...saved.filter((e) => e.date === date)]);
        return saved;
      } catch (err) {
        setEntries((cur) => cur.filter((e) => !tmpIds.has(e.id)));
        throw err;
      }
    },
    [date, setEntries],
  );

  const remove = useCallback(
    async (ids: string[]) => {
      const prev = day?.entries ?? [];
      setEntries((cur) => cur.filter((e) => !ids.includes(e.id)));
      try {
        await deleteEntries(ids);
      } catch (err) {
        setEntries(() => prev);
        throw err;
      }
      return prev.filter((e) => ids.includes(e.id));
    },
    [day, setEntries],
  );

  const update = useCallback(
    async (id: string, patch: Parameters<typeof updateEntry>[1]) => {
      const prev = day?.entries ?? [];
      setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch } : e)).filter((e) => e.date === date));
      try {
        const saved = await updateEntry(id, patch);
        setEntries((cur) => cur.map((e) => (e.id === id ? saved : e)).filter((e) => e.date === date));
        return saved;
      } catch (err) {
        setEntries(() => prev);
        throw err;
      }
    },
    [date, day, setEntries],
  );

  return { day, entries: day?.entries ?? null, loading: day === null, offline, refresh, add, remove, update, setDay };
}

/** Foods this profile has logged in the last 60 days, ranked by frequency. */
export function useFrequentFoods() {
  const { profileId } = useApp();
  const [foods, setFoods] = useState<FrequentFood[] | null>(() => cacheGet<FrequentFood[]>(profileId, "frequent"));
  const refresh = useCallback(() => {
    const t = today();
    return fetchLogRange(addDays(t, -60), t).then(
      (entries) => {
        const ranked = rankFrequentFoods(entries);
        setFoods(ranked);
        cacheSet(profileId, "frequent", ranked);
      },
      () => setFoods((f) => f ?? []),
    );
  }, [profileId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { foods, refresh };
}

export type { WeekDay } from "@/server/actions/summary";

/** Monday-to-Sunday totals against each day's targets, for the week strip and trend tiles. */
export function useWeek(date: string, version = 0) {
  const key = `${date}:${version}`;
  const [state, setState] = useState<{ key: string; days: WeekDay[] | null }>({ key, days: null });
  useEffect(() => {
    let live = true;
    fetchWeek(date).then(
      (days) => live && setState({ key, days }),
      () => live && setState({ key, days: [] }),
    );
    return () => {
      live = false;
    };
  }, [key, date]);
  return state.key === key ? state.days : null;
}
