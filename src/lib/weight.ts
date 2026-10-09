/** Weight trend (EWMA) and adaptive TDEE. */

export const KJ_PER_KG = 32_200; // ≈ 7,700 kcal per kg of body weight

export type WeightPoint = { date: string; kg: number };
export type TrendPoint = WeightPoint & { trend: number };

/** Exponentially weighted moving average of weigh-ins (alpha ≈ 0.1). */
export function weightTrend(points: WeightPoint[], alpha = 0.1): TrendPoint[] {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  let trend: number | null = null;
  return sorted.map((p) => {
    trend = trend === null ? p.kg : trend + alpha * (p.kg - trend);
    return { ...p, trend: Math.round(trend * 100) / 100 };
  });
}

const dayNumber = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;

export type AdaptiveTdee = {
  tdeeKj: number;
  days: number;
  avgIntakeKj: number;
  trendChangeKg: number;
};

/**
 * Estimate actual TDEE from intake and weight trend:
 *   TDEE = average daily intake − (trend weight change × 32,200 kJ) / days
 *
 * Needs at least `minDays` days with logged intake and weigh-ins spanning
 * at least `minDays` days within the window; returns null otherwise.
 */
export function adaptiveTdee({
  intake,
  weights,
  minDays = 14,
}: {
  intake: { date: string; kj: number }[];
  weights: WeightPoint[];
  minDays?: number;
}): AdaptiveTdee | null {
  const logged = intake.filter((d) => d.kj > 0);
  if (logged.length < minDays || weights.length < 2) return null;

  const start = logged.reduce((m, d) => (d.date < m ? d.date : m), logged[0].date);
  const end = logged.reduce((m, d) => (d.date > m ? d.date : m), logged[0].date);
  const trend = weightTrend(weights);
  const inWindow = trend.filter((p) => p.date >= start && p.date <= end);
  if (inWindow.length < 2) return null;

  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const days = dayNumber(last.date) - dayNumber(first.date);
  if (days < minDays - 1) return null;

  const avgIntakeKj = logged.reduce((s, d) => s + d.kj, 0) / logged.length;
  const trendChangeKg = last.trend - first.trend;
  return {
    tdeeKj: Math.round(avgIntakeKj - (trendChangeKg * KJ_PER_KG) / days),
    days,
    avgIntakeKj: Math.round(avgIntakeKj),
    trendChangeKg: Math.round(trendChangeKg * 100) / 100,
  };
}
