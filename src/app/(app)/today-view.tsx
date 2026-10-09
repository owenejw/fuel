"use client";

import { useMemo, useState } from "react";
import { FoodSheet } from "@/components/food-sheet";
import { FuellingCard } from "@/components/fuelling-card";
import { SuggestionsCard } from "@/components/suggestions-card";
import { WaterCard } from "@/components/water-card";
import { fluidTargetMl } from "@/lib/nrv";
import { setDayType } from "@/lib/data";
import type { Food } from "@/lib/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { EntrySheet } from "@/components/entry-sheet";
import { IconBolt, IconChevronLeft, IconChevronRight } from "@/components/icons";
import { MealSlotCard } from "@/components/meal-slot";
import { DaySummary, MacroLine } from "@/components/nutrition";
import { QuickAddSheet } from "@/components/quick-add-sheet";
import { useToast } from "@/components/toast";
import { Button, Card, Input, PageHeader, Sheet, Spinner } from "@/components/ui";
import { copyEntries, entryToNew, fetchRecentMeals, saveMeal } from "@/lib/data";
import { addDays, friendlyDate, isValidDate, today } from "@/lib/dates";
import { useDay } from "@/lib/hooks";
import { sumNutrients, combineTotals } from "@/lib/nutrients";
import { defaultSlot } from "@/lib/slots";
import { MEAL_SLOTS, SLOT_LABELS, type LogEntry, type MealSlot } from "@/lib/types";

const CORE_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export function TodayView() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { unit, profile } = useApp();
  const dateParam = params.get("date");
  const date = isValidDate(dateParam) ? dateParam : today();
  const { day, entries, loading, offline, add, remove, update, refresh, setDay } = useDay(date);
  const [version, setVersion] = useState(0);
  const [openFood, setOpenFood] = useState<Food | null>(null);
  const [nowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  const isToday = date === today();

  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [quick, setQuick] = useState<{ slot: MealSlot; entry?: LogEntry } | null>(null);
  const [menuSlot, setMenuSlot] = useState<MealSlot | null>(null);

  const bySlot = useMemo(() => {
    const m = new Map<MealSlot, LogEntry[]>(MEAL_SLOTS.map((s) => [s, []]));
    for (const e of entries ?? []) m.get(e.slot)!.push(e);
    return m;
  }, [entries]);
  const slotTotals = useMemo(() => new Map(MEAL_SLOTS.map((s) => [s, sumNutrients(bySlot.get(s)!.map((e) => e.nutrients))])), [bySlot]);
  const dayTotals = useMemo(() => combineTotals([...slotTotals.values()]), [slotTotals]);
  const visibleSlots = MEAL_SLOTS.filter((s) => CORE_SLOTS.includes(s) || bySlot.get(s)!.length > 0);

  const go = (d: string) => router.replace(d === today() ? "/" : `/?date=${d}`, { scroll: false });

  async function handleDelete(ids: string[]) {
    const removed = await remove(ids);
    setVersion((v) => v + 1);
    toast(removed.length === 1 ? "Entry deleted" : `${removed.length} entries deleted`, {
      label: "Undo",
      onClick: () => add(removed.map((e) => entryToNew(e))).catch(() => toast("Could not restore")),
    });
  }

  async function copyFromYesterday(slot?: MealSlot) {
    try {
      const copied = await copyEntries(addDays(date, -1), date, slot ? { fromSlot: slot } : {});
      await refresh();
      toast(copied.length ? `Copied ${copied.length} item${copied.length === 1 ? "" : "s"} from yesterday` : "Nothing logged yesterday");
    } catch {
      toast("Could not copy");
    }
  }

  return (
    <>
      <PageHeader
        left={
          <button onClick={() => go(addDays(date, -1))} className="-ml-2 rounded-full p-2" aria-label="Previous day">
            <IconChevronLeft />
          </button>
        }
        title={
          <span className="flex items-center gap-1">
            {friendlyDate(date)}
            <button onClick={() => go(addDays(date, 1))} className="rounded-full p-2" aria-label="Next day">
              <IconChevronRight />
            </button>
          </span>
        }
        right={
          <button
            onClick={() => setQuick({ slot: defaultSlot() })}
            className="bg-surface-2 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm"
          >
            <IconBolt width={16} height={16} /> Quick add
          </button>
        }
      />

      <div className="space-y-3 px-4">
        {offline && <p className="bg-surface-2 text-muted rounded-xl px-3 py-2 text-sm">Offline — showing your saved copy.</p>}
        {day ? (
          <>
            <DaySummary totals={dayTotals} targets={day.plan.targets} unit={unit} training={day.plan.training} />
            <DayTypeToggle
              value={day.plan.dayTypeOverridden ? day.plan.dayType : null}
              auto={day.plan.workouts.some((w) => w.type !== "rest") ? "training" : "rest"}
              onChange={async (t) => {
                await setDayType(date, t);
                await refresh();
              }}
            />
            {day.plan.carbLoadingFor && (
              <p className="bg-accent-soft text-accent rounded-xl px-3 py-2 text-sm">
                Carb loading for {day.plan.carbLoadingFor}: carbs raised to {day.plan.targets.carbs_g} g today.
              </p>
            )}
            {day.plan.source === "placeholder" && (
              <Link href="/onboarding" className="bg-accent-soft text-accent block rounded-xl px-3 py-2 text-sm">
                Using placeholder targets — add your height, birth date and weight to get personal ones.
              </Link>
            )}
            {day.plan.source === "estimated" && (
              <Link href="/settings#targets" className="bg-surface-2 text-muted block rounded-xl px-3 py-2 text-sm">
                Targets estimated from your profile. Review or save them in Settings.
              </Link>
            )}
            <FuellingCard items={day.fuelling} workouts={day.plan.workouts} nowMin={nowMin} isToday={isToday} />
          </>
        ) : null}

        {loading ? (
          <div className="text-muted flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {entries!.length === 0 && (
              <Card className="flex items-center justify-between gap-3 p-4">
                <span className="text-muted text-sm">Nothing logged {date === today() ? "yet today" : "this day"}.</span>
                <Button size="sm" variant="secondary" onClick={() => copyFromYesterday()}>
                  Copy previous day
                </Button>
              </Card>
            )}
            {visibleSlots.map((slot) => (
              <MealSlotCard
                key={slot}
                slot={slot}
                date={date}
                entries={bySlot.get(slot)!}
                totals={slotTotals.get(slot)!}
                unit={unit}
                onEntry={(e) => (e.kind === "quick" ? setQuick({ slot: e.slot, entry: e }) : setEditing(e))}
                onMenu={() => setMenuSlot(slot)}
              />
            ))}
            {day && (
              <WaterCard
                date={date}
                ml={day.waterMl}
                target={fluidTargetMl(profile.sex)}
                onChange={(ml) => setDay((d) => ({ ...d, waterMl: ml }))}
              />
            )}
            {isToday && (
              <SuggestionsCard
                date={date}
                slot={defaultSlot()}
                unit={unit}
                aiEnabled={profile.ai_enabled}
                version={version}
                onOpenFood={setOpenFood}
                onAdd={async (items, label) => {
                  await add(items);
                  setVersion((v) => v + 1);
                  toast(`Added ${label}`);
                }}
              />
            )}
          </>
        )}
      </div>

      <FoodSheet
        food={openFood}
        onClose={() => setOpenFood(null)}
        date={date}
        slot={defaultSlot()}
        unit={unit}
        onAdd={async (e) => {
          await add([e]);
          setOpenFood(null);
          setVersion((v) => v + 1);
          toast(`Added to ${SLOT_LABELS[e.slot]}`);
        }}
      />

      <EntrySheet
        entry={editing}
        unit={unit}
        onClose={() => setEditing(null)}
        onUpdate={async (id, patch) => {
          await update(id, patch);
        }}
        onDelete={(id) => handleDelete([id])}
      />

      <QuickAddSheet
        open={!!quick}
        onClose={() => setQuick(null)}
        date={date}
        slot={quick?.slot ?? "snack"}
        unit={unit}
        entry={quick?.entry}
        onSave={async (e) => {
          if (quick?.entry) {
            await update(quick.entry.id, { name: e.name, slot: e.slot, nutrients: e.nutrients });
          } else {
            await add([e]);
            toast(`Added to ${SLOT_LABELS[e.slot]}`);
          }
          setQuick(null);
        }}
      />

      <SlotMenu
        slot={menuSlot}
        date={date}
        entries={menuSlot ? bySlot.get(menuSlot)! : []}
        unit={unit}
        onClose={() => setMenuSlot(null)}
        onQuickAdd={(slot) => {
          setMenuSlot(null);
          setQuick({ slot });
        }}
        onCopyYesterday={async (slot) => {
          setMenuSlot(null);
          await copyFromYesterday(slot);
        }}
        onCopyEntries={async (items, slot) => {
          setMenuSlot(null);
          await add(items.map((e) => entryToNew(e, { date, slot, time: undefined })));
          toast(`Copied ${items.length} item${items.length === 1 ? "" : "s"} to ${SLOT_LABELS[slot]}`);
        }}
        onClear={(ids) => {
          setMenuSlot(null);
          handleDelete(ids);
        }}
      />
    </>
  );
}

function SlotMenu({
  slot,
  date,
  entries,
  unit,
  onClose,
  onQuickAdd,
  onCopyYesterday,
  onCopyEntries,
  onClear,
}: {
  slot: MealSlot | null;
  date: string;
  entries: LogEntry[];
  unit: ReturnType<typeof useApp>["unit"];
  onClose: () => void;
  onQuickAdd: (slot: MealSlot) => void;
  onCopyYesterday: (slot: MealSlot) => void;
  onCopyEntries: (items: LogEntry[], slot: MealSlot) => void;
  onClear: (ids: string[]) => void;
}) {
  const toast = useToast();
  const [view, setView] = useState<"menu" | "previous" | "save">("menu");
  const [previous, setPrevious] = useState<{ date: string; items: LogEntry[] }[] | null>(null);
  const [mealName, setMealName] = useState("");

  const close = () => {
    setView("menu");
    setPrevious(null);
    onClose();
  };

  if (!slot)
    return (
      <Sheet open={false} onClose={close}>
        {null}
      </Sheet>
    );

  return (
    <Sheet open onClose={close} title={SLOT_LABELS[slot]}>
      {view === "menu" && (
        <div className="divide-border border-border divide-y overflow-hidden rounded-xl border">
          <MenuItem onClick={() => onQuickAdd(slot)}>Quick add</MenuItem>
          <MenuItem onClick={() => onCopyYesterday(slot)}>Copy {SLOT_LABELS[slot].toLowerCase()} from yesterday</MenuItem>
          <MenuItem
            onClick={() => {
              setView("previous");
              fetchRecentMeals(date, slot).then(setPrevious, () => setPrevious([]));
            }}
          >
            Copy a previous {SLOT_LABELS[slot].toLowerCase()}…
          </MenuItem>
          {entries.length > 0 && (
            <>
              <MenuItem
                onClick={() => {
                  setMealName(SLOT_LABELS[slot]);
                  setView("save");
                }}
              >
                Save as a meal…
              </MenuItem>
              <MenuItem className="text-danger" onClick={() => onClear(entries.map((e) => e.id))}>
                Clear {SLOT_LABELS[slot].toLowerCase()}
              </MenuItem>
            </>
          )}
        </div>
      )}

      {view === "previous" &&
        (previous === null ? (
          <div className="text-muted flex justify-center py-8">
            <Spinner />
          </div>
        ) : previous.length === 0 ? (
          <p className="text-muted py-6 text-center text-sm">No {SLOT_LABELS[slot].toLowerCase()} logged in the last two weeks.</p>
        ) : (
          <ul className="space-y-2">
            {previous.map((p) => {
              const t = sumNutrients(p.items.map((i) => i.nutrients));
              return (
                <li key={p.date}>
                  <button
                    onClick={() => onCopyEntries(p.items, slot)}
                    className="border-border active:bg-surface-2 w-full rounded-xl border p-3 text-left"
                  >
                    <div className="flex justify-between text-sm font-medium">
                      <span>{friendlyDate(p.date)}</span>
                      <MacroLine n={t.totals} unit={unit} />
                    </div>
                    <div className="text-muted mt-1 line-clamp-2 text-xs">{p.items.map((i) => i.name).join(", ")}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}

      {view === "save" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await saveMeal(mealName.trim() || SLOT_LABELS[slot], entries);
              toast("Meal saved");
              close();
            } catch {
              toast("Could not save meal");
            }
          }}
        >
          <Input label="Meal name" value={mealName} onChange={(e) => setMealName(e.target.value)} autoFocus />
          <p className="text-muted text-xs">{entries.map((e) => e.name).join(", ")}</p>
          <Button type="submit" className="w-full">
            Save meal
          </Button>
        </form>
      )}
    </Sheet>
  );
}

function MenuItem({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={`active:bg-surface-2 block w-full px-4 py-3.5 text-left ${className ?? ""}`}>
      {children}
    </button>
  );
}

function DayTypeToggle({
  value,
  auto,
  onChange,
}: {
  value: "training" | "rest" | null;
  auto: "training" | "rest";
  onChange: (t: "training" | "rest" | null) => void;
}) {
  const opts: { v: "training" | "rest" | null; label: string }[] = [
    { v: null, label: `Auto (${auto})` },
    { v: "training", label: "Training" },
    { v: "rest", label: "Rest" },
  ];
  return (
    <div className="bg-surface-2 flex rounded-xl p-1 text-xs" role="radiogroup" aria-label="Day type">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`h-8 flex-1 rounded-lg ${value === o.v ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
