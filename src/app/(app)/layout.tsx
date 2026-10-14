import { AppProvider } from "@/components/app-provider";
import { ConfirmProvider } from "@/components/confirm";
import { Shell } from "@/components/shell";
import { TabBar } from "@/components/tab-bar";
import { ToastProvider } from "@/components/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>
        <ConfirmProvider>
          <Shell>{children}</Shell>
          <TabBar />
        </ConfirmProvider>
      </AppProvider>
    </ToastProvider>
  );
}
