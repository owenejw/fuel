"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { ProfileFields, type ProfileDraft } from "@/components/profile-fields";
import { Button, Input } from "@/components/ui";
import { saveProfile } from "@/server/actions/profile";
import { saveWeight } from "@/server/actions/plan";
import { today } from "@/lib/dates";

export function OnboardingForm() {
  const router = useRouter();
  const { profile, setProfile } = useApp();
  const [draft, setDraft] = useState<ProfileDraft>({ ...profile });
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveProfile({ ...profile, ...draft });
      if (weight) await saveWeight(today(), Number(weight));
      setProfile(saved);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <main className="pt-safe mx-auto max-w-md px-5 py-8">
      <h1 className="text-2xl font-semibold">Hi {profile.name}</h1>
      <p className="text-muted mt-1 mb-6">A few details to calculate your targets. You can change these any time in Settings.</p>
      <form onSubmit={submit} className="space-y-4">
        <ProfileFields value={draft} onChange={setDraft} />
        <Input
          label="Current weight (kg)"
          type="number"
          inputMode="decimal"
          step="0.1"
          min={20}
          max={400}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>
        <button type="button" className="text-muted w-full text-sm" onClick={() => router.replace("/")}>
          Skip for now
        </button>
      </form>
    </main>
  );
}
