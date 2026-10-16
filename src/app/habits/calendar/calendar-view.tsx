"use client";

import { useRef, useState } from "react";
import { HabitDaySheet, MoodCard } from "@/components/habits/day-sheet";
import { HabitBadge, IconVacation } from "@/components/habits/habit-icons";
import { BreakRow, HabitRow } from "@/components/habits/habit-rows";
import { useHabits } from "@/components/habits/habits-provider";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { Empty, PageHeader, PageSkeleton, Sheet, cx } from "@/components/ui";
import { addDays, friendlyDate, parseDate, toDateString } from "@/lib/dates";
import { MOODS, WEEKDAY_SHORT, habitColor } from "@/lib/habits/meta";
import { isDoneState, isPaused, onChecklist, weekdayIndex } from "@/lib/habits/progress";
import type { Habit } from "@/lib/habits/types";

const MAX_DOTS = 6;

/** A month at a time: a coloured dot per habit done on each day. Tap a day to see or change it. */
export function CalendarView() {
  const { data, analyses, today, tick, setEntry } = useHabits();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [dir, setDir] = useState<"left" | "right" | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  if (!data)
    return (
      <div className="pt-safe px-4 pt-20">
        <PageSkeleton cards={[48, 360]} />
      </div>
    );

  const first = `${month}-01`;
  const d0 = parseDate(first);
  const daysInMonth = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  const lead = weekdayIndex(first);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const go = (delta: number) => {
    const d = new Date(d0.getFullYear(), d0.getMonth() + delta, 1);
    const next = toDateString(d).slice(0, 7);
    if (next > today.slice(0, 7)) return;
    setDir(delta > 0 ? "left" : "right");
    setMonth(next);
  };
  const habits = data.habits.filter((h) => !h.archived || data.entries.some((e) => e.habit_id === h.id && e.date.startsWith(month)));
  const shown = filter ? habits.filter((h) => h.id === filter) : habits;
  const doneOn = (d: string) => shown.filter((h) => h.kind === "build" && isDoneState(analyses.get(h.id)?.byDate.get(d)?.state));
  const selectedHabit = filter ? habits.find((h) => h.id === filter) : null;
  const open = data.habits.find((h) => h.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title={d0.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
        right={
          <div className="flex gap-1">
            <button
              onClick={() => go(-1)}
              className="bg-surface flex h-10 w-10 items-center justify-center rounded-full active:scale-95"
              aria-label="Previous month"
            >
              <IconChevronLeft width={20} height={20} />
            </button>
            <button
              onClick={() => go(1)}
              disabled={month >= today.slice(0, 7)}
              className="bg-surface flex h-10 w-10 items-center justify-center rounded-full active:scale-95 disabled:opacity-30"
              aria-label="Next month"
            >
              <IconChevronRight width={20} height={20} />
            </button>
          </div>
        }
      />

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
        <Chip on={!filter} onClick={() => setFilter(null)}>
          All
        </Chip>
        {habits
          .filter((h) => h.kind === "build")
          .map((h) => (
            <Chip key={h.id} on={filter === h.id} color={habitColor(h.color)} onClick={() => setFilter(filter === h.id ? null : h.id)}>
              <HabitBadge icon={h.icon} color={h.color} size={20} />
              {h.name}
            </Chip>
          ))}
      </div>

      <div className="px-4">
        <div className="text-muted mb-1 grid grid-cols-7 text-center text-[11px] font-semibold">
          {WEEKDAY_SHORT.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div
          key={month}
          className="grid touch-pan-y grid-cols-7 gap-1"
          style={
            dir
              ? { animation: `${dir === "left" ? "month-from-right" : "month-from-left"} 0.32s cubic-bezier(0.2, 0.9, 0.25, 1)` }
              : undefined
          }
          onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s) return;
            const dx = e.clientX - s.x;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) {
              swiped.current = true;
              go(dx < 0 ? 1 : -1);
            }
          }}
          onClickCapture={(e) => {
            // A swipe shouldn't also open the day under the finger.
            if (!swiped.current) return;
            swiped.current = false;
            e.stopPropagation();
          }}
        >
          {cells.map((d, i) => {
            if (!d) return <span key={`x${i}`} />;
            const future = d > today;
            const done = doneOn(d);
            const paused = isPaused(data.pauses, d);
            const mood = data.days.find((x) => x.date === d)?.mood;
            const single = selectedHabit && done.length > 0;
            return (
              <button
                key={d}
                disabled={future}
                onClick={() => setDay(d)}
                aria-label={`${friendlyDate(d)}: ${done.length} done`}
                className={cx(
                  "relative flex aspect-[4/5] flex-col items-center rounded-2xl pt-1.5 transition active:scale-95 disabled:opacity-30",
                  !single && "bg-surface",
                )}
                style={single ? { background: habitColor(selectedHabit.color) } : undefined}
              >
                <span
                  className={cx(
                    "tabular flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold",
                    d === today && "bg-accent text-accent-text",
                  )}
                >
                  {parseDate(d).getDate()}
                </span>
                {paused ? (
                  <IconVacation width={13} height={13} className="text-muted mt-1.5" />
                ) : (
                  !selectedHabit && (
                    <span className="mt-1.5 grid grid-cols-3 gap-[3px]">
                      {done.slice(0, MAX_DOTS).map((h) => (
                        <span key={h.id} className="h-[6px] w-[6px] rounded-full" style={{ background: habitColor(h.color) }} />
                      ))}
                    </span>
                  )
                )}
                {done.length > MAX_DOTS && !selectedHabit && (
                  <span className="text-muted text-[9px] leading-3">+{done.length - MAX_DOTS}</span>
                )}
                {mood && <span className="absolute right-1 bottom-0.5 text-[10px]">{MOODS[mood - 1].emoji}</span>}
              </button>
            );
          })}
        </div>
        <p className="text-muted mt-3 text-center text-xs">Swipe to change month. Tap a day to see it or fill it in.</p>
      </div>

      <Sheet open={!!day} onClose={() => setDay(null)} title={day ? friendlyDate(day) : ""}>
        {day && <DayDetail date={day} habits={data.habits} onOpen={setOpenId} tick={tick} setEntry={setEntry} />}
      </Sheet>
      <HabitDaySheet habit={open} date={day ?? today} onClose={() => setOpenId(null)} />
    </>
  );
}

function DayDetail({
  date,
  habits,
  onOpen,
  tick,
  setEntry,
}: {
  date: string;
  habits: Habit[];
  onOpen: (id: string) => void;
  tick: ReturnType<typeof useHabits>["tick"];
  setEntry: ReturnType<typeof useHabits>["setEntry"];
}) {
  const { analyses, data } = useHabits();
  const list = habits.filter((h) => onChecklist(h, date) || data?.entries.some((e) => e.habit_id === h.id && e.date === date));
  const build = list.filter((h) => h.kind === "build");
  const breaks = list.filter((h) => h.kind === "break");
  const paused = !!data && isPaused(data.pauses, date);
  return (
    <div className="space-y-4">
      {paused && <p className="text-muted text-sm">On vacation this day. Nothing counted.</p>}
      {build.length === 0 && breaks.length === 0 ? (
        <Empty>No habits on this day.</Empty>
      ) : (
        <div className="bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl">
          {build.map((h) => (
            <HabitRow
              key={h.id}
              habit={h}
              a={analyses.get(h.id)}
              date={date}
              onTick={() => tick(h, date, { toast: `${h.name} done` })}
              onOpen={() => onOpen(h.id)}
              onSkip={() => {
                const skipped = analyses.get(h.id)?.byDate.get(date)?.state === "skipped";
                setEntry(h, date, skipped ? null : { status: "skipped", count: 0 });
              }}
              readOnly={paused}
            />
          ))}
          {breaks.map((h) => (
            <BreakRow key={h.id} habit={h} a={analyses.get(h.id)} date={date} onOpen={() => onOpen(h.id)} />
          ))}
        </div>
      )}
      <MoodCard date={date} />
    </div>
  );
}

function Chip({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border pr-3 text-sm font-medium transition active:scale-95",
        color ? "pl-1" : "pl-3",
        on ? "border-transparent text-white" : "border-border bg-surface text-text",
      )}
      style={on ? { background: color ?? "var(--accent)", color: color ? "#fff" : "var(--accent-text)" } : undefined}
    >
      {children}
    </button>
  );
}
