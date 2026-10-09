import { Suspense } from "react";
import { UnlockForm } from "./unlock-form";

export default function UnlockPage() {
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-2 text-xl font-semibold">Household passcode</h1>
      <p className="text-muted mb-6 text-sm">Enter it once on this device.</p>
      <Suspense>
        <UnlockForm />
      </Suspense>
    </main>
  );
}
