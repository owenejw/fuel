"use client";

import { useEffect, useRef, useState, ViewTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { handleRequestFailure } from "@/lib/offline";
import { SECTIONS, rememberSection, sectionOnLaunch, type Section } from "./sections";

// The launch redirect happens once per page load. Pages are kept alive in the background, so this can't live in state.
let launchRedirected = false;

/**
 * Wraps each page: a short fade-in on navigation, and (when installed to the Home Screen, where iOS
 * has no back gesture of its own) swipe in from the left edge to go back.
 */
export function Shell({ children, section }: { children: ReactNode; section: Section }) {
  const pathname = usePathname();
  const router = useRouter();
  const page = useRef<HTMLDivElement>(null);
  // Tab roots: nothing to go back to, so no edge swipe there.
  const roots = SECTIONS[section].roots;

  // Opening the app goes back to the section used last.
  const [launchTo] = useState(() => (launchRedirected ? null : sectionOnLaunch(section, pathname)));
  const redirecting = !!launchTo && !launchRedirected;
  useEffect(() => {
    if (redirecting) {
      launchRedirected = true;
      router.replace(SECTIONS[launchTo].root);
    } else rememberSection(section);
  }, [redirecting, launchTo, router, section, pathname]);

  // Pull down from the top to refresh (installed app only; Safari already does this in the browser).
  const pull = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ind = pull.current;
    if (!standalone || !ind) return;
    let startY = 0;
    let dy = 0;
    let active = false;
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || document.querySelector("dialog[open]")) return;
      startY = e.touches[0].clientY;
      dy = 0;
      active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        ind.style.opacity = "0";
        return;
      }
      const d = Math.min(90, dy * 0.5);
      ind.style.transition = "none";
      ind.style.opacity = String(Math.min(1, d / 60));
      ind.style.transform = `translateY(${d}px) rotate(${d * 4}deg)`;
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      ind.style.transition = "transform 0.25s, opacity 0.25s";
      if (dy * 0.5 >= 70) {
        ind.style.transform = "translateY(56px)";
        ind.classList.add("animate-spin");
        window.location.reload();
      } else {
        ind.style.transform = "translateY(0)";
        ind.style.opacity = "0";
      }
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, []);

  // A server function from an older version failing (after a deploy) → reload once to get the new version.
  useEffect(() => {
    const onReject = (e: PromiseRejectionEvent) => {
      const msg = String((e.reason as Error | undefined)?.message ?? e.reason ?? "");
      if (/server action|failed to find|unexpected response|failed to fetch/i.test(msg)) handleRequestFailure();
    };
    window.addEventListener("unhandledrejection", onReject);
    return () => window.removeEventListener("unhandledrejection", onReject);
  }, []);

  useEffect(() => {
    const el = page.current;
    if (!el || roots.includes(pathname)) return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let dx = 0;
    let tracking = false;
    let dragging = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t.clientX > 28 || document.querySelector("dialog[open]")) return;
      startX = t.clientX;
      startY = t.clientY;
      startT = performance.now();
      dx = 0;
      tracking = true;
      dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const x = t.clientX - startX;
      const y = t.clientY - startY;
      if (!dragging) {
        if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
        if (Math.abs(y) > Math.abs(x) || x < 0) {
          tracking = false;
          return;
        }
        dragging = true;
        el.style.transition = "none";
        el.style.boxShadow = "-12px 0 32px rgba(0,0,0,0.6)";
      }
      e.preventDefault();
      dx = Math.max(0, x);
      el.style.transform = `translateX(${dx}px)`;
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      const velocity = dx / Math.max(1, performance.now() - startT);
      el.style.transition = "transform 0.22s cubic-bezier(0.2, 0.9, 0.25, 1)";
      if (dx > window.innerWidth * 0.35 || velocity > 0.5) {
        el.style.transform = "translateX(100%)";
        setTimeout(() => (window.history.length > 1 ? router.back() : router.push(SECTIONS[section].root)), 180);
      } else {
        el.style.transform = "";
        setTimeout(() => (el.style.boxShadow = ""), 220);
      }
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [pathname, router, roots, section]);

  if (redirecting) return null;

  return (
    <>
      <div
        ref={pull}
        aria-hidden
        className="border-accent pointer-events-none fixed top-[calc(env(safe-area-inset-top)-28px)] left-1/2 z-40 -ml-3.5 h-7 w-7 rounded-full border-[3px] border-t-transparent opacity-0"
      />
      {/* Switching section: the old one recedes and the new one comes forward. Other navigations use page-in. */}
      <ViewTransition enter={{ section: "section-in", default: "none" }} exit={{ section: "section-out", default: "none" }} default="none">
        <div ref={page} key={pathname} className="page-in bg-bg mx-auto min-h-dvh max-w-lg pb-32">
          {children}
        </div>
      </ViewTransition>
    </>
  );
}
