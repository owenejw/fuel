"use client";

import { useState } from "react";
import type { WaterBottle } from "@/lib/types";
import { IconClose, IconMinus, IconPlus, IconWater } from "./icons";
import { METRIC } from "./rings";
import { Button, Input, Sheet, Stepper, cx } from "./ui";

const DEFAULTS: WaterBottle[] = [
  { name: "Glass", ml: 250 },
  { name: "Bottle", ml: 600 },
];

const litres = (ml: number) => `${Math.round(ml / 10) / 100}`;

/** Add or remove water, including saved bottles ("I just finished my bottle"). */
export function WaterSheet({
  open,
  onClose,
  ml,
  target,
  bottles,
  onAdd,
  onSaveBottles,
}: {
  open: boolean;
  onClose: () => void;
  ml: number;
  target: number;
  bottles: WaterBottle[];
  onAdd: (ml: number) => void;
  onSaveBottles: (b: WaterBottle[]) => void;
}) {
  const [custom, setCustom] = useState<number | null>(250);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState<number | null>(750);
  const all = [...bottles, ...DEFAULTS.filter((d) => !bottles.some((b) => b.ml === d.ml))];
  const pct = Math.min(100, (ml / target) * 100);

  return (
    <Sheet open={open} onClose={onClose} title="Water">
      <div className="space-y-5">
        <div>
          <div className="tabular text-[40px] leading-none font-bold" style={{ color: METRIC.water.color }}>
            {litres(ml)}
            <span className="text-muted text-xl font-semibold">/{litres(target)} L</span>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full"
            style={{ background: "color-mix(in srgb, var(--water) 18%, transparent)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: METRIC.water.color }}
            />
          </div>
        </div>

        <div>
          <div className="text-muted mb-2 text-sm">Tap what you just drank</div>
          <div className="grid grid-cols-2 gap-2">
            {all.map((b) => (
              <button
                key={`${b.name}:${b.ml}`}
                onClick={() => onAdd(b.ml)}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3 text-left active:scale-[0.97] active:bg-white/[0.12]"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: METRIC.water.color }}
                >
                  <IconWater width={18} height={18} className="text-white" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{b.name}</span>
                  <span className="tabular text-muted block text-xs">+{b.ml} mL</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-muted mb-2 text-sm">Other amount</div>
          <Stepper value={custom} onChange={setCustom} step={50} min={0} max={5000} unit="mL" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              disabled={!custom || ml <= 0}
              onClick={() => custom && onAdd(-Math.min(custom, ml))}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white/10 font-semibold active:scale-95 disabled:opacity-40"
            >
              <IconMinus width={18} height={18} /> Remove
            </button>
            <button
              disabled={!custom}
              onClick={() => custom && onAdd(custom)}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl font-semibold text-white active:scale-95 disabled:opacity-40"
              style={{ background: METRIC.water.color }}
            >
              <IconPlus width={18} height={18} strokeWidth={2.6} /> Add
            </button>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">My bottles</span>
            <button onClick={() => setEditing((e) => !e)} className="text-accent text-sm font-medium">
              {editing ? "Done" : bottles.length ? "Edit" : "Add a bottle"}
            </button>
          </div>
          {!editing && !bottles.length && <p className="text-muted text-sm">Save your usual bottle so you can add it in one tap.</p>}
          {editing && (
            <div className="space-y-3">
              {bottles.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl bg-white/[0.07] px-3 py-2">
                  <span className="flex-1 text-sm">
                    {b.name} <span className="tabular text-muted">· {b.ml} mL</span>
                  </span>
                  <button
                    onClick={() => onSaveBottles(bottles.filter((_, j) => j !== i))}
                    className="text-muted rounded-full p-1"
                    aria-label={`Remove ${b.name}`}
                  >
                    <IconClose width={16} height={16} />
                  </button>
                </div>
              ))}
              {bottles.length < 8 && (
                <div className="grid grid-cols-[1fr_8.5rem] items-end gap-2">
                  <Input label="Name" placeholder="e.g. Gym bottle" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
                  <Stepper label="Size" value={size} onChange={setSize} step={50} min={50} max={5000} unit="mL" />
                </div>
              )}
              {bottles.length < 8 && (
                <Button
                  className={cx("w-full")}
                  disabled={!name.trim() || !size || size < 50}
                  onClick={() => {
                    onSaveBottles([...bottles, { name: name.trim(), ml: Math.round(size!) }]);
                    setName("");
                  }}
                >
                  Save bottle
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
