"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { FoodSheet } from "@/components/food-sheet";
import {
  IconBarcode,
  IconBolt,
  IconBook,
  IconCamera,
  IconCheck,
  IconChef,
  IconChevronDown,
  IconChevronLeft,
  IconClock,
  IconEdit,
  IconMic,
  IconMeal,
  IconPlus,
  IconSearch,
  IconTrash,
  SLOT_ICONS,
  type Icon,
} from "@/components/icons";
import { QuickAddSheet } from "@/components/quick-add-sheet";
import { MacroLine } from "@/components/nutrition";
import { Scanner } from "@/components/scanner";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, PageHeader, Sheet, Spinner, cx } from "@/components/ui";
import {
  addEntries,
  deleteEntries,
  deleteSavedMeal,
  fetchCustomFoods,
  fetchFood,
  fetchRecipes,
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
import { scaleNutrients, sumNutrients } from "@/lib/nutrients";
import { defaultSlot } from "@/lib/slots";
import { MEAL_SLOTS, SLOT_LABELS, type Food, type MealSlot, type Recipe, type SavedMeal } from "@/lib/types";

type Tab = "frequent" | "mine" | "recipes" | "meals";
type Filter = "all" | "household" | "afcd" | "branded";

const TABS: [Tab, string, Icon][] = [
  ["frequent", "Recent", IconClock],
  ["mine", "Our foods", IconBook],
  ["recipes", "Recipes", IconChef],
  ["meals", "Meals", IconMeal],
];

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["household", "Our foods"],
  ["afcd", "Australian"],
  ["branded", "Branded"],
];

function matchesFilter(f: Food, filter: Filter) {
  if (filter === "household") return f.kind === "custom" || f.kind === "recipe";
  if (filter === "afcd") return f.source === "afcd";
  if (filter === "branded") return !!f.brand || f.source === "off" || f.source === "usda";
  return true;
}

function frequentToFood(f: FrequentFood): Food {
  return {
    kind: f.kind === "custom" ? "custom" : f.kind === "recipe" ? "recipe" : "reference",
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
  const [tab, setTab] = useState<Tab>(params.get("tab") === "mine" ? "mine" : "frequent");
  const [filter, setFilter] = useState<Filter>("all");
  const [quickOpen, setQuickOpen] = useState(false);
  const justSaved = params.get("saved") === "1";
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [missingBarcode, setMissingBarcode] = useState<string | null>(null);
  const [slotPicker, setSlotPicker] = useState(false);

  const { foods: frequent, refresh: refreshFrequent } = useFrequentFoods();
  const [customFoods, setCustomFoods] = useState<Food[] | null>(null);
  const [meals, setMeals] = useState<SavedMeal[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);

  // Debounced search across custom foods, the reference cache and USDA.
  const q = query.trim();
  const allResults = q.length >= 2 && found ? found.foods : null;
  const results = allResults && allResults.filter((f) => matchesFilter(f, filter));
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
    if (tab === "recipes" && recipes === null) fetchRecipes().then(setRecipes, () => setRecipes([]));
    if (tab === "meals" && meals === null) fetchSavedMeals().then(setMeals, () => setMeals([]));
  }, [tab, customFoods, meals, recipes]);

  // Confirm a food that was saved without logging it.
  const savedOnly = params.get("savedOnly");
  useEffect(() => {
    if (savedOnly) toast(`Saved ${savedOnly} to our foods (not logged)`);
  }, [savedOnly, toast]);

  // Open a food passed in the URL (e.g. after creating a custom food).
  const foodParam = params.get("food");
  useEffect(() => {
    if (!foodParam) return;
    const [kind, id] = foodParam.split(":");
    if ((kind === "custom" || kind === "reference" || kind === "recipe") && id) {
      fetchFood(kind, id).then((f) => f && setSelected({ food: f }));
    }
  }, [foodParam]);

  /** Log entries and confirm exactly where they went, with Undo. */
  // Confirms straight away; the save carries on in the background.
  const logEntries = useCallback(
    async (items: NewEntry[], what: string) => {
      const saving = addEntries(items);
      const where = `${SLOT_LABELS[items[0].slot]} · ${friendlyDate(items[0].date)}`;
      toast(`Added ${what} to ${where}`, {
        label: "Undo",
        onClick: () => {
          saving
            .then((added) => deleteEntries(added.map((e) => e.id)))
            .then(
              () => {
                toast("Removed");
                refreshFrequent();
              },
              () => toast("Could not undo"),
            );
        },
      });
      try {
        await saving;
        refreshFrequent();
      } catch {
        toast(`Couldn't add ${what} — check your connection and try again`);
      }
    },
    [toast, refreshFrequent],
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
    [toast, setScanning, setLookingUp, setSelected, setMissingBarcode],
  );

  const SlotIcon = SLOT_ICONS[slot];
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
        title="Log food"
      />

      <div className="space-y-3 px-4">
        <button
          onClick={() => setSlotPicker(true)}
          className="border-accent/40 bg-accent-soft/50 flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left"
        >
          <span className="bg-accent text-accent-text flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <SlotIcon width={20} height={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-muted block text-xs">Adding to</span>
            <span className="block font-semibold">
              {SLOT_LABELS[slot]} · {friendlyDate(date)}
            </span>
          </span>
          <span className="text-accent flex items-center gap-0.5 text-sm font-medium">
            Change <IconChevronDown width={16} height={16} />
          </span>
        </button>

        <div className="grid grid-cols-3 gap-2">
          <ActionTile
            icon={lookingUp ? undefined : IconBarcode}
            label={lookingUp ? "Looking up…" : "Scan"}
            onClick={() => setScanning(true)}
            disabled={lookingUp}
            primary
          />
          <ActionTile icon={IconMic} label="Describe" href={`/log/describe?slot=${slot}&date=${date}`} />
          <ActionTile icon={IconCamera} label="Photo" href={`/log/photo?slot=${slot}&date=${date}`} />
          <ActionTile icon={IconBolt} label="Quick kJ" onClick={() => setQuickOpen(true)} />
          <ActionTile icon={IconEdit} label="New food" href={newFoodHref()} />
        </div>

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

        {results !== null && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
            {FILTERS.map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cx(
                  "h-8 shrink-0 rounded-full border px-3 text-sm",
                  filter === f ? "border-accent bg-accent text-accent-text" : "border-border bg-surface",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {results !== null ? (
          <Card>
            {results.length === 0 && !searching ? (
              <Empty>
                {allResults && allResults.length > 0 ? "Nothing with this filter. " : "No matches. "}
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
                  <Link href={newFoodHref()} className="text-accent flex items-center gap-2 px-4 py-3 text-sm">
                    <IconPlus width={16} height={16} /> Can&apos;t find it? Create a food
                  </Link>
                </li>
              </ul>
            )}
          </Card>
        ) : (
          <>
            <div className="bg-surface-2 flex rounded-xl p-1">
              {TABS.map(([t, label, TabIcon]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cx(
                    "flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-xs",
                    tab === t ? "bg-surface text-text font-medium shadow-sm" : "text-muted",
                  )}
                >
                  <TabIcon width={16} height={16} />
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
                ) : frequent.length === 0 ? (
                  <Empty>Foods you log show up here, so you can add them again with one tap.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {frequent.map((f) => (
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
                              `${f.lastGrams ? `${Math.round(f.lastGrams)} g ` : ""}${f.name}`,
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
                <div className="border-border text-muted flex items-center justify-between gap-2 border-b px-4 py-2.5 text-xs">
                  <span>Shared by everyone in the household</span>
                  <Link href={newFoodHref()} className="text-accent flex items-center gap-1 text-sm font-medium">
                    <IconPlus width={16} height={16} /> New food
                  </Link>
                </div>
                {customFoods === null ? (
                  <div className="text-muted flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : customFoods.length === 0 ? (
                  <Empty>Foods anyone in the household creates appear here for everyone.</Empty>
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

            {tab === "recipes" && (
              <Card>
                <Link
                  href={`/log/recipe?slot=${slot}&date=${date}`}
                  className="border-border text-accent flex items-center gap-2 border-b px-4 py-3 text-sm font-medium"
                >
                  <IconPlus width={16} height={16} /> New recipe
                </Link>
                {recipes === null ? (
                  <div className="text-muted flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : recipes.length === 0 ? (
                  <Empty>Recipes are shared with everyone in the household.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {recipes.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => fetchFood("recipe", r.id).then((f) => f && setSelected({ food: f }))}
                          className="active:bg-surface-2 w-full px-4 py-2.5 text-left"
                        >
                          <div className="truncate text-sm">{r.name}</div>
                          <div className="text-muted text-xs">
                            Per serve (1 of {r.servings}) · <MacroLine n={scaleNutrients(r.nutrients, 100 / r.servings)} unit={unit} />
                          </div>
                        </button>
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
                            onClick={() => void logEntries(savedMealToEntries(m, date, slot), m.name)}
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
        notice={
          justSaved && (selected?.food.kind === "custom" || selected?.food.kind === "recipe") ? (
            <span className="flex items-start gap-2">
              <IconCheck width={18} height={18} className="mt-0.5 shrink-0" />
              <span>
                Saved to {selected.food.kind === "recipe" ? "recipes" : "our foods"}. <strong>It&apos;s not logged yet</strong> — pick an
                amount below to add it to {SLOT_LABELS[slot]}, or close to skip.
              </span>
            </span>
          ) : undefined
        }
        onClose={() => setSelected(null)}
        date={date}
        slot={slot}
        unit={unit}
        onAdd={async (entry) => {
          setSelected(null);
          void logEntries([entry], `${Math.round(entry.grams ?? 0)} g ${entry.name}`);
          setSlot(entry.slot);
          setSelected(null);
        }}
      />

      <Sheet open={!!missingBarcode} onClose={() => setMissingBarcode(null)} title="Product not found">
        <p className="text-muted mb-4 text-sm">
          Barcode <span className="tabular text-text">{missingBarcode}</span> isn&apos;t in Open Food Facts or USDA. Create it from the
          nutrition panel and it&apos;ll be added to the household&apos;s foods.
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

      <QuickAddSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        date={date}
        slot={slot}
        unit={unit}
        onSave={async (e) => {
          setQuickOpen(false);
          void logEntries([e], e.name);
        }}
      />

      <Sheet open={slotPicker} onClose={() => setSlotPicker(false)} title="Which meal?">
        <div className="grid grid-cols-2 gap-2">
          {MEAL_SLOTS.map((s) => {
            const I = SLOT_ICONS[s];
            return (
              <Button
                key={s}
                variant={s === slot ? "primary" : "secondary"}
                className="h-14 justify-start"
                onClick={() => {
                  setSlot(s);
                  setSlotPicker(false);
                }}
              >
                <I width={18} height={18} /> {SLOT_LABELS[s]}
              </Button>
            );
          })}
        </div>
        {date !== today() && (
          <p className="text-muted mt-3 text-center text-xs">Logging to {friendlyDate(date)}. Go to that day on Today to change it.</p>
        )}
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

function ActionTile({
  icon: TileIcon,
  label,
  onClick,
  href,
  disabled,
  primary,
}: {
  icon?: Icon;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  const cls = cx(
    "flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl text-xs font-medium transition active:scale-[0.97] disabled:opacity-60",
    primary ? "bg-accent text-accent-text" : "bg-surface border-border border",
  );
  const body = (
    <>
      {TileIcon ? <TileIcon width={22} height={22} /> : <Spinner />}
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button onClick={onClick} disabled={disabled} className={cls}>
      {body}
    </button>
  );
}
