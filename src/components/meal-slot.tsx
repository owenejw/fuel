"use client";

import { useRef, useState } from "react";
import { IconTrash } from "./icons";
import { cx } from "./ui";

const REVEAL = 88;

/** Swipe a row left to reveal Delete; a long swipe deletes straight away. */
export function SwipeToDelete({ children, onDelete, label }: { children: React.ReactNode; onDelete: () => void; label: string }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; locked: "h" | "v" | null } | null>(null);
  const width = useRef(0);
  const moved = useRef(false);

  return (
    <div className="relative overflow-hidden">
      <button
        onClick={() => {
          setX(0);
          onDelete();
        }}
        className="bg-danger absolute inset-y-0 right-0 flex items-center gap-1.5 px-5 text-sm font-medium text-white"
        aria-label={label}
        tabIndex={x === 0 ? -1 : 0}
      >
        <IconTrash width={16} height={16} /> Delete
      </button>
      <div
        className={cx("bg-surface relative touch-pan-y", !dragging && "transition-transform duration-200")}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          width.current = e.currentTarget.offsetWidth;
          start.current = { x: e.clientX, y: e.clientY, base: x, locked: null };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
            if (s.locked === "h") {
              setDragging(true);
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }
          if (s.locked !== "h") return;
          moved.current = true;
          setX(Math.min(0, Math.max(-width.current, s.base + dx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          if (!s || s.locked !== "h") return;
          if (x < -width.current * 0.6) {
            setX(0);
            onDelete();
          } else setX(x < -REVEAL / 2 ? -REVEAL : 0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setX(0);
        }}
        onClickCapture={(e) => {
          // A swipe shouldn't also open the entry; a tap on an open row closes it.
          if (moved.current || x !== 0) {
            e.stopPropagation();
            e.preventDefault();
            moved.current = false;
            if (x !== 0) setX(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
