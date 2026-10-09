"use client";

import { useState } from "react";
import { formatEnergy, toUnit, unitLabel, type EnergyUnit } from "@/lib/energy";
import { NUTRIENTS, formatAmount, type NutrientKey, type NutrientTotals, type Nutrients } from "@/lib/nutrients";
import type { DayTargets } from "@/lib/types";
import { cx } from "./ui";

const MACROS: { key: "protein_g" | "carbs_g" | "fat_g" | "fibre_g"; label: string; color: string }[] = [
  { key: "protein_g", label: "Protein", color: "bg-protein" },
  { key: "carbs_g", label: "Carbs", color: "bg-carbs" },
  { key: "fat_g", label: "Fat", color: "bg-fat" },
  { key: "fibre_g", label: "Fibre", color: "bg-fibre" },
];

function Bar({ value, target, color }: { value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target * 1.05;
  return (
    <div className="bg-surface-2 h-2 overflow-hidden rounded-full">
      <div className={cx("h-full rounded-full transition-[width]", over ? "bg-danger" : color)} style={{ width: `${pct}%` }} />
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

/** Remaining energy and macros for the day, at the top of Today. */
export function DaySummary({
  totals,
  targets,
  unit,
  training,
}: {
  totals: NutrientTotals;
  targets: DayTargets;
  unit: EnergyUnit;
  training?: boolean;
}) {
  const eaten = totals.totals.energy_kj ?? 0;
  const remaining = targets.energy_kj - eaten;
  const incompleteKeys = (["energy_kj", "protein_g", "carbs_g", "fat_g", "fibre_g"] as NutrientKey[]).filter((k) => totals.missing[k] > 0);

  return (
    <div className="border-border bg-surface rounded-2xl border p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-muted text-sm">{remaining >= 0 ? "Remaining" : "Over by"}</div>
          <div className={cx("tabular text-4xl font-semibold tracking-tight", remaining < 0 && "text-danger")}>
            {Math.round(Math.abs(toUnit(remaining, unit))).toLocaleString("en-AU")}
            <span className="text-muted ml-1 text-lg font-normal">{unitLabel(unit)}</span>
            <IncompleteMark missing={totals.missing.energy_kj} />
          </div>
        </div>
        <div className="text-muted text-right text-sm">
          {training !== undefined && (
            <div
              className={cx("mb-1 inline-block rounded-full px-2 py-0.5 text-xs", training ? "bg-accent-soft text-accent" : "bg-surface-2")}
            >
              {training ? "Training day" : "Rest day"}
            </div>
          )}
          <div className="tabular">
            {formatEnergy(eaten, unit, { label: false })} / {formatEnergy(targets.energy_kj, unit)}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Bar value={eaten} target={targets.energy_kj} color="bg-accent" />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3">
        {MACROS.map((m) => {
          const v = totals.totals[m.key] ?? 0;
          const t = targets[m.key];
          const left = Math.round(t - v);
          return (
            <div key={m.key}>
              <div className="text-muted text-xs">{m.label}</div>
              <div className="tabular text-sm font-semibold">
                {left >= 0 ? `${left}g` : `+${-left}g`}
                <IncompleteMark missing={totals.missing[m.key]} />
              </div>
              <div className="mt-1">
                <Bar value={v} target={t} color={m.color} />
              </div>
              <div className="tabular text-muted mt-0.5 text-[11px]">
                {Math.round(v)}/{Math.round(t)}
              </div>
            </div>
          );
        })}
      </div>
      {incompleteKeys.length > 0 && (
        <p className="text-muted mt-3 text-xs">
          <span className="text-warn">*</span> Incomplete: some foods have no data for{" "}
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
