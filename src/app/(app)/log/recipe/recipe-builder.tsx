"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconChevronLeft, IconSearch, IconTrash } from "@/components/icons";
import { MacroLine, NutrientTable } from "@/components/nutrition";
import { Button, Card, Input, PageHeader, Spinner } from "@/components/ui";
import { deleteRecipe, fetchRecipes, saveRecipe, searchFoods } from "@/lib/data";
import { nutrientsFor, SOURCE_LABELS } from "@/lib/foods/shared";
import { scaleNutrients, sumNutrients } from "@/lib/nutrients";
import type { Food, SavedMealItem } from "@/lib/types";

/** Build a recipe from ingredients; nutrition is calculated per serve. */
export function RecipeBuilder() {
  const router = useRouter();
  const params = useSearchParams();
  const { unit } = useApp();
  const editId = params.get("id");
  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [items, setItems] = useState<(SavedMealItem & { per100?: Food["per100"] })[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; foods: Food[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editId) return;
    fetchRecipes().then((all) => {
      const r = all.find((x) => x.id === editId);
      if (!r) return;
      setName(r.name);
      setServings(String(r.servings));
      setItems(r.ingredients.map((i) => ({ ...i, per100: i.grams ? scaleNutrients(i.nutrients, 10000 / i.grams) : undefined })));
    });
  }, [editId]);

  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(
      () =>
        searchFoods(term, ctrl.signal).then(
          (foods) => setFound({ q: term, foods }),
          () => undefined,
        ),
      300,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);

  const total = useMemo(() => sumNutrients(items.map((i) => i.nutrients)), [items]);
  const serves = Math.max(0.5, Number(servings) || 1);
  const perServe = useMemo(() => scaleNutrients(total.totals as Food["per100"], 100 / serves), [total, serves]);

  const add = (f: Food) => {
    const grams = f.serve_size_g ?? 100;
    setItems((all) => [
      ...all,
      {
        kind: f.kind,
        food_id: f.id,
        name: f.brand ? `${f.name} (${f.brand})` : f.name,
        grams,
        nutrients: nutrientsFor(f, grams),
        per100: f.per100,
      },
    ]);
    setQ("");
    setFound(null);
  };

  const setGrams = (i: number, grams: number) =>
    setItems((all) => all.map((it, n) => (n === i && it.per100 ? { ...it, grams, nutrients: scaleNutrients(it.per100, grams) } : it)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const food = await saveRecipe(
        {
          name,
          servings: serves,
          ingredients: items.map((it) => ({ kind: it.kind, food_id: it.food_id, name: it.name, grams: it.grams, nutrients: it.nutrients })),
        },
        editId ?? undefined,
      );
      const back = new URLSearchParams();
      for (const k of ["slot", "date"]) if (params.get(k)) back.set(k, params.get(k)!);
      back.set("food", `recipe:${food.id}`);
      router.replace(`/log?${back}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
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
        title={editId ? "Edit recipe" : "New recipe"}
      />
      <div className="space-y-3 px-4">
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Input label="Recipe name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input
            label="Serves"
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </div>

        <Card>
          <label className="border-border flex h-12 items-center gap-2 border-b px-3">
            <IconSearch width={18} height={18} className="text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Add an ingredient"
              className="h-full flex-1 bg-transparent outline-none"
              type="search"
            />
            {term.length >= 2 && found?.q !== term && <Spinner className="text-muted h-4 w-4" />}
          </label>
          {term.length >= 2 && found && (
            <ul className="divide-border border-border max-h-64 divide-y overflow-y-auto border-b">
              {found.foods
                .filter((f) => f.kind !== "recipe")
                .map((f) => (
                  <li key={`${f.kind}:${f.id}`}>
                    <button onClick={() => add(f)} className="w-full px-4 py-2 text-left">
                      <div className="truncate text-sm">{f.name}</div>
                      <div className="text-muted text-xs">
                        {SOURCE_LABELS[f.source]} · per 100 g · <MacroLine n={f.per100} unit={unit} />
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {items.length === 0 ? (
            <p className="text-muted px-4 py-6 text-center text-sm">Search above to add ingredients.</p>
          ) : (
            <ul className="divide-border divide-y">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-2 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{it.name}</div>
                    <MacroLine n={it.nutrients} unit={unit} />
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label="Grams"
                    value={it.grams ?? ""}
                    disabled={!it.per100}
                    onChange={(e) => setGrams(i, Number(e.target.value) || 0)}
                    className="tabular border-border bg-surface h-9 w-16 rounded-lg border px-2 text-right text-sm"
                  />
                  <span className="text-muted text-xs">g</span>
                  <button
                    onClick={() => setItems((all) => all.filter((_, n) => n !== i))}
                    className="text-muted rounded-full p-1.5"
                    aria-label="Remove"
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {items.length > 0 && (
          <>
            <h2 className="pt-1 text-sm font-semibold">Per serve (1 of {serves})</h2>
            <NutrientTable n={perServe} unit={unit} missing={total.missing} />
          </>
        )}
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button className="w-full" size="lg" disabled={busy || !name.trim() || !items.length} onClick={save}>
          {busy ? "Saving…" : "Save recipe"}
        </Button>
        {editId && (
          <Button
            variant="secondary"
            className="text-danger w-full"
            onClick={async () => {
              if (!confirm("Delete this recipe? Past log entries keep their values.")) return;
              await deleteRecipe(editId);
              router.replace("/log");
            }}
          >
            Delete recipe
          </Button>
        )}
      </div>
    </>
  );
}
