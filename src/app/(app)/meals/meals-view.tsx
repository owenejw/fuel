"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { EntrySheet } from "@/components/entry-sheet";
import {
  IconBolt,
  IconBookmark,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconGrid,
  IconMore,
  IconPlus,
  IconTrash,
  SLOT_ICONS,
  type Icon,
} from "@/components/icons";
import { SwipeToDelete } from "@/components/meal-slot";
import { MacroLine } from "@/components/nutrition";
import { QuickAddSheet } from "@/components/quick-add-sheet";
import { METRIC, type MetricKey } from "@/components/rings";
import { useToast } from "@/components/toast";
import { Button, Input, PageHeader, Sheet, Spinner, cx } from "@/components/ui";
import { copyEntries, entryToNew, fetchRecentMeals, saveMeal } from "@/lib/data";
import { addDays, friendlyDate, isValidDate, today } from "@/lib/dates";
import { formatEnergy, type EnergyUnit } from "@/lib/energy";
import { useDay } from "@/lib/hooks";
import { combineTotals, sumNutrients, type Nutrients } from "@/lib/nutrients";
import { defaultSlot } from "@/lib/slots";
import { MEAL_SLOTS, SLOT_LABELS, type DayTargets, type LogEntry, type MealSlot } from "@/lib/types";

const CORE_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export function MealsView() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { unit } = useApp();
  const dateParam = params.get("date");
  const date = isValidDate(dateParam) ? dateParam : today();
  const { day, entries, loading, offline, add, remove, update, refresh } = useDay(date);

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

  const go = (d: string) => router.replace(d === today() ? "/meals" : `/meals?date=${d}`, { scroll: false });

  async function handleDelete(ids: string[]) {
    const removed = await remove(ids);
    toast(removed.length === 1 ? "Entry deleted" : `${removed.length} entries deleted`, {
      label: "Undo",
      onClick: () => add(removed.map((e) => entryToNew(e))).catch(() => toast("Could not restore")),
    });
  }

  const undoAction = (saving: Promise<LogEntry[]>) => ({
    label: "Undo",
    onClick: () => {
      saving.then((added) => remove(added.map((x) => x.id))).catch(() => toast("Could not undo"));
    },
  });

  async function copyFromYesterday(slot?: MealSlot) {
    try {
      const copied = await copyEntries(addDays(date, -1), date, slot ? { fromSlot: slot } : {});
      await refresh();
      toast(copied.length ? `Copied ${copied.length} item${copied.length === 1 ? "" : "s"} from yesterday` : "Nothing logged yesterday");
    } catch {
      toast("Could not copy");
    }
  }

  const [tab, setTab] = useState<"overview" | MealSlot>("overview");
  const tabs: ("overview" | MealSlot)[] = ["overview", ...visibleSlots];
  const onEntry = (e: LogEntry) => (e.kind === "quick" ? setQuick({ slot: e.slot, entry: e }) : setEditing(e));

  return (
    <>
      <PageHeader
        title="Meals"
        right={
          <button
            onClick={() => setQuick({ slot: tab === "overview" ? defaultSlot() : tab })}
            className="bg-surface flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium active:scale-95"
          >
            <IconBolt width={16} height={16} className="text-accent" /> Quick add
          </button>
        }
      />

      <div className="flex items-center justify-between px-2">
        <button onClick={() => go(addDays(date, -1))} className="text-muted rounded-full p-2 active:scale-90" aria-label="Previous day">
          <IconChevronLeft />
        </button>
        <span className="text-[15px] font-semibold">
          {friendlyDate(date)}
          {["Today", "Yesterday", "Tomorrow"].includes(friendlyDate(date)) && (
            <span className="text-muted font-normal">
              {" · "}
              {new Date(date + "T00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </span>
          )}
        </span>
        <button onClick={() => go(addDays(date, 1))} className="text-muted rounded-full p-2 active:scale-90" aria-label="Next day">
          <IconChevronRight />
        </button>
      </div>

      <div className="bg-bg/85 sticky top-[calc(env(safe-area-inset-top)+4rem)] z-10 -mt-1 py-2 backdrop-blur-xl">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4" role="tablist">
          {tabs.map((t) => {
            const on = t === tab;
            const SlotIcon = t === "overview" ? IconGrid : SLOT_ICONS[t];
            const kj = t === "overview" ? null : slotTotals.get(t)!.totals.energy_kj;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t)}
                className={cx(
                  "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition active:scale-95",
                  on ? "bg-text text-bg" : "bg-surface text-text",
                )}
              >
                <SlotIcon width={16} height={16} />
                {t === "overview" ? "Overview" : SLOT_LABELS[t]}
                {kj ? (
                  <span className={cx("tabular text-xs font-medium", on ? "opacity-60" : "text-muted")}>
                    {formatEnergy(kj, unit, { label: false })}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div key={`${date}:${tab}`} className="page-in space-y-3 px-4 pt-1">
        {offline && <p className="bg-surface-2 text-muted rounded-xl px-3 py-2 text-sm">Offline — showing your saved copy.</p>}
        {loading || !day ? (
          <div className="text-muted flex justify-center py-10">
            <Spinner />
          </div>
        ) : tab === "overview" ? (
          <>
            <MealsTotals totals={dayTotals.totals} targets={day.plan.targets} unit={unit} date={date} />
            <h2 className="pt-2 text-xl font-bold">By meal</h2>
            {visibleSlots.map((slot) => (
              <MealSummaryCard
                key={slot}
                slot={slot}
                date={date}
                count={bySlot.get(slot)!.length}
                totals={slotTotals.get(slot)!.totals}
                unit={unit}
                onOpen={() => setTab(slot)}
              />
            ))}
            {entries!.length === 0 && (
              <Button variant="secondary" className="w-full" onClick={() => copyFromYesterday()}>
                <IconCopy width={16} height={16} /> Copy yesterday&apos;s meals
              </Button>
            )}
          </>
        ) : (
          <MealDetail
            slot={tab}
            date={date}
            entries={bySlot.get(tab)!}
            totals={slotTotals.get(tab)!.totals}
            unit={unit}
            onEntry={onEntry}
            onDelete={(e) => handleDelete([e.id])}
            onQuick={() => setQuick({ slot: tab })}
            onMenu={() => setMenuSlot(tab)}
          />
        )}
      </div>

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
          const editing = quick?.entry;
          setQuick(null);
          if (editing) {
            update(editing.id, { name: e.name, slot: e.slot, nutrients: e.nutrients }).catch(() => toast("Couldn't save — try again"));
          } else {
            const saving = add([e]);
            toast(`Added ${e.name} to ${SLOT_LABELS[e.slot]} · ${friendlyDate(e.date)}`, undoAction(saving));
            saving.catch(() => toast(`Couldn't add ${e.name} — try again`));
          }
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
          <MenuItem icon={IconBolt} onClick={() => onQuickAdd(slot)}>
            Quick add kJ
          </MenuItem>
          <MenuItem icon={IconCopy} onClick={() => onCopyYesterday(slot)}>
            Copy {SLOT_LABELS[slot].toLowerCase()} from yesterday
          </MenuItem>
          <MenuItem
            icon={IconCopy}
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
                icon={IconBookmark}
                onClick={() => {
                  setMealName(SLOT_LABELS[slot]);
                  setView("save");
                }}
              >
                Save as a meal…
              </MenuItem>
              <MenuItem icon={IconTrash} className="text-danger" onClick={() => onClear(entries.map((e) => e.id))}>
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

function MenuItem({
  children,
  onClick,
  className,
  icon: ItemIcon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  icon: Icon;
}) {
  return (
    <button onClick={onClick} className={cx("active:bg-surface-2 flex w-full items-center gap-3 px-4 py-3.5 text-left", className)}>
      <ItemIcon width={18} height={18} className="shrink-0 opacity-70" />
      {children}
    </button>
  );
}

/** One line of colour-coded totals; tap for the full breakdown. */
function MealsTotals({ totals, targets, unit, date }: { totals: Nutrients; targets: DayTargets; unit: EnergyUnit; date: string }) {
  const items: [MetricKey, number, number, string][] = [
    ["protein", totals.protein_g ?? 0, targets.protein_g, "P"],
    ["carbs", totals.carbs_g ?? 0, targets.carbs_g, "C"],
    ["fat", totals.fat_g ?? 0, targets.fat_g, "F"],
  ];
  return (
    <Link href={`/nutrition?date=${date}`} className="bg-surface flex items-center gap-3 rounded-2xl px-4 py-3 active:scale-[0.99]">
      <div className="min-w-0 flex-1">
        <div className="text-energy tabular text-xl font-semibold">
          {formatEnergy(totals.energy_kj ?? 0, unit, { label: false })}
          <span className="text-muted text-sm font-normal"> / {formatEnergy(targets.energy_kj, unit)}</span>
        </div>
        <div className="tabular mt-0.5 flex gap-3 text-sm">
          {items.map(([k, v, t, l]) => (
            <span key={k} className={METRIC[k].text}>
              {l} {Math.round(v)}
              <span className="text-muted">/{Math.round(t)}g</span>
            </span>
          ))}
        </div>
      </div>
      <IconChevronRight width={20} height={20} className="text-muted" />
    </Link>
  );
}

const MACRO_CHIPS: [MetricKey, "protein_g" | "carbs_g" | "fat_g", string][] = [
  ["protein", "protein_g", "Protein"],
  ["carbs", "carbs_g", "Carbs"],
  ["fat", "fat_g", "Fat"],
];

function MacroChips({ totals }: { totals: Nutrients }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MACRO_CHIPS.map(([m, k, l]) => (
        <span
          key={k}
          className="tabular rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ color: METRIC[m].color, background: `color-mix(in srgb, ${METRIC[m].color} 14%, transparent)` }}
        >
          {l} {Math.round(totals[k] ?? 0)} g
        </span>
      ))}
    </div>
  );
}

/** One meal on the overview: tap to open it, or + to add to it. */
function MealSummaryCard({
  slot,
  date,
  count,
  totals,
  unit,
  onOpen,
}: {
  slot: MealSlot;
  date: string;
  count: number;
  totals: Nutrients;
  unit: EnergyUnit;
  onOpen: () => void;
}) {
  const SlotIcon = SLOT_ICONS[slot];
  return (
    <div className="bg-surface flex items-center gap-3 rounded-3xl p-4">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
        <span className="bg-surface-2 text-accent flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
          <SlotIcon width={22} height={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold">{SLOT_LABELS[slot]}</span>
          {count ? (
            <>
              <span className="tabular text-energy block text-[22px] leading-tight font-bold">
                {formatEnergy(totals.energy_kj ?? 0, unit, { label: false })}
                <span className="ml-0.5 text-sm font-semibold">{unit === "kj" ? "kJ" : "kcal"}</span>
                <span className="text-muted ml-2 text-xs font-normal">
                  {count} food{count === 1 ? "" : "s"}
                </span>
              </span>
              <span className="mt-1.5 block">
                <MacroChips totals={totals} />
              </span>
            </>
          ) : (
            <span className="text-muted block text-sm">Nothing yet</span>
          )}
        </span>
      </button>
      <Link
        href={`/log?slot=${slot}&date=${date}`}
        className="bg-accent text-accent-text flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-90"
        aria-label={`Add to ${SLOT_LABELS[slot]}`}
      >
        <IconPlus width={20} height={20} strokeWidth={2.6} />
      </Link>
    </div>
  );
}

/** One meal's tab: its totals, actions, and the foods in it. */
function MealDetail({
  slot,
  date,
  entries,
  totals,
  unit,
  onEntry,
  onDelete,
  onQuick,
  onMenu,
}: {
  slot: MealSlot;
  date: string;
  entries: LogEntry[];
  totals: Nutrients;
  unit: EnergyUnit;
  onEntry: (e: LogEntry) => void;
  onDelete: (e: LogEntry) => void;
  onQuick: () => void;
  onMenu: () => void;
}) {
  return (
    <>
      <div className="bg-surface rounded-3xl p-4">
        <div className="text-[15px]">{SLOT_LABELS[slot]}</div>
        <div className="tabular text-energy text-[34px] leading-tight font-bold">
          {formatEnergy(totals.energy_kj ?? 0, unit, { label: false })}
          <span className="ml-0.5 text-lg font-semibold">{unit === "kj" ? "kJ" : "kcal"}</span>
        </div>
        <div className="mt-2">
          <MacroChips totals={totals} />
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
          <Link
            href={`/log?slot=${slot}&date=${date}`}
            className="bg-accent text-accent-text flex h-11 items-center justify-center gap-1.5 rounded-full font-semibold active:scale-[0.97]"
          >
            <IconPlus width={18} height={18} strokeWidth={2.6} /> Add food
          </Link>
          <button
            onClick={onQuick}
            className="bg-surface-2 flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold active:scale-95"
          >
            <IconBolt width={16} height={16} className="text-accent" /> kJ
          </button>
          <button
            onClick={onMenu}
            className="bg-surface-2 flex h-11 w-11 items-center justify-center rounded-full active:scale-95"
            aria-label="More options"
          >
            <IconMore width={20} height={20} />
          </button>
        </div>
      </div>
      {entries.length > 0 ? (
        <>
          <h2 className="pt-2 text-xl font-bold">Foods</h2>
          <ul className="bg-surface divide-border divide-y overflow-hidden rounded-3xl">
            {entries.map((e) => (
              <li key={e.id}>
                <SwipeToDelete onDelete={() => onDelete(e)} label={`Delete ${e.name}`}>
                  <button onClick={() => onEntry(e)} className="active:bg-surface-2 flex w-full items-center gap-3 px-4 py-3 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px]">{e.name}</div>
                      <MacroLine n={e.nutrients} unit={unit} />
                    </div>
                    <span className="tabular text-muted shrink-0 text-sm">{e.grams ? `${Math.round(e.grams)} g` : "quick"}</span>
                  </button>
                </SwipeToDelete>
              </li>
            ))}
          </ul>
          <p className="text-muted px-1 text-xs">Tap a food to change it · swipe left to delete</p>
        </>
      ) : (
        <p className="text-muted py-6 text-center text-sm">Nothing logged for {SLOT_LABELS[slot].toLowerCase()} yet.</p>
      )}
    </>
  );
}
