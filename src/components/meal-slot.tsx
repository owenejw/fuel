"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatEnergy, type EnergyUnit } from "@/lib/energy";
import type { NutrientTotals } from "@/lib/nutrients";
import { SLOT_LABELS, type LogEntry, type MealSlot } from "@/lib/types";
import { IconMore, IconPlus, IconTrash, SLOT_ICONS } from "./icons";
import { IncompleteMark, MacroLine } from "./nutrition";
import { Card, cx } from "./ui";

export function MealSlotCard({
  slot,
  date,
  entries,
  totals,
  unit,
  onEntry,
  onDelete,
  onMenu,
}: {
  slot: MealSlot;
  date: string;
  entries: LogEntry[];
  totals: NutrientTotals;
  unit: EnergyUnit;
  onEntry: (e: LogEntry) => void;
  onDelete: (e: LogEntry) => void;
  onMenu: () => void;
}) {
  const Icon = SLOT_ICONS[slot];
  const addHref = `/log?slot=${slot}&date=${date}`;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 py-1.5 pr-1 pl-3">
        <span className="bg-surface-2 text-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <Icon width={18} height={18} />
        </span>
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
      </div>
      {entries.length > 0 && (
        <ul className="divide-border border-border divide-y border-t">
          {entries.map((e) => (
            <li key={e.id}>
              <SwipeToDelete onDelete={() => onDelete(e)} label={`Delete ${e.name}`}>
                <button onClick={() => onEntry(e)} className="active:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{e.name}</div>
                    <MacroLine n={e.nutrients} unit={unit} />
                  </div>
                  <span className="tabular text-muted shrink-0 text-sm">{e.grams ? `${Math.round(e.grams)} g` : "quick"}</span>
                </button>
              </SwipeToDelete>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={addHref}
        className={cx(
          "text-accent active:bg-surface-2 flex items-center gap-2 px-4 py-2.5 text-sm font-medium",
          entries.length > 0 && "border-border border-t",
        )}
      >
        <IconPlus width={16} height={16} />
        Add {entries.length > 0 ? "more" : `to ${SLOT_LABELS[slot].toLowerCase()}`}
      </Link>
    </Card>
  );
}

const REVEAL = 88;

/** Swipe a row left to reveal Delete; a long swipe deletes straight away. */
export function SwipeToDelete({ children, onDelete, label }: { children: React.ReactNode; onDelete: () => void; label: string }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; locked: "h" | "v" | null } | null>(null);
  const width = useRef(0);
  const moved = useRef(false);

  return (
    <div className="relative overflow-hidden">
      <button
        onClick={() => {
          setX(0);
          onDelete();
        }}
        className="bg-danger absolute inset-y-0 right-0 flex items-center gap-1.5 px-5 text-sm font-medium text-white"
        aria-label={label}
        tabIndex={x === 0 ? -1 : 0}
      >
        <IconTrash width={16} height={16} /> Delete
      </button>
      <div
        className={cx("bg-surface relative touch-pan-y", !dragging && "transition-transform duration-200")}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          width.current = e.currentTarget.offsetWidth;
          start.current = { x: e.clientX, y: e.clientY, base: x, locked: null };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
            if (s.locked === "h") {
              setDragging(true);
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }
          if (s.locked !== "h") return;
          moved.current = true;
          setX(Math.min(0, Math.max(-width.current, s.base + dx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          if (!s || s.locked !== "h") return;
          if (x < -width.current * 0.6) {
            setX(0);
            onDelete();
          } else setX(x < -REVEAL / 2 ? -REVEAL : 0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setX(0);
        }}
        onClickCapture={(e) => {
          // A swipe shouldn't also open the entry; a tap on an open row closes it.
          if (moved.current || x !== 0) {
            e.stopPropagation();
            e.preventDefault();
            moved.current = false;
            if (x !== 0) setX(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
