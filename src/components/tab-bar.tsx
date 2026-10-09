"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCalendar, IconChart, IconPlus, IconSettings, IconToday } from "./icons";
import { cx } from "./ui";

const TABS = [
  { href: "/", label: "Today", Icon: IconToday },
  { href: "/log", label: "Log", Icon: IconPlus },
  { href: "/trends", label: "Trends", Icon: IconChart },
  { href: "/plan", label: "Plan", Icon: IconCalendar },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe border-border bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cx("flex h-16 flex-col items-center justify-center gap-0.5 text-xs", active ? "text-accent" : "text-muted")}
                aria-current={active ? "page" : undefined}
              >
                {href === "/log" ? (
                  <span
                    className={cx(
                      "flex h-8 w-12 items-center justify-center rounded-full",
                      active ? "bg-accent text-accent-text" : "bg-accent-soft text-accent",
                    )}
                  >
                    <Icon width={22} height={22} />
                  </span>
                ) : (
                  <Icon width={22} height={22} />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
