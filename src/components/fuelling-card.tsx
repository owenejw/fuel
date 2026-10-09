"use client";

import { activeWindow, fmtMin, type FuelItem } from "@/lib/fuelling";
import { WORKOUT_LABELS, type Workout } from "@/lib/types";
import { Card, cx } from "./ui";

/** The day's workouts with fuelling guidance laid out on a timeline. */
export function FuellingCard({
  items,
  workouts,
  nowMin,
  isToday,
}: {
  items: FuelItem[];
  workouts: Workout[];
  nowMin: number;
  isToday: boolean;
}) {
  const active = isToday ? activeWindow(items, nowMin) : null;
  const sessions = workouts.filter((w) => w.type !== "rest");
  if (!sessions.length) return null;
  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold">Fuelling</h2>
      <p className="text-muted mb-3 text-sm">
        {sessions
          .map(
            (w) =>
              `${w.title || WORKOUT_LABELS[w.type]}${w.start_time ? ` at ${fmtMin(Number(w.start_time.slice(0, 2)) * 60 + Number(w.start_time.slice(3, 5)))}` : ""}${w.duration_min ? ` · ${w.duration_min} min` : ""}${w.is_race ? " · race" : ""}`,
          )
          .join(" · ")}
      </p>
      <ol className="border-border relative space-y-3 border-l-2 pl-4">
        {items.map((i, n) => {
          const isActive = active === i;
          const past = isToday && i.end !== null && i.end < nowMin;
          return (
            <li key={n} className={cx("relative", past && "opacity-50")}>
              <span
                className={cx(
                  "border-surface absolute top-1 -left-[23px] h-3 w-3 rounded-full border-2",
                  isActive ? "bg-accent" : "bg-border",
                )}
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className={cx("text-sm font-medium", isActive && "text-accent")}>
                  {i.title}
                  {isActive && " · now"}
                </span>
                {i.start !== null && (
                  <span className="tabular text-muted shrink-0 text-xs">
                    {fmtMin(i.start)}
                    {i.end !== null && i.end !== i.start ? `–${fmtMin(i.end)}` : ""}
                  </span>
                )}
              </div>
              <p className="text-muted text-sm">{i.detail}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
