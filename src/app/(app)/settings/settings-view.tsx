"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { ProfileFields, type ProfileDraft } from "@/components/profile-fields";
import { useToast } from "@/components/toast";
import { Button, Card, Input, PageHeader, SectionTitle, Toggle } from "@/components/ui";
import {
  IconBell,
  IconCalendarSync,
  IconCarbs,
  IconDownload,
  IconDumbbell,
  IconEnergy,
  IconFat,
  IconFibre,
  IconPhone,
  IconProtein,
  IconRest,
  IconSparkles,
  IconTarget,
  IconToday,
  IconUsers,
  type Icon,
} from "@/components/icons";
import { fromUnit, formatEnergy, toUnit, unitLabel } from "@/lib/energy";
import { PROTEIN_G_PER_KG } from "@/lib/tdee";
import type { DayTargets, Profile } from "@/lib/types";
import { saveProfile } from "@/server/actions/profile";
import { getGoalContext, saveGoal, syncCalendar, type GoalContext } from "@/server/actions/plan";
import { removePushSubscription, savePushSubscription } from "@/server/actions/push";

function Section({ id, title, icon, children }: { id?: string; title: string; icon: Icon; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16">
      <SectionTitle icon={icon}>{title}</SectionTitle>
      {children}
    </section>
  );
}

export function SettingsView() {
  const { profile, setProfile, switchProfile } = useApp();
  const toast = useToast();

  /** Save a partial change to the profile. */
  const save = async (patch: Partial<Profile>) => {
    try {
      const next = await saveProfile({ ...profile, ...patch });
      setProfile(next);
      return next;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save");
      throw err;
    }
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6 px-4 pb-6">
        <ProfileSection profile={profile} save={save} />
        <TargetsSection />
        <AiSection profile={profile} save={save} />
        <CalendarSection profile={profile} save={save} />
        <RemindersSection profile={profile} save={save} />
        <Section title="Export" icon={IconDownload}>
          <Card className="divide-border divide-y">
            {(["logs", "weights", "workouts"] as const).map((t) => (
              <a key={t} href={`/api/export?type=${t}`} className="text-accent flex items-center gap-2 px-4 py-3 text-sm">
                <IconDownload width={16} height={16} /> Download {t} (CSV)
              </a>
            ))}
          </Card>
        </Section>
        <Section title="This device" icon={IconPhone}>
          <Card className="divide-border divide-y">
            <div className="px-4 py-3 text-sm">
              This device is using <span className="font-medium">{profile.name}</span>&apos;s profile.
            </div>
            <button onClick={switchProfile} className="text-accent flex w-full items-center gap-2 px-4 py-3 text-left text-sm">
              <IconUsers width={16} height={16} /> Switch profile
            </button>
          </Card>
        </Section>
      </div>
    </>
  );
}

type SaveFn = (patch: Partial<Profile>) => Promise<Profile>;

function ProfileSection({ profile, save }: { profile: Profile; save: SaveFn }) {
  const toast = useToast();
  const [draft, setDraft] = useState<ProfileDraft>({ ...profile });
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Profile" icon={IconToday}>
      <Card className="p-4">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await save(draft);
              toast("Profile saved");
            } finally {
              setBusy(false);
            }
          }}
        >
          <ProfileFields value={draft} onChange={setDraft} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </Card>
    </Section>
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
                  To calculate targets, add your {ctx.missing.join(", ")} (Profile above, and log a weight in Trends).
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
  return (
    <Section title="AI features (Claude)" icon={IconSparkles}>
      <Card className="p-4">
        <Toggle
          label="Claude suggestions, photo logging and label reading"
          hint="Sends today's totals, targets, workouts, frequent foods and any photos you take to the Claude API."
          checked={profile.ai_enabled}
          onChange={(v) => save({ ai_enabled: v })}
        />
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
          <p className="text-muted text-sm">Push reminders need VAPID keys configured on the server (see README).</p>
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
