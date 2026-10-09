"use client";

import { useState } from "react";
import type { NewEntry } from "@/lib/data";
import { fromUnit, toUnit, unitLabel, type EnergyUnit } from "@/lib/energy";
import type { Nutrients } from "@/lib/nutrients";
import { MEAL_SLOTS, SLOT_LABELS, type LogEntry, type MealSlot } from "@/lib/types";
import { Button, Input, Select, Sheet } from "./ui";

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
      <Input label="Description (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Quick add" />
      <Input
        label={`Energy (${unitLabel(unit)})`}
        type="number"
        inputMode="decimal"
        min={0}
        value={energy}
        onChange={(e) => setEnergy(e.target.value)}
        required
        autoFocus
      />
      <div className="grid grid-cols-3 gap-2">
        <Input
          label="Protein g"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
        />
        <Input
          label="Carbs g"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={carbs}
          onChange={(e) => setCarbs(e.target.value)}
        />
        <Input label="Fat g" type="number" inputMode="decimal" min={0} step="any" value={fat} onChange={(e) => setFat(e.target.value)} />
      </div>
      <p className="text-muted text-xs">
        Leave a macro blank if you don&apos;t know it — it&apos;ll show as &quot;no data&quot;, not zero.
      </p>
      <Select
        label="Meal"
        value={slot}
        onChange={(v) => setSlot(v as MealSlot)}
        options={MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }))}
      />
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : entry ? "Save" : "Add"}
      </Button>
    </form>
  );
}
