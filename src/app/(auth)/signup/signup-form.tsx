"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { OtpForm } from "@/components/auth/otp-form";
import { Input } from "@/components/ui";

export function SignupForm() {
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");

  async function redeem(email: string) {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (res.ok || res.status === 409) return null; // 409: already has an account → just sign in
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Sign-up failed";
  }

  return (
    <OtpForm
      next="/onboarding"
      beforeSend={redeem}
      submitLabel="Create account"
      extraFields={
        <Input
          label="Invite code"
          autoCapitalize="characters"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
        />
      }
    />
  );
}
