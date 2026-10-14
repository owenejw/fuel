"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { FuellingCard } from "@/components/fuelling-card";
import { useToast } from "@/components/toast";
import {
  Button,
  Card,
  ChoiceCards,
  Empty,
  Heading,
  Input,
  PageHeader,
  PageSkeleton,
  Skeleton,
  Pills,
  Segmented,
  Sheet,
  Stepper,
  Toggle,
  cx,
} from "@/components/ui";
import {
  IconCalendar,
  IconCalendarSync,
  IconCheck,
  IconChevronDown,
  IconDumbbell,
  IconPlus,
  IconRest,
  IconSparkles,
  IconTrash,
  IconTrophy,
  WORKOUT_ICONS,
} from "@/components/icons";
import { getDay } from "@/lib/data";
import { addDays, friendlyDate, today } from "@/lib/dates";
import { DayTypeSheet, WeekNav, mondayOf } from "@/components/week";
import { fmtMin } from "@/lib/fuelling";
import { WORKOUT_LABELS, WORKOUT_TYPES, type Intensity, type Workout, type WorkoutInput, type WorkoutType } from "@/lib/types";
import type { DayBundle, DayPlan } from "@/server/repo";
import { deleteWorkout, getDayPlans, saveWorkout, setWorkoutCompleted, syncCalendar } from "@/server/actions/plan";
import {
  addGroceryItem,
  clearCheckedGrocery,
  fetchGrocery,
  generateGrocery,
  toggleGrocery,
  type GroceryItem,
} from "@/server/actions/grocery";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function PlanView() {
  const { profile } = useApp();
  const toast = useToast();
  const [start, setStart] = useState(() => mondayOf(today()));
  const [dayTypeFor, setDayTypeFor] = useState<string | null>(null);
  const [plans, setPlans] = useState<DayPlan[] | null>(null);
  const [selected, setSelected] = useState(today());
  const [day, setDayBundle] = useState<DayBundle | null>(null);
  const [editing, setEditing] = useState<{ workout?: Workout; date: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => getDayPlans(start, addDays(start, 6)).then(setPlans, () => undefined), [start]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    getDay(selected).then(setDayBundle, () => undefined);
  }, [selected, plans]);

  return (
    <>
      <PageHeader
        title="Plan"
        right={
          profile.calendar_ics_url ? (
            <button
              disabled={syncing}
              className="bg-surface flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium active:scale-95 disabled:opacity-60"
              onClick={async () => {
                setSyncing(true);
                try {
                  const n = await syncCalendar();
                  toast(`Synced ${n} event${n === 1 ? "" : "s"}`);
                  load();
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Sync failed");
                } finally {
                  setSyncing(false);
                }
              }}
            >
              <IconCalendarSync width={16} height={16} className="text-accent" /> {syncing ? "Syncing…" : "Sync"}
            </button>
          ) : (
            <Link
              href="/settings/calendar"
              className="bg-surface flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium active:scale-95"
            >
              <IconCalendarSync width={16} height={16} className="text-accent" /> Connect calendar
            </Link>
          )
        }
      />
      <div className="space-y-3 px-4">
        <WeekNav weekStart={start} onChange={setStart} maxAhead={8} />

        {!plans ? (
          <PageSkeleton cards={[96, 96, 96, 96]} />
        ) : (
          <div key={start} className="page-in space-y-2">
            {plans.map((p) => (
              <div
                key={p.date}
                className={cx(
                  "bg-surface rounded-3xl p-4 transition",
                  p.date === selected && "ring-accent/60 ring-1",
                  p.date < today() && "opacity-70",
                )}
              >
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelected(p.date)} className="min-w-0 flex-1 text-left">
                    <span className={cx("block text-[17px] font-semibold", p.date === today() && "text-accent")}>
                      {friendlyDate(p.date)}
                    </span>
                    {p.carbLoadingFor && <span className="text-carbs block text-xs">Carb loading for {p.carbLoadingFor}</span>}
                  </button>
                  <button
                    onClick={() => setDayTypeFor(p.date)}
                    className={cx(
                      "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold active:scale-95",
                      p.training ? "bg-protein/15 text-protein" : "bg-surface-2 text-text",
                    )}
                    aria-label={`${friendlyDate(p.date)}: ${p.training ? "training" : "rest"} day. Change`}
                  >
                    {p.training ? <IconDumbbell width={13} height={13} /> : <IconRest width={13} height={13} />}
                    {p.training ? "Training" : "Rest"}
                    <IconChevronDown width={13} height={13} />
                  </button>
                  <button
                    onClick={() => setEditing({ date: p.date })}
                    className="bg-accent text-accent-text flex h-9 w-9 items-center justify-center rounded-full active:scale-90"
                    aria-label={`Add workout on ${friendlyDate(p.date)}`}
                  >
                    <IconPlus width={18} height={18} strokeWidth={2.6} />
                  </button>
                </div>
                {p.workouts.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {p.workouts.map((w) => (
                      <li key={w.id} className="flex items-center gap-3">
                        <button
                          aria-label={w.completed ? "Mark not done" : "Mark done"}
                          aria-pressed={w.completed}
                          onClick={async () => {
                            await setWorkoutCompleted(w.id, !w.completed);
                            load();
                          }}
                          className={cx(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90",
                            w.completed ? "bg-protein text-black" : "bg-surface-2 text-protein",
                          )}
                        >
                          {(() => {
                            const WIcon = w.completed ? IconCheck : WORKOUT_ICONS[w.type];
                            return <WIcon width={17} height={17} />;
                          })()}
                        </button>
                        <button
                          onClick={() => setEditing({ workout: w, date: w.date })}
                          className="min-w-0 flex-1 py-1 text-left active:opacity-70"
                        >
                          <span className={cx("block truncate text-[15px]", w.completed && "text-muted line-through")}>
                            {w.title || WORKOUT_LABELS[w.type]}
                            {w.source === "calendar" && <IconCalendar width={12} height={12} className="text-muted ml-1.5 inline" />}
                          </span>
                          <span className="text-muted block text-xs">
                            {[
                              w.start_time && fmtMin(toMin(w.start_time)),
                              w.duration_min && `${w.duration_min} min`,
                              w.intensity,
                              w.is_race && "race",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {day && day.plan.workouts.some((w) => w.type !== "rest") && (
          <>
            <Heading>{friendlyDate(selected)}&apos;s fuelling</Heading>
            <FuellingCard
              items={day.fuelling}
              workouts={day.plan.workouts}
              nowMin={new Date().getHours() * 60 + new Date().getMinutes()}
              isToday={selected === today()}
            />
          </>
        )}
        {day?.plan.carbLoadingFor && (
          <p className="bg-carbs/10 text-carbs rounded-2xl px-4 py-3 text-sm">
            {day.plan.carbLoadingFor} is coming up — carbs for {friendlyDate(selected).toLowerCase()} are raised to{" "}
            {day.plan.targets.carbs_g} g (about 8 g/kg).
          </p>
        )}

        <GroceryList />
      </div>

      <DayTypeSheet date={dayTypeFor} onClose={() => setDayTypeFor(null)} onChanged={() => load()} />

      <WorkoutSheet
        state={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </>
  );
}

function WorkoutSheet({
  state,
  onClose,
  onSaved,
}: {
  state: { workout?: Workout; date: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Sheet open={!!state} onClose={onClose} title={state?.workout ? "Edit workout" : "Add workout"}>
      {state && <WorkoutForm key={state.workout?.id ?? state.date} initial={state.workout} date={state.date} onSaved={onSaved} />}
    </Sheet>
  );
}

function WorkoutForm({ initial, date, onSaved }: { initial?: Workout; date: string; onSaved: () => void }) {
  const toast = useToast();
  const [w, setW] = useState<WorkoutInput>(
    initial ?? {
      date,
      start_time: "17:30",
      duration_min: 60,
      type: "soccer",
      intensity: "moderate",
      is_race: false,
      completed: false,
      title: null,
    },
  );
  const set = <K extends keyof WorkoutInput>(k: K, v: WorkoutInput[K]) => setW((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await saveWorkout({ ...w, title: w.title?.trim() || null }, initial?.id);
          onSaved();
        } catch (err) {
          toast(err instanceof Error ? err.message : "Could not save");
        }
      }}
    >
      <ChoiceCards<WorkoutType>
        label="Type"
        columns={3}
        value={w.type}
        onChange={(v) => set("type", v)}
        options={WORKOUT_TYPES.map((t) => ({ value: t, label: WORKOUT_LABELS[t], icon: WORKOUT_ICONS[t] }))}
      />
      {w.type !== "rest" && (
        <Segmented<Intensity>
          label="How hard?"
          value={w.intensity}
          onChange={(v) => set("intensity", v)}
          options={[
            { value: "easy", label: "Easy" },
            { value: "moderate", label: "Moderate" },
            { value: "hard", label: "Hard" },
          ]}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date" type="date" value={w.date} onChange={(e) => set("date", e.target.value)} required />
        <Input label="Start time" type="time" value={w.start_time ?? ""} onChange={(e) => set("start_time", e.target.value || null)} />
      </div>
      {w.type !== "rest" && (
        <div className="space-y-2">
          <Pills
            label="Duration (minutes)"
            value={w.duration_min}
            onChange={(v) => set("duration_min", v)}
            options={[30, 45, 60, 90, 120] as const}
          />
          <Stepper value={w.duration_min} onChange={(v) => set("duration_min", v)} step={5} max={1440} start={60} unit="min" />
        </div>
      )}
      <Input label="Title (optional)" placeholder="e.g. City2Surf" value={w.title ?? ""} onChange={(e) => set("title", e.target.value)} />
      <div className="border-border space-y-3 rounded-xl border p-3">
        <Toggle
          icon={IconTrophy}
          label="It's a race"
          hint="Carb-load for the 2 days before"
          checked={w.is_race}
          onChange={(v) => set("is_race", v)}
        />
        <Toggle icon={IconCheck} label="Completed" checked={w.completed} onChange={(v) => set("completed", v)} />
      </div>
      <div className="flex gap-2">
        {initial && (
          <Button
            type="button"
            variant="secondary"
            className="text-danger flex-1"
            onClick={async () => {
              await deleteWorkout(initial.id);
              onSaved();
            }}
          >
            Delete
          </Button>
        )}
        <Button type="submit" className="flex-[2]">
          Save
        </Button>
      </div>
      {initial?.source === "calendar" && (
        <p className="text-muted text-xs">From your calendar — edits may be overwritten on the next sync.</p>
      )}
    </form>
  );
}

function GroceryList() {
  const toast = useToast();
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    fetchGrocery().then(setItems, () => setItems([]));
  }, []);

  return (
    <section>
      <Heading
        right={
          <button
            disabled={busy}
            className="bg-surface flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium active:scale-95 disabled:opacity-60"
            onClick={async () => {
              setBusy(true);
              try {
                setItems(await generateGrocery());
                toast("Added your staples and nutrient boosters");
              } finally {
                setBusy(false);
              }
            }}
          >
            <IconSparkles width={15} height={15} className="text-accent" /> {busy ? "Building…" : "Suggest items"}
          </button>
        }
      >
        Grocery list
      </Heading>
      <Card>
        <form
          className="border-border flex gap-2 border-b p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await addGroceryItem(name);
            setName("");
            setItems(await fetchGrocery());
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add an item"
            className="bg-surface-2 h-10 flex-1 rounded-full px-4 outline-none"
          />
          <Button size="sm" type="submit">
            Add
          </Button>
        </form>
        {items === null ? (
          <div className="p-3">
            <Skeleton className="h-10" />
          </div>
        ) : items.length === 0 ? (
          <Empty>Tap “Suggest items” to build a list from what you eat and what you&apos;re low on.</Empty>
        ) : (
          <ul className="divide-border divide-y">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/5"
                  aria-pressed={i.checked}
                  onClick={() => {
                    const checked = !i.checked;
                    setItems((all) => all?.map((x) => (x.id === i.id ? { ...x, checked } : x)) ?? null);
                    toggleGrocery(i.id, checked).catch(() => toast("Couldn't save — try again"));
                  }}
                >
                  <span
                    className={cx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition",
                      i.checked ? "border-accent bg-accent text-accent-text" : "border-white/30",
                    )}
                  >
                    {i.checked && <IconCheck width={14} height={14} strokeWidth={3} />}
                  </span>
                  <span className={cx("flex-1 text-[15px]", i.checked && "text-muted line-through")}>
                    {i.name}
                    {i.reason && <span className="text-muted block text-xs">{i.reason}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {items?.some((i) => i.checked) && (
          <button
            className="border-border text-muted flex w-full items-center justify-center gap-1 border-t py-2.5 text-sm"
            onClick={async () => {
              await clearCheckedGrocery();
              setItems(await fetchGrocery());
            }}
          >
            <IconTrash width={16} height={16} /> Clear ticked items
          </button>
        )}
      </Card>
    </section>
  );
}
