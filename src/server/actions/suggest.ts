"use server";

import { z } from "zod";
import { isValidDate } from "@/lib/dates";
import { getSuggestions, type Suggestions } from "../suggestions";
import { requireProfileId } from "../session";

export async function fetchSuggestions(date: string, nowMin: number): Promise<Suggestions> {
  const pid = await requireProfileId();
  return getSuggestions(pid, z.string().refine(isValidDate).parse(date), z.number().int().min(0).max(1439).parse(nowMin));
}
