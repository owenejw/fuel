import { AppProvider } from "@/components/app-provider";
import { TabBar } from "@/components/tab-bar";
import { ToastProvider } from "@/components/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>
        <div className="mx-auto min-h-dvh max-w-lg pb-24">{children}</div>
        <TabBar />
      </AppProvider>
    </ToastProvider>
  );
}
