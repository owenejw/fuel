"use client";

import Link from "next/link";
import { IconHabits, IconNutrition } from "./icons";
import { SECTIONS, type Section } from "./sections";

/** The round glass button beside the tab bar that flips to the app's other section. */
export function SectionSwitch({ to }: { to: Section }) {
  const Icon = to === "habits" ? IconHabits : IconNutrition;
  return (
    <Link
      href={SECTIONS[to].root}
      transitionTypes={["section"]}
      aria-label={`Switch to ${SECTIONS[to].label}`}
      title={SECTIONS[to].label}
      className="glass pointer-events-auto flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-full text-white/90 transition active:scale-90"
    >
      <Icon width={26} height={26} strokeWidth={2.2} />
    </Link>
  );
}
