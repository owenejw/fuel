"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { ProfileFields, type ProfileDraft } from "@/components/profile-fields";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Button, Card, Input, PageHeader, Toggle, cx } from "@/components/ui";
import Link from "next/link";
import {
  IconBell,
  IconCopy,
  IconHeart,
  IconChevronLeft,
  IconChevronRight,
  IconRuler,
  IconScale,
  IconCalendarSync,
  IconCarbs,
  IconDownload,
  IconDumbbell,
  IconEnergy,
  IconFat,
  IconFibre,
  IconProtein,
  IconRest,
  IconSparkles,
  IconTarget,
  IconUsers,
  type Icon,
} from "@/components/icons";
import { fromUnit, formatEnergy, toUnit, unitLabel } from "@/lib/energy";
import { PROTEIN_G_PER_KG } from "@/lib/tdee";
import type { DayTargets, Profile } from "@/lib/types";
import { saveAvatar, saveProfile } from "@/server/actions/profile";
import { Avatar } from "@/components/summary";
import { createHealthKey, getHealthStatus } from "@/server/actions/health";
import { aiAvailable } from "@/server/actions/ai";
import { getDayPlans, getGoalContext, saveGoal, syncCalendar, type GoalContext } from "@/server/actions/plan";
import { today } from "@/lib/dates";
import { removePushSubscription, savePushSubscription } from "@/server/actions/push";

function Section({ children }: { id?: string; title?: string; icon?: Icon; children: React.ReactNode }) {
  return <section>{children}</section>;
}

export type SettingsPage =
  "profile" | "health-details" | "goals" | "units" | "notifications" | "apple-health" | "calendar" | "meal-ideas" | "export";

const TITLES: Record<SettingsPage, string> = {
  profile: "Profile",
  "health-details": "Health details",
  goals: "Goals & targets",
  units: "Units",
  notifications: "Notifications",
  "apple-health": "Apple Health",
  calendar: "Google Calendar",
  "meal-ideas": "Meal ideas & photo logging",
  export: "Export data",
};

/** Settings home (Apple-style account list), or one of its pages. */
export function SettingsView({ page }: { page?: SettingsPage }) {
  const { profile, setProfile, switchProfile } = useApp();
  const toast = useToast();

  /** Optimistic: switches and choices change on screen immediately, then save. */
  const save = async (patch: Partial<Profile>) => {
    const before = profile;
    setProfile({ ...profile, ...patch });
    try {
      const next = await saveProfile({ ...profile, ...patch });
      setProfile(next);
      return next;
    } catch (err) {
      setProfile(before);
      toast(err instanceof Error ? err.message : "Could not save");
      throw err;
    }
  };

  if (page)
    return (
      <>
        <PageHeader
          title={<span className="text-lg font-semibold">{TITLES[page]}</span>}
          left={
            <Link
              href="/settings"
              className="bg-surface -ml-1 flex h-10 w-10 items-center justify-center rounded-full active:scale-95"
              aria-label="Back to account"
            >
              <IconChevronLeft width={22} height={22} />
            </Link>
          }
        />
        <div className="space-y-4 px-4 pb-6">
          {page === "profile" && <AvatarAndName profile={profile} save={save} />}
          {page === "health-details" && (
            <FieldsForm
              profile={profile}
              save={save}
              fields={["sex", "birth_date", "height_cm", "activity_level", "training_days_per_week"]}
            />
          )}
          {page === "goals" && (
            <>
              <FieldsForm profile={profile} save={save} fields={["goal"]} auto />
              <TargetsSection />
            </>
          )}
          {page === "units" && <FieldsForm profile={profile} save={save} fields={["energy_unit"]} auto />}
          {page === "notifications" && <RemindersSection profile={profile} save={save} />}
          {page === "apple-health" && <HealthSection />}
          {page === "calendar" && <CalendarSection profile={profile} save={save} />}
          {page === "meal-ideas" && <AiSection profile={profile} save={save} />}
          {page === "export" && (
            <Card className="divide-border divide-y">
              {(["logs", "weights", "workouts"] as const).map((t) => (
                <a key={t} href={`/api/export?type=${t}`} className="text-accent flex items-center gap-2 px-4 py-3.5">
                  <IconDownload width={18} height={18} /> Download {t} (CSV)
                </a>
              ))}
            </Card>
          )}
        </div>
      </>
    );

  return (
    <>
      <PageHeader
        title="Account"
        left={
          <Link
            href="/"
            className="bg-surface -ml-1 flex h-10 w-10 items-center justify-center rounded-full active:scale-95"
            aria-label="Back to Today"
          >
            <IconChevronLeft width={22} height={22} />
          </Link>
        }
      />
      <div className="space-y-5 px-4 pb-6">
        <Link href="/settings/profile" className="bg-surface flex items-center gap-4 rounded-3xl p-4 active:scale-[0.98]">
          <Avatar name={profile.name} emoji={profile.avatar_emoji} color={profile.avatar_color} size={64} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xl font-semibold">{profile.name}</span>
            <span className="text-muted block text-sm">Profile picture and name</span>
          </span>
          <IconChevronRight width={20} height={20} className="text-muted" />
        </Link>

        <RowGroup>
          <Row href="/settings/health-details" icon={IconRuler} color="var(--carbs)" label="Health details" />
          <Row href="/settings/goals" icon={IconTarget} color="var(--energy)" label="Goals & targets" />
          <Row
            href="/settings/units"
            icon={IconScale}
            color="var(--fat)"
            label="Units"
            value={profile.energy_unit === "kj" ? "kJ" : "kcal"}
          />
        </RowGroup>

        <RowGroup>
          <Row href="/settings/notifications" icon={IconBell} color="var(--danger)" label="Notifications" />
          <Row href="/settings/apple-health" icon={IconHeart} color="var(--energy)" label="Apple Health" />
          <Row href="/settings/calendar" icon={IconCalendarSync} color="var(--water)" label="Google Calendar" />
          <Row
            href="/settings/meal-ideas"
            icon={IconSparkles}
            color="var(--fibre)"
            label="Meal ideas & photo logging"
            value={profile.ai_enabled ? "On" : "Off"}
          />
        </RowGroup>

        <RowGroup>
          <Row href="/settings/export" icon={IconDownload} color="var(--muted)" label="Export data" />
          <button onClick={switchProfile} className="text-accent flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-white/5">
            <IconUsers width={20} height={20} />
            <span className="flex-1">Switch profile</span>
          </button>
        </RowGroup>
        <p className="text-muted text-center text-xs">This device is using {profile.name}&apos;s profile.</p>
      </div>
    </>
  );
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface divide-border divide-y overflow-hidden rounded-3xl">{children}</div>;
}

function Row({ href, icon: RowIcon, color, label, value }: { href: string; icon: Icon; color: string; label: string; value?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 active:bg-white/5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: color }}>
        <RowIcon width={17} height={17} />
      </span>
      <span className="flex-1">{label}</span>
      {value && <span className="text-muted text-sm">{value}</span>}
      <IconChevronRight width={18} height={18} className="text-muted" />
    </Link>
  );
}

type SaveFn = (patch: Partial<Profile>) => Promise<Profile>;

/** Profile fields with a Save button, or saving as soon as something changes (`auto`). */
function FieldsForm({
  profile,
  save,
  fields,
  auto,
}: {
  profile: Profile;
  save: SaveFn;
  fields: Parameters<typeof ProfileFields>[0]["fields"];
  auto?: boolean;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<ProfileDraft>({ ...profile });
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-4">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await save(draft);
            toast("Saved");
          } finally {
            setBusy(false);
          }
        }}
      >
        <ProfileFields
          value={draft}
          fields={fields}
          onChange={(d) => {
            setDraft(d);
            if (auto) save(d).catch(() => undefined);
          }}
        />
        {!auto && (
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        )}
      </form>
    </Card>
  );
}

const EMOJIS = [
  "😀",
  "😎",
  "🤓",
  "🥳",
  "🤠",
  "👻",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐸",
  "🐵",
  "🦄",
  "🐙",
  "🦖",
  "🐳",
  "⚽",
  "🏃",
  "🏋️",
  "🚴",
  "🏊",
  "🧗",
  "🥑",
  "🍌",
  "🍓",
  "🌮",
  "🍕",
  "☕",
  "🔥",
  "⚡",
  "🌈",
  "⭐",
  "🌊",
  "🏔️",
];
const COLOURS = ["#ff2d55", "#ff9500", "#ffcc00", "#34c759", "#30d5c8", "#0a84ff", "#5e5ce6", "#bf5af2", "#ff6482", "#8e8e93"];

function AvatarAndName({ profile, save }: { profile: Profile; save: SaveFn }) {
  const { setProfile } = useApp();
  const toast = useToast();
  const [name, setName] = useState(profile.name);
  const setAvatar = (emoji: string | null, color: string | null) => {
    const before = profile;
    setProfile({ ...profile, avatar_emoji: emoji, avatar_color: color });
    saveAvatar({ emoji, color }).then(setProfile, () => {
      setProfile(before);
      toast("Couldn't save — try again");
    });
  };
  const colour = profile.avatar_color ?? COLOURS[6];
  return (
    <>
      <div className="flex flex-col items-center gap-3 py-2">
        <Avatar name={profile.name} emoji={profile.avatar_emoji} color={profile.avatar_color} size={104} />
        {profile.avatar_emoji && (
          <button onClick={() => setAvatar(null, null)} className="text-accent text-sm">
            Use my initial instead
          </button>
        )}
      </div>
      <Card className="p-4">
        <div className="text-muted mb-2 text-sm">Background</div>
        <div className="flex flex-wrap gap-2.5">
          {COLOURS.map((c) => (
            <button
              key={c}
              onClick={() => setAvatar(profile.avatar_emoji ?? EMOJIS[0], c)}
              className={cx(
                "h-9 w-9 rounded-full transition active:scale-90",
                colour === c && profile.avatar_color && "ring-2 ring-white ring-offset-2 ring-offset-[var(--surface)]",
              )}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>
        <div className="text-muted mt-4 mb-2 text-sm">Emoji</div>
        <div className="grid grid-cols-6 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setAvatar(e, colour)}
              className={cx(
                "flex aspect-square items-center justify-center rounded-xl text-2xl transition active:scale-90",
                profile.avatar_emoji === e ? "bg-white/15" : "bg-surface-2",
              )}
              aria-label={`Use ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await save({ name: name.trim() });
            toast("Name saved");
          }}
        >
          <Input className="flex-1" label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <Button type="submit" variant="secondary" disabled={name.trim() === profile.name}>
            Save
          </Button>
        </form>
      </Card>
    </>
  );
}

const FIELDS: { key: keyof DayTargets; label: string; icon: Icon }[] = [
  { key: "energy_kj", label: "Energy", icon: IconEnergy },
  { key: "protein_g", label: "Protein", icon: IconProtein },
  { key: "carbs_g", label: "Carbs", icon: IconCarbs },
  { key: "fat_g", label: "Fat", icon: IconFat },
  { key: "fibre_g", label: "Fibre", icon: IconFibre },
];

function TargetsSection() {
  const { unit } = useApp();
  const toast = useToast();
  const [ctx, setCtx] = useState<GoalContext | null>(null);
  const [proteinPerKg, setProteinPerKg] = useState<number>(PROTEIN_G_PER_KG.default);
  const [form, setForm] = useState<Record<string, string>>({});

  const fill = (t: { training: DayTargets; rest: DayTargets }) => {
    const f: Record<string, string> = {};
    for (const p of ["training", "rest"] as const)
      for (const { key } of FIELDS) f[`${p}.${key}`] = String(key === "energy_kj" ? Math.round(toUnit(t[p][key], unit)) : t[p][key]);
    setForm(f);
  };

  useEffect(() => {
    getGoalContext().then((c) => {
      setCtx(c);
      if (c.goal) {
        const g = c.goal;
        fill({
          training: {
            energy_kj: g.training_kj,
            protein_g: g.training_protein_g,
            carbs_g: g.training_carbs_g,
            fat_g: g.training_fat_g,
            fibre_g: g.training_fibre_g,
          },
          rest: {
            energy_kj: g.rest_kj,
            protein_g: g.rest_protein_g,
            carbs_g: g.rest_carbs_g,
            fat_g: g.rest_fat_g,
            fibre_g: g.rest_fibre_g,
          },
        });
      } else if (c.suggested) fill(c.suggested);
      else
        // Nothing to calculate from yet: start from the targets in use today, so the boxes aren't blank.
        getDayPlans(today(), today()).then(([p]) => p && fill({ training: p.targets, rest: p.targets }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  async function recalc(opts: { tdeeKj?: number } = {}) {
    const c = await getGoalContext({ proteinPerKg, ...opts });
    setCtx(c);
    if (c.suggested) fill(c.suggested);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = (p: string, k: keyof DayTargets) => {
      const v = Number(form[`${p}.${k}`]);
      return k === "energy_kj" ? Math.round(fromUnit(v, unit)) : v;
    };
    try {
      await saveGoal({
        training_kj: n("training", "energy_kj"),
        training_protein_g: n("training", "protein_g"),
        training_carbs_g: n("training", "carbs_g"),
        training_fat_g: n("training", "fat_g"),
        training_fibre_g: n("training", "fibre_g"),
        rest_kj: n("rest", "energy_kj"),
        rest_protein_g: n("rest", "protein_g"),
        rest_carbs_g: n("rest", "carbs_g"),
        rest_fat_g: n("rest", "fat_g"),
        rest_fibre_g: n("rest", "fibre_g"),
      });
      toast("Targets saved");
      setCtx(await getGoalContext({ proteinPerKg }));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save targets");
    }
  }

  const cell = (p: "training" | "rest", key: keyof DayTargets, label: string) => (
    <input
      aria-label={`${p === "training" ? "Training" : "Rest"} day ${label}`}
      type="number"
      inputMode="decimal"
      min={0}
      value={form[`${p}.${key}`] ?? ""}
      onChange={(e) => setForm((f) => ({ ...f, [`${p}.${key}`]: e.target.value }))}
      className="tabular border-border bg-surface focus:border-accent h-10 w-full min-w-0 rounded-lg border px-2 text-right outline-none"
      required
    />
  );

  return (
    <Section id="targets" title="Daily targets" icon={IconTarget}>
      <Card className="space-y-4 p-4">
        {!ctx ? null : (
          <>
            <div className="bg-surface-2 rounded-xl p-3 text-sm">
              {ctx.formulaTdeeKj ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted">Estimated TDEE (Mifflin-St Jeor × activity)</span>
                    <span className="tabular font-medium">{formatEnergy(ctx.formulaTdeeKj, unit)}</span>
                  </div>
                  {ctx.weightKg && (
                    <div className="text-muted mt-1 text-xs">
                      Based on your latest weight of {ctx.weightKg} kg. Adaptive TDEE is in Trends once there are 14 days of data.
                    </div>
                  )}
                </>
              ) : (
                <span className="text-muted">
                  To calculate targets for you, add{" "}
                  {ctx.missing.filter((m) => !m.includes("weigh")).length > 0 && (
                    <>
                      your {ctx.missing.filter((m) => !m.includes("weigh")).join(", ")} in{" "}
                      <Link href="/settings/health-details" className="text-accent font-medium">
                        Health details
                      </Link>
                      {ctx.missing.some((m) => m.includes("weigh")) && " and "}
                    </>
                  )}
                  {ctx.missing.some((m) => m.includes("weigh")) && "a weigh-in (tap Weight on Today)"}. Until then you can set them by hand
                  below.
                </span>
              )}
            </div>

            {ctx.weightKg && (
              <label className="block">
                <span className="text-muted mb-1 flex justify-between text-sm">
                  <span>Protein</span>
                  <span className="tabular">
                    {proteinPerKg.toFixed(1)} g/kg · {Math.round(proteinPerKg * ctx.weightKg)} g
                  </span>
                </span>
                <input
                  type="range"
                  min={PROTEIN_G_PER_KG.min}
                  max={PROTEIN_G_PER_KG.max}
                  step={0.1}
                  value={proteinPerKg}
                  onChange={(e) => setProteinPerKg(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
            )}
            {ctx.formulaTdeeKj && (
              <Button type="button" variant="secondary" className="w-full" onClick={() => recalc()}>
                Calculate from my profile and goal
              </Button>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-[1fr_6rem_6rem] items-center gap-x-2 gap-y-2">
                <span />
                <span className="text-muted flex items-center justify-end gap-1 text-xs font-medium">
                  <IconDumbbell width={13} height={13} /> Training
                </span>
                <span className="text-muted flex items-center justify-end gap-1 text-xs font-medium">
                  <IconRest width={13} height={13} /> Rest
                </span>
                {FIELDS.map(({ key, label, icon: I }) => (
                  <div key={key} className="contents">
                    <span className="flex items-center gap-2 text-sm">
                      <I width={15} height={15} className="text-muted" />
                      {label}
                      <span className="text-muted text-xs">{key === "energy_kj" ? unitLabel(unit) : "g"}</span>
                    </span>
                    {cell("training", key, label)}
                    {cell("rest", key, label)}
                  </div>
                ))}
              </div>
              <p className="text-muted text-xs">
                Protein stays constant; training days get more carbs, rest days fewer, so the weekly average matches your goal.
              </p>
              <Button type="submit" className="w-full">
                Save targets
              </Button>
            </form>
          </>
        )}
      </Card>
    </Section>
  );
}

function AiSection({ profile, save }: { profile: Profile; save: SaveFn }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    aiAvailable().then(setAvailable, () => setAvailable(false));
  }, []);
  return (
    <Section title="Meal ideas & photo logging" icon={IconSparkles}>
      <Card className="p-4">
        {available === false ? (
          <p className="text-muted text-sm">This isn&apos;t set up on the server yet. It needs a free Gemini key (see the README).</p>
        ) : (
          <Toggle
            label="Meal ideas, photo logging and label reading"
            hint="Sends today's totals, targets, workouts, frequent foods and any photos you take to Google to work these out. Google may use them to improve its products."
            checked={profile.ai_enabled}
            onChange={(v) => save({ ai_enabled: v })}
          />
        )}
      </Card>
    </Section>
  );
}

const SHORTCUT_NAME = "kilo JOL Sync";

function HealthSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<{ hasKey: boolean; syncedAt: string | null } | null>(null);
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    getHealthStatus().then(setStatus, () => undefined);
  }, []);

  async function makeKey() {
    if (
      status?.hasKey &&
      !(await confirm({
        title: "Make a new sync key?",
        message: "The old one stops working, so you'll need to paste the new one into the shortcut.",
        confirm: "Make new key",
      }))
    )
      return;
    try {
      setKey(await createHealthKey());
      setStatus((s) => ({ hasKey: true, syncedAt: s?.syncedAt ?? null }));
    } catch {
      toast("Couldn't make a key — try again");
    }
  }

  return (
    <Section title="Apple Health" icon={IconHeart}>
      <Card className="space-y-3 p-4">
        <p className="text-muted text-sm">
          The <strong className="text-text">{SHORTCUT_NAME}</strong> shortcut brings your weight, active kJ and workouts in from Apple
          Health, and writes the food and water you log here back to Health.
        </p>
        {key ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Your sync key</div>
            <div className="bg-surface-2 tabular rounded-xl px-3 py-2.5 font-mono text-sm break-all select-all">{key}</div>
            <Button
              className="w-full"
              onClick={() =>
                navigator.clipboard.writeText(key).then(
                  () => toast("Copied — paste it into the shortcut"),
                  () => toast("Couldn't copy — select it and copy"),
                )
              }
            >
              <IconCopy width={16} height={16} /> Copy key
            </Button>
            <p className="text-muted text-xs">This is only shown once. Keep it private — anyone with it can add data to your profile.</p>
          </div>
        ) : (
          <Button variant={status?.hasKey ? "secondary" : "primary"} className="w-full" onClick={makeKey}>
            {status?.hasKey ? "Make a new sync key" : "Create my sync key"}
          </Button>
        )}
        {status?.hasKey && (
          <a
            href={`shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`}
            className="bg-accent text-accent-text flex h-11 items-center justify-center gap-2 rounded-xl font-medium active:scale-[0.98]"
          >
            <IconHeart width={16} height={16} /> Sync now
          </a>
        )}
        <p className="text-muted text-xs">
          {status?.syncedAt
            ? `Last synced ${new Date(status.syncedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}`
            : "Not synced yet"}
        </p>
      </Card>
    </Section>
  );
}

function CalendarSection({ profile, save }: { profile: Profile; save: SaveFn }) {
  const toast = useToast();
  const [url, setUrl] = useState(profile.calendar_ics_url ?? "");
  const [keywords, setKeywords] = useState(profile.calendar_keywords);
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Google Calendar" icon={IconCalendarSync}>
      <Card className="space-y-3 p-4">
        <p className="text-muted text-xs">
          In Google Calendar on a computer: Settings → your calendar → Integrate calendar → copy the{" "}
          <strong>Secret address in iCal format</strong>. Events whose titles match your keywords become workouts.
        </p>
        <Input
          label="Secret iCal address"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
        />
        <Input label="Keywords (comma separated)" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              await save({ calendar_ics_url: url.trim().replace(/^webcal:/i, "https:") || null, calendar_keywords: keywords });
              toast("Calendar settings saved");
            }}
          >
            Save
          </Button>
          <Button
            className="flex-1"
            disabled={busy || !profile.calendar_ics_url}
            onClick={async () => {
              setBusy(true);
              try {
                const n = await syncCalendar();
                toast(`Synced ${n} workout${n === 1 ? "" : "s"} from your calendar`);
              } catch (err) {
                toast(err instanceof Error ? err.message : "Sync failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Syncing…" : "Sync now"}
          </Button>
        </div>
        {profile.calendar_synced_at && (
          <p className="text-muted text-xs">Last synced {new Date(profile.calendar_synced_at).toLocaleString("en-AU")}</p>
        )}
      </Card>
    </Section>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function RemindersSection({ profile, save }: { profile: Profile; save: SaveFn }) {
  const toast = useToast();
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [time, setTime] = useState(profile.remind_log_time?.slice(0, 5) ?? "");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setSubscribed(!!s));
  }, []);

  async function enable() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return toast("Notifications are blocked for this app");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid!) });
      await savePushSubscription(JSON.parse(JSON.stringify(sub)));
      setSubscribed(true);
      toast("Reminders enabled on this device");
    } catch {
      toast("Couldn't enable notifications. On iPhone, add kilo JOL to your Home Screen first.");
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setSubscribed(false);
  }

  return (
    <Section title="Reminders" icon={IconBell}>
      <Card className="space-y-3 p-4">
        {!vapid ? (
          <p className="text-muted text-sm">Reminders aren&apos;t set up on the server yet.</p>
        ) : subscribed === null ? (
          <p className="text-muted text-sm">
            Notifications aren&apos;t available here. On iPhone, install kilo JOL to the Home Screen and open it from there.
          </p>
        ) : (
          <Button variant={subscribed ? "secondary" : "primary"} className="w-full" onClick={subscribed ? disable : enable}>
            {subscribed ? "Turn off reminders on this device" : "Turn on reminders on this device"}
          </Button>
        )}
        <div className="flex items-end gap-2">
          <Input className="flex-1" label="Remind me to log food at" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <Button
            variant="secondary"
            onClick={() =>
              save({ remind_log_time: time || null }).then(() => toast(time ? `Daily reminder at ${time}` : "Daily reminder off"))
            }
          >
            Save
          </Button>
        </div>
        <Toggle
          label="Pre-workout fuelling reminders"
          hint="About 2½ hours before a session"
          checked={profile.remind_workouts}
          onChange={(v) => save({ remind_workouts: v })}
        />
      </Card>
    </Section>
  );
}
