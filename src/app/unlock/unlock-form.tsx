"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { unlock } from "./actions";

export function UnlockForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await unlock(code)) router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
        else setError(true);
      }}
    >
      <Input label="Passcode" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
      {error && <p className="text-danger text-sm">That&apos;s not it.</p>}
      <Button type="submit" className="w-full">
        Continue
      </Button>
    </form>
  );
}
