"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";

/**
 * Two-step email sign-in. The email contains both a magic link and a one-time
 * code; the code is what makes sign-in work inside an installed iOS PWA,
 * where links open in Safari rather than the app.
 */
export function OtpForm({
  initialEmail = "",
  next = "/",
  beforeSend,
  extraFields,
  submitLabel = "Email me a sign-in code",
}: {
  initialEmail?: string;
  next?: string;
  beforeSend?: (email: string) => Promise<string | null>;
  extraFields?: React.ReactNode;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const addr = email.trim().toLowerCase();
    try {
      if (beforeSend) {
        const err = await beforeSend(addr);
        if (err) throw new Error(err);
      }
      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/confirm?next=${encodeURIComponent(next)}` },
      });
      if (error) {
        throw new Error(
          /signups not allowed|not found|otp_disabled/i.test(error.message)
            ? "No account with that email. You need an invite code to sign up."
            : error.message,
        );
      }
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError("That code didn't work. Check it, or request a new one.");
    router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="space-y-4">
        <p className="text-muted text-sm">
          We emailed a code to <strong className="text-text">{email}</strong>. Enter it below, or tap the link in the email.
        </p>
        <Input
          label="Sign-in code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
          required
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
          {busy ? "Checking…" : "Sign in"}
        </Button>
        <button type="button" className="text-muted w-full text-sm" onClick={() => setStep("email")}>
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={send} className="space-y-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {extraFields}
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}
