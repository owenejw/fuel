"use client";

import { useSearchParams } from "next/navigation";
import { OtpForm } from "@/components/auth/otp-form";

export function LoginForm() {
  const params = useSearchParams();
  const error = params.get("error");
  return (
    <>
      {error && (
        <p className="bg-surface-2 text-danger mb-4 rounded-xl p-3 text-sm">
          That sign-in link has expired or was already used. Request a new code.
        </p>
      )}
      <OtpForm next={params.get("next") ?? "/"} />
    </>
  );
}
