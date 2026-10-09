"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconChevronLeft, IconTrash } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Card, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { addEntries } from "@/lib/data";
import { isValidDate, today } from "@/lib/dates";
import { formatEnergy, fromUnit, toUnit, unitLabel } from "@/lib/energy";
import { fileToDataUrl } from "@/lib/image";
import { defaultSlot } from "@/lib/slots";
import { MEAL_SLOTS, SLOT_LABELS, type MealSlot } from "@/lib/types";
import { estimatePlate, type PlateEstimate } from "@/server/actions/ai";

type Item = PlateEstimate["items"][number];

/** Photo of a plate → Claude estimates items and grams → user edits → saved as entries. */
export function PhotoLog() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { unit, profile } = useApp();
  const date = isValidDate(params.get("date")) ? params.get("date")! : today();
  const [slot, setSlot] = useState<MealSlot>((params.get("slot") as MealSlot) || defaultSlot());
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function analyse() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      const res = await estimatePlate(photo, note);
      setItems(res.items);
      setNotes(res.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyse the photo");
    } finally {
      setBusy(false);
    }
  }

  /** Changing grams rescales that item's estimate proportionally. */
  const setGrams = (i: number, grams: number) =>
    setItems((all) =>
      all!.map((it, n) => {
        if (n !== i || !it.grams) return it;
        const f = grams / it.grams;
        return {
          ...it,
          grams,
          energy_kj: it.energy_kj * f,
          protein_g: it.protein_g * f,
          carbs_g: it.carbs_g * f,
          fat_g: it.fat_g * f,
          fibre_g: it.fibre_g == null ? null : it.fibre_g * f,
        };
      }),
    );

  async function save() {
    if (!items?.length) return;
    setBusy(true);
    try {
      await addEntries(
        items.map((it) => ({
          date,
          slot,
          kind: "quick" as const,
          name: `${it.name} (photo estimate)`,
          grams: it.grams > 0 ? Math.round(it.grams) : null,
          nutrients: {
            energy_kj: Math.round(it.energy_kj),
            protein_g: Math.round(it.protein_g * 10) / 10,
            carbs_g: Math.round(it.carbs_g * 10) / 10,
            fat_g: Math.round(it.fat_g * 10) / 10,
            ...(it.fibre_g != null ? { fibre_g: Math.round(it.fibre_g * 10) / 10 } : {}),
          },
        })),
      );
      toast(`Logged ${items.length} item${items.length === 1 ? "" : "s"} to ${SLOT_LABELS[slot]}`);
      router.replace(date === today() ? "/" : `/?date=${date}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        left={
          <button onClick={() => router.back()} className="-ml-2 rounded-full p-2" aria-label="Back">
            <IconChevronLeft />
          </button>
        }
        title="Log from a photo"
      />
      <div className="space-y-3 px-4">
        {!profile.ai_enabled && (
          <p className="bg-surface-2 text-muted rounded-xl p-3 text-sm">Turn on AI features in Settings to use photo logging.</p>
        )}
        <label className="border-border bg-surface block cursor-pointer overflow-hidden rounded-2xl border border-dashed text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ? (
            <img src={photo} alt="Your meal" className="max-h-72 w-full object-cover" />
          ) : (
            <div className="text-muted p-10">Tap to take or choose a photo</div>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setItems(null);
                setPhoto(await fileToDataUrl(f));
              }
            }}
          />
        </label>
        {photo && !items && (
          <>
            <Input
              label="Anything Claude should know? (optional)"
              placeholder="e.g. cooked in olive oil, large bowl"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button className="w-full" size="lg" onClick={analyse} disabled={busy || !profile.ai_enabled}>
              {busy ? (
                <>
                  <Spinner /> Estimating…
                </>
              ) : (
                "Estimate this meal"
              )}
            </Button>
          </>
        )}
        {error && <p className="text-danger text-sm">{error}</p>}

        {items && (
          <>
            <Card>
              <ul className="divide-border divide-y">
                {items.map((it, i) => (
                  <li key={i} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <input
                        value={it.name}
                        onChange={(e) => setItems((all) => all!.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))}
                        className="w-full bg-transparent text-sm outline-none"
                      />
                      <div className="tabular text-muted text-xs">
                        {formatEnergy(it.energy_kj, unit)} · P {Math.round(it.protein_g)} · C {Math.round(it.carbs_g)} · F{" "}
                        {Math.round(it.fat_g)}
                      </div>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label="Grams"
                      value={Math.round(it.grams)}
                      onChange={(e) => setGrams(i, Number(e.target.value) || 0)}
                      className="tabular border-border bg-surface h-9 w-16 rounded-lg border px-2 text-right text-sm"
                    />
                    <span className="text-muted text-xs">g</span>
                    <button
                      onClick={() => setItems((all) => all!.filter((_, n) => n !== i))}
                      className="text-muted rounded-full p-1.5"
                      aria-label="Remove item"
                    >
                      <IconTrash width={16} height={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-border flex justify-between border-t px-4 py-2 text-sm font-medium">
                <span>Total</span>
                <span className="tabular">
                  {formatEnergy(
                    items.reduce((s, i) => s + i.energy_kj, 0),
                    unit,
                  )}
                </span>
              </div>
            </Card>
            {notes && <p className="text-muted text-xs">{notes}</p>}
            <QuickEnergyAdjust
              unit={unit}
              onAdd={(kj) =>
                setItems((all) => [
                  ...all!,
                  { name: "Extra (oil, sauce…)", grams: 0, energy_kj: kj, protein_g: 0, carbs_g: 0, fat_g: kj / 37, fibre_g: null },
                ])
              }
            />
            <Select
              label="Meal"
              value={slot}
              onChange={(v) => setSlot(v as MealSlot)}
              options={MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }))}
            />
            <Button className="w-full" size="lg" onClick={save} disabled={busy || !items.length}>
              Log {items.length} item{items.length === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

function QuickEnergyAdjust({ unit, onAdd }: { unit: ReturnType<typeof useApp>["unit"]; onAdd: (kj: number) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number(v) > 0) onAdd(fromUnit(Number(v), unit));
        setV("");
      }}
    >
      <Input
        className="flex-1"
        label={`Add hidden extras (${unitLabel(unit)})`}
        type="number"
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={String(Math.round(toUnit(400, unit)))}
      />
      <Button variant="secondary" type="submit">
        Add
      </Button>
    </form>
  );
}
