"use client";

import { useRef, useState, type ReactNode } from "react";
import { cx } from "../ui";
import { AUTO_LABELS, habitColor } from "@/lib/habits/meta";
import { challengeDay, isDoneState, type Analysis } from "@/lib/habits/progress";
import type { Habit, Routine } from "@/lib/habits/types";
import { HabitCheck } from "./habit-check";
import { HabitBadge, IconAuto, IconFlame, IconSkip } from "./habit-icons";

const REVEAL = 92;

/** Swipe a row left to reveal one action (Skip); a long swipe does it straight away. */
export function SwipeAction({
  children,
  label,
  onAction,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; locked: "h" | "v" | null } | null>(null);
  const width = useRef(0);
  const moved = useRef(false);
  if (disabled) return <>{children}</>;
  return (
    <div className="relative overflow-hidden">
      <button
        onClick={() => {
          setX(0);
          onAction();
        }}
        className="bg-surface-2 absolute inset-y-0 right-0 flex w-[92px] items-center justify-center gap-1.5 text-sm font-semibold"
        tabIndex={x === 0 ? -1 : 0}
      >
        <IconSkip width={16} height={16} /> {label}
      </button>
      <div
        className={cx(
          "bg-surface relative touch-pan-y",
          !dragging && "transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1)]",
        )}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          width.current = e.currentTarget.offsetWidth;
          start.current = { x: e.clientX, y: e.clientY, base: x, locked: null };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
            if (s.locked === "h") {
              setDragging(true);
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }
          if (s.locked !== "h") return;
          moved.current = true;
          setX(Math.min(0, Math.max(-width.current, s.base + dx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          if (!s || s.locked !== "h") return;
          if (x < -width.current * 0.55) {
            setX(0);
            onAction();
          } else setX(x < -REVEAL / 2 ? -REVEAL : 0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setX(0);
        }}
        onClickCapture={(e) => {
          if (moved.current || x !== 0) {
            e.stopPropagation();
            e.preventDefault();
            moved.current = false;
            if (x !== 0) setX(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The small line under a habit's name. */
export function habitSubtitle(h: Habit, a: Analysis | undefined, date: string): string {
  const info = a?.byDate.get(date);
  const parts: string[] = [];
  if (info?.state === "skipped") return "Skipped · doesn't count as a miss";
  if (info?.state === "paused") return "Paused for vacation";
  if (info?.auto) parts.push("Done from your nutrition log");
  else if (h.auto_source) parts.push(`Auto · ${AUTO_LABELS[h.auto_source].label}`);
  if (h.target > 1) parts.push(`${info?.count ?? 0}/${h.target}${h.unit ? ` ${h.unit}` : ""}`);
  if (h.schedule === "per_week" && a?.week) parts.push(`${a.week.done}/${a.week.quota} this week`);
  const ch = challengeDay(h, date);
  if (ch) parts.push(`Day ${ch.day} of ${ch.total}`);
  return parts.join(" · ");
}

function StreakTag({ a }: { a: Analysis | undefined }) {
  if (!a || a.streak < 2) return null;
  return (
    <span className="text-muted flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums">
      <IconFlame width={13} height={13} style={{ color: "var(--fat)" }} />
      {a.streak}
      {a.streakUnit === "weeks" ? "w" : ""}
    </span>
  );
}

/** One habit on the checklist: tick ring, name and progress. Tap the text for more. */
export function HabitRow({
  habit,
  a,
  date,
  onTick,
  onOpen,
  onSkip,
  highlight,
  tag,
  readOnly,
}: {
  habit: Habit;
  a: Analysis | undefined;
  date: string;
  onTick: () => void;
  onOpen: () => void;
  onSkip: () => void;
  highlight?: boolean;
  tag?: ReactNode;
  readOnly?: boolean;
}) {
  const info = a?.byDate.get(date);
  const done = isDoneState(info?.state);
  const sub = habitSubtitle(habit, a, date);
  const skipped = info?.state === "skipped";
  return (
    <SwipeAction label={skipped ? "Unskip" : "Skip"} onAction={onSkip} disabled={readOnly || info?.state === "paused" || done}>
      <div className="flex min-h-16 items-center gap-3 px-3 py-2.5">
        <span
          className={cx("rounded-full", highlight && "next-glow")}
          style={{ ["--glow" as string]: `color-mix(in srgb, ${habitColor(habit.color)} 45%, transparent)` }}
        >
          <HabitCheck habit={habit} info={info} onClick={onTick} disabled={readOnly || info?.state === "paused"} />
        </span>
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className={cx("flex items-center gap-1.5 text-[17px] leading-tight", done && "text-muted", skipped && "text-muted")}>
              <span className="truncate">{habit.name}</span>
              {habit.auto_source && <IconAuto width={13} height={13} className="text-muted shrink-0" aria-label="Auto" />}
            </span>
            {(tag || sub) && (
              <span className="text-muted mt-0.5 flex items-center gap-1.5 truncate text-[13px]">
                {tag}
                {sub}
              </span>
            )}
          </span>
          <StreakTag a={a} />
        </button>
      </div>
    </SwipeAction>
  );
}

/** A habit to break: shown as days since the last slip. */
export function BreakRow({ habit, a, date, onOpen }: { habit: Habit; a: Analysis | undefined; date: string; onOpen: () => void }) {
  const color = habitColor(habit.color);
  const state = a?.byDate.get(date)?.state;
  const paused = state === "paused";
  return (
    <button onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left active:bg-white/5">
      <HabitBadge icon={habit.icon} color={habit.color} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] leading-tight">{habit.name}</span>
        <span className="text-muted mt-0.5 block truncate text-[13px]">
          {paused
            ? "Paused for vacation"
            : state === "slip"
              ? "Slipped today. Tomorrow's a fresh start"
              : a && a.best > a.streak
                ? `Best ${a.best} days`
                : "Habit to break"}
        </span>
      </span>
      <span className="text-right">
        <span className="tabular block text-[26px] leading-none font-semibold" style={{ color }}>
          {a?.streak ?? 0}
        </span>
        <span className="text-muted text-[11px] font-semibold tracking-wide uppercase">{a?.streak === 1 ? "day" : "days"} since</span>
      </span>
    </button>
  );
}

/**
 * A routine: its habits as a chain joined by a line that fills as you go. The next step to do is highlighted.
 */
export function RoutineCard({
  routine,
  steps,
  analyses,
  date,
  focusId,
  onTick,
  onOpen,
  onSkip,
  readOnly,
}: {
  routine: Routine;
  steps: Habit[];
  analyses: Map<string, Analysis>;
  date: string;
  focusId: string | null;
  onTick: (h: Habit) => void;
  onOpen: (h: Habit) => void;
  onSkip: (h: Habit) => void;
  readOnly?: boolean;
}) {
  const state = (h: Habit) => analyses.get(h.id)?.byDate.get(date)?.state;
  const doneCount = steps.filter((h) => isDoneState(state(h)) || state(h) === "skipped").length;
  const complete = doneCount === steps.length;
  const next = steps.find((h) => !isDoneState(state(h)) && state(h) !== "skipped" && state(h) !== "paused");
  return (
    <div className="bg-surface overflow-hidden rounded-3xl">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{routine.name}</span>
        <span className={cx("tabular text-[13px] font-semibold", complete ? "text-accent" : "text-muted")}>
          {steps.every((h) => state(h) === "paused") ? "Paused" : complete ? "Complete" : `${doneCount} of ${steps.length}`}
        </span>
      </div>
      <div className="bg-surface-2 mx-4 h-1 overflow-hidden rounded-full">
        <div
          className="bg-accent h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${(doneCount / Math.max(1, steps.length)) * 100}%` }}
        />
      </div>
      <ol className="py-1">
        {steps.map((h, i) => {
          const done = isDoneState(state(h)) || state(h) === "skipped";
          const isNext = next?.id === h.id && doneCount > 0;
          return (
            <li key={h.id} id={`habit-${h.id}`} className="relative">
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="bg-surface-2 absolute top-[calc(50%+24px)] left-[33.5px] z-10 h-[calc(100%-48px)] w-[3px] rounded-full"
                >
                  <span
                    className="block h-full origin-top rounded-full transition-transform duration-500 ease-out"
                    style={{ background: habitColor(h.color), transform: `scaleY(${done ? 1 : 0})` }}
                  />
                </span>
              )}
              <HabitRow
                habit={h}
                a={analyses.get(h.id)}
                date={date}
                onTick={() => onTick(h)}
                onOpen={() => onOpen(h)}
                onSkip={() => onSkip(h)}
                highlight={focusId === h.id}
                readOnly={readOnly}
                tag={
                  isNext ? (
                    <span className="bg-accent-soft text-accent rounded-full px-1.5 py-px text-[11px] font-semibold">Up next</span>
                  ) : undefined
                }
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
