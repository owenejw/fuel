"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, friendlyDate, parseDate, today } from "@/lib/dates";
import type { WeekDay } from "@/lib/hooks";
import { getDayPlans } from "@/server/actions/plan";
import { fetchWeek } from "@/server/actions/summary";
import { setDayType } from "@/lib/data";
import { IconChevronLeft, IconChevronRight, IconDumbbell, IconRest, IconSparkles } from "./icons";
import { ChoiceCards, Sheet, Spinner, cx } from "./ui";

export const mondayOf = (d: string) => addDays(d, -((parseDate(d).getDay() + 6) % 7));

export function weekLabel(weekStart: string) {
  const thisWeek = mondayOf(today());
  if (weekStart === thisWeek) return "This week";
  if (weekStart === addDays(thisWeek, -7)) return "Last week";
  if (weekStart === addDays(thisWeek, 7)) return "Next week";
  const f = (d: string) => parseDate(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${f(weekStart)} – ${f(addDays(weekStart, 6))}`;
}

/** ‹ This week › — the one week switcher used on Nutrition, Plan and Trends. */
export function WeekNav({ weekStart, onChange, maxAhead = 1 }: { weekStart: string; onChange: (w: string) => void; maxAhead?: number }) {
  const canNext = weekStart < addDays(mondayOf(today()), 7 * maxAhead);
  return (
    <div className="mb-1 flex items-center justify-between">
      <button
        onClick={() => onChange(addDays(weekStart, -7))}
        className="bg-surface text-muted rounded-full p-2 active:scale-90"
        aria-label="Previous week"
      >
        <IconChevronLeft width={18} height={18} />
      </button>
      <span className="text-[15px] font-semibold">{weekLabel(weekStart)}</span>
      <button
        onClick={() => canNext && onChange(addDays(weekStart, 7))}
        disabled={!canNext}
        className="bg-surface text-muted rounded-full p-2 active:scale-90 disabled:opacity-30"
        aria-label="Next week"
      >
        <IconChevronRight width={18} height={18} />
      </button>
    </div>
  );
}

/**
 * Monday–Sunday day picker. Swipe or use the arrows for other weeks; past days open their numbers,
 * upcoming days let you mark them as training or rest.
 */
export function WeekPicker({
  selected,
  version,
  onSelect,
  onPlanDay,
}: {
  selected: string;
  version: number;
  onSelect: (d: string) => void;
  onPlanDay: (d: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(selected));
  const [weeks, setWeeks] = useState<Record<string, WeekDay[]>>({});
  const [loaded, setLoaded] = useState<Record<string, number>>({});
  const touch = useRef<{ x: number; y: number } | null>(null);
  const t = today();
  const thisWeek = mondayOf(t);

  useEffect(() => {
    if (loaded[weekStart] === version) return;
    let live = true;
    fetchWeek(weekStart).then(
      (d) => {
        if (!live) return;
        setWeeks((w) => ({ ...w, [weekStart]: d }));
        setLoaded((l) => ({ ...l, [weekStart]: version }));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [weekStart, version, loaded]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const data = weeks[weekStart];
  const canNext = weekStart < addDays(thisWeek, 7);

  return (
    <div
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
        if (dx > 0) setWeekStart((w) => addDays(w, -7));
        else if (canNext) setWeekStart((w) => addDays(w, 7));
      }}
    >
      <WeekNav weekStart={weekStart} onChange={setWeekStart} />
      <div key={weekStart} className="page-in grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const info = data?.[i];
          const isSel = d === selected;
          const future = d > t;
          return (
            <button
              key={d}
              onClick={() => (future ? onPlanDay(d) : onSelect(d))}
              className="flex flex-col items-center gap-1 rounded-xl py-1 active:opacity-60"
              aria-label={future ? `Plan ${d}` : d}
              aria-pressed={isSel}
            >
              <span className={cx("text-[11px] font-semibold", d === t ? "text-accent" : "text-muted")}>{"MTWTFSS"[i]}</span>
              <span
                className={cx(
                  "tabular flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-semibold transition",
                  isSel ? "bg-accent text-accent-text" : future ? "bg-surface/60 text-muted" : "bg-surface",
                  d === t && !isSel && "ring-accent ring-1",
                )}
              >
                {Number(d.slice(8))}
              </span>
              <span className="flex h-3 items-center">
                {info?.training ? (
                  <IconDumbbell width={11} height={11} className="text-protein" />
                ) : (
                  <span className={cx("h-1.5 w-1.5 rounded-full", info?.logged ? "bg-accent" : "bg-transparent")} />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Choose automatic, training or rest for a day (today, past or upcoming). */
export function DayTypeSheet({ date, onClose, onChanged }: { date: string | null; onClose: () => void; onChanged: (d: string) => void }) {
  const [plan, setPlan] = useState<{ date: string; dayType: "training" | "rest"; overridden: boolean; auto: "training" | "rest" } | null>(
    null,
  );
  useEffect(() => {
    if (!date) return;
    let live = true;
    getDayPlans(date, date).then(([p]) => {
      if (live && p)
        setPlan({
          date,
          dayType: p.dayType,
          overridden: p.dayTypeOverridden,
          auto: p.workouts.some((w) => w.type !== "rest") ? "training" : "rest",
        });
    });
    return () => {
      live = false;
    };
  }, [date]);
  const current = plan && plan.date === date ? plan : null;
  return (
    <Sheet open={!!date} onClose={onClose} title={date ? `${friendlyDate(date)}${date > today() ? " — plan ahead" : ""}` : ""}>
      {!current ? (
        <div className="text-muted flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <ChoiceCards<"auto" | "training" | "rest">
          value={current.overridden ? current.dayType : "auto"}
          onChange={async (v) => {
            const d = current.date;
            onClose();
            await setDayType(d, v === "auto" ? null : v);
            onChanged(d);
          }}
          options={[
            {
              value: "auto",
              label: `Automatic (${current.auto} day)`,
              hint: "Worked out from the workouts in your Plan",
              icon: IconSparkles,
            },
            { value: "training", label: "Training day", hint: "More carbs to fuel your session", icon: IconDumbbell },
            { value: "rest", label: "Rest day", hint: "Fewer carbs, same protein", icon: IconRest },
          ]}
        />
      )}
    </Sheet>
  );
}
