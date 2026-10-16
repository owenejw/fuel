"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { StrengthChart, StrengthRing, WeekdayBars, YearGrid } from "@/components/habits/charts";
import { HabitBadge, IconFlame, IconMedal } from "@/components/habits/habit-icons";
import { useHabits } from "@/components/habits/habits-provider";
import { BackButton, Card, PageHeader, PageSkeleton, Segmented, cx } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { findPatterns, weekdayRates } from "@/lib/habits/insights";
import { AUTO_LABELS, TIME_LABELS, habitColor, scheduleLabel } from "@/lib/habits/meta";
import { MILESTONES, challengeDay } from "@/lib/habits/progress";

type Range = "30" | "90" | "365" | "all";

/** One habit's progress: strength, streaks, milestones, the year at a glance, trend and weekday patterns. */
export function HabitDetailView() {
  const { id } = useParams<{ id: string }>();
  const { data, analyses, today } = useHabits();
  const [range, setRange] = useState<Range>("90");
  if (!data)
    return (
      <div className="pt-safe px-4 pt-20">
        <PageSkeleton />
      </div>
    );
  const h = data.habits.find((x) => x.id === id);
  const a = analyses.get(id);
  if (!h || !a) return <PageHeader title="Habit not found" left={<BackButton href="/habits/manage" />} />;

  const color = habitColor(h.color);
  const isBreak = h.kind === "break";
  const series = range === "all" ? a.series : a.series.filter((p) => p.date > addDays(today, -Number(range)));
  const rates = weekdayRates(a, today);
  const patterns = findPatterns(a, today);
  const ch = challengeDay(h, today);
  const unit = a.streakUnit === "weeks" ? (a.streak === 1 ? "week" : "weeks") : a.streak === 1 ? "day" : "days";

  return (
    <>
      <PageHeader
        title=""
        left={<BackButton />}
        right={
          <Link href={`/habits/${id}/edit`} className="text-accent px-2 text-[17px] font-medium">
            Edit
          </Link>
        }
      />
      <div className="space-y-3 px-4">
        <div className="flex items-center gap-3 pb-1">
          <HabitBadge icon={h.icon} color={h.color} size={52} />
          <div className="min-w-0">
            <h1 className="truncate text-[28px] leading-tight font-bold tracking-tight">{h.name}</h1>
            <p className="text-muted truncate text-[15px]">
              {isBreak ? "Habit to break" : `${scheduleLabel(h)} · ${TIME_LABELS[h.time_of_day]}`}
              {h.auto_source && ` · Auto: ${AUTO_LABELS[h.auto_source].label}`}
              {h.archived && " · Archived"}
            </p>
          </div>
        </div>

        <Card className="flex items-center gap-5 p-5">
          <StrengthRing value={a.strength} color={h.color} />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="text-muted text-[13px]">{isBreak ? "Days since a slip" : "Current streak"}</div>
              <div className="flex items-center gap-1 text-[22px] font-semibold">
                {!isBreak && <IconFlame width={18} height={18} style={{ color: "var(--fat)" }} />}
                <span className="tabular">{a.streak}</span>
                <span className="text-muted text-[15px] font-medium">{unit}</span>
              </div>
            </div>
            <div className="flex gap-5">
              <Stat label="Best" value={`${a.best}`} />
              <Stat label="Last 30 days" value={a.rate30 == null ? "–" : `${Math.round(a.rate30 * 100)}%`} />
            </div>
          </div>
        </Card>
        <p className="text-muted px-1 text-xs">
          Strength rises each time you do it and eases off gently when you miss. It never drops straight to zero, so one bad day
          doesn&apos;t undo your work.
        </p>

        {ch && (
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between text-[15px]">
              <span className="font-semibold">Challenge</span>
              <span className="text-muted tabular">{today > (h.end_date ?? today) ? "Finished" : `Day ${ch.day} of ${ch.total}`}</span>
            </div>
            <div className="bg-surface-2 h-2 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${(ch.day / ch.total) * 100}%`, background: color }}
              />
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h2 className="mb-3 text-[17px] font-semibold">Milestones</h2>
          <div className="grid grid-cols-7 gap-1.5">
            {MILESTONES.map((m) => {
              const got = Math.max(a.best, a.milestoneCount) >= m;
              return (
                <div key={m} className="flex flex-col items-center gap-1">
                  <span
                    className={cx("flex h-10 w-10 items-center justify-center rounded-full", !got && "bg-surface-2 text-muted")}
                    style={got ? { background: `linear-gradient(145deg, var(--fat), ${color})`, color: "#fff" } : undefined}
                  >
                    <IconMedal width={18} height={18} />
                  </span>
                  <span className={cx("tabular text-[11px] font-semibold", got ? "text-text" : "text-muted")}>{m}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-[17px] font-semibold">Year</h2>
          <YearGrid byDate={a.byDate} color={h.color} today={today} start={h.start_date} />
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-[17px] font-semibold">Strength trend</h2>
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "30", label: "1M" },
              { value: "90", label: "3M" },
              { value: "365", label: "1Y" },
              { value: "all", label: "All" },
            ]}
          />
          <StrengthChart series={series} color={h.color} />
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-[17px] font-semibold">By weekday</h2>
          <WeekdayBars rates={rates.rates} color={h.color} weak={patterns.filter((p) => p.kind !== "strong").map((p) => p.weekday)} />
          {patterns.length > 0 ? (
            <ul className="space-y-1">
              {patterns.map((p) => (
                <li key={p.weekday} className="text-[15px]">
                  {p.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">
              {rates.overall == null ? "Patterns show up after a few weeks." : "No weak days. Nice and steady across the week."}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted text-[13px]">{label}</div>
      <div className="tabular text-[17px] font-semibold">{value}</div>
    </div>
  );
}
