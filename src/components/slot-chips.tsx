"use client";

import { MEAL_SLOTS, SLOT_LABELS, type MealSlot } from "@/lib/types";
import { SLOT_ICONS } from "./icons";
import { cx } from "./ui";

/** Horizontally scrolling meal picker with icons. */
export function SlotChips({ value, onChange, label }: { value: MealSlot; onChange: (s: MealSlot) => void; label?: string }) {
  return (
    <div>
      {label && <span className="text-muted mb-1 block text-sm">{label}</span>}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={label ?? "Meal"}>
        {MEAL_SLOTS.map((s) => {
          const I = SLOT_ICONS[s];
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={value === s}
              onClick={() => onChange(s)}
              className={cx(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm",
                value === s ? "bg-accent text-accent-text" : "bg-surface-2",
              )}
            >
              <I width={15} height={15} />
              {SLOT_LABELS[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
