/**
 * Australian Nutrient Reference Values (NHMRC/MoH NRVs) for the nutrients we
 * track, by sex and age. RDI where one exists, otherwise AI. Sodium uses the
 * Suggested Dietary Target as an upper limit. Water is the AI for total water
 * (food + drinks).
 */
import type { NutrientKey } from "./nutrients";
import type { Sex } from "./types";

export type Nrv = { target: number; basis: "RDI" | "AI" | "SDT"; limit?: boolean };
export type NrvTable = Partial<Record<NutrientKey, Nrv>>;

type Band = "14-18" | "19-30" | "31-50" | "51-70" | "70+";

function band(age: number): Band {
  if (age < 19) return "14-18";
  if (age < 31) return "19-30";
  if (age < 51) return "31-50";
  if (age < 71) return "51-70";
  return "70+";
}

const pick = <T>(b: Band, values: Record<Band, T>) => values[b];

function forSex(sex: Sex, age: number): NrvTable {
  const b = band(age);
  const m = sex === "male";
  return {
    fibre_g: { target: m ? (b === "14-18" ? 28 : 30) : b === "14-18" ? 22 : 25, basis: "AI" },
    sodium_mg: { target: 2000, basis: "SDT", limit: true },
    potassium_mg: { target: m ? (b === "14-18" ? 3600 : 3800) : b === "14-18" ? 2600 : 2800, basis: "AI" },
    calcium_mg: {
      target: m
        ? pick(b, { "14-18": 1300, "19-30": 1000, "31-50": 1000, "51-70": 1000, "70+": 1300 })
        : pick(b, { "14-18": 1300, "19-30": 1000, "31-50": 1000, "51-70": 1300, "70+": 1300 }),
      basis: "RDI",
    },
    iron_mg: {
      target: m ? (b === "14-18" ? 11 : 8) : pick(b, { "14-18": 15, "19-30": 18, "31-50": 18, "51-70": 8, "70+": 8 }),
      basis: "RDI",
    },
    magnesium_mg: {
      target: m
        ? pick(b, { "14-18": 410, "19-30": 400, "31-50": 420, "51-70": 420, "70+": 420 })
        : pick(b, { "14-18": 360, "19-30": 310, "31-50": 320, "51-70": 320, "70+": 320 }),
      basis: "RDI",
    },
    zinc_mg: { target: m ? (b === "14-18" ? 13 : 14) : b === "14-18" ? 7 : 8, basis: "RDI" },
    vit_a_ug: { target: m ? 900 : 700, basis: "RDI" },
    vit_c_mg: { target: b === "14-18" ? 40 : 45, basis: "RDI" },
    vit_d_ug: { target: pick(b, { "14-18": 5, "19-30": 5, "31-50": 5, "51-70": 10, "70+": 15 }), basis: "AI" },
    vit_e_mg: { target: m ? 10 : 8, basis: "AI" },
    vit_b12_ug: { target: 2.4, basis: "RDI" },
    folate_ug: { target: 400, basis: "RDI" },
    water_ml: { target: m ? (b === "14-18" ? 3300 : 3400) : b === "14-18" ? 2500 : 2800, basis: "AI" },
  };
}

/** NRVs for a person; with unknown sex, uses the higher of the two (or the average for water). */
export function nrvFor(sex: Sex | null, age: number | null): NrvTable {
  const a = age ?? 30;
  if (sex) return forSex(sex, a);
  const m = forSex("male", a);
  const f = forSex("female", a);
  const out: NrvTable = {};
  for (const k of Object.keys(m) as NutrientKey[]) {
    const mv = m[k]!;
    const fv = f[k]!;
    out[k] = { ...mv, target: k === "water_ml" ? Math.round((mv.target + fv.target) / 2) : Math.max(mv.target, fv.target) };
  }
  return out;
}

/** Fluid (drinks) part of the water AI, used for the water tracker goal. */
export function fluidTargetMl(sex: Sex | null) {
  return sex === "male" ? 2600 : sex === "female" ? 2100 : 2350;
}

export const LOW_THRESHOLD = 0.7;

export type MicroStatus = {
  key: NutrientKey;
  target: number;
  basis: Nrv["basis"];
  limit: boolean;
  today: number | null;
  todayIncomplete: boolean;
  average: number | null;
  daysLogged: number;
  daysLow: number;
  /** Consistently under 70% of target across the week. */
  flagged: boolean;
  /** For limits (sodium): average over the limit. */
  over: boolean;
};

/**
 * Compare daily totals with NRVs. A nutrient is flagged when the 7-day
 * average is under 70% of target AND most logged days were under 70%.
 */
export function microStatus(
  nrv: NrvTable,
  days: { date: string; totals: Partial<Record<NutrientKey, number | null>>; missing: Partial<Record<NutrientKey, number>> }[],
  today: string,
): MicroStatus[] {
  const logged = days.filter((d) => d.totals.energy_kj != null && (d.totals.energy_kj ?? 0) > 0);
  return (Object.entries(nrv) as [NutrientKey, Nrv][]).map(([key, n]) => {
    const values = logged.map((d) => d.totals[key] ?? 0);
    const average = logged.length ? values.reduce((s, v) => s + v, 0) / logged.length : null;
    const daysLow = values.filter((v) => v < n.target * LOW_THRESHOLD).length;
    const t = days.find((d) => d.date === today);
    return {
      key,
      target: n.target,
      basis: n.basis,
      limit: !!n.limit,
      today: t?.totals[key] ?? null,
      todayIncomplete: (t?.missing[key] ?? 0) > 0,
      average: average === null ? null : Math.round(average * 10) / 10,
      daysLogged: logged.length,
      daysLow,
      flagged:
        !n.limit &&
        logged.length >= 3 &&
        average !== null &&
        average < n.target * LOW_THRESHOLD &&
        daysLow >= Math.ceil(logged.length * 0.6),
      over: !!n.limit && average !== null && average > n.target,
    };
  });
}
