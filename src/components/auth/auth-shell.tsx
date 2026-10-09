import Link from "next/link";

export function AuthShell({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <Link href="/" className="mb-8 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
        <span className="text-2xl font-semibold">Fuel</span>
      </Link>
      <h1 className="mb-6 text-xl font-semibold">{title}</h1>
      {children}
      {footer && <div className="text-muted mt-8 text-center text-sm">{footer}</div>}
    </main>
  );
}
