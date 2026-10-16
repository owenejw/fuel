import type { ReactNode } from "react";
import { AppProvider } from "./app-provider";
import { ConfirmProvider } from "./confirm";
import { ToastProvider } from "./toast";

/** What every section of the app shares: the chosen profile, toasts and confirm dialogs. Each section adds its own tab bar. */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </AppProvider>
    </ToastProvider>
  );
}
