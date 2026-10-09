"use client";

import { useState } from "react";
import { addWater } from "@/lib/data";
import { Card } from "./ui";

export function WaterCard({ date, ml, target, onChange }: { date: string; ml: number; target: number; onChange: (ml: number) => void }) {
  const [busy, setBusy] = useState(false);
  const pct = Math.min(100, (ml / target) * 100);
  const add = async (amount: number) => {
    setBusy(true);
    try {
      onChange(await addWater(date, amount));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">Water</h2>
        <span className="tabular text-muted text-sm">
          {(ml / 1000).toFixed(2)} / {(target / 1000).toFixed(1)} L
        </span>
      </div>
      <div className="bg-surface-2 mb-3 h-2 overflow-hidden rounded-full">
        <div className="h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-2">
        {[250, 500, 750].map((a) => (
          <button key={a} disabled={busy} onClick={() => add(a)} className="bg-surface-2 h-9 flex-1 rounded-lg text-sm active:scale-[0.98]">
            +{a} ml
          </button>
        ))}
        <button
          disabled={busy || ml <= 0}
          onClick={() => add(-250)}
          className="text-muted h-9 rounded-lg px-3 text-sm"
          aria-label="Remove 250 ml"
        >
          −250
        </button>
      </div>
    </Card>
  );
}
