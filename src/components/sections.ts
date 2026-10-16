/**
 * The app's two sections. They share the profile and the frame, but each has its own pages and tab bar.
 * Only URLs live here, so the nutrition side never depends on habits code.
 */
export type Section = "nutrition" | "habits";

export const SECTIONS: Record<Section, { label: string; root: string; roots: string[] }> = {
  nutrition: { label: "Nutrition", root: "/", roots: ["/", "/meals", "/trends", "/plan"] },
  habits: { label: "Habits", root: "/habits", roots: ["/habits", "/habits/calendar", "/habits/insights", "/habits/manage"] },
};

export const otherSection = (s: Section): Section => (s === "nutrition" ? "habits" : "nutrition");

const LAST = "fuel:section";
const LAUNCHED = "kj:launched";
export const SECTION_MEMORY_OFF = "fuel:section-memory-off";

/** Remembers the section being shown, so the next launch can reopen it. Per device, best effort. */
export function rememberSection(section: Section) {
  try {
    localStorage.setItem(LAST, section);
  } catch {
    // Storage unavailable: launches just open where asked.
  }
}

/** On a fresh launch at a section's root, the section used last if it's a different one; otherwise null. */
export function sectionOnLaunch(section: Section, pathname: string): Section | null {
  try {
    const first = !sessionStorage.getItem(LAUNCHED);
    sessionStorage.setItem(LAUNCHED, "1");
    const last = localStorage.getItem(LAST) as Section | null;
    if (!first || !last || last === section || !(last in SECTIONS) || pathname !== SECTIONS[section].root) return null;
    if (localStorage.getItem(SECTION_MEMORY_OFF) === "1") return null;
    return last;
  } catch {
    return null;
  }
}
