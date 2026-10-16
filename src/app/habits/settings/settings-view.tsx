"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { IconVacation } from "@/components/habits/habit-icons";
import { useHabits } from "@/components/habits/habits-provider";
import { IconBell, IconUsers } from "@/components/icons";
import { SECTION_MEMORY_OFF } from "@/components/sections";
import { Avatar } from "@/components/summary";
import { useToast } from "@/components/toast";
import { BackButton, Button, Card, Input, PageHeader, PageSkeleton, Toggle } from "@/components/ui";
import { friendlyDate } from "@/lib/dates";
import { isPaused } from "@/lib/habits/progress";
import { savePushSubscription } from "@/server/actions/push";

/** Habits settings: vacation mode, reminders, the weekly review, and which section the app opens to. */
export function HabitSettingsView() {
  const { profile, switchProfile } = useApp();
  const { data, today, setVacation, savePrefs } = useHabits();
  const toast = useToast();
  const [nudge, setNudge] = useState<string | null>(null);
  const [memory, setMemory] = useState(() => {
    try {
      return localStorage.getItem(SECTION_MEMORY_OFF) !== "1";
    } catch {
      return true;
    }
  });
  if (!data)
    return (
      <div className="pt-safe px-4 pt-20">
        <PageSkeleton />
      </div>
    );
  const away = isPaused(data.pauses, today);
  const pause = data.pauses.find((p) => p.start_date <= today && (!p.end_date || p.end_date >= today));
  const nudgeTime = nudge ?? data.prefs.nudge_time ?? "20:30";

  return (
    <>
      <PageHeader title="Habit settings" left={<BackButton href="/habits" />} />
      <div className="space-y-4 px-4 pb-6">
        <Card className="flex items-center gap-4 p-4">
          <Avatar name={profile.name} emoji={profile.avatar_emoji} color={profile.avatar_color} size={52} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">{profile.name}</span>
            <span className="text-muted block text-sm">Habits belong to this profile only</span>
          </span>
          <Button variant="secondary" size="sm" onClick={switchProfile}>
            <IconUsers width={16} height={16} /> Switch
          </Button>
        </Card>

        <Card className="space-y-3 p-4">
          <Toggle
            icon={IconVacation}
            label="Vacation mode"
            hint="Pauses every habit. Streaks and strength freeze, and reminders stop."
            checked={away}
            onChange={(on) => setVacation(on).then(() => toast(on ? "Enjoy your break" : "Welcome back"))}
          />
          {away && pause && (
            <>
              <Input
                label="Back on (optional)"
                type="date"
                min={today}
                value={pause.end_date ?? ""}
                onChange={(e) => setVacation(true, e.target.value || null)}
              />
              <p className="text-muted text-xs">
                Away since {friendlyDate(pause.start_date).toLowerCase()}
                {pause.end_date ? `, until ${friendlyDate(pause.end_date).toLowerCase()}` : ". Turn this off when you're back"}.
              </p>
            </>
          )}
        </Card>

        <PushCard />

        <Card className="space-y-3 p-4">
          <Toggle
            icon={IconBell}
            label="Evening nudge"
            hint="One reminder listing habits still unticked. Nothing is sent if you're all done."
            checked={!!data.prefs.nudge_time}
            onChange={(on) => savePrefs({ nudge_time: on ? nudgeTime : null })}
          />
          {data.prefs.nudge_time && (
            <div className="flex items-end gap-2">
              <Input className="flex-1" label="At" type="time" value={nudgeTime} onChange={(e) => setNudge(e.target.value)} />
              <Button variant="secondary" onClick={() => nudge && savePrefs({ nudge_time: nudge }).then(() => toast(`Nudge at ${nudge}`))}>
                Save
              </Button>
            </div>
          )}
          <p className="text-muted text-xs">
            Each habit can have its own reminder too. Reminders arrive within about 15 minutes of the time set.
          </p>
        </Card>

        <Card className="space-y-4 p-4">
          <Toggle
            label="Sunday review"
            hint="A card on Sunday and Monday with your best habit, most missed and patterns"
            checked={data.prefs.weekly_review}
            onChange={(v) => savePrefs({ weekly_review: v })}
          />
          <Toggle
            label="Open where I left off"
            hint="Opening the app goes to Habits if that's where you were last"
            checked={memory}
            onChange={(v) => {
              setMemory(v);
              try {
                if (v) localStorage.removeItem(SECTION_MEMORY_OFF);
                else localStorage.setItem(SECTION_MEMORY_OFF, "1");
              } catch {
                // Not stored; it just won't be remembered.
              }
            }}
          />
        </Card>

        <p className="text-muted px-2 text-center text-xs">
          Habits can read your nutrition log for auto-completing habits. Nothing from here ever appears in the nutrition side.
        </p>
      </div>
    </>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Notifications on this device. The subscription is shared with nutrition reminders, so it's only switched on here. */
function PushCard() {
  const toast = useToast();
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
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
      toast("Notifications on for this device");
    } catch {
      toast("Couldn't turn on notifications. On iPhone, add kilo JOL to your Home Screen first.");
    }
  }

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-3">
        <span className="bg-surface-2 text-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <IconBell width={18} height={18} />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          Notifications on this device
          <span className="text-muted block text-xs">
            {!vapid
              ? "Not set up on the server yet"
              : subscribed === null
                ? "On iPhone, add kilo JOL to the Home Screen and open it from there"
                : subscribed
                  ? "On"
                  : "Off"}
          </span>
        </span>
        {vapid && subscribed === false && (
          <Button size="sm" onClick={enable}>
            Turn on
          </Button>
        )}
      </div>
    </Card>
  );
}
