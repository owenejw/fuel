"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCalendar, IconChart, IconPlus, IconSettings, IconToday, type Icon } from "./icons";
import { cx } from "./ui";

type Tab = { href: string; label: string; Icon: Icon };

const LEFT: Tab[] = [
  { href: "/", label: "Today", Icon: IconToday },
  { href: "/trends", label: "Trends", Icon: IconChart },
];
const RIGHT: Tab[] = [
  { href: "/plan", label: "Plan", Icon: IconCalendar },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

export function TabBar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const logActive = isActive("/log");

  const tab = ({ href, label, Icon }: Tab) => {
    const active = isActive(href);
    return (
      <li key={href} className="flex-1">
        <Link
          href={href}
          className={cx(
            "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition",
            active ? "text-accent" : "text-muted",
          )}
          aria-current={active ? "page" : undefined}
        >
          <Icon width={22} height={22} strokeWidth={active ? 2.4 : 1.9} />
          {label}
        </Link>
      </li>
    );
  };

  return (
    <nav className="pb-safe border-border bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur">
      <ul className="mx-auto flex max-w-lg items-stretch">
        {LEFT.map(tab)}
        <li className="flex flex-1 justify-center">
          <Link
            href="/log"
            aria-label="Log food"
            aria-current={logActive ? "page" : undefined}
            className="group -mt-6 flex flex-col items-center gap-1 text-[11px] font-medium"
          >
            <span
              className={cx(
                "bg-accent text-accent-text ring-bg flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 transition group-active:scale-95",
                logActive && "brightness-110",
              )}
            >
              <IconPlus width={28} height={28} strokeWidth={2.6} />
            </span>
            <span className={logActive ? "text-accent" : "text-muted"}>Log</span>
          </Link>
        </li>
        {RIGHT.map(tab)}
      </ul>
    </nav>
  );
}
