"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import {
  IconCarbs,
  IconChevronLeft,
  IconChevronRight,
  IconDumbbell,
  IconEnergy,
  IconFat,
  IconFibre,
  IconProtein,
  IconRest,
  IconSparkles,
} from "@/components/icons";
import { METRIC, type MetricKey } from "@/components/rings";
import { BigStat, ChevronBadge, EnergyCard, MiniBars } from "@/components/summary";
import { ChoiceCards, Sheet, Spinner, cx } from "@/components/ui";
import { setDayType } from "@/lib/data";
import { addDays, friendlyDate, isValidDate, parseDate, today } from "@/lib/dates";
import { formatEnergy, toUnit, unitLabel, type EnergyUnit } from "@/lib/energy";
import { useDay, type WeekDay } from "@/lib/hooks";
import { getDayPlans } from "@/server/actions/plan";
import { fetchWeek } from "@/server/actions/summary";
import { fluidTargetMl } from "@/lib/nrv";
import type { NutrientKey } from "@/lib/nutrients";
import { MEAL_SLOTS, SLOT_LABELS, type DayTargets, type LogEntry } from "@/lib/types";

const SECTIONS: { metric: MetricKey; key: NutrientKey & keyof DayTargets; unit: string }[] = [
  { metric: "energy", key: "energy_kj", unit: "kJ" },
  { metric: "protein", key: "protein_g", unit: "g" },
  { metric: "carbs", key: "carbs_g", unit: "g" },
  { metric: "fat", key: "fat_g", unit: "g" },
  { metric: "fibre", key: "fibre_g", unit: "g" },
];

const SHORT: Record<string, string> = {
  breakfast: "Brekkie",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
  pre_workout: "Pre",
  post_workout: "Post",
};

const SECTION_ICONS = { energy: IconEnergy, protein: IconProtein, carbs: IconCarbs, fat: IconFat, fibre: IconFibre } as const;
const mondayOf = (d: string) => addDays(d, -((parseDate(d).getDay() + 6) % 7));

/** One day in detail: the energy card, then each nutrient with where it came from. */
export function NutritionView() {
  const params = useSearchParams();
  const router = useRouter();
  const { unit, profile } = useApp();
  const date = isValidDate(params.get("date")) ? params.get("date")! : today();
  const { day, entries, refresh } = useDay(date);
  const [dayTypeFor, setDayTypeFor] = useState<string | null>(null);
  const [weekVersion, setWeekVersion] = useState(0);

  const totals = useMemo(() => {
    const out: Partial<Record<NutrientKey, number>> = {};
    for (const e of entries ?? [])
      for (const [k, v] of Object.entries(e.nutrients)) if (v != null) out[k as NutrientKey] = (out[k as NutrientKey] ?? 0) + v;
    return out;
  }, [entries]);

  const scrollTo = (metric: MetricKey) => document.getElementById(`m-${metric}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <header className="pt-safe bg-bg/85 sticky top-0 z-20 px-4 pb-2 backdrop-blur-xl">
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            className="bg-surface flex h-10 w-10 items-center justify-center rounded-full active:scale-95"
            aria-label="Back"
          >
            <IconChevronLeft width={22} height={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg leading-tight font-semibold">Nutrition</h1>
            <div className="text-muted text-[13px]">
              {friendlyDate(date)}
              {["Today", "Yesterday", "Tomorrow"].includes(friendlyDate(date)) &&
                ` · ${parseDate(date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}`}
            </div>
          </div>
        </div>
        <WeekPicker
          selected={date}
          version={weekVersion}
          onSelect={(d) => router.replace(d === today() ? "/nutrition" : `/nutrition?date=${d}`, { scroll: false })}
          onPlanDay={setDayTypeFor}
        />
      </header>

      {!day || !entries ? (
        <div className="text-muted flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div key={date} className="page-in space-y-6 px-4 pt-3 pb-6">
          <section>
            <SectionHeading>Summary</SectionHeading>
            <div className="bg-surface rounded-3xl p-4">
              <EnergyCard totals={totals} targets={day.plan.targets} unit={unit} size={140} onSelect={scrollTo} />
              <p className="text-muted mt-3 text-xs">Tap a nutrient to jump to its breakdown.</p>
            </div>
            <button
              onClick={() => setDayTypeFor(date)}
              className="bg-surface mt-3 flex w-full items-center gap-3 rounded-3xl p-4 text-left active:scale-[0.98]"
            >
              <span
                className={cx(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  day.plan.training ? "bg-protein/15 text-protein" : "bg-surface-2 text-text",
                )}
              >
                {day.plan.training ? <IconDumbbell width={20} height={20} /> : <IconRest width={20} height={20} />}
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{day.plan.training ? "Training day" : "Rest day"}</span>
                <span className="text-muted block text-xs">
                  {day.plan.dayTypeOverridden ? "Set by you" : "From your Plan"} · tap to change
                </span>
              </span>
              <ChevronBadge />
            </button>
            {day.plan.carbLoadingFor && (
              <p className="text-carbs mt-2 text-sm">
                Carb loading for {day.plan.carbLoadingFor}: carbs raised to {day.plan.targets.carbs_g} g.
              </p>
            )}
          </section>

          <section>
            <SectionHeading>Nutrients</SectionHeading>
            <div className="space-y-3">
              {SECTIONS.map((sec) => (
                <MetricSection
                  key={sec.metric}
                  metric={sec.metric}
                  nkey={sec.key}
                  target={day.plan.targets[sec.key]}
                  value={totals[sec.key] ?? 0}
                  entries={entries}
                  unit={unit}
                />
              ))}
            </div>
          </section>

          <section>
            <SectionHeading>Water</SectionHeading>
            <div className="bg-surface rounded-3xl p-4">
              <BigStat
                value={String(Math.round(day.waterMl / 10) / 100)}
                target={(fluidTargetMl(profile.sex) / 1000).toFixed(1)}
                unit="L"
                color={METRIC.water.color}
                size="xl"
              />
            </div>
          </section>

          <section>
            <SectionHeading>More</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href={date === today() ? "/meals" : `/meals?date=${date}`}
                className="bg-surface flex h-14 items-center justify-center rounded-full font-semibold active:scale-[0.98]"
              >
                Open meals
              </Link>
              <Link
                href="/settings/goals"
                className="bg-surface flex h-14 items-center justify-center rounded-full font-semibold active:scale-[0.98]"
              >
                Change targets
              </Link>
              <Link
                href="/micros"
                className="bg-surface col-span-2 flex h-14 items-center justify-center rounded-full font-semibold active:scale-[0.98]"
              >
                Vitamins &amp; minerals
              </Link>
            </div>
          </section>
        </div>
      )}

      <DayTypeSheet
        date={dayTypeFor}
        onClose={() => setDayTypeFor(null)}
        onChanged={async (d) => {
          setWeekVersion((v) => v + 1);
          if (d === date) await refresh();
        }}
      />
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xl font-bold">{children}</h2>;
}

/**
 * Monday–Sunday day picker. Swipe or use the arrows for other weeks; past days open their numbers,
 * upcoming days let you mark them as training or rest.
 */
function WeekPicker({
  selected,
  version,
  onSelect,
  onPlanDay,
}: {
  selected: string;
  version: number;
  onSelect: (d: string) => void;
  onPlanDay: (d: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(selected));
  const [weeks, setWeeks] = useState<Record<string, WeekDay[]>>({});
  const [loaded, setLoaded] = useState<Record<string, number>>({});
  const touch = useRef<{ x: number; y: number } | null>(null);
  const t = today();
  const thisWeek = mondayOf(t);

  useEffect(() => {
    if (loaded[weekStart] === version) return;
    let live = true;
    fetchWeek(weekStart).then(
      (d) => {
        if (!live) return;
        setWeeks((w) => ({ ...w, [weekStart]: d }));
        setLoaded((l) => ({ ...l, [weekStart]: version }));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [weekStart, version, loaded]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const data = weeks[weekStart];
  const label =
    weekStart === thisWeek
      ? "This week"
      : weekStart === addDays(thisWeek, -7)
        ? "Last week"
        : weekStart === addDays(thisWeek, 7)
          ? "Next week"
          : `${parseDate(weekStart).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${parseDate(addDays(weekStart, 6)).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
  const canNext = weekStart < addDays(thisWeek, 7);

  return (
    <div
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
        if (dx > 0) setWeekStart((w) => addDays(w, -7));
        else if (canNext) setWeekStart((w) => addDays(w, 7));
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <button
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="text-muted rounded-full p-1.5 active:scale-90"
          aria-label="Previous week"
        >
          <IconChevronLeft width={18} height={18} />
        </button>
        <span className="text-muted text-[13px] font-semibold">{label}</span>
        <button
          onClick={() => canNext && setWeekStart((w) => addDays(w, 7))}
          disabled={!canNext}
          className="text-muted rounded-full p-1.5 active:scale-90 disabled:opacity-30"
          aria-label="Next week"
        >
          <IconChevronRight width={18} height={18} />
        </button>
      </div>
      <div key={weekStart} className="page-in grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const info = data?.[i];
          const isSel = d === selected;
          const future = d > t;
          return (
            <button
              key={d}
              onClick={() => (future ? onPlanDay(d) : onSelect(d))}
              className="flex flex-col items-center gap-1 rounded-xl py-1 active:opacity-60"
              aria-label={future ? `Plan ${d}` : d}
              aria-pressed={isSel}
            >
              <span className={cx("text-[11px] font-semibold", d === t ? "text-accent" : "text-muted")}>{"MTWTFSS"[i]}</span>
              <span
                className={cx(
                  "tabular flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-semibold transition",
                  isSel ? "bg-accent text-accent-text" : future ? "bg-surface/60 text-muted" : "bg-surface",
                  d === t && !isSel && "ring-accent ring-1",
                )}
              >
                {Number(d.slice(8))}
              </span>
              <span className="flex h-3 items-center">
                {info?.training ? (
                  <IconDumbbell width={11} height={11} className="text-protein" />
                ) : (
                  <span className={cx("h-1.5 w-1.5 rounded-full", info?.logged ? "bg-accent" : "bg-transparent")} />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Choose automatic, training or rest for a day (today, past or upcoming). */
function DayTypeSheet({ date, onClose, onChanged }: { date: string | null; onClose: () => void; onChanged: (d: string) => void }) {
  const [plan, setPlan] = useState<{ date: string; dayType: "training" | "rest"; overridden: boolean; auto: "training" | "rest" } | null>(
    null,
  );
  useEffect(() => {
    if (!date) return;
    let live = true;
    getDayPlans(date, date).then(([p]) => {
      if (live && p)
        setPlan({
          date,
          dayType: p.dayType,
          overridden: p.dayTypeOverridden,
          auto: p.workouts.some((w) => w.type !== "rest") ? "training" : "rest",
        });
    });
    return () => {
      live = false;
    };
  }, [date]);
  const current = plan && plan.date === date ? plan : null;
  return (
    <Sheet open={!!date} onClose={onClose} title={date ? `${friendlyDate(date)}${date > today() ? " — plan ahead" : ""}` : ""}>
      {!current ? (
        <div className="text-muted flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <ChoiceCards<"auto" | "training" | "rest">
          value={current.overridden ? current.dayType : "auto"}
          onChange={async (v) => {
            const d = current.date;
            onClose();
            await setDayType(d, v === "auto" ? null : v);
            onChanged(d);
          }}
          options={[
            {
              value: "auto",
              label: `Automatic (${current.auto} day)`,
              hint: "Worked out from the workouts in your Plan",
              icon: IconSparkles,
            },
            { value: "training", label: "Training day", hint: "More carbs to fuel your session", icon: IconDumbbell },
            { value: "rest", label: "Rest day", hint: "Fewer carbs, same protein", icon: IconRest },
          ]}
        />
      )}
    </Sheet>
  );
}

const grams = (n: number) => (n < 10 ? Math.round(n * 10) / 10 : Math.round(n));

function MetricSection({
  metric,
  nkey,
  target,
  value,
  entries,
  unit,
}: {
  metric: MetricKey;
  nkey: NutrientKey;
  target: number;
  value: number;
  entries: LogEntry[];
  unit: EnergyUnit;
}) {
  const m = METRIC[metric];
  const isEnergy = nkey === "energy_kj";
  const show = (n: number) => (isEnergy ? Math.round(toUnit(n, unit)).toLocaleString("en-AU") : String(Math.round(n)));
  const unitText = isEnergy ? unitLabel(unit) : "g";
  const diff = target - value;
  const slots = MEAL_SLOTS.filter((s) => (s !== "pre_workout" && s !== "post_workout") || entries.some((e) => e.slot === s));
  const perSlot = slots.map((s) => entries.filter((e) => e.slot === s).reduce((a, e) => a + (e.nutrients[nkey] ?? 0), 0));
  const top = [...entries]
    .filter((e) => (e.nutrients[nkey] ?? 0) > 0)
    .sort((a, b) => (b.nutrients[nkey] ?? 0) - (a.nutrients[nkey] ?? 0))
    .slice(0, 3);

  const SIcon = SECTION_ICONS[metric as keyof typeof SECTION_ICONS];
  return (
    <section id={`m-${metric}`} className="bg-surface scroll-mt-[calc(env(safe-area-inset-top)+12rem)] rounded-3xl p-4">
      <div className="mb-1 flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 15%, transparent)` }}
        >
          {SIcon && <SIcon width={16} height={16} />}
        </span>
        <h3 className="text-[17px] font-semibold">{m.label}</h3>
      </div>
      <BigStat value={show(value)} target={show(target)} unit={unitText} color={m.color} size="xl" />
      <p className="text-muted mt-1.5 text-[13px] font-semibold tracking-wide uppercase">
        {Math.abs(diff) < (isEnergy ? 50 : 1)
          ? "Right on target"
          : diff > 0
            ? `${show(diff)} ${unitText} to go`
            : `${show(-diff)} ${unitText} over target${metric === "protein" || metric === "fibre" ? " — that's fine" : ""}`}
      </p>
      <div className="mt-4">
        <MiniBars values={perSlot} labels={slots.map((s) => SHORT[s])} color={m.color} height={70} />
      </div>
      {top.length > 0 && (
        <div className="mt-4">
          <div className="text-muted mb-1 text-[13px] font-semibold tracking-wide uppercase" style={{ color: m.color }}>
            Most from
          </div>
          <ul className="space-y-1">
            {top.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 text-[15px]">
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="tabular text-muted shrink-0">
                  {isEnergy ? formatEnergy(e.nutrients.energy_kj ?? 0, unit) : `${grams(e.nutrients[nkey] ?? 0)} g`}
                  <span className="text-muted/70"> · {SLOT_LABELS[e.slot]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
