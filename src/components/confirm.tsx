"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button, Sheet } from "./ui";

type Ask = { title: string; message?: string; confirm?: string; danger?: boolean };
const Ctx = createContext<(a: Ask) => Promise<boolean>>(async () => false);

/** In-app replacement for window.confirm(): `if (await confirm({ title, … }))`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback(
    (a: Ask) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setAsk(a);
      }),
    [],
  );
  const done = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setAsk(null);
  };
  return (
    <Ctx value={confirm}>
      {children}
      <Sheet open={!!ask} onClose={() => done(false)} title={ask?.title}>
        {ask && (
          <div className="space-y-4">
            {ask.message && <p className="text-muted">{ask.message}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" onClick={() => done(false)}>
                Cancel
              </Button>
              <Button variant={ask.danger ? "danger" : "primary"} size="lg" onClick={() => done(true)}>
                {ask.confirm ?? "OK"}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </Ctx>
  );
}

export const useConfirm = () => useContext(Ctx);
