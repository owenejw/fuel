"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconChevronLeft } from "@/components/icons";
import { Spinner, cx } from "@/components/ui";
import { today } from "@/lib/dates";
import { microState, type MicroStatus } from "@/lib/nrv";
import { formatAmount, nutrientDef } from "@/lib/nutrients";
import { cacheGet, cacheSet } from "@/lib/offline";
import { fetchMicros } from "@/server/actions/summary";

type Data = Awaited<ReturnType<typeof fetchMicros>>;

const GOOD = "var(--protein)";
const LOW = "var(--warn)";
const OVER = "var(--danger)";

/** Vitamins and minerals: this week against Australian NRVs, low ones first. */
export function MicrosView() {
  const router = useRouter();
  const { profileId } = useApp();
  const [data, setData] = useState<Data | null>(() => cacheGet<Data>(profileId, "micros"));
  useEffect(() => {
    fetchMicros(today()).then(
      (d) => {
        setData(d);
        cacheSet(profileId, "micros", d);
      },
      () => undefined,
    );
  }, [profileId]);

  const by = (s: ReturnType<typeof microState>) => data?.status.filter((m) => microState(m) === s) ?? [];
  const low = by("low");
  const over = by("over");
  const ok = by("ok");
  const none = by("none");

  return (
    <>
      <header className="pt-safe bg-bg/85 sticky top-0 z-20 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            className="bg-surface flex h-10 w-10 items-center justify-center rounded-full active:scale-95"
            aria-label="Back"
          >
            <IconChevronLeft width={22} height={22} />
          </button>
          <h1 className="flex-1 text-lg font-semibold">Vitamins &amp; minerals</h1>
        </div>
      </header>

      {!data ? (
        <div className="text-muted flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data.daysLogged ? (
        <p className="text-muted px-6 py-16 text-center">Log some food this week to see your vitamins and minerals.</p>
      ) : (
        <div className="space-y-6 px-4 pb-6">
          <div className="grid grid-cols-3 gap-3 pt-2">
            <Count label="Low" value={low.length} color={LOW} />
            <Count label="Over limit" value={over.length} color={OVER} />
            <Count label="On track" value={ok.length} color={GOOD} />
          </div>
          <p className="text-muted text-sm">
            Average of the days you logged this week ({data.daysLogged}) against Australian NRVs for your age and sex. Under 70% counts as
            low. Only foods with data for a nutrient count, so some can read low.
          </p>
          <Group title="Low this week" items={low} color={LOW} />
          <Group title="Over the limit" items={over} color={OVER} />
          <Group title="On track" items={ok} color={GOOD} />
          <Group title="No data yet" items={none} color="var(--muted)" />
        </div>
      )}
    </>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-surface rounded-3xl p-4">
      <div className="text-[13px]">{label}</div>
      <div className="tabular text-[34px] leading-tight font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function Group({ title, items, color }: { title: string; items: MicroStatus[]; color: string }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-xl font-bold">{title}</h2>
      <ul className="bg-surface divide-border divide-y rounded-3xl">
        {items.map((m) => {
          const pct = (v: number | null) => (v == null ? null : Math.round((v / m.target) * 100));
          const week = pct(m.average);
          const day = pct(m.today);
          return (
            <li key={m.key} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium">{nutrientDef(m.key).label}</span>
                <span className="tabular text-[22px] font-bold" style={{ color }}>
                  {week == null ? "–" : `${week}%`}
                </span>
              </div>
              <div className="text-muted text-xs">
                {m.limit ? "Limit" : "Target"} {formatAmount(m.target, m.key)} a day · 7-day average{" "}
                {m.average == null ? "no data" : formatAmount(m.average, m.key)}
              </div>
              <Bar label="Today" pct={day} color={color} incomplete={m.todayIncomplete} />
              <Bar label="7 days" pct={week} color={color} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Bar({ label, pct, color, incomplete }: { label: string; pct: number | null; color: string; incomplete?: boolean }) {
  return (
    <div className="mt-2 grid grid-cols-[3.5rem_1fr_3rem] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
        <div className={cx("h-full rounded-full")} style={{ width: `${Math.min(100, pct ?? 0)}%`, background: color }} />
      </div>
      <span className="tabular text-right">
        {pct == null ? "–" : `${pct}%`}
        {incomplete && <span className="text-warn">*</span>}
      </span>
    </div>
  );
}
