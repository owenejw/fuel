"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { FuellingCard } from "@/components/fuelling-card";
import { IconPlus, IconTrash } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, Input, PageHeader, Select, Sheet, Spinner, cx } from "@/components/ui";
import { getDay } from "@/lib/data";
import { addDays, friendlyDate, parseDate, today } from "@/lib/dates";
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
  const [start, setStart] = useState(today());
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
              className="bg-surface-2 rounded-full px-3 py-1.5 text-sm"
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
              {syncing ? "Syncing…" : "Sync calendar"}
            </button>
          ) : (
            <Link href="/settings" className="text-accent text-sm">
              Connect calendar
            </Link>
          )
        }
      />
      <div className="space-y-3 px-4">
        <div className="flex items-center justify-between text-sm">
          <button onClick={() => setStart(addDays(start, -7))} className="text-accent rounded-lg px-2 py-1">
            ← Earlier
          </button>
          <span className="text-muted">
            {parseDate(start).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} –{" "}
            {parseDate(addDays(start, 6)).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </span>
          <button onClick={() => setStart(addDays(start, 7))} className="text-accent rounded-lg px-2 py-1">
            Later →
          </button>
        </div>

        {!plans ? (
          <div className="text-muted flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <Card>
            <ul className="divide-border divide-y">
              {plans.map((p) => (
                <li key={p.date} className={cx(p.date === selected && "bg-surface-2/60")}>
                  <div className="flex items-center gap-2 px-4 pt-2.5">
                    <button onClick={() => setSelected(p.date)} className="flex-1 text-left">
                      <span className="font-medium">{friendlyDate(p.date)}</span>
                      <span
                        className={cx(
                          "ml-2 rounded-full px-2 py-0.5 text-xs",
                          p.training ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
                        )}
                      >
                        {p.training ? "Training" : "Rest"}
                      </span>
                      {p.carbLoadingFor && <span className="bg-carbs/15 text-carbs ml-1 rounded-full px-2 py-0.5 text-xs">Carb load</span>}
                    </button>
                    <button
                      onClick={() => setEditing({ date: p.date })}
                      className="text-accent rounded-full p-2"
                      aria-label={`Add workout on ${friendlyDate(p.date)}`}
                    >
                      <IconPlus width={20} height={20} />
                    </button>
                  </div>
                  <ul className="px-4 pb-2.5">
                    {p.workouts.length === 0 && <li className="text-muted text-xs">No sessions</li>}
                    {p.workouts.map((w) => (
                      <li key={w.id} className="flex items-center gap-2 py-1">
                        <input
                          type="checkbox"
                          aria-label="Completed"
                          className="h-5 w-5 accent-[var(--accent)]"
                          checked={w.completed}
                          onChange={async (e) => {
                            await setWorkoutCompleted(w.id, e.target.checked);
                            load();
                          }}
                        />
                        <button onClick={() => setEditing({ workout: w, date: w.date })} className="min-w-0 flex-1 text-left text-sm">
                          <span className={cx(w.completed && "text-muted line-through")}>{w.title || WORKOUT_LABELS[w.type]}</span>
                          <span className="text-muted text-xs">
                            {w.start_time ? ` · ${fmtMin(toMin(w.start_time))}` : ""}
                            {w.duration_min ? ` · ${w.duration_min} min` : ""} · {w.intensity}
                            {w.is_race ? " · race" : ""}
                            {w.source === "calendar" ? " · 📅" : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {day && day.plan.workouts.some((w) => w.type !== "rest") && (
          <>
            <h2 className="text-muted pt-2 text-sm font-semibold tracking-wide uppercase">{friendlyDate(selected)} · fuelling</h2>
            <FuellingCard
              items={day.fuelling}
              workouts={day.plan.workouts}
              nowMin={new Date().getHours() * 60 + new Date().getMinutes()}
              isToday={selected === today()}
            />
          </>
        )}
        {day?.plan.carbLoadingFor && (
          <p className="bg-accent-soft text-accent rounded-xl px-3 py-2 text-sm">
            {day.plan.carbLoadingFor} is coming up — carbs for {friendlyDate(selected).toLowerCase()} are raised to{" "}
            {day.plan.targets.carbs_g} g (about 8 g/kg).
          </p>
        )}

        <GroceryList />
      </div>

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
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Type"
          value={w.type}
          onChange={(v) => set("type", v as WorkoutType)}
          options={WORKOUT_TYPES.map((t) => ({ value: t, label: WORKOUT_LABELS[t] }))}
        />
        <Select
          label="Intensity"
          value={w.intensity}
          onChange={(v) => set("intensity", v as Intensity)}
          options={[
            { value: "easy", label: "Easy" },
            { value: "moderate", label: "Moderate" },
            { value: "hard", label: "Hard" },
          ]}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Date" type="date" value={w.date} onChange={(e) => set("date", e.target.value)} required />
        <Input label="Start" type="time" value={w.start_time ?? ""} onChange={(e) => set("start_time", e.target.value || null)} />
        <Input
          label="Minutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={1440}
          value={w.duration_min ?? ""}
          onChange={(e) => set("duration_min", e.target.value ? Number(e.target.value) : null)}
        />
      </div>
      <Input label="Title (optional)" placeholder="e.g. City2Surf" value={w.title ?? ""} onChange={(e) => set("title", e.target.value)} />
      <label className="flex items-center justify-between text-sm">
        It&apos;s a race (carb-load the 2 days before)
        <input
          type="checkbox"
          className="h-6 w-6 accent-[var(--accent)]"
          checked={w.is_race}
          onChange={(e) => set("is_race", e.target.checked)}
        />
      </label>
      <label className="flex items-center justify-between text-sm">
        Completed
        <input
          type="checkbox"
          className="h-6 w-6 accent-[var(--accent)]"
          checked={w.completed}
          onChange={(e) => set("completed", e.target.checked)}
        />
      </label>
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
    <section className="pt-2">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">Grocery list</h2>
        <button
          disabled={busy}
          className="text-accent text-sm"
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
          {busy ? "Building…" : "Suggest items"}
        </button>
      </div>
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
            className="bg-surface-2 h-10 flex-1 rounded-lg px-3 outline-none"
          />
          <Button size="sm" type="submit">
            Add
          </Button>
        </form>
        {items === null ? (
          <div className="text-muted flex justify-center py-6">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <Empty>Tap “Suggest items” to build a list from what you eat and what you&apos;re low on.</Empty>
        ) : (
          <ul className="divide-border divide-y">
            {items.map((i) => (
              <li key={i.id}>
                <label className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--accent)]"
                    checked={i.checked}
                    onChange={async (e) => {
                      setItems((all) => all?.map((x) => (x.id === i.id ? { ...x, checked: e.target.checked } : x)) ?? null);
                      await toggleGrocery(i.id, e.target.checked);
                    }}
                  />
                  <span className={cx("flex-1 text-sm", i.checked && "text-muted line-through")}>
                    {i.name}
                    {i.reason && <span className="text-muted block text-xs">{i.reason}</span>}
                  </span>
                </label>
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
