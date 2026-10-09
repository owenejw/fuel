"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getMe, switchProfile } from "@/server/actions/profile";
import { cacheGet, cacheSet } from "@/lib/offline";
import type { Profile } from "@/lib/types";
import type { EnergyUnit } from "@/lib/energy";
import { Spinner } from "./ui";

type AppState = {
  profile: Profile;
  profileId: string;
  unit: EnergyUnit;
  setProfile: (p: Profile) => void;
  switchProfile: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

const LAST = "fuel:last-profile";

const noop = () => () => undefined;

/**
 * Loads the profile this device has chosen; sends it to the picker if none.
 * Everything below renders on the client only (it reads the offline cache),
 * so the server sends a spinner and hydration always matches.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!isClient) return <Loading />;
  return <ClientAppProvider>{children}</ClientAppProvider>;
}

function Loading() {
  return (
    <div className="text-muted flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}

function ClientAppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [profile, setProfileState] = useState<Profile | null>(() => {
    try {
      const id = localStorage.getItem(LAST);
      return id ? cacheGet<Profile>(id, "profile") : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    getMe().then(
      (p) => {
        if (!p) return router.replace("/profiles");
        setProfileState(p);
        cacheSet(p.id, "profile", p);
        try {
          localStorage.setItem(LAST, p.id);
        } catch {
          // ignore
        }
      },
      () => undefined, // offline: keep the cached profile
    );
  }, [router]);

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    cacheSet(p.id, "profile", p);
  }, []);

  const doSwitch = useCallback(async () => {
    await switchProfile();
    try {
      localStorage.removeItem(LAST);
    } catch {
      // ignore
    }
    router.replace("/profiles");
  }, [router]);

  if (!profile) return <Loading />;

  return <Ctx value={{ profile, profileId: profile.id, unit: profile.energy_unit, setProfile, switchProfile: doSwitch }}>{children}</Ctx>;
}
