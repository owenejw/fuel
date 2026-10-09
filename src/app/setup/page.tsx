export default function SetupPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-4 text-xl font-semibold">Almost there</h1>
      <p className="text-muted">
        Supabase isn&apos;t configured yet. Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Supabase URL and keys,
        then restart the dev server. See the README for the full setup.
      </p>
    </main>
  );
}
