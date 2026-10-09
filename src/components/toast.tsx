"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; text: string; action?: { label: string; onClick: () => void } };
const Ctx = createContext<(text: string, action?: Toast["action"]) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, action?: Toast["action"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 5000 : 2500);
  }, []);
  return (
    <Ctx value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="bg-text text-bg pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg"
          >
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button
                className="text-accent-soft font-semibold"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx>
  );
}

export const useToast = () => useContext(Ctx);
