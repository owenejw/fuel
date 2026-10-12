"use client";

import { useState } from "react";
import type { EnergyUnit } from "@/lib/energy";
import { scaleNutrients } from "@/lib/nutrients";
import type { LogEntry, MealSlot } from "@/lib/types";
import { IconTrash } from "./icons";
import { NutrientTable } from "./nutrition";
import { SlotChips } from "./slot-chips";
import { Button, Sheet, Stepper } from "./ui";

/** Edit the amount or meal of a logged food, or delete it. */
export function EntrySheet({
  entry,
  unit,
  onClose,
  onUpdate,
  onDelete,
}: {
  entry: LogEntry | null;
  unit: EnergyUnit;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<LogEntry>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Sheet open={!!entry} onClose={onClose} title={entry && <span className="block truncate">{entry.name}</span>}>
      {entry && <EntryForm key={entry.id} entry={entry} unit={unit} onClose={onClose} onUpdate={onUpdate} onDelete={onDelete} />}
    </Sheet>
  );
}

function EntryForm({
  entry,
  unit,
  onClose,
  onUpdate,
  onDelete,
}: {
  entry: LogEntry;
  unit: EnergyUnit;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<LogEntry>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [grams, setGrams] = useState(entry.grams ? String(entry.grams) : "");
  const [slot, setSlot] = useState<MealSlot>(entry.slot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const g = Number(grams);
  const valid = Number.isFinite(g) && g > 0;
  // Rescale the stored snapshot so edits keep "no data" fields unknown.
  const preview = entry.grams && valid ? scaleNutrients(entry.nutrients, (g / entry.grams) * 100) : entry.nutrients;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdate(entry.id, { grams: g, slot, nutrients: preview });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Stepper
        label="Amount"
        unit="g"
        step={10}
        max={10000}
        decimals={1}
        value={grams === "" ? null : Number(grams)}
        onChange={(v) => setGrams(v == null ? "" : String(v))}
      />
      <SlotChips label="Meal" value={slot} onChange={setSlot} />
      <NutrientTable n={preview} unit={unit} />
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="text-danger flex-1"
          onClick={async () => {
            await onDelete(entry.id);
            onClose();
          }}
        >
          <IconTrash width={16} height={16} /> Delete
        </Button>
        <Button className="flex-[2]" onClick={save} disabled={busy || !valid}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
