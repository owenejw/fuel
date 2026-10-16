"use client";

import Link from "next/link";
import { useState } from "react";
import { useConfirm } from "@/components/confirm";
import { HabitBadge, IconHabitSettings } from "@/components/habits/habit-icons";
import { useHabits } from "@/components/habits/habits-provider";
import { SortableList } from "@/components/habits/sortable";
import { IconChevronRight, IconClose, IconPlus } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Empty, Heading, Input, PageHeader, PageSkeleton, Segmented, Sheet } from "@/components/ui";
import { TIME_LABELS, scheduleLabel } from "@/lib/habits/meta";
import { HABIT_TIMES, type Habit, type HabitTime, type Routine } from "@/lib/habits/types";
import { deleteRoutine, reorderHabits, reorderRoutines, saveRoutine } from "@/server/habits/actions";

/** All your habits and routines: reorder, open, and set up routines. */
export function ManageView() {
  const { data, analyses, today, mutate } = useHabits();
  const [routineSheet, setRoutineSheet] = useState<Routine | "new" | null>(null);
  if (!data)
    return (
      <div className="pt-safe px-4 pt-20">
        <PageSkeleton />
      </div>
    );

  const active = data.habits.filter((h) => !h.archived && (!h.end_date || h.end_date >= today));
  const finished = data.habits.filter((h) => !h.archived && h.end_date && h.end_date < today);
  const archived = data.habits.filter((h) => h.archived);
  const stepsOf = (r: Routine) =>
    data.habits.filter((h) => h.routine_id === r.id && !h.archived).sort((a, b) => a.routine_position - b.routine_position);

  const row = (h: Habit, handle?: React.ReactNode) => (
    <div className="bg-surface flex items-center gap-3 px-3 py-2.5">
      {handle}
      <Link href={`/habits/${h.id}`} className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70">
        <HabitBadge icon={h.icon} color={h.color} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px]">{h.name}</span>
          <span className="text-muted block truncate text-[13px]">
            {h.kind === "break" ? "Habit to break" : `${scheduleLabel(h)} · ${TIME_LABELS[h.time_of_day]}`}
          </span>
        </span>
        <span className="text-muted tabular text-sm">{Math.round((analyses.get(h.id)?.strength ?? 0) * 100)}%</span>
        <IconChevronRight width={18} height={18} className="text-muted" />
      </Link>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Habits"
        right={
          <Link
            href="/habits/settings"
            aria-label="Habit settings"
            className="bg-surface flex h-10 w-10 items-center justify-center rounded-full active:scale-95"
          >
            <IconHabitSettings width={20} height={20} />
          </Link>
        }
      />
      <div className="space-y-5 px-4">
        <section>
          <Heading
            right={
              <button onClick={() => setRoutineSheet("new")} className="text-accent flex items-center gap-1 text-[15px] font-medium">
                <IconPlus width={16} height={16} /> Routine
              </button>
            }
          >
            Routines
          </Heading>
          {data.routines.length === 0 ? (
            <p className="text-muted text-sm">
              Chain habits that go together, like brush teeth → wash face → skincare. Each one prompts the next.
            </p>
          ) : (
            <SortableList
              className="divide-border/60 divide-y overflow-hidden rounded-3xl"
              items={data.routines}
              getId={(r) => r.id}
              onReorder={(ids) =>
                mutate(() => reorderRoutines(ids), {
                  before: (d) => ({ ...d, routines: ids.map((id, i) => ({ ...d.routines.find((r) => r.id === id)!, position: i })) }),
                })
              }
              render={(r, handle) => (
                <div className="bg-surface flex items-center gap-3 px-3 py-2.5">
                  {handle}
                  <button onClick={() => setRoutineSheet(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px]">{r.name}</span>
                      <span className="text-muted block truncate text-[13px]">
                        {TIME_LABELS[r.time_of_day]} ·{" "}
                        {stepsOf(r)
                          .map((h) => h.name)
                          .join(" → ") || "No steps"}
                      </span>
                    </span>
                    <IconChevronRight width={18} height={18} className="text-muted" />
                  </button>
                </div>
              )}
            />
          )}
        </section>

        <section>
          <Heading>Your habits</Heading>
          {active.length === 0 ? (
            <Empty>No habits yet. Tap + to add one.</Empty>
          ) : (
            <SortableList
              className="divide-border/60 divide-y overflow-hidden rounded-3xl"
              items={active}
              getId={(h) => h.id}
              onReorder={(ids) =>
                mutate(() => reorderHabits(ids), {
                  before: (d) => ({
                    ...d,
                    habits: d.habits
                      .map((h) => (ids.includes(h.id) ? { ...h, position: ids.indexOf(h.id) } : h))
                      .sort((a, b) => a.position - b.position),
                  }),
                })
              }
              render={(h, handle) => row(h, handle)}
            />
          )}
          {active.length > 1 && <p className="text-muted mt-2 px-1 text-xs">Drag the handles to change the order on Today.</p>}
        </section>

        {finished.length > 0 && (
          <section>
            <Heading>Finished challenges</Heading>
            <div className="divide-border/60 divide-y overflow-hidden rounded-3xl">
              {finished.map((h) => (
                <div key={h.id}>{row(h)}</div>
              ))}
            </div>
          </section>
        )}

        {archived.length > 0 && (
          <section>
            <Heading>Archived</Heading>
            <div className="divide-border/60 divide-y overflow-hidden rounded-3xl opacity-70">
              {archived.map((h) => (
                <div key={h.id}>{row(h)}</div>
              ))}
            </div>
          </section>
        )}
      </div>

      <Sheet open={!!routineSheet} onClose={() => setRoutineSheet(null)} title={routineSheet === "new" ? "New routine" : "Edit routine"}>
        {routineSheet && (
          <RoutineEditor
            key={routineSheet === "new" ? "new" : routineSheet.id}
            routine={routineSheet === "new" ? null : routineSheet}
            steps={routineSheet === "new" ? [] : stepsOf(routineSheet)}
            candidates={active.filter((h) => h.kind === "build")}
            onDone={() => setRoutineSheet(null)}
          />
        )}
      </Sheet>
    </>
  );
}

function RoutineEditor({
  routine,
  steps,
  candidates,
  onDone,
}: {
  routine: Routine | null;
  steps: Habit[];
  candidates: Habit[];
  onDone: () => void;
}) {
  const { mutate, data } = useHabits();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(routine?.name ?? "");
  const [time, setTime] = useState<HabitTime>(routine?.time_of_day ?? "evening");
  const [ids, setIds] = useState<string[]>(steps.map((h) => h.id));
  const [busy, setBusy] = useState(false);
  const byId = new Map(candidates.map((h) => [h.id, h]));
  const chosen = ids.map((id) => byId.get(id)).filter((h): h is Habit => !!h);
  const others = candidates.filter((h) => !ids.includes(h.id));
  const inOther = (h: Habit) =>
    h.routine_id && h.routine_id !== routine?.id ? data?.routines.find((r) => r.id === h.routine_id)?.name : null;

  return (
    <div className="space-y-4">
      <Input label="Name" placeholder="e.g. Wind down" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <Segmented
        label="Time of day"
        value={time}
        onChange={setTime}
        options={HABIT_TIMES.map((t) => ({ value: t, label: TIME_LABELS[t] }))}
      />

      <div>
        <span className="text-muted mb-1 block text-sm">Steps, in order</span>
        {chosen.length === 0 ? (
          <p className="text-muted bg-surface rounded-2xl p-4 text-sm">
            Add habits below. You&apos;ll be prompted for the next one as you tick each off.
          </p>
        ) : (
          <SortableList
            className="divide-border/60 divide-y overflow-hidden rounded-2xl"
            items={chosen}
            getId={(h) => h.id}
            onReorder={setIds}
            render={(h, handle) => (
              <div className="bg-surface flex items-center gap-3 px-3 py-2">
                {handle}
                <span className="text-muted tabular w-4 text-sm">{ids.indexOf(h.id) + 1}</span>
                <HabitBadge icon={h.icon} color={h.color} size={30} />
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                <button
                  onClick={() => setIds((x) => x.filter((i) => i !== h.id))}
                  className="text-muted p-2"
                  aria-label={`Remove ${h.name}`}
                >
                  <IconClose width={16} height={16} />
                </button>
              </div>
            )}
          />
        )}
      </div>

      {others.length > 0 && (
        <div>
          <span className="text-muted mb-1 block text-sm">Add a step</span>
          <div className="flex flex-wrap gap-2">
            {others.map((h) => (
              <button
                key={h.id}
                onClick={() => setIds((x) => [...x, h.id])}
                className="bg-surface flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-sm transition active:scale-95"
              >
                <HabitBadge icon={h.icon} color={h.color} size={24} />
                {h.name}
                {inOther(h) && <span className="text-muted text-xs">({inOther(h)})</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={busy || !name.trim() || !ids.length}
        onClick={async () => {
          setBusy(true);
          try {
            await mutate(() => saveRoutine({ name, time_of_day: time, habitIds: ids }, routine?.id), {
              after: (d, rid) => ({
                ...d,
                routines: [
                  ...d.routines.filter((r) => r.id !== rid),
                  { id: rid, name: name.trim(), time_of_day: time, position: routine?.position ?? d.routines.length },
                ].sort((a, b) => a.position - b.position),
                habits: d.habits.map((h) =>
                  ids.includes(h.id)
                    ? { ...h, routine_id: rid, routine_position: ids.indexOf(h.id), time_of_day: time }
                    : h.routine_id === rid
                      ? { ...h, routine_id: null }
                      : h,
                ),
              }),
            });
            toast(routine ? "Routine saved" : "Routine added");
            onDone();
          } catch {
            toast("Couldn't save the routine");
          } finally {
            setBusy(false);
          }
        }}
      >
        Save routine
      </Button>
      {routine && (
        <Button
          variant="ghost"
          className="text-danger w-full"
          onClick={async () => {
            if (
              !(await confirm({
                title: `Delete ${routine.name}?`,
                message: "Its habits stay; they just won't be chained.",
                confirm: "Delete",
                danger: true,
              }))
            )
              return;
            await mutate(() => deleteRoutine(routine.id), {
              after: (d) => ({
                ...d,
                routines: d.routines.filter((r) => r.id !== routine.id),
                habits: d.habits.map((h) => (h.routine_id === routine.id ? { ...h, routine_id: null } : h)),
              }),
            });
            onDone();
          }}
        >
          Delete routine
        </Button>
      )}
    </div>
  );
}
