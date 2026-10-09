"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { FoodSheet } from "@/components/food-sheet";
import { IconBarcode, IconChevronLeft, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { MacroLine } from "@/components/nutrition";
import { Scanner } from "@/components/scanner";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, PageHeader, Sheet, Spinner, cx } from "@/components/ui";
import {
  addEntries,
  deleteSavedMeal,
  fetchCustomFoods,
  fetchFood,
  fetchSavedMeals,
  lookupBarcode,
  savedMealToEntries,
  searchFoods,
  type NewEntry,
} from "@/lib/data";
import { friendlyDate, isValidDate, today } from "@/lib/dates";
import { SOURCE_LABELS } from "@/lib/foods/shared";
import type { FrequentFood } from "@/lib/frequent";
import { useFrequentFoods } from "@/lib/hooks";
import { sumNutrients } from "@/lib/nutrients";
import { defaultSlot } from "@/lib/slots";
import { MEAL_SLOTS, SLOT_LABELS, type Food, type MealSlot, type SavedMeal } from "@/lib/types";

type Tab = "frequent" | "mine" | "meals";

function frequentToFood(f: FrequentFood): Food {
  return {
    kind: f.kind === "custom" ? "custom" : "reference",
    id: f.food_id ?? "",
    source: "history",
    name: f.name,
    brand: null,
    barcode: null,
    serve_size_g: f.lastGrams,
    serve_label: f.lastGrams ? `${Math.round(f.lastGrams)} g (last time)` : null,
    per100: f.per100,
  };
}

export function LogView() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { unit } = useApp();

  const date = isValidDate(params.get("date")) ? params.get("date")! : today();
  const slotParam = params.get("slot") as MealSlot | null;
  const [slot, setSlot] = useState<MealSlot>(slotParam && MEAL_SLOTS.includes(slotParam) ? slotParam : defaultSlot());

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; foods: Food[] } | null>(null);
  const [selected, setSelected] = useState<{ food: Food; grams?: number | null } | null>(null);
  const [tab, setTab] = useState<Tab>("frequent");
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [missingBarcode, setMissingBarcode] = useState<string | null>(null);
  const [slotPicker, setSlotPicker] = useState(false);

  const { foods: frequent, refresh: refreshFrequent } = useFrequentFoods();
  const [customFoods, setCustomFoods] = useState<Food[] | null>(null);
  const [meals, setMeals] = useState<SavedMeal[] | null>(null);

  // Debounced search across custom foods, the reference cache and USDA.
  const q = query.trim();
  const results = q.length >= 2 && found ? found.foods : null;
  const searching = q.length >= 2 && found?.q !== q;
  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchFoods(q, ctrl.signal).then(
        (foods) => setFound({ q, foods }),
        (err) => {
          if (ctrl.signal.aborted) return;
          setFound({ q, foods: [] });
          if (!navigator.onLine) toast("You're offline — search needs a connection");
          else console.error(err);
        },
      );
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, toast]);

  useEffect(() => {
    if (tab === "mine" && customFoods === null) fetchCustomFoods().then(setCustomFoods, () => setCustomFoods([]));
    if (tab === "meals" && meals === null) fetchSavedMeals().then(setMeals, () => setMeals([]));
  }, [tab, customFoods, meals]);

  // Open a food passed in the URL (e.g. after creating a custom food).
  const foodParam = params.get("food");
  useEffect(() => {
    if (!foodParam) return;
    const [kind, id] = foodParam.split(":");
    if ((kind === "custom" || kind === "reference") && id) {
      fetchFood(kind, id).then((f) => f && setSelected({ food: f }));
    }
  }, [foodParam]);

  const logEntries = useCallback(
    async (items: NewEntry[], message: string) => {
      await addEntries(items);
      toast(message, { label: "View", onClick: () => router.push(date === today() ? "/" : `/?date=${date}`) });
      refreshFrequent();
    },
    [toast, router, date, refreshFrequent],
  );

  const onDetected = useCallback(
    async (code: string) => {
      setScanning(false);
      setLookingUp(true);
      try {
        const food = await lookupBarcode(code);
        if (food) setSelected({ food });
        else setMissingBarcode(code);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Lookup failed");
      } finally {
        setLookingUp(false);
      }
    },
    [toast],
  );

  const newFoodHref = (barcode?: string) =>
    `/log/new-food?slot=${slot}&date=${date}${barcode ? `&barcode=${barcode}` : ""}${query && !barcode ? `&name=${encodeURIComponent(query)}` : ""}`;

  return (
    <>
      <PageHeader
        left={
          date !== today() || slotParam ? (
            <button onClick={() => router.back()} className="-ml-2 rounded-full p-2" aria-label="Back">
              <IconChevronLeft />
            </button>
          ) : undefined
        }
        title="Add food"
        right={
          <button onClick={() => setSlotPicker(true)} className="bg-surface-2 rounded-full px-3 py-1.5 text-sm">
            {SLOT_LABELS[slot]}
            {date !== today() && ` · ${friendlyDate(date)}`} ▾
          </button>
        }
      />

      <div className="space-y-3 px-4">
        <Button size="lg" className="w-full" onClick={() => setScanning(true)} disabled={lookingUp}>
          {lookingUp ? <Spinner /> : <IconBarcode />} {lookingUp ? "Looking up…" : "Scan barcode"}
        </Button>

        <label className="border-border bg-surface focus-within:border-accent flex h-12 items-center gap-2 rounded-xl border px-3">
          <IconSearch width={20} height={20} className="text-muted" />
          <input
            type="search"
            placeholder="Search foods"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="placeholder:text-muted/70 h-full flex-1 bg-transparent outline-none"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="search"
          />
          {searching && <Spinner className="text-muted h-4 w-4" />}
        </label>

        {results !== null ? (
          <Card>
            {results.length === 0 && !searching ? (
              <Empty>
                No matches.{" "}
                <Link href={newFoodHref()} className="text-accent">
                  Create a food
                </Link>
              </Empty>
            ) : (
              <ul className="divide-border divide-y">
                {results.map((f) => (
                  <li key={`${f.kind}:${f.id}`}>
                    <FoodRow food={f} unit={unit} onClick={() => setSelected({ food: f })} />
                  </li>
                ))}
                <li>
                  <Link href={newFoodHref()} className="text-accent block px-4 py-3 text-sm">
                    + Create a food
                  </Link>
                </li>
              </ul>
            )}
          </Card>
        ) : (
          <>
            <div className="bg-surface-2 flex rounded-xl p-1">
              {(
                [
                  ["frequent", "Frequent"],
                  ["mine", "My foods"],
                  ["meals", "Saved meals"],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cx("h-9 flex-1 rounded-lg text-sm", tab === t && "bg-surface font-medium shadow-sm")}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "frequent" && (
              <Card>
                {frequent === null ? (
                  <div className="text-muted flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : frequent.filter((f) => f.kind !== "recipe").length === 0 ? (
                  <Empty>Foods you log will show up here for one-tap re-logging.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {frequent
                      .filter((f) => f.kind !== "recipe")
                      .map((f) => (
                        <li key={f.key} className="flex items-center">
                          <button
                            onClick={() => setSelected({ food: frequentToFood(f), grams: f.lastGrams })}
                            className="min-w-0 flex-1 px-4 py-2.5 text-left"
                          >
                            <div className="truncate text-sm">{f.name}</div>
                            <MacroLine n={f.lastNutrients} unit={unit} />
                          </button>
                          <button
                            className="bg-accent-soft text-accent mr-2 flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm"
                            aria-label={`Add ${f.name} to ${SLOT_LABELS[slot]}`}
                            onClick={() =>
                              logEntries(
                                [
                                  {
                                    date,
                                    slot,
                                    kind: f.kind,
                                    food_id: f.food_id,
                                    name: f.name,
                                    grams: f.lastGrams,
                                    nutrients: f.lastNutrients,
                                  },
                                ],
                                `Added ${f.name} to ${SLOT_LABELS[slot]}`,
                              ).catch(() => toast("Could not add"))
                            }
                          >
                            <IconPlus width={16} height={16} />
                            {f.lastGrams ? `${Math.round(f.lastGrams)} g` : ""}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "mine" && (
              <Card>
                <Link href={newFoodHref()} className="border-border text-accent block border-b px-4 py-3 text-sm">
                  + Create a food
                </Link>
                {customFoods === null ? (
                  <div className="text-muted flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : customFoods.length === 0 ? (
                  <Empty>Foods you create are private to you.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {customFoods.map((f) => (
                      <li key={f.id}>
                        <FoodRow food={f} unit={unit} onClick={() => setSelected({ food: f })} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "meals" && (
              <Card>
                {meals === null ? (
                  <div className="text-muted flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : meals.length === 0 ? (
                  <Empty>Save a meal from the ⋯ menu on any meal in Today.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {meals.map((m) => {
                      const t = sumNutrients(m.items.map((i) => i.nutrients));
                      return (
                        <li key={m.id} className="flex items-center">
                          <button
                            className="text-muted ml-1 rounded-full p-2"
                            aria-label={`Delete ${m.name}`}
                            onClick={async () => {
                              if (!confirm(`Delete saved meal "${m.name}"?`)) return;
                              await deleteSavedMeal(m.id);
                              setMeals((all) => all?.filter((x) => x.id !== m.id) ?? null);
                            }}
                          >
                            <IconTrash width={18} height={18} />
                          </button>
                          <div className="min-w-0 flex-1 py-2.5 pr-2">
                            <div className="truncate text-sm">{m.name}</div>
                            <MacroLine n={t.totals} unit={unit} />
                            <div className="text-muted truncate text-xs">{m.items.map((i) => i.name).join(", ")}</div>
                          </div>
                          <button
                            className="bg-accent-soft text-accent mr-2 flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm"
                            aria-label={`Add ${m.name} to ${SLOT_LABELS[slot]}`}
                            onClick={() =>
                              logEntries(savedMealToEntries(m, date, slot), `Added ${m.name} to ${SLOT_LABELS[slot]}`).catch(() =>
                                toast("Could not add"),
                              )
                            }
                          >
                            <IconPlus width={16} height={16} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}
          </>
        )}
      </div>

      {scanning && <Scanner onDetected={onDetected} onClose={() => setScanning(false)} />}

      <FoodSheet
        food={selected?.food ?? null}
        initialGrams={selected?.grams}
        onClose={() => setSelected(null)}
        date={date}
        slot={slot}
        unit={unit}
        onAdd={async (entry) => {
          await logEntries([entry], `Added to ${SLOT_LABELS[entry.slot]}`);
          setSlot(entry.slot);
          setSelected(null);
        }}
      />

      <Sheet open={!!missingBarcode} onClose={() => setMissingBarcode(null)} title="Product not found">
        <p className="text-muted mb-4 text-sm">
          Barcode <span className="tabular text-text">{missingBarcode}</span> isn&apos;t in Open Food Facts or USDA. Create it from the
          nutrition panel — it&apos;ll be saved privately to your foods.
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setMissingBarcode(null);
              setScanning(true);
            }}
          >
            Scan again
          </Button>
          <Button className="flex-[2]" onClick={() => router.push(newFoodHref(missingBarcode!))}>
            Create food
          </Button>
        </div>
      </Sheet>

      <Sheet open={slotPicker} onClose={() => setSlotPicker(false)} title="Add to">
        <div className="grid grid-cols-2 gap-2">
          {MEAL_SLOTS.map((s) => (
            <Button
              key={s}
              variant={s === slot ? "primary" : "secondary"}
              onClick={() => {
                setSlot(s);
                setSlotPicker(false);
              }}
            >
              {SLOT_LABELS[s]}
            </Button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function FoodRow({ food, unit, onClick }: { food: Food; unit: ReturnType<typeof useApp>["unit"]; onClick: () => void }) {
  return (
    <button onClick={onClick} className="active:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{food.name}</div>
        <div className="text-muted truncate text-xs">
          {[food.brand, SOURCE_LABELS[food.source]].filter(Boolean).join(" · ")} · per 100 g
        </div>
        <MacroLine n={food.per100} unit={unit} />
      </div>
    </button>
  );
}
