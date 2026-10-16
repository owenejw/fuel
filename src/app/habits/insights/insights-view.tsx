"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StrengthChart, StrengthRing } from "@/components/habits/charts";
import { HabitBadge } from "@/components/habits/habit-icons";
import { useHabits } from "@/components/habits/habits-provider";
import { Tile } from "@/components/summary";
import { Card, Empty, PageHeader, PageSkeleton, Segmented, cx } from "@/components/ui";
import { addDays, parseDate } from "@/lib/dates";
import { findPatterns, reviewWeekStart, weekdayRates } from "@/lib/habits/insights";
import { WEEKDAY_SHORT, habitColor } from "@/lib/habits/meta";
import { completionRate, weekStart } from "@/lib/habits/progress";

type Range = "30" | "90" | "365";

/** Across all habits: overall strength, trend, weekday patterns and a link to the weekly review. */
export function InsightsView() {
  const { data, analyses, today } = useHabits();
  const [pick, setPick] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("90");

  const list = useMemo(() => [...analyses.values()].filter((a) => !a.habit.archived), [analyses]);
  const average = useMemo(() => {
    // Mean strength of the habits running on each day.
    const from = addDays(today, -Number(range) + 1);
    const maps = list.map((a) => new Map(a.series.map((p) => [p.date, p.value])));
    const out: { date: string; value: number }[] = [];
    for (let d = from; d <= today; d = addDays(d, 1)) {
      const vals = maps.map((m) => m.get(d)).filter((v): v is number => v != null);
      if (vals.length) out.push({ date: d, value: vals.reduce((s, v) => s + v, 0) / vals.length });
    }
    return out;
  }, [list, range, today]);

  // Weekday rates and patterns walk 12 weeks per habit; work them out once per change, not on every render.
  const breakdown = useMemo(
    () => list.map((a) => ({ a, rates: weekdayRates(a, today).rates, patterns: findPatterns(a, today) })),
    [list, today],
  );

  if (!data)
    return (
      <div className="pt-safe px-4 pt-20">
        <PageSkeleton />
      </div>
    );
  if (!list.length)
    return (
      <>
        <PageHeader title="Insights" />
        <Empty>Add a habit and your progress will show up here.</Empty>
      </>
    );

  const overall = average.at(-1)?.value ?? 0;
  const ranked = [...list].sort((a, b) => b.strength - a.strength);
  const ws = weekStart(today);
  const weekRates = list.map((a) => completionRate(a.habit, a.byDate, data.pauses, ws, today)).filter((r): r is number => r != null);
  const thisWeek = weekRates.length ? weekRates.reduce((s, r) => s + r, 0) / weekRates.length : null;
  const picked = pick ? analyses.get(pick) : null;
  const series = picked ? picked.series.filter((p) => p.date > addDays(today, -Number(range))) : average;
  const patterns = breakdown.flatMap((b) => b.patterns);

  return (
    <>
      <PageHeader title="Insights" />
      <div className="space-y-3 px-4">
        <Card className="flex items-center gap-5 p-5">
          <StrengthRing value={overall} color="indigo" label="overall" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="text-muted text-[13px]">Strongest</div>
              <div className="truncate text-[17px] font-semibold">{ranked[0].habit.name}</div>
            </div>
            <div>
              <div className="text-muted text-[13px]">This week</div>
              <div className="tabular text-[17px] font-semibold">{thisWeek == null ? "–" : `${Math.round(thisWeek * 100)}% done`}</div>
            </div>
          </div>
        </Card>

        <Tile href="/habits/review" title="Weekly review">
          <p className="text-muted text-[15px]">
            Best habit, most missed and patterns for the week of{" "}
            {parseDate(reviewWeekStart(today)).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}.
          </p>
        </Tile>

        <Card className="space-y-3 p-4">
          <h2 className="text-[17px] font-semibold">Strength trend</h2>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            <Pick on={!pick} onClick={() => setPick(null)}>
              Average
            </Pick>
            {list.map((a) => (
              <Pick key={a.habit.id} on={pick === a.habit.id} color={habitColor(a.habit.color)} onClick={() => setPick(a.habit.id)}>
                {a.habit.name}
              </Pick>
            ))}
          </div>
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "30", label: "1M" },
              { value: "90", label: "3M" },
              { value: "365", label: "1Y" },
            ]}
          />
          <StrengthChart series={series} color={picked?.habit.color ?? "indigo"} />
        </Card>

        <Card className="p-4">
          <h2 className="mb-1 text-[17px] font-semibold">Weekly breakdown</h2>
          <p className="text-muted mb-3 text-[13px]">How often each habit gets done on each weekday, last 12 weeks.</p>
          <div className="space-y-1.5">
            <div className="text-muted grid grid-cols-[minmax(0,1fr)_repeat(7,28px)] gap-1 text-center text-[11px] font-semibold">
              <span />
              {WEEKDAY_SHORT.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            {breakdown.map(({ a, rates }) => {
              const c = habitColor(a.habit.color);
              return (
                <Link
                  key={a.habit.id}
                  href={`/habits/${a.habit.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_repeat(7,28px)] items-center gap-1"
                >
                  <span className="truncate pr-1 text-[13px]">{a.habit.name}</span>
                  {rates.map((r, i) => (
                    <span
                      key={i}
                      className="h-7 rounded-md"
                      title={r == null ? "No data" : `${Math.round(r * 100)}%`}
                      style={{
                        background:
                          r == null ? "var(--surface-2)" : `color-mix(in srgb, ${c} ${Math.round(15 + r * 85)}%, var(--surface-2))`,
                      }}
                    />
                  ))}
                </Link>
              );
            })}
          </div>
          {patterns.length > 0 ? (
            <ul className="border-border mt-4 space-y-2 border-t pt-3">
              {patterns.map((p) => (
                <li key={`${p.habitId}${p.weekday}`} className="text-[15px]">
                  {p.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted mt-3 text-sm">No patterns yet. They show up after a few weeks of data.</p>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-[17px] font-semibold">By strength</h2>
          <div className="space-y-3">
            {ranked.map((a) => (
              <Link key={a.habit.id} href={`/habits/${a.habit.id}`} className="flex items-center gap-3">
                <HabitBadge icon={a.habit.icon} color={a.habit.color} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between text-[15px]">
                    <span className="truncate">{a.habit.name}</span>
                    <span className="tabular text-muted">{Math.round(a.strength * 100)}%</span>
                  </span>
                  <span className="bg-surface-2 mt-1 block h-1.5 overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${a.strength * 100}%`, background: habitColor(a.habit.color) }}
                    />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function Pick({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cx("h-8 shrink-0 rounded-full px-3 text-sm font-medium transition active:scale-95", !on && "bg-surface-2 text-muted")}
      style={on ? { background: color ?? "var(--accent)", color: color ? "#fff" : "var(--accent-text)" } : undefined}
    >
      {children}
    </button>
  );
}
