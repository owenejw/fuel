"use client";

import { prettyName } from "@/lib/food-names";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconCarbs, IconDumbbell, IconEnergy, IconFat, IconFibre, IconProtein, IconRest } from "@/components/icons";
import { METRIC, type MetricKey } from "@/components/rings";
import { BigStat, ChevronBadge, EnergyCard, MiniBars } from "@/components/summary";
import { DayTypeSheet, WeekPicker } from "@/components/week";
import { BackButton, PageSkeleton, cx } from "@/components/ui";
import { friendlyDate, isValidDate, parseDate, today } from "@/lib/dates";
import { formatEnergy, toUnit, unitLabel, type EnergyUnit } from "@/lib/energy";
import { useDay } from "@/lib/hooks";
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
          <BackButton onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} />
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
        <div className="px-4 pt-3">
          <PageSkeleton cards={[260, 80, 220]} />
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
                <span className="min-w-0 flex-1 truncate">{prettyName(e.name).title}</span>
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
