"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { IconCalendar, IconChart, IconMeal, IconPlus, IconToday, type Icon } from "./icons";
import { cx } from "./ui";

type Tab = { href: string; label: string; Icon: Icon; match?: string[] };

const LEFT: Tab[] = [
  { href: "/", label: "Today", Icon: IconToday, match: ["/nutrition", "/micros", "/settings"] },
  { href: "/meals", label: "Meals", Icon: IconMeal },
];
const RIGHT: Tab[] = [
  { href: "/trends", label: "Trends", Icon: IconChart },
  { href: "/plan", label: "Plan", Icon: IconCalendar },
];
const TABS = [...LEFT, ...RIGHT];

/** Floating "liquid glass" capsule. A glass highlight slides to the active tab. */
export function TabBar() {
  const realPath = usePathname();
  // Highlight the tapped tab immediately, before the page has loaded.
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const pathname = pending && pending.from === realPath ? pending.to : realPath;
  const isActive = (t: Tab) =>
    (t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)) || !!t.match?.some((m) => pathname.startsWith(m));
  const logActive = pathname.startsWith("/log");
  const activeIndex = logActive ? -1 : TABS.findIndex(isActive);

  const bar = useRef<HTMLUListElement>(null);
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  const [lens, setLens] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = items.current[activeIndex];
      const parent = bar.current;
      if (!el || !parent) return setLens(null);
      const a = el.getBoundingClientRect();
      const b = parent.getBoundingClientRect();
      setLens({ x: a.left - b.left, w: a.width });
    };
    measure();
    // Re-measure whenever the bar's layout settles or changes (fonts, rotation, safe areas).
    const ro = new ResizeObserver(measure);
    if (bar.current) ro.observe(bar.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex]);

  const tab = (t: Tab, i: number) => {
    const active = i === activeIndex;
    return (
      <li key={t.href} className="relative z-10 flex-1">
        <Link
          ref={(el) => {
            items.current[i] = el;
          }}
          href={t.href}
          onClick={() => setPending({ from: realPath, to: t.href })}
          className={cx(
            "flex h-14 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition-colors duration-300 active:scale-95",
            active ? "text-accent" : "text-white/80",
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
      <ul ref={bar} className="glass pointer-events-auto relative mx-auto flex max-w-lg items-center gap-1 rounded-full p-1.5">
        {lens && (
          <span
            aria-hidden
            className="glass-lens absolute top-1.5 bottom-1.5 left-0 rounded-full transition-[transform,width] duration-[420ms] ease-[cubic-bezier(0.3,1.4,0.5,1)]"
            style={{ width: lens.w, transform: `translateX(${lens.x}px)` }}
          />
        )}
        {LEFT.map((t, i) => tab(t, i))}
        <li className="relative z-10 flex shrink-0 justify-center px-1">
          <Link
            href="/log"
            aria-label="Log food"
            aria-current={logActive ? "page" : undefined}
            onClick={() => setPending({ from: realPath, to: "/log" })}
            className={cx(
              "glass-accent text-accent-text flex h-14 w-14 items-center justify-center rounded-full transition active:scale-90",
              logActive && "ring-2 ring-white/70",
            )}
          >
            <IconPlus width={28} height={28} strokeWidth={2.8} />
          </Link>
        </li>
        {RIGHT.map((t, i) => tab(t, i + LEFT.length))}
      </ul>
    </nav>
  );
}
