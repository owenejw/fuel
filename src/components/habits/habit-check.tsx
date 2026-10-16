"use client";

import { habitColor, habitColor2 } from "@/lib/habits/meta";
import { isDoneState, type DayInfo } from "@/lib/habits/progress";
import type { Habit } from "@/lib/habits/types";
import { IconPause, IconSkip } from "./habit-icons";

/**
 * The round tick button. Count habits fill the ring a step at a time; when done it fills with the habit's colour,
 * pops, and the tick draws itself.
 */
export function HabitCheck({
  habit,
  info,
  onClick,
  size = 44,
  disabled,
}: {
  habit: Habit;
  info: DayInfo | undefined;
  onClick?: () => void;
  size?: number;
  disabled?: boolean;
}) {
  const c1 = habitColor(habit.color);
  const c2 = habitColor2(habit.color);
  const state = info?.state;
  const done = isDoneState(state);
  const count = info?.count ?? 0;
  const frac = done ? 1 : Math.min(1, count / habit.target);
  const stroke = Math.max(3, size * 0.1);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const label =
    habit.target > 1
      ? `${habit.name}: ${count} of ${habit.target}${done ? ", done" : ". Add one"}`
      : `${habit.name}${done ? ", done" : ""}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={done}
      className="relative shrink-0 rounded-full transition active:scale-90 disabled:active:scale-100"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={state === "skipped" || state === "paused" ? "var(--border)" : c1}
          strokeOpacity={state === "skipped" || state === "paused" ? 1 : 0.28}
          strokeWidth={stroke}
          strokeDasharray={state === "skipped" ? `${circ / 16} ${circ / 16}` : undefined}
        />
        {!done && frac > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={c1}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circ * frac} ${circ}`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        )}
      </svg>
      {done ? (
        <span
          key="done"
          className="habit-pop absolute inset-0 flex items-center justify-center rounded-full"
          style={{ background: `linear-gradient(145deg, ${c2}, ${c1})`, boxShadow: `0 4px 14px ${c1}55` }}
        >
          <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="#fff"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="check-draw"
            />
          </svg>
        </span>
      ) : state === "skipped" ? (
        <span className="text-muted absolute inset-0 flex items-center justify-center">
          <IconSkip width={size * 0.4} height={size * 0.4} />
        </span>
      ) : state === "paused" ? (
        <span className="text-muted absolute inset-0 flex items-center justify-center">
          <IconPause width={size * 0.36} height={size * 0.36} />
        </span>
      ) : habit.target > 1 ? (
        <span className="tabular absolute inset-0 flex items-center justify-center text-[13px] font-semibold" style={{ color: c2 }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
