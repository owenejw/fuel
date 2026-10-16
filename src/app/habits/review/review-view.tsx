"use client";

import { useState } from "react";
import { StrengthRing } from "@/components/habits/charts";
import { HabitBadge } from "@/components/habits/habit-icons";
import { useHabits } from "@/components/habits/habits-provider";
import { IconChevronLeft, IconChevronRight, IconTrophy } from "@/components/icons";
import { BackButton, Card, Empty, PageHeader, PageSkeleton } from "@/components/ui";
import { addDays, friendlyDate, parseDate } from "@/lib/dates";
import { reviewWeekStart, weeklyReview, type HabitWeek } from "@/lib/habits/insights";
import { MOODS, habitColor } from "@/lib/habits/meta";
import { weekStart } from "@/lib/habits/progress";

const fmt = (d: string) => parseDate(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/** The Sunday review: best habit, most missed, patterns and how the week felt. */
export function ReviewView() {
  const { data, analyses, today } = useHabits();
  const [ws, setWs] = useState(() => reviewWeekStart(today));
  if (!data)
    return (
      <div className="pt-safe px-4 pt-20">
        <PageSkeleton />
      </div>
    );
  const review = weeklyReview([...analyses.values()], data.days, data.pauses, ws, today);
  const habit = (w: HabitWeek | null) => (w ? data.habits.find((h) => h.id === w.habitId) : undefined);
  const best = habit(review.best);
  const missed = habit(review.mostMissed);
  const latest = weekStart(today);
  const mood = review.mood == null ? null : MOODS[Math.round(review.mood) - 1];

  return (
    <>
      <PageHeader title="Week in review" left={<BackButton href="/habits/insights" />} />
      <div className="space-y-3 px-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setWs(addDays(ws, -7))}
            className="bg-surface flex h-10 w-10 items-center justify-center rounded-full active:scale-95"
            aria-label="Previous week"
          >
            <IconChevronLeft width={20} height={20} />
          </button>
          <span className="text-[15px] font-semibold">
            {fmt(review.weekStart)} – {fmt(review.weekEnd)}
          </span>
          <button
            onClick={() => setWs(addDays(ws, 7))}
            disabled={ws >= latest}
            className="bg-surface flex h-10 w-10 items-center justify-center rounded-full active:scale-95 disabled:opacity-30"
            aria-label="Next week"
          >
            <IconChevronRight width={20} height={20} />
          </button>
        </div>

        {!review.habits.length ? (
          <Empty>Nothing to review for this week.</Empty>
        ) : (
          <>
            <Card className="flex items-center gap-5 p-5">
              <StrengthRing value={review.overall ?? 0} color="indigo" label="done" />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <div className="text-muted text-[13px]">Habits tracked</div>
                  <div className="tabular text-[17px] font-semibold">{review.habits.length}</div>
                </div>
                <div>
                  <div className="text-muted text-[13px]">Mood</div>
                  <div className="text-[17px] font-semibold">{mood ? `${mood.emoji} ${mood.label}` : "–"}</div>
                </div>
              </div>
            </Card>

            {best && review.best && (
              <Card className="rise-in flex items-center gap-4 p-4">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: "linear-gradient(145deg, var(--warn), var(--fat))" }}
                >
                  <IconTrophy width={24} height={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-muted block text-[13px]">Best habit</span>
                  <span className="block truncate text-[17px] font-semibold">{best.name}</span>
                  <span className="text-muted block text-[13px]">
                    {Math.round(review.best.rate * 100)}% done · strength {change(review.best.strengthChange)}
                  </span>
                </span>
              </Card>
            )}

            {missed && review.mostMissed && (
              <Card className="rise-in flex items-center gap-4 p-4">
                <HabitBadge icon={missed.icon} color={missed.color} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="text-muted block text-[13px]">Most missed</span>
                  <span className="block truncate text-[17px] font-semibold">{missed.name}</span>
                  <span className="text-muted block text-[13px]">
                    Missed {review.mostMissed.missed} {review.mostMissed.missed === 1 ? "time" : "times"}.{" "}
                    {missed.reminder_time ? "Try making it smaller this week." : "A reminder might help."}
                  </span>
                </span>
              </Card>
            )}

            {review.patterns.length > 0 && (
              <Card className="p-4">
                <h2 className="mb-2 text-[17px] font-semibold">Patterns</h2>
                <ul className="space-y-1.5">
                  {review.patterns.map((p) => (
                    <li key={`${p.habitId}${p.weekday}`} className="text-[15px]">
                      {p.text}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card className="p-4">
              <h2 className="mb-3 text-[17px] font-semibold">Every habit</h2>
              <div className="space-y-3">
                {[...review.habits]
                  .sort((a, b) => b.rate - a.rate)
                  .map((w) => {
                    const h = data.habits.find((x) => x.id === w.habitId)!;
                    return (
                      <div key={w.habitId} className="flex items-center gap-3">
                        <HabitBadge icon={h.icon} color={h.color} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="flex justify-between text-[15px]">
                            <span className="truncate">{h.name}</span>
                            <span className="text-muted tabular">{Math.round(w.rate * 100)}%</span>
                          </span>
                          <span className="bg-surface-2 mt-1 block h-1.5 overflow-hidden rounded-full">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${w.rate * 100}%`, background: habitColor(h.color) }}
                            />
                          </span>
                        </span>
                        <span
                          className="tabular w-12 text-right text-[13px]"
                          style={{ color: w.strengthChange >= 0 ? "var(--protein)" : "var(--muted)" }}
                        >
                          {change(w.strengthChange)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </Card>

            {review.notes.length > 0 && (
              <Card className="p-4">
                <h2 className="mb-2 text-[17px] font-semibold">Your notes</h2>
                <ul className="space-y-2">
                  {review.notes.map((n) => (
                    <li key={n.date} className="text-[15px]">
                      <span className="text-muted mr-2 text-[13px]">{friendlyDate(n.date)}</span>
                      {n.mood ? `${MOODS[n.mood - 1].emoji} ` : ""}
                      {n.note}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}

const change = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}`;
