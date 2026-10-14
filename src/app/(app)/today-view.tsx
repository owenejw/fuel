"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { FoodSheet } from "@/components/food-sheet";
import { IconDumbbell, IconIdea, IconPlus, IconRest, IconStreak, WORKOUT_ICONS } from "@/components/icons";
import { METRIC } from "@/components/rings";
import { SuggestionsCard } from "@/components/suggestions-card";
import { WaterSheet } from "@/components/water-sheet";
import { saveWaterBottles } from "@/server/actions/profile";
import { AvatarLink, BigStat, ChevronBadge, EnergyCard, MiniBars, Tile } from "@/components/summary";
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
import { cacheGet, cacheSet } from "@/lib/offline";

type Summary = Awaited<ReturnType<typeof fetchSummary>>;

const kj = (n: number, unit: "kj" | "kcal") => Math.round(toUnit(n, unit)).toLocaleString("en-AU");

/** Today: an at-a-glance summary. Every card opens a more detailed page. */
export function TodayView() {
  const toast = useToast();
  const { unit, profile, profileId, setProfile } = useApp();
  const date = today();
  const { day, entries, add, remove, setDay } = useDay(date);
  const [version, setVersion] = useState(0);

  const [openFood, setOpenFood] = useState<Food | null>(null);
  const [now] = useState(() => new Date());

  // Show the last summary instantly, then refresh it.
  const [summary, setSummary] = useState<Summary | null>(() => cacheGet<Summary>(profileId, `summary:${date}`));
  const entryCount = entries?.length ?? 0;
  useEffect(() => {
    fetchSummary(date).then(
      (s) => {
        setSummary(s);
        cacheSet(profileId, `summary:${date}`, s);
      },
      () => undefined,
    );
  }, [date, entryCount, version, profileId]);
  const week = summary?.week ?? null;
  const weights = summary?.weights ?? null;
  const loggedDays = summary?.loggedDays ?? null;
  const streak = useMemo(() => (loggedDays ? computeStreak(loggedDays, date) : null), [loggedDays, date]);

  const t = useMemo(() => sumNutrients((entries ?? []).map((e) => e.nutrients)).totals, [entries]);
  const targets = day?.plan.targets;

  const [waterOpen, setWaterOpen] = useState(false);
  const addWaterMl = async (amount: number) => {
    setDay((d) => ({ ...d, waterMl: Math.max(0, d.waterMl + amount) }));
    try {
      const ml = await addWater(date, amount);
      setDay((d) => ({ ...d, waterMl: ml }));
    } catch {
      setDay((d) => ({ ...d, waterMl: Math.max(0, d.waterMl - amount) }));
      toast("Could not save water");
    }
  };

  const undo = (saving: Promise<LogEntry[]>) => ({
    label: "Undo",
    onClick: () => {
      saving.then((added) => remove(added.map((x) => x.id))).catch(() => toast("Could not undo"));
    },
  });

  return (
    <>
      <header className="pt-safe px-4">
        <div className="flex items-start gap-3 pt-4 pb-1">
          <h1 className="min-w-0 flex-1 text-[28px] leading-tight font-bold tracking-tight">
            {greeting(profile.name, date, now.getHours(), profile.id)}
          </h1>
          <AvatarLink />
        </div>
        <div className="text-muted flex items-center gap-3 text-[15px]">
          <span>{now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</span>
          {!!streak?.days && (
            <span className="flex items-center gap-1 font-semibold" style={{ color: METRIC.fat.color }}>
              <IconStreak width={15} height={15} />
              {streak.days}-day streak
            </span>
          )}
        </div>
        <div
          className="mt-2.5 grid grid-cols-7 gap-1.5"
          aria-label={`Logged ${streak?.week.filter((d) => d.logged).length ?? 0} of 7 days this week`}
        >
          {(streak?.week ?? Array.from({ length: 7 }, (_, i) => ({ date: String(i), logged: false, future: false }))).map((d, i) => (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <span
                className="h-1.5 w-full rounded-full"
                style={{ background: d.logged ? "var(--accent)" : d.future ? "var(--surface)" : "var(--surface-2)" }}
              />
              <span className={d.date === date ? "text-text text-[11px] font-semibold" : "text-muted text-[11px]"}>{"MTWTFSS"[i]}</span>
            </div>
          ))}
        </div>
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

            <Tile title="Today" href={`/nutrition?date=${date}`}>
              <EnergyCard
                totals={t}
                targets={targets}
                unit={unit}
                footer={
                  <>
                    <span className="tabular">
                      Eaten {kj(t.energy_kj ?? 0, unit)} of {kj(targets.energy_kj, unit)} {unitLabel(unit)}
                    </span>
                    <span className="flex items-center gap-1">
                      {day.plan.training ? <IconDumbbell width={13} height={13} /> : <IconRest width={13} height={13} />}
                      {day.plan.training ? "Training day" : "Rest day"}
                    </span>
                  </>
                }
              />
            </Tile>

            <div className="grid grid-cols-2 gap-3">
              {/* Water */}
              <WaterTile
                ml={day.waterMl}
                target={fluidTargetMl(profile.sex)}
                quick={profile.water_bottles?.[0] ?? { name: "Glass", ml: 250 }}
                onOpen={() => setWaterOpen(true)}
                onAdd={addWaterMl}
              />

              {/* Vitamins & minerals */}
              <Tile title="Vitamins" href="/micros">
                <div className="text-[15px]">& minerals this week</div>
                {summary?.micros ? (
                  summary.micros.low + summary.micros.over > 0 ? (
                    <>
                      <BigStat value={String(summary.micros.low + summary.micros.over)} unit=" to watch" color="var(--warn)" />
                      <div className="text-muted mt-1 text-xs">
                        {summary.micros.low} low{summary.micros.over ? ` · ${summary.micros.over} over limit` : ""}
                      </div>
                    </>
                  ) : (
                    <>
                      <BigStat value="All good" color={METRIC.protein.color} size="md" />
                      <div className="text-muted mt-1 text-xs">{summary.micros.tracked} tracked</div>
                    </>
                  )
                ) : (
                  <Spinner className="text-muted mt-2" />
                )}
              </Tile>

              {/* Week average */}
              <Tile title="This week" href="/trends" className="col-span-2">
                <div className="text-[15px]">Average energy on days you logged</div>
                <WeekAverage week={week} unit={unit} />
              </Tile>

              {/* Training */}
              <Tile title="Training" href="/plan">
                <TrainingSummary workouts={day.plan.workouts} training={day.plan.training} />
                {summary?.activeKj != null && (
                  <div className="mt-1 text-xs" style={{ color: METRIC.energy.color }}>
                    Burned {kj(summary.activeKj, unit)} {unitLabel(unit)} active
                  </div>
                )}
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
                const saving = add(items);
                toast(`Added ${label} to ${SLOT_LABELS[items[0].slot]}`, undo(saving));
                await saving.then(
                  () => setVersion((v) => v + 1),
                  () => toast(`Couldn't add ${label} — try again`),
                );
              }}
            />
          </>
        )}
      </div>

      {day && (
        <WaterSheet
          open={waterOpen}
          onClose={() => setWaterOpen(false)}
          ml={day.waterMl}
          target={fluidTargetMl(profile.sex)}
          bottles={profile.water_bottles ?? []}
          onAdd={(amount) => {
            void addWaterMl(amount);
            toast(amount > 0 ? `Added ${amount} mL water` : `Removed ${-amount} mL water`);
          }}
          onSaveBottles={(b) => {
            const before = profile;
            setProfile({ ...profile, water_bottles: b });
            saveWaterBottles(b).then(setProfile, () => {
              setProfile(before);
              toast("Couldn't save bottles — try again");
            });
          }}
        />
      )}

      <FoodSheet
        food={openFood}
        onClose={() => setOpenFood(null)}
        date={date}
        slot={defaultSlot()}
        unit={unit}
        onAdd={async (e) => {
          setOpenFood(null);
          const saving = add([e]);
          toast(`Added ${e.name} to ${SLOT_LABELS[e.slot]} · ${friendlyDate(e.date)}`, undo(saving));
          await saving.then(
            () => setVersion((v) => v + 1),
            () => toast(`Couldn't add ${e.name} — try again`),
          );
        }}
      />
    </>
  );
}

function WaterTile({
  ml,
  target,
  quick,
  onOpen,
  onAdd,
}: {
  ml: number;
  target: number;
  quick: { name: string; ml: number };
  onOpen: () => void;
  onAdd: (ml: number) => void;
}) {
  const glasses = Math.round(target / 250);
  const filled = Math.floor(ml / 250);
  return (
    <section className="bg-surface flex flex-col rounded-3xl p-4">
      <button onClick={onOpen} className="flex-1 text-left active:opacity-70" aria-label="Open water">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex-1 text-[17px] font-semibold">Water</h2>
          <ChevronBadge />
        </div>
        <div className="text-[15px]">Today</div>
        <BigStat
          value={String(Math.round(ml / 10) / 100)}
          target={String(Math.round(target / 10) / 100)}
          unit="L"
          color={METRIC.water.color}
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {Array.from({ length: glasses }, (_, i) => (
            <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < filled ? METRIC.water.color : "var(--surface-2)" }} />
          ))}
        </div>
      </button>
      <button
        onClick={() => onAdd(quick.ml)}
        className="mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-full text-sm font-semibold text-white active:scale-95"
        style={{ background: "linear-gradient(135deg, var(--water), var(--water-2))" }}
      >
        <IconPlus width={16} height={16} strokeWidth={2.6} /> {quick.ml} mL
      </button>
    </section>
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
