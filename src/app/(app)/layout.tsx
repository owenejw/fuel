import { AppFrame } from "@/components/app-frame";
import { Shell } from "@/components/shell";
import { TabBar } from "@/components/tab-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <Shell section="nutrition">{children}</Shell>
      <TabBar />
    </AppFrame>
  );
}
