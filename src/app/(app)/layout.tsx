import { AppProvider } from "@/components/app-provider";
import { Shell } from "@/components/shell";
import { TabBar } from "@/components/tab-bar";
import { ToastProvider } from "@/components/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>
        <Shell>{children}</Shell>
        <TabBar />
      </AppProvider>
    </ToastProvider>
  );
}
