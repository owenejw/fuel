import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <p className="text-muted mb-6 text-sm">Accounts are invite-only. Your data is private to you — nobody else can see it.</p>
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
