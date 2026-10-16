"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { habitColor, habitColor2 } from "@/lib/habits/meta";
import type { Habit } from "@/lib/habits/types";
import { Button } from "../ui";
import { HabitBadge } from "./habit-icons";

const LINES: Record<number, string> = {
  7: "A whole week. The hardest part is behind you.",
  14: "Two weeks in. It's starting to stick.",
  21: "Three weeks. This is becoming who you are.",
  30: "A month strong.",
  50: "Fifty. That's real commitment.",
  100: "One hundred. Remarkable.",
  365: "A full year. Legendary.",
};

/** Full-screen milestone moment: a ring fills around the number while confetti falls in the habit's colour. */
export function Celebration({ habit, days, onClose }: { habit: Habit; days: number; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const c1 = habitColor(habit.color);
  const c2 = habitColor2(habit.color);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    el.width = w * dpr;
    el.height = h * dpr;
    ctx.scale(dpr, dpr);
    const colors = [c1, c2, "#ffffff", "#ffd60a"];
    const bits = Array.from({ length: 140 }, () => ({
      x: w / 2,
      y: h * 0.38,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 15 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      s: Math.random() * 6 + 4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const frame = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.vy += 0.32;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.r += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        ctx.globalAlpha = Math.max(0, 1 - (t - start) / 3200);
        ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
        ctx.restore();
      }
      if (t - start < 3200) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [c1, c2]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const size = 200;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const unit = habit.kind === "build" && habit.schedule === "per_week" ? "check-ins" : "days";

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label={`${days} ${unit} of ${habit.name}`}
      onClick={onClose}
      className="section-habits fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/70 px-8 text-center backdrop-blur-xl"
      style={{ animation: "fade-in 0.3s ease-out" }}
    >
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div className="burst relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
          <defs>
            <linearGradient id="celebrate-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={c2} />
              <stop offset="100%" stopColor={c1} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c1} strokeOpacity={0.2} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#celebrate-g)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            className="ring-fill"
            style={{ ["--circ" as string]: circ }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-6xl leading-none font-bold tracking-tight">{days}</span>
          <span className="text-muted mt-1 text-sm font-semibold tracking-wide uppercase">{unit}</span>
        </div>
      </div>
      <div className="rise-in mt-8 flex items-center gap-2" style={{ animationDelay: "0.35s" }}>
        <HabitBadge icon={habit.icon} color={habit.color} size={28} />
        <span className="text-xl font-semibold">{habit.name}</span>
      </div>
      <p className="rise-in text-muted mt-2 max-w-xs text-[15px]" style={{ animationDelay: "0.45s" }}>
        {LINES[days] ?? "Milestone reached."}
      </p>
      <Button className="rise-in mt-8 w-48" style={{ animationDelay: "0.55s" }} onClick={onClose}>
        Keep going
      </Button>
    </div>,
    document.body,
  );
}
