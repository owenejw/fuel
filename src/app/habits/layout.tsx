import type { Metadata } from "next";
import { AppFrame } from "@/components/app-frame";
import { HabitsProvider } from "@/components/habits/habits-provider";
import { HabitsTabBar } from "@/components/habits/habits-tab-bar";
import { Shell } from "@/components/shell";

export const metadata: Metadata = { title: "Habits · kilo JOL" };

/** The habits section: its own pages, data and tab bar. It shares only the profile and the frame with nutrition. */
export default function HabitsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="section-habits">
      <AppFrame>
        <HabitsProvider>
          <Shell section="habits">{children}</Shell>
          <HabitsTabBar />
        </HabitsProvider>
      </AppFrame>
    </div>
  );
}
