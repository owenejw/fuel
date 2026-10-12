import { useId } from "react";

export type RingSpec = { value: number; target: number; color: string; color2: string };

/**
 * Concentric progress rings, outermost first (Apple Fitness style). Each ring has a dim track in its
 * own colour; past 100 % the ring keeps going round a second lap, drawn with a shadowed tip.
 */
export function Rings({ rings, size, stroke, gap = 2 }: { rings: RingSpec[]; size: number; stroke: number; gap?: number }) {
  const id = "r" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <defs>
        {rings.map((r, i) => (
          <linearGradient key={i} id={`${id}-g${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: r.color }} />
            <stop offset="100%" style={{ stopColor: r.color2 }} />
          </linearGradient>
        ))}
        <filter id={`${id}-tip`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation={stroke / 5} floodColor="#000" floodOpacity="0.7" />
        </filter>
      </defs>
      {rings.map((r, i) => {
        const radius = c - stroke / 2 - i * (stroke + gap);
        if (radius <= stroke / 2) return null;
        const circ = 2 * Math.PI * radius;
        const pct = r.target > 0 ? Math.max(0, r.value / r.target) : 0;
        const first = Math.min(1, pct);
        const lap = Math.min(1, Math.max(0, pct - 1));
        return (
          <g key={i} transform={`rotate(-90 ${c} ${c})`}>
            <circle cx={c} cy={c} r={radius} fill="none" style={{ stroke: r.color }} strokeOpacity={0.22} strokeWidth={stroke} />
            {first > 0 && (
              <circle
                cx={c}
                cy={c}
                r={radius}
                fill="none"
                stroke={`url(#${id}-g${i})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circ * first} ${circ}`}
                className="transition-[stroke-dasharray] duration-700 ease-out"
              />
            )}
            {lap > 0 && (
              <circle
                cx={c}
                cy={c}
                r={radius}
                fill="none"
                style={{ stroke: r.color2 }}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circ * lap} ${circ}`}
                filter={`url(#${id}-tip)`}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** The nutrient colours, so every screen uses the same ones. */
export const METRIC = {
  energy: { label: "Energy", color: "var(--energy)", color2: "var(--energy-2)", text: "text-energy" },
  protein: { label: "Protein", color: "var(--protein)", color2: "var(--protein-2)", text: "text-protein" },
  carbs: { label: "Carbs", color: "var(--carbs)", color2: "var(--carbs-2)", text: "text-carbs" },
  fat: { label: "Fat", color: "var(--fat)", color2: "var(--fat-2)", text: "text-fat" },
  fibre: { label: "Fibre", color: "var(--fibre)", color2: "var(--fibre-2)", text: "text-fibre" },
  water: { label: "Water", color: "var(--water)", color2: "var(--water-2)", text: "text-water" },
} as const;
export type MetricKey = keyof typeof METRIC;
