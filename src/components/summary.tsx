"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { today } from "@/lib/dates";
import type { WeekDay } from "@/lib/hooks";
import { useApp } from "./app-provider";
import { IconChevronRight } from "./icons";
import { METRIC, Rings } from "./rings";
import { cx } from "./ui";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** Mini rings for Monday–Sunday. Tapping a day calls `onPick` (or links to its details). */
export function WeekStrip({ days, selected, href }: { days: WeekDay[] | null; selected: string; href: (date: string) => string }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 7 }, (_, i) => {
        const d = days?.[i];
        const isSel = d?.date === selected;
        const future = d ? d.date > today() : false;
        const body = (
          <>
            <span
              className={cx(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                isSel ? "bg-energy text-white" : "text-muted",
              )}
            >
              {LETTERS[i]}
            </span>
            <span className={cx(future && "opacity-40")}>
              <Rings
                size={38}
                stroke={4.5}
                gap={1}
                rings={[
                  { ...METRIC.energy, value: d?.totals.energy_kj ?? 0, target: d?.targets.energy_kj ?? 1 },
                  { ...METRIC.protein, value: d?.totals.protein_g ?? 0, target: d?.targets.protein_g ?? 1 },
                  { ...METRIC.carbs, value: d?.totals.carbs_g ?? 0, target: d?.targets.carbs_g ?? 1 },
                ]}
              />
            </span>
          </>
        );
        return d && !future ? (
          <Link
            key={i}
            href={href(d.date)}
            className="flex flex-col items-center gap-1.5 rounded-xl py-1 active:bg-white/5"
            aria-label={d.date}
          >
            {body}
          </Link>
        ) : (
          <div key={i} className="flex flex-col items-center gap-1.5 py-1">
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** The round chevron Apple puts on cards that open something. */
export function ChevronBadge() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70" aria-hidden>
      <IconChevronRight width={16} height={16} strokeWidth={2.6} />
    </span>
  );
}

/** A summary card. With `href` the whole card is a link and shows a chevron; without, it's static. */
export function Tile({
  title,
  href,
  children,
  className,
  right,
}: {
  title: ReactNode;
  href?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  const inner = (
    <>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title}</h2>
        {right}
        {href && <ChevronBadge />}
      </div>
      {children}
    </>
  );
  const cls = cx("bg-surface block rounded-3xl p-4", href && "transition active:scale-[0.98] active:brightness-110", className);
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <section className={cls}>{inner}</section>
  );
}

/** "Label" over a big coloured "value/target unit", as on Apple's summary. */
export function BigStat({
  label,
  value,
  target,
  unit,
  color,
  size = "lg",
}: {
  label?: string;
  value: string;
  target?: string;
  unit?: string;
  color: string;
  size?: "md" | "lg" | "xl";
}) {
  return (
    <div>
      {label && <div className="text-[15px] leading-tight">{label}</div>}
      <div
        className={cx(
          "tabular leading-none font-semibold tracking-tight",
          size === "md" && "text-[22px]",
          size === "lg" && "text-[28px]",
          size === "xl" && "text-[40px]",
        )}
        style={{ color }}
      >
        {value}
        {target && <span>/{target}</span>}
        {unit && <span className="ml-0.5 text-[0.62em] font-semibold">{unit}</span>}
      </div>
    </div>
  );
}

/** Round initial in the top corner; opens Settings. */
export function AvatarLink() {
  const { profile } = useApp();
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7d7aff] to-[#5e5ce6] text-lg font-semibold text-white shadow-md active:scale-95"
    >
      {profile.name.trim().slice(0, 1).toUpperCase() || "?"}
    </Link>
  );
}

/** Tiny bar chart: one bar per item, scaled to the largest (or to `max`). */
export function MiniBars({
  values,
  labels,
  color,
  max,
  height = 56,
  highlight,
  target,
}: {
  values: number[];
  labels?: string[];
  color: string;
  max?: number;
  height?: number;
  highlight?: number;
  target?: number;
}) {
  const top = Math.max(max ?? 0, target ?? 0, ...values, 1);
  return (
    <div>
      <div className="relative flex items-end gap-1.5" style={{ height }}>
        {target != null && (
          <div className="absolute inset-x-0 border-t border-dashed border-white/25" style={{ bottom: `${(target / top) * 100}%` }} />
        )}
        {values.map((v, i) => (
          <div key={i} className="flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-[22px] rounded-t-[6px] rounded-b-[3px]"
              style={{
                height: `${Math.max(v > 0 ? 8 : 4, (v / top) * 100)}%`,
                background: v > 0 ? color : "var(--surface-2)",
                opacity: highlight == null || highlight === i ? 1 : 0.55,
              }}
            />
          </div>
        ))}
      </div>
      {labels && (
        <div className="text-muted mt-1 flex gap-1.5 text-[11px]">
          {labels.map((l, i) => (
            <span key={i} className="flex-1 text-center">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
