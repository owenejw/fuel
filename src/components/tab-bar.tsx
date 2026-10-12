"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBook, IconCalendar, IconChart, IconPlus, IconToday, type Icon } from "./icons";
import { cx } from "./ui";

type Tab = { href: string; label: string; Icon: Icon; match?: string[] };

const LEFT: Tab[] = [
  { href: "/", label: "Today", Icon: IconToday, match: ["/nutrition"] },
  { href: "/diary", label: "Diary", Icon: IconBook },
];
const RIGHT: Tab[] = [
  { href: "/trends", label: "Trends", Icon: IconChart },
  { href: "/plan", label: "Plan", Icon: IconCalendar },
];

/** Floating capsule nav. Settings lives behind the avatar on Today. */
export function TabBar() {
  const pathname = usePathname();
  const isActive = (t: Tab) =>
    (t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)) || !!t.match?.some((m) => pathname.startsWith(m));
  const logActive = pathname.startsWith("/log");

  const tab = (t: Tab) => {
    const active = isActive(t);
    return (
      <li key={t.href} className="flex-1">
        <Link
          href={t.href}
          className={cx(
            "flex h-14 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition",
            active ? "text-accent bg-white/10" : "text-white/75",
          )}
          aria-current={active ? "page" : undefined}
        >
          <t.Icon width={22} height={22} strokeWidth={active ? 2.4 : 2} />
          {t.label}
        </Link>
      </li>
    );
  };

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <ul className="pointer-events-auto mx-auto flex max-w-lg items-center gap-1 rounded-full border border-white/10 bg-[#1c1c1e]/80 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        {LEFT.map(tab)}
        <li className="flex shrink-0 justify-center px-1">
          <Link
            href="/log"
            aria-label="Log food"
            aria-current={logActive ? "page" : undefined}
            className={cx(
              "bg-accent text-accent-text flex h-14 w-14 items-center justify-center rounded-full shadow-[0_4px_16px_rgba(48,213,200,0.45)] transition active:scale-95",
              logActive && "ring-2 ring-white/60",
            )}
          >
            <IconPlus width={28} height={28} strokeWidth={2.8} />
          </Link>
        </li>
        {RIGHT.map(tab)}
      </ul>
    </nav>
  );
}
