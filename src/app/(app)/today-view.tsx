"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { FoodSheet } from "@/components/food-sheet";
import { IconIdea, IconPlus, IconStreak, WORKOUT_ICONS } from "@/components/icons";
import { METRIC, Rings } from "@/components/rings";
import { SuggestionsCard } from "@/components/suggestions-card";
import { AvatarLink, BigStat, MiniBars, Tile, WeekStrip } from "@/components/summary";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/ui";
import { addWater } from "@/lib/data";
import { friendlyDate, today } from "@/lib/dates";
import { toUnit, unitLabel } from "@/lib/energy";
import { fmtMin } from "@/lib/fuelling";
import { greeting } from "@/lib/greeting";
import { useDay, type WeekDay } from "@/lib/hooks";
import { fluidTargetMl } from "@/lib/nrv";
import { sumNutrients } from "@/lib/nutrients";
import { defaultSlot } from "@/lib/slots";
import { computeStreak } from "@/lib/streak";
import { SLOT_LABELS, WORKOUT_LABELS, type Food, type LogEntry, type Workout } from "@/lib/types";
import { fetchSummary } from "@/server/actions/summary";

const kj = (n: number, unit: "kj" | "kcal") => Math.round(toUnit(n, unit)).toLocaleString("en-AU");

/** Today: an at-a-glance summary. Every card opens a more detailed page. */
export function TodayView() {
  const toast = useToast();
  const { unit, profile } = useApp();
  const date = today();
  const { day, entries, add, remove, setDay } = useDay(date);
  const [version, setVersion] = useState(0);

  const [openFood, setOpenFood] = useState<Food | null>(null);
  const [now] = useState(() => new Date());

  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchSummary>> | null>(null);
  const entryCount = entries?.length ?? 0;
  useEffect(() => {
    fetchSummary(date).then(setSummary, () => undefined);
  }, [date, entryCount, version]);
  const week = summary?.week ?? null;
  const weights = summary?.weights ?? null;
  const loggedDays = summary?.loggedDays ?? null;
  const streak = useMemo(() => (loggedDays ? computeStreak(loggedDays, date) : null), [loggedDays, date]);

  const t = useMemo(() => sumNutrients((entries ?? []).map((e) => e.nutrients)).totals, [entries]);
  const targets = day?.plan.targets;

  const undo = (added: LogEntry[]) => ({
    label: "Undo",
    onClick: () => {
      remove(added.map((x) => x.id)).catch(() => toast("Could not undo"));
    },
  });

  return (
    <>
      <header className="pt-safe px-4">
        <div className="flex items-end gap-3 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <div className="text-muted text-[13px] font-semibold tracking-wide uppercase">
              {now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">
              {greeting(profile.name, date, now.getHours(), profile.id)}
            </h1>
          </div>
          <AvatarLink />
        </div>
        <WeekStrip days={week} selected={date} href={(d) => `/nutrition?date=${d}`} />
      </header>

      <div className="mt-3 space-y-3 px-4">
        {!day || !targets ? (
          <div className="text-muted flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <>
            {day.plan.source === "placeholder" && (
              <Link href="/onboarding" className="bg-surface flex items-center gap-3 rounded-3xl p-4 active:scale-[0.98]">
                <span className="bg-accent/15 text-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                  <IconIdea width={20} height={20} />
                </span>
                <span className="flex-1 text-sm">Set up your height, birth date and weight to get your own targets.</span>
              </Link>
            )}

            {/* Rings */}
            <Tile title="Today's rings" href={`/nutrition?date=${date}`}>
              <div className="flex items-center gap-4">
                <Rings
                  size={148}
                  stroke={17}
                  gap={2}
                  rings={[
                    { ...METRIC.energy, value: t.energy_kj ?? 0, target: targets.energy_kj },
                    { ...METRIC.protein, value: t.protein_g ?? 0, target: targets.protein_g },
                    { ...METRIC.carbs, value: t.carbs_g ?? 0, target: targets.carbs_g },
                  ]}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <BigStat
                    label="Energy"
                    value={kj(t.energy_kj ?? 0, unit)}
                    target={kj(targets.energy_kj, unit)}
                    unit={unitLabel(unit)}
                    color={METRIC.energy.color}
                    size="md"
                  />
                  <BigStat
                    label="Protein"
                    value={String(Math.round(t.protein_g ?? 0))}
                    target={String(Math.round(targets.protein_g))}
                    unit="g"
                    color={METRIC.protein.color}
                    size="md"
                  />
                  <BigStat
                    label="Carbs"
                    value={String(Math.round(t.carbs_g ?? 0))}
                    target={String(Math.round(targets.carbs_g))}
                    unit="g"
                    color={METRIC.carbs.color}
                    size="md"
                  />
                </div>
              </div>
              <div className="border-border mt-4 grid grid-cols-2 gap-3 border-t pt-3">
                <BigStat
                  label="Fat"
                  value={String(Math.round(t.fat_g ?? 0))}
                  target={String(Math.round(targets.fat_g))}
                  unit="g"
                  color={METRIC.fat.color}
                  size="md"
                />
                <BigStat
                  label="Fibre"
                  value={String(Math.round(t.fibre_g ?? 0))}
                  target={String(Math.round(targets.fibre_g))}
                  unit="g"
                  color={METRIC.fibre.color}
                  size="md"
                />
              </div>
            </Tile>

            <div className="grid grid-cols-2 gap-3">
              {/* Diary */}
              <Tile title="Diary" href="/diary">
                <div className="text-[15px]">Today</div>
                <BigStat value={String(entryCount)} unit={entryCount === 1 ? " food" : " foods"} color="var(--text)" />
                <MiniBars
                  height={44}
                  color={METRIC.energy.color}
                  values={(["breakfast", "lunch", "dinner", "snack"] as const).map(
                    (s) => sumNutrients((entries ?? []).filter((e) => e.slot === s).map((e) => e.nutrients)).totals.energy_kj ?? 0,
                  )}
                  labels={["B", "L", "D", "S"]}
                />
              </Tile>

              {/* Water */}
              <WaterTile
                ml={day.waterMl}
                target={fluidTargetMl(profile.sex)}
                onAdd={async (amount) => {
                  try {
                    const ml = await addWater(date, amount);
                    setDay((d) => ({ ...d, waterMl: ml }));
                  } catch {
                    toast("Could not save water");
                  }
                }}
              />

              {/* Streak */}
              <Tile title="Streak" href="/trends">
                <div className="text-[15px]">Days logged</div>
                <BigStat value={String(streak?.days ?? 0)} unit={streak?.days === 1 ? " day" : " days"} color={METRIC.fat.color} />
                <div className="mt-3 flex gap-1">
                  {(streak?.week ?? []).map((d) => (
                    <span
                      key={d.date}
                      className="h-1.5 flex-1 rounded-full"
                      style={{ background: d.logged ? METRIC.fat.color : d.future ? "var(--surface-2)" : "var(--border)" }}
                    />
                  ))}
                </div>
                <div className="text-muted mt-1 flex items-center gap-1 text-xs">
                  <IconStreak width={12} height={12} /> {streak?.week.filter((d) => d.logged).length ?? 0} of 7 this week
                </div>
              </Tile>

              {/* Week average */}
              <Tile title="This week" href="/trends">
                <div className="text-[15px]">Avg energy</div>
                <WeekAverage week={week} unit={unit} />
              </Tile>

              {/* Training */}
              <Tile title="Training" href="/plan">
                <TrainingSummary workouts={day.plan.workouts} training={day.plan.training} />
              </Tile>

              {/* Weight */}
              <Tile title="Weight" href="/trends">
                <WeightSummary weights={weights} />
              </Tile>
            </div>

            <SuggestionsCard
              date={date}
              slot={defaultSlot()}
              unit={unit}
              aiEnabled={profile.ai_enabled}
              version={version}
              onOpenFood={setOpenFood}
              onAdd={async (items, label) => {
                const added = await add(items);
                setVersion((v) => v + 1);
                toast(`Added ${label} to ${SLOT_LABELS[items[0].slot]}`, undo(added));
              }}
            />
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
          const added = await add([e]);
          setOpenFood(null);
          setVersion((v) => v + 1);
          toast(`Added ${e.name} to ${SLOT_LABELS[e.slot]} · ${friendlyDate(e.date)}`, undo(added));
        }}
      />
    </>
  );
}

function WaterTile({ ml, target, onAdd }: { ml: number; target: number; onAdd: (ml: number) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const glasses = Math.round(target / 250);
  const filled = Math.floor(ml / 250);
  return (
    <Tile title="Water">
      <div className="text-[15px]">Today</div>
      <BigStat value={String(Math.round(ml / 10) / 100)} target={(target / 1000).toFixed(1)} unit="L" color={METRIC.water.color} />
      <div className="mt-2 flex flex-wrap gap-1">
        {Array.from({ length: glasses }, (_, i) => (
          <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < filled ? METRIC.water.color : "var(--surface-2)" }} />
        ))}
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onAdd(250);
          setBusy(false);
        }}
        className="mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-full text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, var(--water), var(--water-2))" }}
      >
        <IconPlus width={16} height={16} strokeWidth={2.6} /> 250 ml
      </button>
    </Tile>
  );
}

function WeekAverage({ week, unit }: { week: WeekDay[] | null; unit: "kj" | "kcal" }) {
  if (!week) return <Spinner className="text-muted mt-2" />;
  const logged = week.filter((d) => d.logged);
  const avg = logged.length ? logged.reduce((a, d) => a + (d.totals.energy_kj ?? 0), 0) / logged.length : 0;
  const avgTarget = week.reduce((a, d) => a + d.targets.energy_kj, 0) / week.length;
  return (
    <>
      <BigStat value={logged.length ? kj(avg, unit) : "–"} unit={unitLabel(unit)} color={METRIC.energy.color} />
      <div className="mt-2">
        <MiniBars
          height={40}
          color={METRIC.energy.color}
          values={week.map((d) => d.totals.energy_kj ?? 0)}
          target={avgTarget}
          labels={["M", "T", "W", "T", "F", "S", "S"]}
          highlight={week.findIndex((d) => d.date === today())}
        />
      </div>
    </>
  );
}

function TrainingSummary({ workouts, training }: { workouts: Workout[]; training: boolean }) {
  const sessions = workouts.filter((w) => w.type !== "rest");
  if (!sessions.length)
    return (
      <>
        <div className="text-[15px]">Today</div>
        <BigStat value={training ? "Training" : "Rest"} color={METRIC.carbs.color} size="md" />
        <div className="text-muted mt-1 text-xs">No sessions planned</div>
      </>
    );
  const w = sessions[0];
  const WIcon = WORKOUT_ICONS[w.type];
  return (
    <>
      <span className="bg-protein/15 text-protein mb-2 flex h-10 w-10 items-center justify-center rounded-full">
        <WIcon width={20} height={20} />
      </span>
      <div className="truncate text-[15px]">{w.title || WORKOUT_LABELS[w.type]}</div>
      <BigStat value={w.duration_min ? String(w.duration_min) : "–"} unit="min" color={METRIC.protein.color} size="md" />
      <div className="text-muted mt-1 text-xs">
        {w.start_time ? fmtMin(Number(w.start_time.slice(0, 2)) * 60 + Number(w.start_time.slice(3, 5))) : "Today"}
        {sessions.length > 1 ? ` · +${sessions.length - 1} more` : ""}
      </div>
    </>
  );
}

function WeightSummary({ weights }: { weights: { date: string; kg: number }[] | null }) {
  if (!weights) return <Spinner className="text-muted mt-2" />;
  if (!weights.length)
    return (
      <>
        <div className="text-[15px]">Latest</div>
        <BigStat value="No data" color="var(--water-2)" size="md" />
        <div className="text-muted mt-1 text-xs">Log a weigh-in in Trends</div>
      </>
    );
  const last = weights[weights.length - 1];
  const first = weights[0];
  const diff = Math.round((last.kg - first.kg) * 10) / 10;
  return (
    <>
      <div className="text-[15px]">Latest</div>
      <BigStat value={last.kg.toFixed(1)} unit="kg" color="var(--water-2)" />
      <div className="text-muted mt-1 text-xs">
        {weights.length > 1 ? `${diff > 0 ? "+" : ""}${diff} kg in 30 days` : friendlyDate(last.date)}
      </div>
    </>
  );
}
