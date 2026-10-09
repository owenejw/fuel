"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { ProfileFields, type ProfileDraft } from "@/components/profile-fields";
import { useToast } from "@/components/toast";
import { Button, Card, Input, PageHeader, Sheet } from "@/components/ui";
import { DEFAULT_TARGETS, fetchGoalFor, saveGoal, saveProfile } from "@/lib/data";
import { today } from "@/lib/dates";
import { fromUnit, toUnit, unitLabel } from "@/lib/energy";
import { cacheClearAll } from "@/lib/offline";
import type { Goal } from "@/lib/types";

export function SettingsView() {
  const { userId, email, profile, setProfile, signOut, unit } = useApp();
  const toast = useToast();
  const [draft, setDraft] = useState<ProfileDraft>({ ...profile });
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsAdmin(!!d?.isAdmin))
      .catch(() => undefined);
  }, []);

  async function saveProfileForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const p = { ...draft, user_id: userId };
      await saveProfile(p);
      setProfile(p);
      toast("Profile saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6 px-4">
        <section>
          <h2 className="text-muted mb-2 text-sm font-semibold tracking-wide uppercase">Profile</h2>
          <Card className="p-4">
            <form onSubmit={saveProfileForm} className="space-y-4">
              <ProfileFields value={draft} onChange={setDraft} />
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </form>
          </Card>
        </section>

        <TargetsSection userId={userId} unit={unit} />

        <section>
          <h2 className="text-muted mb-2 text-sm font-semibold tracking-wide uppercase">Account</h2>
          <Card className="divide-border divide-y">
            <div className="px-4 py-3 text-sm">
              Signed in as <span className="font-medium">{email}</span>
            </div>
            {isAdmin && (
              <Link href="/admin" className="text-accent block px-4 py-3 text-sm">
                Invite codes (admin)
              </Link>
            )}
            <button onClick={signOut} className="block w-full px-4 py-3 text-left text-sm">
              Sign out
            </button>
            <button onClick={() => setDeleteOpen(true)} className="text-danger block w-full px-4 py-3 text-left text-sm">
              Delete account and all data…
            </button>
          </Card>
          <p className="text-muted mt-2 px-1 text-xs">
            Your logs, foods and settings are private to your account. Nobody else can see them.
          </p>
        </section>
      </div>
      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </>
  );
}

function TargetsSection({ userId, unit }: { userId: string; unit: ReturnType<typeof useApp>["unit"] }) {
  const toast = useToast();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchGoalFor(today())
      .then((g) => {
        setGoal(g);
        const t = (p: "training" | "rest") =>
          g
            ? { kj: g[`${p}_kj`], protein: g[`${p}_protein_g`], carbs: g[`${p}_carbs_g`], fat: g[`${p}_fat_g`], fibre: g[`${p}_fibre_g`] }
            : {
                kj: DEFAULT_TARGETS.energy_kj,
                protein: DEFAULT_TARGETS.protein_g,
                carbs: DEFAULT_TARGETS.carbs_g,
                fat: DEFAULT_TARGETS.fat_g,
                fibre: DEFAULT_TARGETS.fibre_g,
              };
        const f: Record<string, string> = {};
        for (const p of ["training", "rest"] as const) {
          const v = t(p);
          f[`${p}_kj`] = String(Math.round(toUnit(v.kj, unit)));
          f[`${p}_protein_g`] = String(v.protein);
          f[`${p}_carbs_g`] = String(v.carbs);
          f[`${p}_fat_g`] = String(v.fat);
          f[`${p}_fibre_g`] = String(v.fibre);
        }
        setForm(f);
      })
      .finally(() => setLoaded(true));
  }, [unit]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = (k: string) => Number(form[k]);
    try {
      await saveGoal(userId, {
        effective_date: today(),
        training_kj: Math.round(fromUnit(n("training_kj"), unit)),
        training_protein_g: n("training_protein_g"),
        training_carbs_g: n("training_carbs_g"),
        training_fat_g: n("training_fat_g"),
        training_fibre_g: n("training_fibre_g"),
        rest_kj: Math.round(fromUnit(n("rest_kj"), unit)),
        rest_protein_g: n("rest_protein_g"),
        rest_carbs_g: n("rest_carbs_g"),
        rest_fat_g: n("rest_fat_g"),
        rest_fibre_g: n("rest_fibre_g"),
      });
      toast("Targets saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save targets");
    }
  }

  const row = (p: "training" | "rest") => (
    <div className="grid grid-cols-5 gap-2">
      {[
        [`${p}_kj`, unitLabel(unit)],
        [`${p}_protein_g`, "Protein g"],
        [`${p}_carbs_g`, "Carbs g"],
        [`${p}_fat_g`, "Fat g"],
        [`${p}_fibre_g`, "Fibre g"],
      ].map(([k, label]) => (
        <Input
          key={k}
          label={label}
          type="number"
          inputMode="decimal"
          min={0}
          value={form[k] ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
          className="[&_input]:px-2 [&_span]:text-xs"
          required
        />
      ))}
    </div>
  );

  return (
    <section id="targets">
      <h2 className="text-muted mb-2 text-sm font-semibold tracking-wide uppercase">Daily targets</h2>
      <Card className="p-4">
        {!loaded ? null : (
          <form onSubmit={save} className="space-y-4">
            {!goal && <p className="text-muted text-sm">These are placeholders. A TDEE-based calculator arrives in the next phase.</p>}
            <div>
              <div className="mb-1 text-sm font-medium">Training days</div>
              {row("training")}
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">Rest days</div>
              {row("rest")}
            </div>
            <Button type="submit" className="w-full">
              Save targets
            </Button>
          </form>
        )}
      </Card>
    </section>
  );
}

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (!res.ok) {
      setBusy(false);
      return setError("Could not delete the account. Try again.");
    }
    cacheClearAll();
    window.location.replace(new URL("/login", window.location.origin));
  }

  return (
    <Sheet open={open} onClose={onClose} title="Delete account">
      <div className="space-y-4">
        <p className="text-sm">
          This permanently deletes your account and <strong>all</strong> of your data: food logs, custom foods, saved meals, recipes,
          weights, workouts, goals and water logs. It can&apos;t be undone.
        </p>
        <Input
          label='Type "DELETE" to confirm'
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoCapitalize="characters"
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button variant="danger" className="w-full" disabled={confirmText !== "DELETE" || busy} onClick={del}>
          {busy ? "Deleting…" : "Delete everything"}
        </Button>
      </div>
    </Sheet>
  );
}
