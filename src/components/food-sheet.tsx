"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SOURCE_LABELS, nutrientsFor } from "@/lib/foods/shared";
import type { NewEntry } from "@/lib/data";
import type { EnergyUnit } from "@/lib/energy";
import { MEAL_SLOTS, SLOT_LABELS, type Food, type MealSlot } from "@/lib/types";
import { NutrientTable } from "./nutrition";
import { Button, Sheet, cx } from "./ui";

/** Pick an amount (grams or serves) and meal slot for a food, then add it to the log. */
export function FoodSheet({
  food,
  onClose,
  date,
  slot: initialSlot,
  unit,
  initialGrams,
  onAdd,
  submitLabel = "Add",
}: {
  food: Food | null;
  onClose: () => void;
  date: string;
  slot: MealSlot;
  unit: EnergyUnit;
  initialGrams?: number | null;
  onAdd: (entry: NewEntry) => Promise<void>;
  submitLabel?: string;
}) {
  return (
    <Sheet
      open={!!food}
      onClose={onClose}
      title={
        food && (
          <div>
            <div className="truncate">{food.name}</div>
            <div className="text-muted truncate text-xs font-normal">
              {[food.brand, SOURCE_LABELS[food.source], food.serve_label && `serve ${food.serve_label}`].filter(Boolean).join(" · ")}
            </div>
          </div>
        )
      }
    >
      {food && (
        <FoodSheetBody
          key={`${food.kind}:${food.id}:${initialGrams ?? ""}`}
          food={food}
          date={date}
          initialSlot={initialSlot}
          unit={unit}
          initialGrams={initialGrams}
          onAdd={onAdd}
          submitLabel={submitLabel}
        />
      )}
    </Sheet>
  );
}

function FoodSheetBody({
  food,
  date,
  initialSlot,
  unit,
  initialGrams,
  onAdd,
  submitLabel,
}: {
  food: Food;
  date: string;
  initialSlot: MealSlot;
  unit: EnergyUnit;
  initialGrams?: number | null;
  onAdd: (entry: NewEntry) => Promise<void>;
  submitLabel: string;
}) {
  const startServe = !initialGrams && !!food.serve_size_g;
  const [mode, setMode] = useState<"g" | "serve">(startServe ? "serve" : "g");
  const [amount, setAmount] = useState(initialGrams ? String(initialGrams) : startServe ? "1" : "100");
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grams = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return mode === "serve" && food.serve_size_g ? n * food.serve_size_g : n;
  }, [amount, mode, food]);

  const nutrients = useMemo(() => (grams ? nutrientsFor(food, grams) : {}), [food, grams]);

  async function add() {
    if (!grams) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({
        date,
        slot,
        kind: food.kind,
        food_id: food.id,
        name: food.brand ? `${food.name} (${food.brand})` : food.name,
        grams: Math.round(grams * 10) / 10,
        nutrients,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  const chips = mode === "serve" ? ["0.5", "1", "1.5", "2"] : ["50", "100", "150", "200"];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          aria-label="Amount"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="tabular border-border bg-surface focus:border-accent h-12 w-28 rounded-xl border px-3 text-lg outline-none"
        />
        <div className="bg-surface-2 flex flex-1 rounded-xl p-1">
          {(["g", "serve"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={m === "serve" && !food.serve_size_g}
              onClick={() => {
                if (m === mode) return;
                setMode(m);
                if (m === "serve" && food.serve_size_g) setAmount(String(Math.round((grams / food.serve_size_g) * 100) / 100 || 1));
                else setAmount(String(Math.round(grams) || 100));
              }}
              className={cx("flex-1 rounded-lg text-sm disabled:opacity-40", mode === m && "bg-surface shadow-sm")}
            >
              {m === "g" ? "grams" : food.serve_size_g ? `serves (${food.serve_size_g} g)` : "serves"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setAmount(c)}
            className={cx("h-9 flex-1 rounded-lg border text-sm", amount === c ? "border-accent text-accent" : "border-border")}
          >
            {c}
            {mode === "g" ? " g" : "×"}
          </button>
        ))}
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {MEAL_SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            className={cx("h-9 shrink-0 rounded-full px-3 text-sm", slot === s ? "bg-accent text-accent-text" : "bg-surface-2")}
          >
            {SLOT_LABELS[s]}
          </button>
        ))}
      </div>

      <NutrientTable n={nutrients} unit={unit} />
      {food.kind === "recipe" && (
        <Link href={`/log/recipe?id=${food.id}&slot=${slot}&date=${date}`} className="text-accent block text-sm">
          Edit this recipe
        </Link>
      )}
      {food.kind === "custom" && food.source === "custom" && (
        <Link href={`/log/new-food?id=${food.id}&slot=${slot}&date=${date}`} className="text-accent block text-sm">
          Edit this food
        </Link>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}
      <Button className="w-full" size="lg" onClick={add} disabled={busy || !grams}>
        {busy ? "Adding…" : `${submitLabel} ${Math.round(grams)} g to ${SLOT_LABELS[slot]}`}
      </Button>
    </div>
  );
}
