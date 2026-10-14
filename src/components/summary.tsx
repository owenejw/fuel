"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { today } from "@/lib/dates";
import type { WeekDay } from "@/lib/hooks";
import { toUnit, unitLabel, type EnergyUnit } from "@/lib/energy";
import type { Nutrients } from "@/lib/nutrients";
import type { DayTargets } from "@/lib/types";
import { useApp } from "./app-provider";
import { IconCarbs, IconChevronRight, IconEnergy, IconFat, IconFibre, IconProtein } from "./icons";
import { METRIC, Rings } from "./rings";
import { cx } from "./ui";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** Monday–Sunday day picker: date, plus a dot if anything was logged. */
export function WeekStrip({ days, selected, href }: { days: WeekDay[] | null; selected: string; href: (date: string) => string }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 7 }, (_, i) => {
        const d = days?.[i];
        const isSel = d?.date === selected;
        const future = d ? d.date > today() : true;
        const body = (
          <>
            <span className="text-muted text-[11px] font-semibold">{LETTERS[i]}</span>
            <span
              className={cx(
                "tabular flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-semibold",
                isSel ? "bg-accent text-accent-text" : future ? "text-muted/50" : "bg-surface",
              )}
            >
              {d ? Number(d.date.slice(8)) : ""}
            </span>
            <span className={cx("h-1.5 w-1.5 rounded-full", d?.logged ? "bg-accent" : "bg-transparent")} />
          </>
        );
        return d && !future ? (
          <Link
            key={i}
            href={href(d.date)}
            replace
            className="flex flex-col items-center gap-1 rounded-xl py-1 active:opacity-60"
            aria-label={d.date}
          >
            {body}
          </Link>
        ) : (
          <div key={i} className="flex flex-col items-center gap-1 py-1">
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

/** Emoji on a colour, or the first initial on a gradient. */
export function Avatar({ name, emoji, color, size = 40 }: { name: string; emoji: string | null; color: string | null; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-md"
      style={{
        width: size,
        height: size,
        fontSize: emoji ? size * 0.55 : size * 0.45,
        background: color ?? "linear-gradient(135deg, #7d7aff, #5e5ce6)",
      }}
    >
      {emoji || name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

/** Profile picture in the top corner; opens your account. */
export function AvatarLink() {
  const { profile } = useApp();
  return (
    <Link href="/settings" aria-label="Account" className="shrink-0 rounded-full active:scale-95">
      <Avatar name={profile.name} emoji={profile.avatar_emoji} color={profile.avatar_color} />
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

const BAR_ROWS = [
  { metric: "protein", key: "protein_g", Icon: IconProtein, overOk: true },
  { metric: "carbs", key: "carbs_g", Icon: IconCarbs, overOk: false },
  { metric: "fat", key: "fat_g", Icon: IconFat, overOk: false },
  { metric: "fibre", key: "fibre_g", Icon: IconFibre, overOk: true },
] as const;

/** One kJ ring with the macros as bars beside it: what you're at, and what's left. */
export function EnergyCard({
  totals,
  targets,
  unit,
  footer,
  size = 132,
  onSelect,
}: {
  totals: Nutrients;
  targets: DayTargets;
  unit: EnergyUnit;
  footer?: ReactNode;
  size?: number;
  /** When set, the ring and each row become buttons. */
  onSelect?: (metric: "energy" | "protein" | "carbs" | "fat" | "fibre") => void;
}) {
  const eaten = totals.energy_kj ?? 0;
  const left = targets.energy_kj - eaten;
  return (
    <>
      <div className="flex items-center gap-4">
        <div
          className={cx("relative shrink-0", onSelect && "cursor-pointer transition active:scale-95")}
          onClick={onSelect && (() => onSelect("energy"))}
          role={onSelect ? "button" : undefined}
          aria-label={onSelect ? "Energy details" : undefined}
        >
          <Rings size={size} stroke={13} rings={[{ ...METRIC.energy, value: eaten, target: targets.energy_kj }]} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <IconEnergy width={16} height={16} style={{ color: METRIC.energy.color }} />
            <div className="tabular text-[26px] leading-tight font-bold tracking-tight">
              {Math.round(Math.abs(toUnit(left, unit))).toLocaleString("en-AU")}
            </div>
            <div className="text-muted text-xs">
              {unitLabel(unit)} {left >= 0 ? "left" : "over"}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          {BAR_ROWS.map((r) => {
            const m = METRIC[r.metric];
            const v = totals[r.key] ?? 0;
            const t = targets[r.key];
            const diff = Math.round(t - v);
            const pct = t > 0 ? Math.min(100, (v / t) * 100) : 0;
            const Row = onSelect ? "button" : "div";
            return (
              <Row
                key={r.key}
                {...(onSelect ? { type: "button" as const, onClick: () => onSelect(r.metric) } : {})}
                className={cx("block w-full text-left", onSelect && "-mx-1.5 rounded-xl px-1.5 py-0.5 active:bg-white/5")}
              >
                <div className="flex items-baseline gap-1.5 text-[13px]">
                  <r.Icon width={13} height={13} className="self-center" style={{ color: m.color }} />
                  <span className="flex-1">{m.label}</span>
                  <span className="tabular font-semibold" style={{ color: m.color }}>
                    {Math.round(v)}
                    <span className="text-muted font-normal">/{Math.round(t)} g</span>
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full"
                  style={{ background: `color-mix(in srgb, ${m.color} 18%, transparent)` }}
                >
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: m.color }} />
                </div>
                <div className={cx("tabular mt-0.5 text-right text-[11px]", diff < 0 && !r.overOk ? "text-danger" : "text-muted")}>
                  {diff >= 0 ? `${diff} g left` : `${-diff} g over`}
                </div>
              </Row>
            );
          })}
        </div>
      </div>
      {footer && <div className="text-muted mt-3 flex items-center justify-between gap-2 text-xs">{footer}</div>}
    </>
  );
}
