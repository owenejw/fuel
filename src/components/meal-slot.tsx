"use client";

import Link from "next/link";
import { formatEnergy, type EnergyUnit } from "@/lib/energy";
import type { NutrientTotals } from "@/lib/nutrients";
import { SLOT_LABELS, type LogEntry, type MealSlot } from "@/lib/types";
import { IconMore, IconPlus } from "./icons";
import { IncompleteMark, MacroLine } from "./nutrition";
import { Card } from "./ui";

export function MealSlotCard({
  slot,
  date,
  entries,
  totals,
  unit,
  onEntry,
  onMenu,
}: {
  slot: MealSlot;
  date: string;
  entries: LogEntry[];
  totals: NutrientTotals;
  unit: EnergyUnit;
  onEntry: (e: LogEntry) => void;
  onMenu: () => void;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 py-1 pr-1 pl-4">
        <h2 className="flex-1 font-semibold">{SLOT_LABELS[slot]}</h2>
        {entries.length > 0 && (
          <span className="tabular text-muted text-sm">
            {formatEnergy(totals.totals.energy_kj ?? 0, unit)}
            <IncompleteMark missing={totals.missing.energy_kj} />
          </span>
        )}
        <button onClick={onMenu} className="text-muted rounded-full p-2.5" aria-label={`${SLOT_LABELS[slot]} options`}>
          <IconMore width={20} height={20} />
        </button>
        <Link href={`/log?slot=${slot}&date=${date}`} className="text-accent rounded-full p-2.5" aria-label={`Add to ${SLOT_LABELS[slot]}`}>
          <IconPlus width={22} height={22} />
        </Link>
      </div>
      {entries.length > 0 && (
        <ul className="divide-border border-border divide-y border-t">
          {entries.map((e) => (
            <li key={e.id}>
              <button onClick={() => onEntry(e)} className="active:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{e.name}</div>
                  <MacroLine n={e.nutrients} unit={unit} />
                </div>
                <span className="tabular text-muted shrink-0 text-sm">{e.grams ? `${Math.round(e.grams)} g` : "quick"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
