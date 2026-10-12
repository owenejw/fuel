"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { EntrySheet } from "@/components/entry-sheet";
import { IconBolt, IconBookmark, IconChevronLeft, IconChevronRight, IconCopy, IconTrash, type Icon } from "@/components/icons";
import { MealSlotCard } from "@/components/meal-slot";
import { MacroLine } from "@/components/nutrition";
import { QuickAddSheet } from "@/components/quick-add-sheet";
import { METRIC, type MetricKey } from "@/components/rings";
import { useToast } from "@/components/toast";
import { Button, Card, Input, PageHeader, Sheet, Spinner, cx } from "@/components/ui";
import { copyEntries, entryToNew, fetchRecentMeals, saveMeal } from "@/lib/data";
import { addDays, friendlyDate, isValidDate, today } from "@/lib/dates";
import { formatEnergy, type EnergyUnit } from "@/lib/energy";
import { useDay } from "@/lib/hooks";
import { combineTotals, sumNutrients, type Nutrients } from "@/lib/nutrients";
import { defaultSlot } from "@/lib/slots";
import { MEAL_SLOTS, SLOT_LABELS, type DayTargets, type LogEntry, type MealSlot } from "@/lib/types";

const CORE_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export function DiaryView() {
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

  const go = (d: string) => router.replace(d === today() ? "/diary" : `/diary?date=${d}`, { scroll: false });

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

  return (
    <>
      <PageHeader
        left={
          <button onClick={() => go(addDays(date, -1))} className="-ml-2 rounded-full p-2" aria-label="Previous day">
            <IconChevronLeft />
          </button>
        }
        title={
          <span className="flex items-center gap-1 text-base">
            {friendlyDate(date)}
            <button onClick={() => go(addDays(date, 1))} className="rounded-full p-2" aria-label="Next day">
              <IconChevronRight />
            </button>
          </span>
        }
        right={
          <button
            onClick={() => setQuick({ slot: defaultSlot() })}
            className="bg-surface-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
          >
            <IconBolt width={16} height={16} className="text-accent" /> Quick add
          </button>
        }
      />

      <div className="space-y-3 px-4">
        {offline && <p className="bg-surface-2 text-muted rounded-xl px-3 py-2 text-sm">Offline — showing your saved copy.</p>}
        {day && <DiaryTotals totals={dayTotals.totals} targets={day.plan.targets} unit={unit} date={date} />}

        {loading ? (
          <div className="text-muted flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {entries!.length === 0 && (
              <Card className="flex items-center justify-between gap-3 p-4">
                <span className="text-muted text-sm">Nothing logged {date === today() ? "yet today" : "this day"}.</span>
                <Button size="sm" variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => copyFromYesterday()}>
                  <IconCopy width={16} height={16} /> Copy yesterday
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
                onDelete={(e) => handleDelete([e.id])}
                onMenu={() => setMenuSlot(slot)}
              />
            ))}
          </>
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
function DiaryTotals({ totals, targets, unit, date }: { totals: Nutrients; targets: DayTargets; unit: EnergyUnit; date: string }) {
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
