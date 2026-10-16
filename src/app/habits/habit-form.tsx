"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/confirm";
import { HABIT_ICONS, HabitBadge, ICON_KEYS } from "@/components/habits/habit-icons";
import { useHabits } from "@/components/habits/habits-provider";
import { IconChevronRight } from "@/components/icons";
import { useToast } from "@/components/toast";
import { BackButton, Button, Card, Input, PageHeader, PageSkeleton, Pills, Segmented, Sheet, Stepper, Toggle, cx } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { AUTO_LABELS, COLOR_KEYS, TEMPLATES, TIME_LABELS, WEEKDAY_SHORT, blankHabit, habitColor } from "@/lib/habits/meta";
import { AUTO_SOURCES, HABIT_TIMES, type AutoSource, type HabitInput } from "@/lib/habits/types";
import { deleteHabit, saveHabit, setHabitArchived } from "@/server/habits/actions";

/** Create a habit, or with `edit`, edit the one in the URL. */
export function HabitForm({ edit }: { edit?: boolean }) {
  const params = useParams<{ id?: string }>();
  const id = edit ? params.id : undefined;
  const { data, today } = useHabits();
  if (!data)
    return (
      <div className="pt-safe px-4 pt-20">
        <PageSkeleton />
      </div>
    );
  const existing = id ? data.habits.find((h) => h.id === id) : undefined;
  if (id && !existing) return <PageHeader title="Habit not found" left={<BackButton href="/habits/manage" />} />;
  return <Form key={id ?? "new"} id={id} initial={existing ?? null} today={today} />;
}

function Form({ id, initial, today }: { id?: string; initial: (HabitInput & { archived?: boolean }) | null; today: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { mutate } = useHabits();
  const template = TEMPLATES.find((t) => t.name === params.get("template"));
  const [h, setH] = useState<HabitInput>(() => (initial ? { ...initial } : blankHabit(today, template)));
  const [iconsOpen, setIconsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<HabitInput>) => setH((cur) => ({ ...cur, ...patch }));
  const color = habitColor(h.color);
  const isCount = h.target > 1;
  const isBreak = h.kind === "break";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!h.name.trim()) return toast("Give your habit a name");
    if (h.schedule === "weekdays" && !h.weekdays) return toast("Pick at least one day");
    setBusy(true);
    try {
      await mutate(() => saveHabit({ ...h, unit: h.unit?.trim() || null }, id));
      toast(id ? "Saved" : `${h.name.trim()} added`);
      router.push(id ? `/habits/${id}` : "/habits");
    } catch {
      toast("Couldn't save. Check the details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={id ? "Edit habit" : "New habit"} left={<BackButton href={id ? `/habits/${id}` : undefined} />} />
      <form onSubmit={submit} className="space-y-4 px-4 pb-8">
        {/* Live preview */}
        <div className="flex flex-col items-center gap-3 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setIconsOpen(true)}
            className="rounded-full transition active:scale-95"
            aria-label="Choose icon"
          >
            <HabitBadge icon={h.icon} color={h.color} size={84} />
          </button>
          <div className="flex flex-wrap justify-center gap-2 p-1" role="radiogroup" aria-label="Colour">
            {COLOR_KEYS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={h.color === c}
                aria-label={c}
                onClick={() => set({ color: c })}
                className={cx(
                  "h-7 w-7 shrink-0 rounded-full transition active:scale-90",
                  h.color === c && "ring-2 ring-white ring-offset-2 ring-offset-black",
                )}
                style={{ background: habitColor(c) }}
              />
            ))}
          </div>
        </div>

        <Card className="space-y-4 p-4">
          <Input
            label="Name"
            placeholder="e.g. Stretch"
            value={h.name}
            maxLength={60}
            onChange={(e) => set({ name: e.target.value })}
            autoFocus={!id}
          />
          <Segmented
            label="Type"
            value={h.kind}
            onChange={(kind) => set({ kind, ...(kind === "break" ? { target: 1, auto_source: null, schedule: "daily" } : {}) })}
            options={[
              { value: "build", label: "Build" },
              { value: "break", label: "Break" },
            ]}
          />
          {isBreak && (
            <p className="text-muted text-sm">
              Shown as days since your last slip. Log a slip when it happens; everything else counts as a win.
            </p>
          )}
        </Card>

        {!isBreak && (
          <>
            <Card className="space-y-4 p-4">
              <Segmented
                label="Complete it by"
                value={h.auto_source ? "auto" : isCount ? "count" : "check"}
                onChange={(v) =>
                  set(
                    v === "check"
                      ? { target: 1, unit: null, auto_source: null }
                      : v === "count"
                        ? { target: Math.max(2, h.target), auto_source: null }
                        : { target: 1, unit: null, auto_source: h.auto_source ?? "water_goal" },
                  )
                }
                options={[
                  { value: "check", label: "Ticking" },
                  { value: "count", label: "Counting" },
                  { value: "auto", label: "Nutrition" },
                ]}
              />
              {isCount && !h.auto_source && (
                <div className="grid grid-cols-2 gap-3">
                  <Stepper label="Target" value={h.target} min={2} max={100} onChange={(v) => set({ target: v ?? 2 })} />
                  <Input
                    label="Unit"
                    placeholder="glasses"
                    value={h.unit ?? ""}
                    maxLength={20}
                    onChange={(e) => set({ unit: e.target.value })}
                  />
                </div>
              )}
              {h.auto_source && (
                <div className="space-y-2" role="radiogroup" aria-label="Nutrition goal">
                  {AUTO_SOURCES.map((s: AutoSource) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={h.auto_source === s}
                      onClick={() => set({ auto_source: s })}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.98]",
                        h.auto_source === s ? "border-accent bg-accent-soft/60" : "border-border bg-surface",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{AUTO_LABELS[s].label}</span>
                        <span className="text-muted block text-xs">{AUTO_LABELS[s].hint}</span>
                      </span>
                    </button>
                  ))}
                  <p className="text-muted text-xs">Read from your nutrition log. Habits never change anything there.</p>
                </div>
              )}
            </Card>

            <Card className="space-y-4 p-4">
              <Segmented
                label="Time of day"
                value={h.time_of_day}
                onChange={(time_of_day) => set({ time_of_day })}
                options={HABIT_TIMES.map((t) => ({ value: t, label: TIME_LABELS[t] }))}
              />
              <Segmented
                label="How often"
                value={h.schedule}
                onChange={(schedule) => set({ schedule })}
                options={[
                  { value: "daily", label: "Every day" },
                  { value: "weekdays", label: "Some days" },
                  { value: "per_week", label: "Per week" },
                ]}
              />
              {h.schedule === "weekdays" && (
                <div className="flex gap-1.5" role="group" aria-label="Days">
                  {WEEKDAY_SHORT.map((d, i) => {
                    const on = ((h.weekdays >> i) & 1) === 1;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        aria-label={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}
                        onClick={() => set({ weekdays: h.weekdays ^ (1 << i) || h.weekdays })}
                        className={cx(
                          "h-10 flex-1 rounded-full text-sm font-semibold transition active:scale-90",
                          on ? "text-white" : "bg-surface-2 text-muted",
                        )}
                        style={on ? { background: color } : undefined}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
              {h.schedule === "per_week" && (
                <Pills
                  label="Times a week"
                  value={h.per_week}
                  onChange={(per_week) => set({ per_week })}
                  options={[1, 2, 3, 4, 5, 6] as const}
                />
              )}
            </Card>
          </>
        )}

        <Card className="space-y-4 p-4">
          <Input label="Starts" type="date" value={h.start_date} onChange={(e) => e.target.value && set({ start_date: e.target.value })} />
          <Toggle
            label="Challenge"
            hint="Give it an end date, like 30 days"
            checked={!!h.end_date}
            onChange={(on) => set({ end_date: on ? addDays(h.start_date, 29) : null })}
          />
          {h.end_date && (
            <>
              <Pills
                label="Length"
                value={challengeLength(h.start_date, h.end_date)}
                onChange={(n) => set({ end_date: addDays(h.start_date, n - 1) })}
                options={[7, 21, 30, 66, 100] as const}
                format={(n) => `${n}d`}
              />
              <Input
                label="Ends"
                type="date"
                min={h.start_date}
                value={h.end_date}
                onChange={(e) => e.target.value && set({ end_date: e.target.value })}
              />
            </>
          )}
        </Card>

        {!isBreak && (
          <Card className="space-y-3 p-4">
            <Toggle
              label="Reminder"
              hint="Arrives within about 15 minutes of this time, if it isn't done yet"
              checked={!!h.reminder_time}
              onChange={(on) => set({ reminder_time: on ? defaultReminder(h.time_of_day) : null })}
            />
            {h.reminder_time && (
              <Input type="time" value={h.reminder_time} onChange={(e) => set({ reminder_time: e.target.value || null })} />
            )}
          </Card>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {id ? "Save" : "Add habit"}
        </Button>

        {id && initial && (
          <div className="bg-surface divide-border divide-y overflow-hidden rounded-3xl">
            <button
              type="button"
              className="text-accent flex w-full items-center px-4 py-3.5 text-left active:bg-white/5"
              onClick={async () => {
                await mutate(() => setHabitArchived(id, !initial.archived));
                toast(initial.archived ? "Restored" : "Archived. Its history is kept");
                router.push("/habits/manage");
              }}
            >
              <span className="flex-1">{initial.archived ? "Restore habit" : "Archive habit"}</span>
              <IconChevronRight width={18} height={18} className="text-muted" />
            </button>
            <button
              type="button"
              className="text-danger flex w-full items-center px-4 py-3.5 text-left active:bg-white/5"
              onClick={async () => {
                if (
                  !(await confirm({
                    title: `Delete ${initial.name}?`,
                    message: "Its whole history goes too. Archive it instead to keep it.",
                    confirm: "Delete",
                    danger: true,
                  }))
                )
                  return;
                await mutate(() => deleteHabit(id));
                router.push("/habits/manage");
              }}
            >
              Delete habit
            </button>
          </div>
        )}
      </form>

      <Sheet open={iconsOpen} onClose={() => setIconsOpen(false)} title="Icon">
        <div className="grid grid-cols-6 gap-2 pb-2">
          {ICON_KEYS.map((k) => {
            const I = HABIT_ICONS[k];
            const on = h.icon === k;
            return (
              <button
                key={k}
                type="button"
                aria-label={k}
                aria-pressed={on}
                onClick={() => {
                  set({ icon: k });
                  setIconsOpen(false);
                }}
                className={cx(
                  "flex aspect-square items-center justify-center rounded-2xl transition active:scale-90",
                  on ? "text-white" : "bg-white/8 text-white/85",
                )}
                style={on ? { background: color } : undefined}
              >
                <I width={22} height={22} />
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

const challengeLength = (start: string, end: string) => Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1;
const defaultReminder = (t: HabitInput["time_of_day"]) => (t === "morning" ? "07:30" : t === "evening" ? "20:30" : "12:00");
