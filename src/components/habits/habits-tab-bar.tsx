"use client";

import { IconCalendar, IconChart, IconPlus, IconToday } from "../icons";
import { GlassTabBar, type Tab } from "../tab-bar";
import { IconList } from "./habit-icons";

const LEFT: Tab[] = [
  { href: "/habits", label: "Today", Icon: IconToday },
  { href: "/habits/calendar", label: "Calendar", Icon: IconCalendar },
];
const RIGHT: Tab[] = [
  { href: "/habits/insights", label: "Insights", Icon: IconChart, match: ["/habits/review"] },
  { href: "/habits/manage", label: "Habits", Icon: IconList },
];

const OTHER_ROOTS = ["/habits/calendar", "/habits/insights", "/habits/review", "/habits/new"];

function isActive(t: Tab, pathname: string) {
  if (t.href === "/habits") return pathname === "/habits" || pathname.startsWith("/habits/settings");
  if (t.href === "/habits/manage")
    // A habit's own pages (/habits/<id>) belong to the Habits tab.
    return (
      pathname.startsWith("/habits/manage") ||
      (/^\/habits\/[^/]+/.test(pathname) && !pathname.startsWith("/habits/settings") && !OTHER_ROOTS.some((r) => pathname.startsWith(r)))
    );
  return pathname.startsWith(t.href) || !!t.match?.some((m) => pathname.startsWith(m));
}

/** The habits section's tab bar: same glass capsule as nutrition, with its own tabs. */
export function HabitsTabBar() {
  return (
    <GlassTabBar
      left={LEFT}
      right={RIGHT}
      center={{ href: "/habits/new", label: "New habit", Icon: IconPlus }}
      section="habits"
      isActiveTab={isActive}
    />
  );
}
