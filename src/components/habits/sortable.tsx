"use client";

import { useRef, useState, type ReactNode } from "react";
import { cx } from "../ui";
import { IconGrip } from "./habit-icons";

type Drag = { id: string; from: number; to: number; startY: number; dy: number; tops: number[]; heights: number[]; settling: boolean };

/**
 * A list you reorder by dragging the grip on each row. The row lifts, the others slide out of its way, and it
 * settles into place when you let go.
 */
export function SortableList<T>({
  items,
  getId,
  render,
  onReorder,
  className,
}: {
  items: T[];
  getId: (t: T) => string;
  render: (t: T, handle: ReactNode) => ReactNode;
  onReorder: (ids: string[]) => void;
  className?: string;
}) {
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);

  // The new slot = how many other rows' middles are above the dragged row's middle.
  const targetIndex = (d: Drag, dy: number) => {
    const center = d.tops[d.from] + d.heights[d.from] / 2 + dy;
    let to = 0;
    for (let i = 0; i < d.tops.length; i++) if (i !== d.from && center > d.tops[i] + d.heights[i] / 2) to++;
    return to;
  };

  const offsetFor = (d: Drag, i: number) => {
    if (i === d.from) return d.dy;
    const h = d.heights[d.from] + gapBetween(d);
    if (d.from < d.to && i > d.from && i <= d.to) return -h;
    if (d.to < d.from && i >= d.to && i < d.from) return h;
    return 0;
  };

  const handle = (i: number, id: string) => (
    <span
      role="button"
      tabIndex={0}
      aria-label="Drag to reorder"
      className="text-muted -mr-1 flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      onKeyDown={(e) => {
        // Keyboard: arrow keys move the row.
        const delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        if (!delta) return;
        e.preventDefault();
        const ids = items.map(getId);
        const j = i + delta;
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        onReorder(ids);
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const rects = rows.current.slice(0, items.length).map((r) => r?.getBoundingClientRect());
        setDrag({
          id,
          from: i,
          to: i,
          startY: e.clientY,
          dy: 0,
          tops: rects.map((r) => r?.top ?? 0),
          heights: rects.map((r) => r?.height ?? 0),
          settling: false,
        });
      }}
      onPointerMove={(e) => {
        setDrag((d) => {
          if (!d || d.id !== id || d.settling) return d;
          const dy = e.clientY - d.startY;
          return { ...d, dy, to: targetIndex(d, dy) };
        });
      }}
      onPointerUp={() => {
        const d = drag;
        if (!d || d.id !== id) return;
        // Glide into the new slot, then commit the order.
        const final = d.to === d.from ? 0 : d.tops[d.to] - d.tops[d.from] + (d.to > d.from ? d.heights[d.to] - d.heights[d.from] : 0);
        setDrag({ ...d, dy: final, settling: true });
        setTimeout(() => {
          if (d.to !== d.from) {
            const ids = items.map(getId);
            const [moved] = ids.splice(d.from, 1);
            ids.splice(d.to, 0, moved);
            onReorder(ids);
          }
          setDrag(null);
        }, 180);
      }}
      onPointerCancel={() => setDrag(null)}
    >
      <IconGrip width={20} height={20} />
    </span>
  );

  return (
    <ul className={className}>
      {items.map((t, i) => {
        const id = getId(t);
        const lifted = drag?.id === id;
        return (
          <li
            key={id}
            ref={(el) => {
              rows.current[i] = el;
            }}
            className={cx("relative", lifted && "z-20")}
            style={
              drag
                ? {
                    transform: `translateY(${offsetFor(drag, i)}px)${lifted && !drag.settling ? " scale(1.02)" : ""}`,
                    transition: lifted && !drag.settling ? "none" : "transform 0.2s cubic-bezier(0.2, 0.9, 0.25, 1)",
                    boxShadow: lifted && !drag.settling ? "0 12px 30px rgba(0,0,0,0.55)" : undefined,
                    borderRadius: lifted ? 16 : undefined,
                  }
                : undefined
            }
          >
            {render(t, handle(i, id))}
          </li>
        );
      })}
    </ul>
  );
}

const gapBetween = (d: Drag) => (d.tops.length > 1 ? Math.max(0, d.tops[1] - d.tops[0] - d.heights[0]) : 0);
