"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/components/app-provider";
import { IconChevronLeft, IconChevronRight, IconTrash } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, Input, PageHeader, Spinner, cx } from "@/components/ui";
import { addDays, friendlyDate, parseDate, today } from "@/lib/dates";
import { formatEnergy, toUnit, unitLabel, type EnergyUnit } from "@/lib/energy";
import { formatAmount, nutrientDef } from "@/lib/nutrients";
import { WORKOUT_LABELS } from "@/lib/types";
import { deleteWeight, fetchWeights, getGoalContext, saveGoal, saveWeight } from "@/server/actions/plan";
import { getTrends, type Trends } from "@/server/actions/trends";

type Tab = "week" | "micros" | "weight" | "summary";

const dayLabel = (d: string) => parseDate(d).toLocaleDateString("en-AU", { weekday: "short" });

export function TrendsView() {
  const { unit } = useApp();
  const [end, setEnd] = useState(today());
  const [tab, setTab] = useState<Tab>("week");
  const [data, setData] = useState<Trends | null>(null);

  const load = useCallback(() => getTrends(end).then(setData, () => undefined), [end]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Trends"
        right={
          <div className="flex items-center text-sm">
            <button onClick={() => setEnd(addDays(end, -7))} className="rounded-full p-2" aria-label="Previous week">
              <IconChevronLeft width={20} height={20} />
            </button>
            <span className="tabular">
              {parseDate(addDays(end, -6)).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}–
              {parseDate(end).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </span>
            <button
              onClick={() => setEnd(addDays(end, 7) > today() ? today() : addDays(end, 7))}
              disabled={end >= today()}
              className="rounded-full p-2 disabled:opacity-30"
              aria-label="Next week"
            >
              <IconChevronRight width={20} height={20} />
            </button>
          </div>
        }
      />
      <div className="space-y-3 px-4">
        <div className="bg-surface-2 flex rounded-xl p-1">
          {(
            [
              ["week", "Week"],
              ["micros", "Micros"],
              ["weight", "Weight"],
              ["summary", "Summary"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx("h-9 flex-1 rounded-lg text-sm", tab === t && "bg-surface font-medium shadow-sm")}
            >
              {label}
            </button>
          ))}
        </div>
        {!data ? (
          <div className="text-muted flex justify-center py-10">
            <Spinner />
          </div>
        ) : tab === "week" ? (
          <WeekTab data={data} unit={unit} />
        ) : tab === "micros" ? (
          <MicrosTab data={data} />
        ) : tab === "weight" ? (
          <WeightTab data={data} unit={unit} onChange={load} />
        ) : (
          <SummaryTab data={data} unit={unit} />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------------

const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--text)" },
  labelStyle: { color: "var(--muted)" },
  cursor: { fill: "var(--surface-2)" },
};

/** One measure per chart: bars = intake, short dashes = that day's target. */
function DailyChart({
  data,
  valueKey,
  label,
  color,
  format,
}: {
  data: Trends["week"];
  valueKey: "energy_kj" | "protein_g" | "carbs_g" | "fat_g";
  label: string;
  color: string;
  format: (v: number) => string;
}) {
  const rows = data.map((d) => ({
    day: dayLabel(d.date),
    date: d.date,
    value: d.logged ? d.totals[valueKey] : null,
    target: d.targets[valueKey],
  }));
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{label}</div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              width={52}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : format(v))}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(v, name) => [v == null ? "nothing logged" : format(Number(v)), name === "value" ? "Eaten" : "Target"]}
              labelFormatter={(_, p) => (p?.[0]?.payload ? friendlyDate(p[0].payload.date) : "")}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Scatter
              dataKey="target"
              fill="var(--text)"
              isAnimationActive={false}
              shape={(props: { cx?: number; cy?: number }) => (
                <rect x={(props.cx ?? 0) - 12} y={(props.cy ?? 0) - 1} width={24} height={2} rx={1} fill="var(--text)" />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function WeekTab({ data, unit }: { data: Trends; unit: EnergyUnit }) {
  const a = data.averages;
  const fmtE = (v: number) => Math.round(toUnit(v, unit)).toLocaleString("en-AU");
  const rows: { label: string; key: keyof Trends["averages"]["intake"]; fmt: (v: number) => string }[] = [
    { label: `Energy (${unitLabel(unit)})`, key: "energy_kj", fmt: fmtE },
    { label: "Protein (g)", key: "protein_g", fmt: (v) => String(Math.round(v)) },
    { label: "Carbs (g)", key: "carbs_g", fmt: (v) => String(Math.round(v)) },
    { label: "Fat (g)", key: "fat_g", fmt: (v) => String(Math.round(v)) },
    { label: "Fibre (g)", key: "fibre_g", fmt: (v) => String(Math.round(v)) },
  ];
  return (
    <>
      <Card className="p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">Weekly averages</h2>
          <span className="text-muted text-xs">{a.daysLogged} of 7 days logged</span>
        </div>
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="text-muted text-left text-xs">
              <th className="py-1 font-normal"></th>
              <th className="py-1 text-right font-normal">Avg intake</th>
              <th className="py-1 text-right font-normal">Avg target</th>
              <th className="py-1 text-right font-normal">%</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-right">{a.daysLogged ? r.fmt(a.intake[r.key]) : "no data"}</td>
                <td className="py-1.5 text-right">{r.fmt(a.targets[r.key])}</td>
                <td className="text-muted py-1.5 text-right">
                  {a.daysLogged && a.targets[r.key] ? `${Math.round((a.intake[r.key] / a.targets[r.key]) * 100)}%` : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.week.some((d) => d.incomplete) && (
          <p className="text-muted mt-2 text-xs">Some days include foods with no data for a macro, so totals may be low.</p>
        )}
      </Card>
      <Card className="space-y-4 p-4">
        <p className="text-muted text-xs">Bars show what you ate; the dark dash is that day&apos;s target.</p>
        <DailyChart data={data.week} valueKey="energy_kj" label={`Energy (${unitLabel(unit)})`} color="var(--accent)" format={fmtE} />
        <DailyChart
          data={data.week}
          valueKey="protein_g"
          label="Protein (g)"
          color="var(--protein)"
          format={(v) => String(Math.round(v))}
        />
        <DailyChart data={data.week} valueKey="carbs_g" label="Carbs (g)" color="var(--carbs)" format={(v) => String(Math.round(v))} />
        <DailyChart data={data.week} valueKey="fat_g" label="Fat (g)" color="var(--fat)" format={(v) => String(Math.round(v))} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Micros
// ---------------------------------------------------------------------------

function MicrosTab({ data }: { data: Trends }) {
  const micros = [...data.micros].sort((a, b) => Number(b.flagged) - Number(a.flagged) || Number(b.over) - Number(a.over));
  if (!data.averages.daysLogged) return <Empty>Log some food this week to see micronutrients.</Empty>;
  return (
    <Card className="p-4">
      <p className="text-muted mb-3 text-xs">
        Today and 7-day average against Australian NRVs for your age and sex. Totals only count foods that have data for that nutrient, so
        they can read low.
      </p>
      <ul className="space-y-3">
        {micros.map((m) => {
          const def = nutrientDef(m.key);
          const pct = (v: number | null) => (v == null ? 0 : Math.min(100, (v / m.target) * 100));
          return (
            <li key={m.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {def.label}
                  {m.flagged && (
                    <span className="bg-warn/15 text-warn ml-2 rounded-full px-2 py-0.5 text-xs font-normal">⚠ Under 70% this week</span>
                  )}
                  {m.over && (
                    <span className="bg-danger/15 text-danger ml-2 rounded-full px-2 py-0.5 text-xs font-normal">▲ Over limit</span>
                  )}
                </span>
                <span className="tabular text-muted text-xs">
                  {m.limit ? "limit" : m.basis} {formatAmount(m.target, m.key)}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-2 text-xs">
                <span className="text-muted">Today</span>
                <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
                  <div className="bg-accent h-full rounded-full" style={{ width: `${pct(m.today)}%` }} />
                </div>
                <span className="tabular text-right">
                  {m.today == null ? "no data" : `${Math.round((m.today / m.target) * 100)}%`}
                  {m.todayIncomplete && <span className="text-warn">*</span>}
                </span>
                <span className="text-muted">7-day</span>
                <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cx("h-full rounded-full", m.flagged ? "bg-warn" : m.over ? "bg-danger" : "bg-accent")}
                    style={{ width: `${pct(m.average)}%` }}
                  />
                </div>
                <span className="tabular text-right">{m.average == null ? "no data" : `${Math.round((m.average / m.target) * 100)}%`}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

function WeightTab({ data, unit, onChange }: { data: Trends; unit: EnergyUnit; onChange: () => void }) {
  const toast = useToast();
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(today());
  const [list, setList] = useState<{ id: string; date: string; kg: number }[]>([]);
  const refreshList = useCallback(() => fetchWeights(addDays(today(), -60), today()).then((w) => setList(w.reverse())), []);
  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const rows = useMemo(
    () => data.weights.map((p) => ({ ...p, label: parseDate(p.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) })),
    [data.weights],
  );
  const latest = data.weights.at(-1);
  const weekAgo = [...data.weights].reverse().find((p) => latest && p.date <= addDays(latest.date, -7));

  return (
    <>
      <Card className="p-4">
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveWeight(date, Number(kg));
            setKg("");
            toast("Weight saved");
            onChange();
            refreshList();
          }}
        >
          <Input
            className="w-28"
            label="Weight (kg)"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={20}
            max={400}
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            required
          />
          <Input className="flex-1" label="Date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          <Button type="submit">Save</Button>
        </form>
      </Card>

      <Card className="p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-semibold">Trend</h2>
          {latest && (
            <span className="tabular text-sm">
              {latest.trend.toFixed(1)} kg
              {weekAgo && (
                <span className="text-muted ml-1">
                  ({latest.trend - weekAgo.trend >= 0 ? "+" : ""}
                  {(latest.trend - weekAgo.trend).toFixed(2)} kg/wk)
                </span>
              )}
            </span>
          )}
        </div>
        {rows.length < 2 ? (
          <Empty>Log your weight a few times to see the trend.</Empty>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} minTickGap={24} />
                  <YAxis
                    domain={["dataMin - 1", "dataMax + 1"]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    width={44}
                    tickFormatter={(v) => Number(v).toFixed(0)}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v, name) => [`${Number(v).toFixed(1)} kg`, name === "kg" ? "Weigh-in" : "Trend"]}
                  />
                  <Scatter dataKey="kg" fill="var(--muted)" isAnimationActive={false} />
                  <Line dataKey="trend" stroke="var(--accent)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-muted mt-1 text-xs">
              Dots are weigh-ins; the line is the smoothed trend (EWMA, α = 0.1), which ignores day-to-day water swings.
            </p>
          </>
        )}
      </Card>

      <AdaptiveCard data={data} unit={unit} />

      {list.length > 0 && (
        <Card>
          <ul className="divide-border divide-y">
            {list.map((w) => (
              <li key={w.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{friendlyDate(w.date)}</span>
                <span className="tabular flex items-center gap-2">
                  {w.kg} kg
                  <button
                    className="text-muted rounded-full p-1.5"
                    aria-label={`Delete weight for ${w.date}`}
                    onClick={async () => {
                      await deleteWeight(w.id);
                      refreshList();
                      onChange();
                    }}
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function AdaptiveCard({ data, unit }: { data: Trends; unit: EnergyUnit }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const a = data.adaptive;
  return (
    <Card className="p-4">
      <h2 className="mb-2 font-semibold">Adaptive TDEE</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-surface-2 rounded-xl p-3">
          <div className="text-muted text-xs">From your data</div>
          <div className="tabular text-lg font-semibold">{a ? formatEnergy(a.tdeeKj, unit) : "–"}</div>
        </div>
        <div className="bg-surface-2 rounded-xl p-3">
          <div className="text-muted text-xs">Formula estimate</div>
          <div className="tabular text-lg font-semibold">{data.formulaTdeeKj ? formatEnergy(data.formulaTdeeKj, unit) : "–"}</div>
        </div>
      </div>
      {a ? (
        <>
          <p className="text-muted mt-2 text-xs">
            Average intake {formatEnergy(a.avgIntakeKj, unit)}/day over {a.days} days while the weight trend moved{" "}
            {a.trendChangeKg >= 0 ? "+" : ""}
            {a.trendChangeKg} kg (1 kg ≈ 32,200 kJ).
          </p>
          <Button
            className="mt-3 w-full"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const ctx = await getGoalContext({ tdeeKj: a.tdeeKj });
                if (!ctx.suggested) throw new Error("Add your weight and profile details first");
                const s = ctx.suggested;
                await saveGoal({
                  training_kj: s.training.energy_kj,
                  training_protein_g: s.training.protein_g,
                  training_carbs_g: s.training.carbs_g,
                  training_fat_g: s.training.fat_g,
                  training_fibre_g: s.training.fibre_g,
                  rest_kj: s.rest.energy_kj,
                  rest_protein_g: s.rest.protein_g,
                  rest_carbs_g: s.rest.carbs_g,
                  rest_fat_g: s.rest.fat_g,
                  rest_fibre_g: s.rest.fibre_g,
                });
                toast(
                  `Targets updated: ${formatEnergy(s.training.energy_kj, unit)} training / ${formatEnergy(s.rest.energy_kj, unit)} rest`,
                );
              } catch (err) {
                toast(err instanceof Error ? err.message : "Could not update targets");
              } finally {
                setBusy(false);
              }
            }}
          >
            Update my targets from this
          </Button>
        </>
      ) : (
        <p className="text-muted mt-2 text-xs">
          Needs 14+ days of logged food and weigh-ins across that period. You have {data.intakeDays28} logged day
          {data.intakeDays28 === 1 ? "" : "s"} in the last 4 weeks.
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Weekly summary
// ---------------------------------------------------------------------------

function SummaryTab({ data, unit }: { data: Trends; unit: EnergyUnit }) {
  const { planned, completed } = data.workouts;
  const a = data.averages;
  const first = data.weights.filter((w) => w.date >= data.week[0].date)[0];
  const last = data.weights.at(-1);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Workouts" value={`${completed}/${planned.length}`} hint="done / planned" />
        <Stat
          label="Avg intake"
          value={a.daysLogged ? formatEnergy(a.intake.energy_kj, unit, { label: false }) : "–"}
          hint={`target ${formatEnergy(a.targets.energy_kj, unit)}`}
        />
        <Stat
          label="Weight trend"
          value={
            first && last && first !== last ? `${last.trend - first.trend >= 0 ? "+" : ""}${(last.trend - first.trend).toFixed(1)} kg` : "–"
          }
          hint="this week"
        />
      </div>
      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Sessions</h2>
        {planned.length === 0 ? (
          <p className="text-muted text-sm">No workouts planned this week.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {planned.map((w) => (
              <li key={w.id} className="flex justify-between py-2">
                <span>
                  {dayLabel(w.date)} · {w.title || WORKOUT_LABELS[w.type]}
                </span>
                <span className={w.completed ? "text-accent" : "text-muted"}>
                  {w.completed ? "✓ Done" : w.date < today() ? "Missed" : "Planned"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-4 text-sm">
        <h2 className="mb-2 font-semibold">Protein</h2>
        {a.daysLogged ? (
          <p>
            Averaged <strong>{a.intake.protein_g} g</strong> a day against a {a.targets.protein_g} g target (
            {Math.round((a.intake.protein_g / Math.max(1, a.targets.protein_g)) * 100)}%).
          </p>
        ) : (
          <p className="text-muted">No food logged this week.</p>
        )}
        {data.micros.some((m) => m.flagged) && (
          <p className="text-muted mt-2">
            Low all week:{" "}
            {data.micros
              .filter((m) => m.flagged)
              .map((m) => nutrientDef(m.key).label.toLowerCase())
              .join(", ")}
            .
          </p>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-3">
      <div className="text-muted text-xs">{label}</div>
      <div className="tabular text-xl font-semibold">{value}</div>
      <div className="text-muted text-[11px]">{hint}</div>
    </Card>
  );
}
