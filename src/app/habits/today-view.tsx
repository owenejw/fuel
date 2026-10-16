"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { HabitDaySheet, MoodCard } from "@/components/habits/day-sheet";
import { HabitBadge, IconVacation } from "@/components/habits/habit-icons";
import { BreakRow, HabitRow, RoutineCard } from "@/components/habits/habit-rows";
import { useHabits } from "@/components/habits/habits-provider";
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconPlus } from "@/components/icons";
import { Rings } from "@/components/rings";
import { Avatar, Tile } from "@/components/summary";
import { useToast } from "@/components/toast";
import { Button, Card, PageSkeleton, Spinner, cx } from "@/components/ui";
import { addDays, parseDate } from "@/lib/dates";
import { reviewWeekStart, showReviewCard, weeklyReview } from "@/lib/habits/insights";
import { TEMPLATES, TIME_LABELS, WEEKDAY_SHORT, blankHabit, groupOrder } from "@/lib/habits/meta";
import { dayProgress, isDoneState, isPaused, onChecklist, weekStart } from "@/lib/habits/progress";
import type { Habit, HabitTime, Routine } from "@/lib/habits/types";
import { saveHabit } from "@/server/habits/actions";

type Item = { kind: "routine"; routine: Routine; steps: Habit[] } | { kind: "habit"; habit: Habit };

/** Habits Today: the checklist grouped by time of day, with the part of the day you're in first. */
export function HabitsTodayView() {
  const { profile } = useApp();
  const { data, today, analyses, tick, setEntry, setVacation } = useHabits();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const date = selected && selected <= today ? selected : today;
  const [openId, setOpenId] = useState<string | null>(null);
  // The habit to highlight: the next step after a tick, or ?h= from a reminder or a newly added habit. Read from the
  // URL each time, because this page is kept alive between visits.
  const [focusLocal, setFocusId] = useState<string | null>(null);
  const focusId = focusLocal ?? params.get("h");
  const [expanded, setExpanded] = useState<Partial<Record<HabitTime | "break", boolean>>>({});
  const [now] = useState(() => new Date());

  // From a reminder (?h=<id>): bring that habit into view.
  useEffect(() => {
    if (!focusId || !data) return;
    const t = setTimeout(() => document.getElementById(`habit-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
    return () => clearTimeout(t);
  }, [focusId, data]);

  const groups = useMemo(() => {
    if (!data) return [];
    const active = data.habits.filter((h) => h.kind === "build" && onChecklist(h, date));
    const routineIds = new Set(data.routines.map((r) => r.id));
    const order = groupOrder(date === today ? now.getHours() : 8);
    return order.map((time) => {
      const items: Item[] = [];
      for (const r of data.routines.filter((r) => r.time_of_day === time)) {
        const steps = active.filter((h) => h.routine_id === r.id).sort((a, b) => a.routine_position - b.routine_position);
        if (steps.length) items.push({ kind: "routine", routine: r, steps });
      }
      for (const h of active.filter((h) => h.time_of_day === time && !(h.routine_id && routineIds.has(h.routine_id))))
        items.push({ kind: "habit", habit: h });
      const habits = items.flatMap((i) => (i.kind === "routine" ? i.steps : [i.habit]));
      const finished = (h: Habit) => {
        const s = analyses.get(h.id)?.byDate.get(date)?.state;
        return isDoneState(s) || s === "skipped" || s === "paused" || s === "off";
      };
      return {
        time,
        items,
        habits,
        done: habits.filter(finished).length,
        paused: habits.every((h) => analyses.get(h.id)?.byDate.get(date)?.state === "paused"),
      };
    });
  }, [data, date, today, now, analyses]);

  const review = useMemo(
    () =>
      data && data.prefs.weekly_review && showReviewCard(today) && data.habits.some((h) => !h.archived)
        ? weeklyReview([...analyses.values()], data.days, data.pauses, reviewWeekStart(today), today)
        : null,
    [data, analyses, today],
  );

  if (!data)
    return (
      <div className="pt-safe px-4 pt-20">
        <PageSkeleton cards={[120, 220, 160]} />
      </div>
    );

  const breaks = data.habits.filter((h) => h.kind === "break" && onChecklist(h, date));
  const paused = isPaused(data.pauses, date);
  const pausedToday = isPaused(data.pauses, today);
  const open = data.habits.find((h) => h.id === openId) ?? null;
  const firstOpen = groups.find((g) => g.items.length && g.done < g.habits.length)?.time ?? groups.find((g) => g.items.length)?.time;
  const hasAny = data.habits.some((h) => !h.archived);

  const stateOf = (h: Habit) => analyses.get(h.id)?.byDate.get(date)?.state;
  const onTick = (h: Habit) => {
    const wasDone = isDoneState(stateOf(h));
    let message = `${h.name} done`;
    if (!wasDone && h.routine_id) {
      const steps = groups.flatMap((g) => g.items).find((i) => i.kind === "routine" && i.routine.id === h.routine_id);
      if (steps?.kind === "routine") {
        const i = steps.steps.findIndex((s) => s.id === h.id);
        const rest = [...steps.steps.slice(i + 1), ...steps.steps.slice(0, i)];
        const next = rest.find((s) => !isDoneState(stateOf(s)) && stateOf(s) !== "skipped");
        if (next) {
          message = `${h.name} done · Next: ${next.name}`;
          setFocusId(next.id);
        } else message = `${steps.routine.name} complete`;
      }
    }
    tick(h, date, { toast: message });
  };
  const onSkip = (h: Habit) =>
    setEntry(
      h,
      date,
      stateOf(h) === "skipped" ? null : { status: "skipped", count: 0 },
      stateOf(h) === "skipped" ? undefined : { toast: `${h.name} skipped` },
    );

  const name = (id: string | undefined) => data.habits.find((h) => h.id === id)?.name;

  return (
    <>
      <header className="pt-safe px-4">
        <div className="flex items-start gap-3 pt-4 pb-1">
          <div className="min-w-0 flex-1">
            <h1 className="text-[34px] leading-tight font-bold tracking-tight">Habits</h1>
            <p className="text-muted text-[15px]">
              {parseDate(date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <Link href="/habits/settings" aria-label="Habit settings" className="shrink-0 rounded-full active:scale-95">
            <Avatar name={profile.name} emoji={profile.avatar_emoji} color={profile.avatar_color} />
          </Link>
        </div>
        <WeekRings date={date} today={today} onSelect={setSelected} />
      </header>

      <div className="mt-3 space-y-5 px-4">
        {pausedToday && date === today && (
          <Card className="rise-in flex items-center gap-3 p-4">
            <span className="bg-accent-soft text-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
              <IconVacation width={22} height={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">On vacation</span>
              <span className="text-muted block text-sm">Habits are paused. Streaks and strength are frozen until you&apos;re back.</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => setVacation(false)}>
              I&apos;m back
            </Button>
          </Card>
        )}

        {review && review.best && (
          <Tile href="/habits/review" title="Your week in review">
            <p className="text-muted text-[15px]">
              Best: <span className="text-text font-medium">{name(review.best.habitId)}</span>
              {review.mostMissed && (
                <>
                  {" · "}Most missed: <span className="text-text font-medium">{name(review.mostMissed.habitId)}</span>
                </>
              )}
            </p>
          </Tile>
        )}

        {!hasAny && <EmptyState />}

        {groups
          .filter((g) => g.items.length)
          .map((g) => {
            const isOpen = expanded[g.time] ?? (g.time === firstOpen || (!!focusId && g.habits.some((h) => h.id === focusId)));
            const complete = g.done === g.habits.length;
            return (
              <section key={g.time} aria-label={TIME_LABELS[g.time]}>
                <button
                  className="mb-2 flex w-full items-center gap-2 pt-1 text-left"
                  onClick={() => setExpanded((e) => ({ ...e, [g.time]: !isOpen }))}
                  aria-expanded={isOpen}
                >
                  <h2 className="flex-1 text-xl font-bold">{TIME_LABELS[g.time]}</h2>
                  {!isOpen && (
                    <span className="flex -space-x-1.5">
                      {g.habits.slice(0, 5).map((h) => (
                        <span key={h.id} className="ring-bg rounded-full ring-2">
                          <HabitBadge icon={h.icon} color={h.color} size={22} muted={!isDoneState(stateOf(h))} />
                        </span>
                      ))}
                    </span>
                  )}
                  <span className={cx("tabular text-sm font-semibold", complete && !g.paused ? "text-accent" : "text-muted")}>
                    {g.paused ? "Paused" : complete ? "All done" : `${g.done}/${g.habits.length}`}
                  </span>
                  <IconChevronDown
                    width={18}
                    height={18}
                    className={cx("text-muted transition-transform duration-300", !isOpen && "-rotate-90")}
                  />
                </button>
                <div
                  className={cx(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="min-h-0 space-y-3 overflow-hidden" inert={!isOpen}>
                    {g.items.map((it) =>
                      it.kind === "routine" ? (
                        <div key={it.routine.id} id={`routine-${it.routine.id}`}>
                          <RoutineCard
                            routine={it.routine}
                            steps={it.steps}
                            analyses={analyses}
                            date={date}
                            focusId={focusId}
                            onTick={onTick}
                            onOpen={(h) => setOpenId(h.id)}
                            onSkip={onSkip}
                            readOnly={paused}
                          />
                        </div>
                      ) : null,
                    )}
                    {g.items.some((i) => i.kind === "habit") && (
                      <div className="bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl">
                        {g.items.map((it) =>
                          it.kind === "habit" ? (
                            <div key={it.habit.id} id={`habit-${it.habit.id}`}>
                              <HabitRow
                                habit={it.habit}
                                a={analyses.get(it.habit.id)}
                                date={date}
                                onTick={() => onTick(it.habit)}
                                onOpen={() => setOpenId(it.habit.id)}
                                onSkip={() => onSkip(it.habit)}
                                highlight={focusId === it.habit.id}
                                readOnly={paused}
                              />
                            </div>
                          ) : null,
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

        {breaks.length > 0 && (
          <section aria-label="Habits to break">
            <h2 className="mb-2 pt-1 text-xl font-bold">Breaking</h2>
            <div className="bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl">
              {breaks.map((h) => (
                <BreakRow key={h.id} habit={h} a={analyses.get(h.id)} date={date} onOpen={() => setOpenId(h.id)} />
              ))}
            </div>
          </section>
        )}

        {hasAny && <MoodCard date={date} />}
      </div>

      <HabitDaySheet habit={open} date={date} onClose={() => setOpenId(null)} />
    </>
  );
}

/** Monday–Sunday, each day with a ring for how much got done. Tap a past day to tick things off for it. */
function WeekRings({ date, today, onSelect }: { date: string; today: string; onSelect: (d: string) => void }) {
  const { analyses } = useHabits();
  const ws = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  return (
    <div className="mt-3 flex items-center gap-1">
      <button onClick={() => onSelect(addDays(ws, -7))} className="text-muted -ml-1 p-1" aria-label="Previous week">
        <IconChevronLeft width={18} height={18} />
      </button>
      <div className="grid flex-1 grid-cols-7 gap-1">
        {days.map((d, i) => {
          const future = d > today;
          const { done, due } = dayProgress(analyses.values(), d);
          const on = d === date;
          return (
            <button
              key={d}
              disabled={future}
              onClick={() => onSelect(d)}
              aria-label={parseDate(d).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              aria-current={on ? "date" : undefined}
              className={cx("flex flex-col items-center gap-1 rounded-2xl py-1.5 transition disabled:opacity-35", on && "bg-surface")}
            >
              <span className={cx("text-[11px] font-semibold", d === today ? "text-accent" : "text-muted")}>{WEEKDAY_SHORT[i]}</span>
              <span className="relative flex items-center justify-center">
                <Rings
                  rings={[{ value: due ? done : 0, target: Math.max(due, 1), color: "var(--accent)", color2: "var(--accent-hi)" }]}
                  size={34}
                  stroke={4.5}
                />
                <span className="tabular absolute text-[11px] font-semibold">{parseDate(d).getDate()}</span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onSelect(addDays(ws, 7))}
        disabled={addDays(ws, 7) > today}
        className="text-muted -mr-1 p-1 disabled:opacity-30"
        aria-label="Next week"
      >
        <IconChevronRight width={18} height={18} />
      </button>
    </div>
  );
}

/** No habits yet: one-tap starters, or make your own. */
function EmptyState() {
  const { today, mutate } = useHabits();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="rise-in space-y-4">
      <Card className="p-5 text-center">
        <h2 className="text-xl font-bold">Small habits, done often</h2>
        <p className="text-muted mt-1 text-[15px]">
          Pick a starter or make your own. Strength builds a little every time you tick one off.
        </p>
        <Link
          href="/habits/new"
          className="bg-accent text-accent-text mt-4 inline-flex h-11 items-center gap-2 rounded-full px-5 font-semibold active:scale-[0.97]"
        >
          <IconPlus width={18} height={18} /> New habit
        </Link>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.name}
            disabled={!!busy}
            onClick={async () => {
              setBusy(t.name);
              try {
                await mutate(() => saveHabit(blankHabit(today, t)), { after: (d, saved) => ({ ...d, habits: [...d.habits, saved] }) });
              } catch {
                toast("Couldn't add that habit");
              } finally {
                setBusy(null);
              }
            }}
            className="bg-surface flex items-center gap-2.5 rounded-2xl p-3 text-left transition active:scale-[0.97] disabled:opacity-60"
          >
            {busy === t.name ? <Spinner className="m-2" /> : <HabitBadge icon={t.icon ?? "check"} color={t.color ?? "indigo"} size={36} />}
            <span className="min-w-0 text-sm leading-tight font-medium">
              {t.name}
              {t.auto_source && <span className="text-muted block text-xs font-normal">Auto from nutrition</span>}
              {t.kind === "break" && <span className="text-muted block text-xs font-normal">To break</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
