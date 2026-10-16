"use client";

import { useEffect, useId, useRef } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Rings } from "../rings";
import { addDays, friendlyDate, parseDate } from "@/lib/dates";
import { WEEKDAY_SHORT, habitColor, habitColor2 } from "@/lib/habits/meta";
import { weekStart, type DayInfo } from "@/lib/habits/progress";

const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--text)" },
  labelStyle: { color: "var(--muted)" },
  cursor: { stroke: "var(--border)" },
};

/** Big strength ring with the percentage inside. */
export function StrengthRing({
  value,
  color,
  size = 132,
  label = "strength",
}: {
  value: number;
  color: string;
  size?: number;
  label?: string;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Rings
        rings={[{ value: Math.round(value * 100), target: 100, color: habitColor(color), color2: habitColor2(color) }]}
        size={size}
        stroke={size * 0.11}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular leading-none font-bold tracking-tight" style={{ fontSize: size * 0.26 }}>
          {Math.round(value * 100)}
          <span className="text-[0.55em]">%</span>
        </span>
        <span className="text-muted mt-0.5 text-[11px] font-semibold tracking-wide uppercase">{label}</span>
      </div>
    </div>
  );
}

const CELL = 12;
const GAP = 3;

/** A year of days for one habit, a column per week (like a contributions grid). Scrolls to today. */
export function YearGrid({ byDate, color, today, start }: { byDate: Map<string, DayInfo>; color: string; today: string; start: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const c = habitColor(color);
  const first = addDays(weekStart(today), -52 * 7);
  const weeks = Array.from({ length: 53 }, (_, w) => addDays(first, w * 7));
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const fill = (d: string): React.CSSProperties => {
    if (d > today || d < start) return { background: "rgba(255,255,255,0.03)" };
    const s = byDate.get(d)?.state;
    switch (s) {
      case "done":
      case "extra":
      case "clean":
        return { background: c };
      case "partial":
        return { background: `color-mix(in srgb, ${c} 45%, transparent)` };
      case "slip":
        return { background: "var(--danger)" };
      case "missed":
        return { background: "var(--surface-2)" };
      case "skipped":
      case "paused":
        return { background: "repeating-linear-gradient(135deg, var(--surface-2) 0 2px, transparent 2px 4px)" };
      default:
        return { background: "rgba(255,255,255,0.06)" };
    }
  };

  return (
    <div>
      <div ref={scroller} className="no-scrollbar overflow-x-auto pb-1">
        <div className="flex" style={{ gap: GAP, width: weeks.length * (CELL + GAP) }}>
          {weeks.map((ws) => {
            const d1 = parseDate(ws);
            const showMonth = d1.getDate() <= 7;
            return (
              <div key={ws} className="flex flex-col" style={{ gap: GAP }}>
                <span className="text-muted h-3 text-[9px] leading-3 whitespace-nowrap">
                  {showMonth ? d1.toLocaleDateString("en-AU", { month: "short" }) : ""}
                </span>
                {Array.from({ length: 7 }, (_, i) => {
                  const d = addDays(ws, i);
                  return (
                    <span key={d} title={friendlyDate(d)} className="rounded-[3px]" style={{ width: CELL, height: CELL, ...fill(d) }} />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-muted mt-2 flex items-center gap-3 text-[11px]">
        <Legend style={{ background: c }} label="Done" />
        <Legend style={{ background: "var(--surface-2)" }} label="Missed" />
        <Legend
          style={{ background: "repeating-linear-gradient(135deg, var(--surface-2) 0 2px, transparent 2px 4px)" }}
          label="Skipped or away"
        />
      </div>
    </div>
  );
}

function Legend({ style, label }: { style: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={style} />
      {label}
    </span>
  );
}

/** Strength over time, 0–100 %. */
export function StrengthChart({
  series,
  color,
  height = 180,
}: {
  series: { date: string; value: number }[];
  color: string;
  height?: number;
}) {
  const id = "s" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const c = habitColor(color);
  const step = Math.max(1, Math.floor(series.length / 120));
  const rows = series
    .filter((_, i) => i % step === 0 || i === series.length - 1)
    .map((p) => ({
      date: p.date,
      value: Math.round(p.value * 100),
      label: parseDate(p.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    }));
  if (rows.length < 2) return <p className="text-muted py-6 text-center text-sm">Your strength trend appears after a couple of days.</p>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.45} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} minTickGap={32} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            width={40}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(v) => [`${v}%`, "Strength"]}
            labelFormatter={(_, p) => (p?.[0]?.payload ? friendlyDate(p[0].payload.date) : "")}
          />
          <Area dataKey="value" stroke={c} strokeWidth={2.5} fill={`url(#${id})`} type="monotone" isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Completion rate per weekday, Monday first. A dimmed bar is a weak day. */
export function WeekdayBars({ rates, color, weak = [] }: { rates: (number | null)[]; color: string; weak?: number[] }) {
  const c = habitColor(color);
  return (
    <div className="flex h-28 items-end gap-2">
      {rates.map((r, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-muted tabular text-[10px]">{r == null ? "–" : `${Math.round(r * 100)}`}</span>
          <div className="bg-surface-2 relative h-16 w-full overflow-hidden rounded-lg">
            <div
              className="absolute inset-x-0 bottom-0 rounded-lg transition-[height] duration-700 ease-out"
              style={{ height: `${(r ?? 0) * 100}%`, background: weak.includes(i) ? `color-mix(in srgb, ${c} 45%, transparent)` : c }}
            />
          </div>
          <span className="text-muted text-[11px] font-semibold">{WEEKDAY_SHORT[i]}</span>
        </div>
      ))}
    </div>
  );
}
