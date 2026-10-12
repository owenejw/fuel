"use client";

import { useState } from "react";
import type { NewEntry } from "@/lib/data";
import { fromUnit, toUnit, unitLabel, type EnergyUnit } from "@/lib/energy";
import type { Nutrients } from "@/lib/nutrients";
import { SLOT_LABELS, type LogEntry, type MealSlot } from "@/lib/types";
import { friendlyDate } from "@/lib/dates";
import { IconCarbs, IconEnergy, IconFat, IconProtein } from "./icons";
import { SlotChips } from "./slot-chips";
import { Button, Input, Sheet } from "./ui";

const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** Quick add (energy + macros only). Blank macro fields are stored as "no data". */
export function QuickAddSheet({
  open,
  onClose,
  date,
  slot: initialSlot,
  unit,
  entry,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  slot: MealSlot;
  unit: EnergyUnit;
  /** When editing an existing quick-add entry. */
  entry?: LogEntry | null;
  onSave: (e: NewEntry) => Promise<void>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={entry ? "Edit quick add" : "Quick add"}>
      {open && <QuickAddForm key={entry?.id ?? "new"} date={date} initialSlot={initialSlot} unit={unit} entry={entry} onSave={onSave} />}
    </Sheet>
  );
}

function QuickAddForm({
  date,
  initialSlot,
  unit,
  entry,
  onSave,
}: {
  date: string;
  initialSlot: MealSlot;
  unit: EnergyUnit;
  entry?: LogEntry | null;
  onSave: (e: NewEntry) => Promise<void>;
}) {
  const n = entry?.nutrients ?? {};
  const str = (v: number | null | undefined) => (v == null ? "" : String(v));
  const [name, setName] = useState(entry?.name ?? "");
  const [energy, setEnergy] = useState(n.energy_kj == null ? "" : String(Math.round(toUnit(n.energy_kj, unit))));
  const [protein, setProtein] = useState(str(n.protein_g));
  const [carbs, setCarbs] = useState(str(n.carbs_g));
  const [fat, setFat] = useState(str(n.fat_g));
  const [slot, setSlot] = useState<MealSlot>(entry?.slot ?? initialSlot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const kj = num(energy);
    if (kj === null || kj < 0) return setError(`Enter the energy in ${unitLabel(unit)}`);
    const nutrients: Nutrients = { energy_kj: Math.round(fromUnit(kj, unit)) };
    for (const [k, v] of [
      ["protein_g", protein],
      ["carbs_g", carbs],
      ["fat_g", fat],
    ] as const) {
      const n = num(v);
      if (n !== null && n >= 0) nutrients[k] = n;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ date, slot, kind: "quick", name: name.trim() || "Quick add", grams: null, nutrients });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <Input
        label="What was it? (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Coffee and a muffin"
      />
      <label className="border-border bg-surface focus-within:border-accent flex h-16 items-center gap-3 rounded-2xl border px-4">
        <IconEnergy width={22} height={22} className="text-accent shrink-0" />
        <input
          aria-label={`Energy (${unitLabel(unit)})`}
          type="number"
          inputMode="decimal"
          min={0}
          value={energy}
          onChange={(e) => setEnergy(e.target.value)}
          required
          autoFocus
          placeholder="0"
          className="tabular min-w-0 flex-1 bg-transparent text-2xl font-semibold outline-none"
        />
        <span className="text-muted">{unitLabel(unit)}</span>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Protein", protein, setProtein, IconProtein, "var(--protein)"],
            ["Carbs", carbs, setCarbs, IconCarbs, "var(--carbs)"],
            ["Fat", fat, setFat, IconFat, "var(--fat)"],
          ] as const
        ).map(([label, v, setV, I, color]) => (
          <label key={label} className="border-border bg-surface focus-within:border-accent block rounded-xl border px-3 py-2">
            <span className="text-muted flex items-center gap-1 text-xs">
              <I width={13} height={13} style={{ color }} /> {label}
            </span>
            <span className="flex items-baseline gap-1">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={v}
                placeholder="–"
                onChange={(e) => setV(e.target.value)}
                className="tabular w-full min-w-0 bg-transparent text-lg outline-none"
              />
              <span className="text-muted text-sm">g</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-muted text-xs">
        Leave a macro blank if you don&apos;t know it — it&apos;ll show as &quot;no data&quot;, not zero.
      </p>
      <SlotChips label="Meal" value={slot} onChange={setSlot} />
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : entry ? "Save" : `Add to ${SLOT_LABELS[slot]} · ${friendlyDate(date)}`}
      </Button>
    </form>
  );
}
