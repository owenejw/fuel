"use client";

import Link from "next/link";
import { useState } from "react";
import { IconChevronRight, IconEdit, IconMinus, IconPlus } from "../icons";
import { useConfirm } from "../confirm";
import { Button, Card, Input, Sheet, cx } from "../ui";
import { friendlyDate } from "@/lib/dates";
import { AUTO_LABELS, MOODS, habitColor } from "@/lib/habits/meta";
import { isDoneState } from "@/lib/habits/progress";
import type { Habit } from "@/lib/habits/types";
import { HabitBadge, IconSkip, IconTrend } from "./habit-icons";
import { useHabits } from "./habits-provider";

/** Everything you can do with one habit on one day: tick or count, skip, slip, and links to its pages. */
export function HabitDaySheet({ habit, date, onClose }: { habit: Habit | null; date: string; onClose: () => void }) {
  return (
    <Sheet open={!!habit} onClose={onClose} title={habit ? <SheetTitle habit={habit} date={date} /> : null}>
      {habit && <SheetBody habit={habit} date={date} onClose={onClose} />}
    </Sheet>
  );
}

function SheetTitle({ habit, date }: { habit: Habit; date: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <HabitBadge icon={habit.icon} color={habit.color} size={32} />
      <span className="min-w-0">
        <span className="block truncate">{habit.name}</span>
        <span className="text-muted block text-xs font-normal">{friendlyDate(date)}</span>
      </span>
    </span>
  );
}

function SheetBody({ habit, date, onClose }: { habit: Habit; date: string; onClose: () => void }) {
  const { analyses, setEntry, data } = useHabits();
  const confirm = useConfirm();
  const a = analyses.get(habit.id);
  const info = a?.byDate.get(date);
  const state = info?.state;
  const done = isDoneState(state);
  const count = info?.count ?? 0;
  const entry = data?.entries.find((e) => e.habit_id === habit.id && e.date === date);
  const color = habitColor(habit.color);
  const paused = state === "paused";

  const setCount = (n: number) =>
    setEntry(habit, date, n <= 0 ? null : { status: "done", count: n }, n === habit.target ? { toast: `${habit.name} done` } : undefined);

  return (
    <div className="space-y-4 pt-1">
      {paused && <p className="text-muted text-sm">You&apos;re on vacation, so this day doesn&apos;t count.</p>}

      {habit.kind === "break" ? (
        <Card className="space-y-3 p-4 text-center">
          <div className="tabular text-5xl font-bold" style={{ color }}>
            {a?.streak ?? 0}
          </div>
          <div className="text-muted text-sm">days since your last slip · best {a?.best ?? 0}</div>
          {state === "slip" ? (
            <Button variant="secondary" className="w-full" onClick={() => setEntry(habit, date, null)}>
              Undo slip
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              disabled={paused}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Log a slip?",
                    message: "Your count goes back to zero. Strength only dips a little.",
                    confirm: "Log slip",
                  })
                )
                  setEntry(habit, date, { status: "slip", count: 0 }, { toast: "Slip logged" });
              }}
            >
              I slipped {friendlyDate(date).toLowerCase()}
            </Button>
          )}
        </Card>
      ) : habit.target > 1 && !habit.auto_source ? (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setCount(count - 1)}
              disabled={paused || count <= 0}
              className="bg-surface-2 flex h-14 w-14 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-40"
              aria-label="One less"
            >
              <IconMinus width={24} height={24} />
            </button>
            <div className="text-center">
              <div className="tabular text-5xl leading-none font-bold" style={{ color: done ? color : undefined }}>
                {count}
                <span className="text-muted text-2xl font-semibold">/{habit.target}</span>
              </div>
              {habit.unit && <div className="text-muted mt-1 text-sm">{habit.unit}</div>}
            </div>
            <button
              onClick={() => setCount(count + 1)}
              disabled={paused}
              className="flex h-14 w-14 items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-40"
              style={{ background: color }}
              aria-label="One more"
            >
              <IconPlus width={24} height={24} strokeWidth={2.6} />
            </button>
          </div>
        </Card>
      ) : (
        <Button
          className="w-full"
          size="lg"
          disabled={paused || (info?.auto && !entry)}
          style={done ? undefined : { background: color, color: "#fff" }}
          variant={done ? "secondary" : "primary"}
          onClick={() =>
            setEntry(habit, date, done ? null : { status: "done", count: 1 }, done ? undefined : { toast: `${habit.name} done` })
          }
        >
          {info?.auto && !entry ? "Done from your nutrition log" : done ? "Mark as not done" : "Mark as done"}
        </Button>
      )}

      {habit.auto_source && (
        <p className="text-muted text-xs">
          {AUTO_LABELS[habit.auto_source].hint}. It&apos;s read from your nutrition log and never changes it.
        </p>
      )}

      {habit.kind === "build" && !done && !paused && (
        <button
          onClick={() =>
            setEntry(
              habit,
              date,
              state === "skipped" ? null : { status: "skipped", count: 0 },
              state === "skipped" ? undefined : { toast: "Skipped" },
            )
          }
          className="bg-surface flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:bg-white/5"
        >
          <IconSkip width={20} height={20} className="text-muted" />
          <span className="flex-1">
            {state === "skipped" ? "Unskip" : "Skip this day"}
            <span className="text-muted block text-xs">Doesn&apos;t count as a miss or break your streak</span>
          </span>
        </button>
      )}

      <div className="bg-surface divide-border divide-y overflow-hidden rounded-2xl">
        <Link href={`/habits/${habit.id}`} onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-white/5">
          <IconTrend width={20} height={20} className="text-accent" />
          <span className="flex-1">Progress</span>
          <span className="text-muted tabular text-sm">{Math.round((a?.strength ?? 0) * 100)}% strength</span>
          <IconChevronRight width={18} height={18} className="text-muted" />
        </Link>
        <Link href={`/habits/${habit.id}/edit`} onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-white/5">
          <IconEdit width={20} height={20} className="text-accent" />
          <span className="flex-1">Edit habit</span>
          <IconChevronRight width={18} height={18} className="text-muted" />
        </Link>
      </div>
    </div>
  );
}

/** "How was today?": a mood and a one-line note for the day. */
export function MoodCard({ date }: { date: string }) {
  const { data, saveDay } = useHabits();
  const day = data?.days.find((d) => d.date === date);
  const [draft, setDraft] = useState<{ date: string; note: string } | null>(null);
  const note = draft?.date === date ? draft.note : (day?.note ?? "");
  const commit = () => {
    if (draft?.date !== date) return;
    if ((day?.note ?? "") !== draft.note.trim()) saveDay(date, { note: draft.note.trim() || null, mood: day?.mood ?? null });
    setDraft(null);
  };
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-[17px] font-semibold">How was {friendlyDate(date) === "Today" ? "today" : friendlyDate(date)}?</h2>
      <div className="flex justify-between gap-1" role="radiogroup" aria-label="Mood">
        {MOODS.map((m) => {
          const on = day?.mood === m.value;
          return (
            <button
              key={m.value}
              role="radio"
              aria-checked={on}
              aria-label={m.label}
              onClick={() => saveDay(date, { note: day?.note ?? null, mood: on ? null : m.value })}
              className={cx(
                "flex h-12 flex-1 items-center justify-center rounded-2xl text-[26px] transition active:scale-90",
                on ? "bg-accent-soft scale-105" : "opacity-60 grayscale-[0.4]",
              )}
            >
              {m.emoji}
            </button>
          );
        })}
      </div>
      <Input
        className="mt-3"
        placeholder="Add a one-line note"
        maxLength={140}
        value={note}
        onChange={(e) => setDraft({ date, note: e.target.value })}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        enterKeyHint="done"
      />
    </Card>
  );
}
