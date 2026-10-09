export const KJ_PER_KCAL = 4.184;

export type EnergyUnit = "kj" | "kcal";

export const kcalToKj = (kcal: number) => kcal * KJ_PER_KCAL;
export const kjToKcal = (kj: number) => kj / KJ_PER_KCAL;

/** Convert a kJ value into the user's preferred unit. */
export function toUnit(kj: number, unit: EnergyUnit) {
  return unit === "kcal" ? kjToKcal(kj) : kj;
}

/** Convert a value entered in the user's unit back to kJ. */
export function fromUnit(value: number, unit: EnergyUnit) {
  return unit === "kcal" ? kcalToKj(value) : value;
}

export function unitLabel(unit: EnergyUnit) {
  return unit === "kcal" ? "kcal" : "kJ";
}

export function formatEnergy(kj: number | null | undefined, unit: EnergyUnit, opts: { label?: boolean } = {}) {
  if (kj === null || kj === undefined) return "no data";
  const n = Math.round(toUnit(kj, unit)).toLocaleString("en-AU");
  return opts.label === false ? n : `${n} ${unitLabel(unit)}`;
}
