"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchProfile } from "@/lib/data";
import { cacheClearAll, cacheGet, cacheSet } from "@/lib/offline";
import type { Profile } from "@/lib/types";
import type { EnergyUnit } from "@/lib/energy";
import { Spinner } from "./ui";

type AppState = {
  userId: string;
  email: string | null;
  profile: Profile;
  unit: EnergyUnit;
  setProfile: (p: Profile) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

/** Loads the session and profile; sends new users to onboarding. */
export function AppProvider({ children, requireProfile = true }: { children: ReactNode; requireProfile?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<{ userId: string; email: string | null; profile: Profile | null } | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        router.replace("/login");
        return;
      }
      const cached = cacheGet<Profile>(user.id, "profile");
      if (cached && !cancelled) setState({ userId: user.id, email: user.email ?? null, profile: cached });
      try {
        const profile = await fetchProfile();
        if (cancelled) return;
        if (profile) cacheSet(user.id, "profile", profile);
        setState({ userId: user.id, email: user.email ?? null, profile });
      } catch {
        // Offline: keep the cached profile if we have one.
        if (!cached && !cancelled) setState({ userId: user.id, email: user.email ?? null, profile: null });
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        cacheClearAll();
        router.replace("/login");
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (state && !state.profile && requireProfile && pathname !== "/onboarding") router.replace("/onboarding");
  }, [state, requireProfile, pathname, router]);

  const setProfile = useCallback((p: Profile) => {
    setState((s) => (s ? { ...s, profile: p } : s));
    cacheSet(p.user_id, "profile", p);
  }, []);

  const signOut = useCallback(async () => {
    cacheClearAll();
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }, [router]);

  if (!state || (!state.profile && requireProfile)) {
    return (
      <div className="text-muted flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const profile: Profile = state.profile ?? {
    user_id: state.userId,
    name: "",
    sex: null,
    birth_date: null,
    height_cm: null,
    activity_level: "moderate",
    goal: "maintain",
    energy_unit: "kj",
  };

  return (
    <Ctx value={{ userId: state.userId, email: state.email, profile, unit: profile.energy_unit, setProfile, signOut }}>{children}</Ctx>
  );
}
