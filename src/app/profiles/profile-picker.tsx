"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createProfile, listProfiles, selectProfile } from "@/server/actions/profile";
import { Button, Input, Spinner } from "@/components/ui";

const COLOURS = ["bg-teal-600", "bg-indigo-600", "bg-orange-600", "bg-pink-600", "bg-lime-700", "bg-sky-600"];

/** "Who's using this device?" — the choice is remembered in a long-lived cookie. */
export function ProfilePicker() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProfiles().then(setProfiles, () => setError("Couldn't load profiles — is the database running?"));
  }, []);

  async function choose(id: string) {
    setBusy(id);
    await selectProfile(id);
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
        <span className="text-2xl font-semibold">Fuel</span>
      </div>
      <h1 className="mb-1 text-xl font-semibold">Who&apos;s this?</h1>
      <p className="text-muted mb-6 text-sm">This device will remember your choice. You can switch any time in Settings.</p>
      {error && <p className="text-danger mb-4 text-sm">{error}</p>}
      {profiles === null && !error ? (
        <div className="text-muted flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <ul className="space-y-3">
          {(profiles ?? []).map((p, i) => (
            <li key={p.id}>
              <button
                onClick={() => choose(p.id)}
                disabled={!!busy}
                className="border-border bg-surface flex w-full items-center gap-4 rounded-2xl border p-4 text-left active:scale-[0.99]"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white ${COLOURS[i % COLOURS.length]}`}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 text-lg font-medium">{p.name}</span>
                {busy === p.id && <Spinner className="text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form
          className="mt-6 flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await createProfile(name);
              router.replace("/onboarding");
            } catch {
              setError("Couldn't add that name — it may already exist.");
            }
          }}
        >
          <Input className="flex-1" label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={40} />
          <Button type="submit">Add</Button>
        </form>
      ) : (
        <button className="text-accent mt-6 text-sm" onClick={() => setAdding(true)}>
          + Add someone
        </button>
      )}
    </main>
  );
}
