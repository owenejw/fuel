"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { ProfileFields, type ProfileDraft } from "@/components/profile-fields";
import { Button, Input } from "@/components/ui";
import { saveProfile } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { today } from "@/lib/dates";

export function OnboardingForm() {
  const router = useRouter();
  const { userId, profile, setProfile } = useApp();
  const [draft, setDraft] = useState<ProfileDraft>({ ...profile });
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = { ...draft, user_id: userId };
      await saveProfile(p);
      if (weight) {
        const { error } = await supabaseBrowser()
          .from("weights")
          .upsert({ user_id: userId, date: today(), kg: Number(weight) }, { onConflict: "user_id,date" });
        if (error) throw new Error(error.message);
      }
      setProfile(p);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <main className="pt-safe mx-auto max-w-md px-5 py-8">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p className="text-muted mt-1 mb-6">A few details to set sensible targets. You can change these any time in Settings.</p>
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
          {busy ? "Saving…" : "Get started"}
        </Button>
      </form>
    </main>
  );
}
