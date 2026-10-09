"use client";

import { useCallback, useEffect, useState } from "react";
import { aiSuggest, type AiSuggestions } from "@/server/actions/ai";
import { fetchSuggestions } from "@/server/actions/suggest";
import type { Suggestions } from "@/server/suggestions";
import { savedMealToEntries, type NewEntry } from "@/lib/data";
import { formatEnergy, type EnergyUnit } from "@/lib/energy";
import type { Food, MealSlot } from "@/lib/types";
import { IconBolt, IconPlus } from "./icons";
import { MacroLine } from "./nutrition";
import { Button, Card, Spinner } from "./ui";

/** Rule-based suggestions (top 5) plus optional Claude suggestions. */
export function SuggestionsCard({
  date,
  slot,
  unit,
  aiEnabled,
  version,
  onAdd,
  onOpenFood,
}: {
  date: string;
  slot: MealSlot;
  unit: EnergyUnit;
  aiEnabled: boolean;
  /** Bumped when the log changes so suggestions refresh. */
  version: number;
  onAdd: (entries: NewEntry[], label: string) => Promise<void>;
  onOpenFood: (food: Food) => void;
}) {
  const [data, setData] = useState<Suggestions | null>(null);
  const [ai, setAi] = useState<AiSuggestions | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const load = useCallback(() => {
    const now = new Date();
    fetchSuggestions(date, now.getHours() * 60 + now.getMinutes()).then(setData, () => undefined);
  }, [date]);

  useEffect(() => {
    load();
  }, [load, version]);

  if (!data) return null;
  const { items, micro, remaining, window } = data;
  if (!items.length && !micro.length && !aiEnabled) return null;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Suggestions</h2>
        {window && <span className="bg-accent-soft text-accent rounded-full px-2 py-0.5 text-xs">{window.title}</span>}
      </div>
      {remaining.energy_kj <= 0 && <p className="text-muted mb-2 text-sm">You&apos;ve hit today&apos;s energy target.</p>}
      {items.length > 0 ? (
        <ul className="divide-border divide-y">
          {items.map((s) => (
            <li key={s.candidate.key} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  {s.candidate.name}
                  {s.candidate.grams ? <span className="text-muted"> · {Math.round(s.candidate.grams)} g</span> : null}
                </div>
                <div className="text-accent text-xs">{s.reason}</div>
                <div className="tabular text-muted text-[11px]">
                  Then left: {formatEnergy(s.after.energy_kj, unit)} · P {Math.round(s.after.protein_g)} · C {Math.round(s.after.carbs_g)} ·
                  F {Math.round(s.after.fat_g)}
                </div>
              </div>
              <button
                className="bg-accent-soft text-accent shrink-0 rounded-full p-2"
                aria-label={`Add ${s.candidate.name}`}
                onClick={() => {
                  const c = s.candidate;
                  const entries: NewEntry[] =
                    c.kind === "meal" && c.items
                      ? savedMealToEntries({ items: c.items }, date, slot)
                      : [
                          {
                            date,
                            slot,
                            kind: c.kind as NewEntry["kind"],
                            food_id: c.food_id,
                            name: c.name,
                            grams: c.grams,
                            nutrients: c.nutrients,
                          },
                        ];
                  onAdd(entries, c.name).then(load);
                }}
              >
                <IconPlus width={18} height={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted text-sm">Log a few days of food and suggestions from your own favourites will appear here.</p>
      )}

      {micro.length > 0 && (
        <div className="border-border mt-3 border-t pt-3">
          <div className="text-muted mb-1 text-xs font-medium tracking-wide uppercase">Try something new</div>
          {micro.map((m) => (
            <button key={m.food.id} onClick={() => onOpenFood(m.food)} className="block w-full py-1.5 text-left">
              <div className="text-sm">{m.food.name}</div>
              <div className="text-muted text-xs">
                Low on {m.label.toLowerCase()} this week · {Math.round(m.per100 * 10) / 10} {m.unit} per 100 g ·{" "}
                <MacroLine n={m.food.per100} unit={unit} />
              </div>
            </button>
          ))}
        </div>
      )}

      {aiEnabled && (
        <div className="border-border mt-3 border-t pt-3">
          {ai ? (
            <div className="space-y-2">
              <p className="text-sm">{ai.summary}</p>
              {ai.suggestions.map((s, i) => (
                <div key={i}>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-muted text-sm">{s.detail}</div>
                </div>
              ))}
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={aiBusy}
              onClick={async () => {
                setAiBusy(true);
                setAiError(null);
                try {
                  const now = new Date();
                  setAi(await aiSuggest(date, now.getHours() * 60 + now.getMinutes()));
                } catch (err) {
                  setAiError(err instanceof Error ? err.message : "Claude couldn't answer");
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              {aiBusy ? <Spinner className="h-4 w-4" /> : <IconBolt width={16} height={16} />} Ask Claude what to eat
            </Button>
          )}
          {aiError && <p className="text-danger mt-2 text-sm">{aiError}</p>}
        </div>
      )}
    </Card>
  );
}
