"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addEntries,
  deleteEntries,
  fetchGoalFor,
  fetchLog,
  fetchLogRange,
  isTrainingDay,
  targetsFromGoal,
  updateEntry,
  type NewEntry,
} from "./data";
import { addDays, today } from "./dates";
import { rankFrequentFoods, type FrequentFood } from "./frequent";
import { cacheGet, cachePruneLogs, cacheSet } from "./offline";
import type { DayTargets, LogEntry } from "./types";
import { useApp } from "@/components/app-provider";

/** A day's log entries with offline cache and optimistic updates. */
export function useDayLog(date: string) {
  const { userId } = useApp();
  const cacheKey = `log:${date}`;
  const [state, setState] = useState<{ key: string; entries: LogEntry[] | null }>(() => ({
    key: cacheKey,
    entries: cacheGet<LogEntry[]>(userId, cacheKey),
  }));
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switching days: show that day's cached copy immediately (adjusting state during render).
  if (state.key !== cacheKey) setState({ key: cacheKey, entries: cacheGet<LogEntry[]>(userId, cacheKey) });
  const entries = state.key === cacheKey ? state.entries : null;

  const setEntries = useCallback(
    (fn: (cur: LogEntry[] | null) => LogEntry[]) =>
      setState((s) => {
        const next = fn(s.key === cacheKey ? s.entries : null);
        cacheSet(userId, cacheKey, next);
        return { key: cacheKey, entries: next };
      }),
    [userId, cacheKey],
  );

  const refresh = useCallback(
    () =>
      fetchLog(date).then(
        (data) => {
          setEntries(() => data);
          setOffline(false);
          setError(null);
        },
        (err) => {
          setOffline(typeof navigator !== "undefined" && !navigator.onLine);
          setError(err instanceof Error ? err.message : "Could not load log");
          setState((s) => (s.key === cacheKey && s.entries === null ? { ...s, entries: [] } : s));
        },
      ),
    [date, cacheKey, setEntries],
  );

  useEffect(() => {
    refresh();
    if (date === today()) cachePruneLogs(userId, addDays(date, -7));
  }, [date, userId, refresh]);

  const add = useCallback(
    async (items: NewEntry[]) => {
      const saved = await addEntries(items);
      setEntries((cur) => [...(cur ?? []), ...saved.filter((e) => e.date === date)]);
      return saved;
    },
    [date, setEntries],
  );

  const remove = useCallback(
    async (ids: string[]) => {
      const prev = entries ?? [];
      setEntries(() => prev.filter((e) => !ids.includes(e.id)));
      try {
        await deleteEntries(ids);
      } catch (err) {
        setEntries(() => prev);
        throw err;
      }
      return prev.filter((e) => ids.includes(e.id));
    },
    [entries, setEntries],
  );

  const update = useCallback(
    async (id: string, patch: Parameters<typeof updateEntry>[1]) => {
      const saved = await updateEntry(id, patch);
      setEntries((cur) => (cur ?? []).map((e) => (e.id === id ? saved : e)).filter((e) => e.date === date));
      return saved;
    },
    [date, setEntries],
  );

  return { entries, loading: entries === null, offline, error, refresh, add, remove, update };
}

/** Targets for a date: latest goal on/before that date, training vs rest day. */
export function useTargets(date: string) {
  const { userId } = useApp();
  const [state, setState] = useState<{ targets: DayTargets; training: boolean; hasGoal: boolean } | null>(() =>
    cacheGet(userId, `targets:${date}`),
  );
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGoalFor(date), isTrainingDay(date)])
      .then(([goal, training]) => {
        if (cancelled) return;
        const next = { targets: targetsFromGoal(goal, training), training, hasGoal: !!goal };
        setState(next);
        cacheSet(userId, `targets:${date}`, next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [date, userId]);
  return state;
}

/** Foods this user has logged in the last 60 days, ranked by frequency. */
export function useFrequentFoods() {
  const { userId } = useApp();
  const [foods, setFoods] = useState<FrequentFood[] | null>(() => cacheGet<FrequentFood[]>(userId, "frequent"));
  const refresh = useCallback(() => {
    const t = today();
    return fetchLogRange(addDays(t, -60), t).then(
      (entries) => {
        const ranked = rankFrequentFoods(entries);
        setFoods(ranked);
        cacheSet(userId, "frequent", ranked);
      },
      () => setFoods((f) => f ?? []),
    );
  }, [userId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { foods, refresh };
}
