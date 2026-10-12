"use client";

import { useState } from "react";
import { formatEnergy, type EnergyUnit } from "@/lib/energy";
import { NUTRIENTS, formatAmount, type NutrientKey, type Nutrients } from "@/lib/nutrients";
import { cx } from "./ui";

/** Marker shown next to totals that are missing data from some items. */
export function IncompleteMark({ missing }: { missing: number }) {
  if (!missing) return null;
  return (
    <span className="text-warn ml-0.5" title={`${missing} item${missing === 1 ? "" : "s"} with no data`} aria-label="incomplete">
      *
    </span>
  );
}

/** Compact "kJ · P · C · F" line for a food or entry. Unknown values read "no data". */
export function MacroLine({ n, unit, className }: { n: Nutrients; unit: EnergyUnit; className?: string }) {
  const g = (k: NutrientKey) => (n[k] == null ? "–" : `${Math.round(n[k]!)}`);
  return (
    <span className={cx("tabular text-muted text-xs", className)}>
      <span className="text-energy">{n.energy_kj == null ? "no energy data" : formatEnergy(n.energy_kj, unit)}</span>
      {" · "}
      <span className="text-protein">P {g("protein_g")}</span> · <span className="text-carbs">C {g("carbs_g")}</span> ·{" "}
      <span className="text-fat">F {g("fat_g")}</span>
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
