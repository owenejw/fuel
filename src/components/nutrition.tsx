"use client";

import { useState } from "react";
import { formatEnergy, toUnit, unitLabel, type EnergyUnit } from "@/lib/energy";
import { NUTRIENTS, formatAmount, type NutrientKey, type NutrientTotals, type Nutrients } from "@/lib/nutrients";
import type { DayTargets } from "@/lib/types";
import { IconCarbs, IconEnergy, IconFat, IconFibre, IconProtein, type Icon } from "./icons";
import { cx } from "./ui";

const MACROS: { key: "protein_g" | "carbs_g" | "fat_g" | "fibre_g"; label: string; color: string; stroke: string; Icon: Icon }[] = [
  { key: "protein_g", label: "Protein", color: "bg-protein", stroke: "var(--protein)", Icon: IconProtein },
  { key: "carbs_g", label: "Carbs", color: "bg-carbs", stroke: "var(--carbs)", Icon: IconCarbs },
  { key: "fat_g", label: "Fat", color: "bg-fat", stroke: "var(--fat)", Icon: IconFat },
  { key: "fibre_g", label: "Fibre", color: "bg-fibre", stroke: "var(--fibre)", Icon: IconFibre },
];

export function Bar({ value, target, color }: { value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target * 1.05;
  return (
    <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
      <div className={cx("h-full rounded-full transition-[width]", over ? "bg-danger" : color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Circular progress ring. */
export function Ring({
  value,
  target,
  size,
  stroke = 10,
  color = "var(--accent)",
  children,
}: {
  value: number;
  target: number;
  size: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const over = target > 0 && value > target * 1.05;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? "var(--danger)" : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** Marker shown next to totals that are missing data from some items. */
export function IncompleteMark({ missing }: { missing: number }) {
  if (!missing) return null;
  return (
    <span className="text-warn ml-0.5" title={`${missing} item${missing === 1 ? "" : "s"} with no data`} aria-label="incomplete">
      *
    </span>
  );
}

/** Energy left as a big ring, with macros beside it. `badge` sits in the top-right corner. */
export function DaySummary({
  totals,
  targets,
  unit,
  badge,
}: {
  totals: NutrientTotals;
  targets: DayTargets;
  unit: EnergyUnit;
  badge?: React.ReactNode;
}) {
  const eaten = totals.totals.energy_kj ?? 0;
  const remaining = targets.energy_kj - eaten;
  const incompleteKeys = (["energy_kj", "protein_g", "carbs_g", "fat_g", "fibre_g"] as NutrientKey[]).filter((k) => totals.missing[k] > 0);

  return (
    <div className="border-border bg-surface rounded-3xl border p-4">
      <div className="flex items-center gap-4">
        <Ring value={eaten} target={targets.energy_kj} size={136} stroke={12}>
          <IconEnergy width={16} height={16} className={remaining < 0 ? "text-danger" : "text-accent"} />
          <div className={cx("tabular text-[26px] leading-tight font-semibold tracking-tight", remaining < 0 && "text-danger")}>
            {Math.round(Math.abs(toUnit(remaining, unit))).toLocaleString("en-AU")}
            <IncompleteMark missing={totals.missing.energy_kj} />
          </div>
          <div className="text-muted text-xs">
            {unitLabel(unit)} {remaining >= 0 ? "left" : "over"}
          </div>
        </Ring>
        <div className="min-w-0 flex-1 space-y-2.5">
          {MACROS.map((m) => {
            const v = totals.totals[m.key] ?? 0;
            const t = targets[m.key];
            const left = Math.round(t - v);
            return (
              <div key={m.key}>
                <div className="flex items-center gap-1.5 text-xs">
                  <m.Icon width={13} height={13} style={{ color: m.stroke }} />
                  <span className="flex-1">{m.label}</span>
                  <span className={cx("tabular font-semibold", left < 0 && "text-danger")}>
                    {left >= 0 ? `${left} g left` : `${-left} g over`}
                    <IncompleteMark missing={totals.missing[m.key]} />
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={v} target={t} color={m.color} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-muted mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="tabular">
          Eaten {formatEnergy(eaten, unit, { label: false })} of {formatEnergy(targets.energy_kj, unit)}
        </span>
        {badge}
      </div>
      {incompleteKeys.length > 0 && (
        <p className="text-muted mt-2 text-xs">
          <span className="text-warn">*</span> Some foods have no data for{" "}
          {incompleteKeys.map((k) => NUTRIENTS.find((n) => n.key === k)!.label.toLowerCase()).join(", ")}.
        </p>
      )}
    </div>
  );
}

/** Compact "kJ · P · C · F" line for a food or entry. Unknown values read "no data". */
export function MacroLine({ n, unit, className }: { n: Nutrients; unit: EnergyUnit; className?: string }) {
  const g = (k: NutrientKey) => (n[k] == null ? "–" : `${Math.round(n[k]!)}`);
  return (
    <span className={cx("tabular text-muted text-xs", className)}>
      {n.energy_kj == null ? "no energy data" : formatEnergy(n.energy_kj, unit)} · P {g("protein_g")} · C {g("carbs_g")} · F {g("fat_g")}
    </span>
  );
}

/** Full nutrient table. Unknown values are shown as "no data", never zero. */
export function NutrientTable({ n, unit, missing }: { n: Nutrients; unit: EnergyUnit; missing?: Partial<Record<NutrientKey, number>> }) {
  const [all, setAll] = useState(false);
  const rows = all ? NUTRIENTS : NUTRIENTS.filter((d) => d.macro || ["sat_fat_g", "sugars_g", "fibre_g", "sodium_mg"].includes(d.key));
  return (
    <div>
      <dl className="divide-border border-border divide-y rounded-xl border">
        {rows.map((d) => (
          <div key={d.key} className="flex justify-between px-3 py-2 text-sm">
            <dt className={cx(!d.macro && "text-muted pl-3")}>{d.label}</dt>
            <dd className={cx("tabular", n[d.key] == null && "text-muted italic")}>
              {d.key === "energy_kj" ? formatEnergy(n.energy_kj, unit) : formatAmount(n[d.key], d.key)}
              {missing && <IncompleteMark missing={missing[d.key] ?? 0} />}
            </dd>
          </div>
        ))}
      </dl>
      <button type="button" className="text-accent mt-2 text-sm" onClick={() => setAll((a) => !a)}>
        {all ? "Show less" : "Show all nutrients"}
      </button>
    </div>
  );
}
