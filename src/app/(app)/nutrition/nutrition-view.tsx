"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconChevronDown, IconChevronLeft, IconDumbbell, IconRest, IconSparkles } from "@/components/icons";
import { METRIC, type MetricKey } from "@/components/rings";
import { BigStat, EnergyCard, MiniBars, WeekStrip } from "@/components/summary";
import { ChoiceCards, Sheet, Spinner, cx } from "@/components/ui";
import { setDayType } from "@/lib/data";
import { friendlyDate, isValidDate, parseDate, today } from "@/lib/dates";
import { formatEnergy, toUnit, unitLabel, type EnergyUnit } from "@/lib/energy";
import { useDay, useWeek } from "@/lib/hooks";
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

/** One day in detail: rings, then each nutrient with where it came from. */
export function NutritionView() {
  const params = useSearchParams();
  const router = useRouter();
  const { unit, profile } = useApp();
  const date = isValidDate(params.get("date")) ? params.get("date")! : today();
  const { day, entries, refresh } = useDay(date);
  const week = useWeek(date);
  const [dayTypeOpen, setDayTypeOpen] = useState(false);

  const totals = useMemo(() => {
    const out: Partial<Record<NutrientKey, number>> = {};
    for (const e of entries ?? [])
      for (const [k, v] of Object.entries(e.nutrients)) if (v != null) out[k as NutrientKey] = (out[k as NutrientKey] ?? 0) + v;
    return out;
  }, [entries]);

  const title = `${friendlyDate(date)}${["Today", "Yesterday"].includes(friendlyDate(date)) ? ` ${parseDate(date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}`;

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
          <h1 className="flex-1 text-lg font-semibold">{title}</h1>
        </div>
        <WeekStrip days={week} selected={date} href={(d) => `/nutrition?date=${d}`} />
      </header>

      {!day || !entries ? (
        <div className="text-muted flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="px-4 pb-6">
          <div className="flex flex-col items-center pt-4 pb-2">
            <div className="bg-surface w-full rounded-3xl p-4">
              <EnergyCard totals={totals} targets={day.plan.targets} unit={unit} size={140} />
            </div>
            <button
              onClick={() => setDayTypeOpen(true)}
              className={cx(
                "mt-4 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold active:scale-95",
                day.plan.training ? "bg-protein/15 text-protein" : "bg-surface text-text",
              )}
            >
              {day.plan.training ? <IconDumbbell width={16} height={16} /> : <IconRest width={16} height={16} />}
              {day.plan.training ? "Training day" : "Rest day"}
              <IconChevronDown width={16} height={16} />
            </button>
            {day.plan.carbLoadingFor && (
              <p className="text-carbs mt-2 text-center text-sm">
                Carb loading for {day.plan.carbLoadingFor}: carbs raised to {day.plan.targets.carbs_g} g.
              </p>
            )}
          </div>

          {SECTIONS.map((s) => (
            <MetricSection
              key={s.metric}
              metric={s.metric}
              nkey={s.key}
              target={day.plan.targets[s.key]}
              value={totals[s.key] ?? 0}
              entries={entries}
              unit={unit}
            />
          ))}

          <section className="border-border border-t py-5">
            <BigStat
              label="Water"
              value={String(Math.round(day.waterMl / 10) / 100)}
              target={(fluidTargetMl(profile.sex) / 1000).toFixed(1)}
              unit="L"
              color={METRIC.water.color}
              size="xl"
            />
          </section>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Link
              href={date === today() ? "/diary" : `/diary?date=${date}`}
              className="bg-surface flex h-14 items-center justify-center rounded-full font-semibold active:scale-[0.98]"
            >
              Open diary
            </Link>
            <Link
              href="/settings#targets"
              className="bg-surface flex h-14 items-center justify-center rounded-full font-semibold active:scale-[0.98]"
            >
              Change targets
            </Link>
            <Link
              href="/trends"
              className="bg-surface col-span-2 flex h-14 items-center justify-center rounded-full font-semibold active:scale-[0.98]"
            >
              Vitamins &amp; minerals
            </Link>
          </div>
        </div>
      )}

      <Sheet open={dayTypeOpen} onClose={() => setDayTypeOpen(false)} title="What kind of day is it?">
        {day && (
          <ChoiceCards<"auto" | "training" | "rest">
            value={day.plan.dayTypeOverridden ? day.plan.dayType : "auto"}
            onChange={async (v) => {
              setDayTypeOpen(false);
              await setDayType(date, v === "auto" ? null : v);
              await refresh();
            }}
            options={[
              {
                value: "auto",
                label: `Automatic (${day.plan.workouts.some((w) => w.type !== "rest") ? "training" : "rest"} day)`,
                hint: "Worked out from the workouts in your Plan",
                icon: IconSparkles,
              },
              { value: "training", label: "Training day", hint: "More carbs to fuel your session", icon: IconDumbbell },
              { value: "rest", label: "Rest day", hint: "Fewer carbs, same protein", icon: IconRest },
            ]}
          />
        )}
      </Sheet>
    </>
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

  return (
    <section className="border-border border-t py-5">
      <BigStat label={m.label} value={show(value)} target={show(target)} unit={unitText} color={m.color} size="xl" />
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
