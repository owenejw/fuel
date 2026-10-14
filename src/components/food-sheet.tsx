"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { friendlyDate } from "@/lib/dates";
import { SOURCE_LABELS, nutrientsFor } from "@/lib/foods/shared";
import type { NewEntry } from "@/lib/data";
import type { EnergyUnit } from "@/lib/energy";
import { SLOT_LABELS, type Food, type MealSlot } from "@/lib/types";
import { SlotChips } from "./slot-chips";
import { IconBarcode, IconStar } from "./icons";
import { prettyName } from "@/lib/food-names";
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
  notice,
  favourite,
  onToggleFavourite,
  onAddAndNext,
  nextLabel = "Add & scan another",
}: {
  /** Star state; when given, a ☆ button appears in the title. */
  favourite?: boolean;
  onToggleFavourite?: () => void;
  /** A second button, e.g. after a barcode scan: add, then scan the next product. */
  onAddAndNext?: (entry: NewEntry) => Promise<void>;
  nextLabel?: string;
  /** Shown at the top, e.g. "Saved — not logged yet". */
  notice?: React.ReactNode;
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
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="leading-tight">{prettyName(food.name).title}</div>
              <div className="text-muted mt-0.5 text-xs font-normal">
                {[
                  prettyName(food.name).full !== prettyName(food.name).title && prettyName(food.name).full,
                  food.brand,
                  SOURCE_LABELS[food.source],
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {onToggleFavourite && food.id && (
              <button
                onClick={onToggleFavourite}
                className={cx("-mt-1 rounded-full p-2 transition active:scale-90", favourite ? "text-warn" : "text-white/60")}
                aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={favourite}
              >
                <IconStar width={22} height={22} fill={favourite ? "currentColor" : "none"} />
              </button>
            )}
          </div>
        )
      }
    >
      {food && notice && <div className="bg-accent-soft text-accent mb-4 rounded-xl px-3 py-2.5 text-sm">{notice}</div>}
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
          onAddAndNext={onAddAndNext}
          nextLabel={nextLabel}
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
  onAddAndNext,
  nextLabel,
}: {
  onAddAndNext?: (entry: NewEntry) => Promise<void>;
  nextLabel?: string;
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

  async function add(next = false) {
    if (!grams) return;
    const go = next && onAddAndNext ? onAddAndNext : onAdd;
    setBusy(true);
    setError(null);
    try {
      await go({
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

      <SlotChips value={slot} onChange={setSlot} />

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
      <Button className="w-full" size="lg" onClick={() => add()} disabled={busy || !grams}>
        {busy ? "Adding…" : `${submitLabel} ${Math.round(grams)} g to ${SLOT_LABELS[slot]} · ${friendlyDate(date)}`}
      </Button>
      {onAddAndNext && (
        <Button className="w-full" variant="secondary" onClick={() => add(true)} disabled={busy || !grams}>
          <IconBarcode width={18} height={18} /> {nextLabel}
        </Button>
      )}
    </div>
  );
}
