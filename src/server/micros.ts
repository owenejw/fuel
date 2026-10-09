import "server-only";
import { addDays, ageOn } from "@/lib/dates";
import { microStatus, nrvFor } from "@/lib/nrv";
import { dailyTotals, getProfile } from "./repo";

/** 7-day micronutrient status ending on `end`. */
export async function weeklyMicros(pid: string, end: string) {
  const profile = await getProfile(pid);
  const age = profile?.birth_date ? ageOn(profile.birth_date, end) : null;
  const nrv = nrvFor(profile?.sex ?? null, age);
  const { days, entries } = await dailyTotals(pid, addDays(end, -6), end);
  return { status: microStatus(nrv, days, end), days, entries, nrv };
}
