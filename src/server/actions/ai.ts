"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { addDays, isValidDate } from "@/lib/dates";
import { fmtMin } from "@/lib/fuelling";
import { sumNutrients } from "@/lib/nutrients";
import { getDayBundle, getProfile, getWorkouts } from "../repo";
import { candidatesFor } from "../suggestions";
import { requireProfileId } from "../session";

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

async function requireAi() {
  const pid = await requireProfileId();
  const profile = await getProfile(pid);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI features need ANTHROPIC_API_KEY set on the server.");
  if (!profile?.ai_enabled) throw new Error("Turn on AI features in Settings first.");
  client ??= new Anthropic();
  return { pid, profile, client };
}

/** One structured-output call with server-side refusal fallback. */
async function ask<T extends z.ZodType>(
  schema: T,
  content: Anthropic.Beta.BetaContentBlockParam[] | string,
  system: string,
  effort: "low" | "medium",
) {
  const { client: c } = await requireAi();
  const res = await c.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    output_config: { effort, format: zodOutputFormat(schema) },
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined this request.");
  if (!res.parsed_output) throw new Error("Couldn't read Claude's answer — try again.");
  return res.parsed_output as z.infer<T>;
}

// ---------------------------------------------------------------------------
// Natural-language suggestions
// ---------------------------------------------------------------------------

const SuggestionSchema = z.object({
  summary: z.string(),
  suggestions: z.array(z.object({ title: z.string(), detail: z.string() })),
});
export type AiSuggestions = z.infer<typeof SuggestionSchema>;

export async function aiSuggest(date: string, nowMin: number): Promise<AiSuggestions> {
  const { pid, profile } = await requireAi();
  const d = z.string().refine(isValidDate).parse(date);
  const [bundle, cands, upcoming] = await Promise.all([getDayBundle(pid, d), candidatesFor(pid, d), getWorkouts(pid, d, addDays(d, 2))]);
  const eaten = sumNutrients(bundle.entries.map((e) => e.nutrients)).totals;
  const t = bundle.plan.targets;
  const context = {
    now: fmtMin(nowMin),
    day_type: bundle.plan.dayType,
    targets: t,
    eaten_so_far: {
      energy_kj: eaten.energy_kj,
      protein_g: eaten.protein_g,
      carbs_g: eaten.carbs_g,
      fat_g: eaten.fat_g,
      fibre_g: eaten.fibre_g,
    },
    remaining: {
      energy_kj: Math.round(t.energy_kj - (eaten.energy_kj ?? 0)),
      protein_g: Math.round(t.protein_g - (eaten.protein_g ?? 0)),
      carbs_g: Math.round(t.carbs_g - (eaten.carbs_g ?? 0)),
      fat_g: Math.round(t.fat_g - (eaten.fat_g ?? 0)),
    },
    upcoming_workouts: upcoming.map((w) => ({
      date: w.date,
      start: w.start_time,
      minutes: w.duration_min,
      type: w.type,
      intensity: w.intensity,
      race: w.is_race,
      title: w.title,
    })),
    fuelling_timeline_today: bundle.fuelling.map((f) => ({
      window: f.kind,
      from: f.start === null ? null : fmtMin(f.start),
      guidance: f.detail,
    })),
    frequent_foods: cands.slice(0, 20).map((c) => ({ name: c.name, serve_g: c.grams, ...c.nutrients })),
  };
  return ask(
    SuggestionSchema,
    `Here is today's data for ${profile.name} (Australia; energy in kJ):\n${JSON.stringify(context)}`,
    `You are a sports nutrition assistant inside a personal food-tracking app. Give 2–4 short, practical suggestions for what to eat for the rest of today to hit the remaining targets, favouring the person's frequent foods and the workout fuelling timeline. Use Australian food names and kJ. Keep each suggestion to one or two sentences. Don't give medical advice.`,
    "low",
  );
}

// ---------------------------------------------------------------------------
// Photo of a plate → itemised estimate
// ---------------------------------------------------------------------------

const PlateSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      grams: z.number(),
      energy_kj: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      fibre_g: z.number().nullable(),
    }),
  ),
  notes: z.string(),
});
export type PlateEstimate = z.infer<typeof PlateSchema>;

function imageBlock(dataUrl: string): Anthropic.Beta.BetaImageBlockParam {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("Unsupported image");
  if (m[2].length > 7_000_000) throw new Error("Image is too large");
  return { type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } };
}

export async function estimatePlate(imageDataUrl: string, note?: string): Promise<PlateEstimate> {
  return ask(
    PlateSchema,
    [
      imageBlock(imageDataUrl),
      { type: "text", text: `Estimate each item on this plate.${note ? ` Context from the user: ${note.slice(0, 300)}` : ""}` },
    ],
    `You estimate food portions from photos for a nutrition tracker. List each distinct food item with an estimated edible weight in grams and the energy (kJ), protein, carbohydrate, fat and fibre for that amount. Use typical Australian composition values. Be realistic about portion sizes; say in notes what you were unsure about.`,
    "medium",
  );
}

// ---------------------------------------------------------------------------
// Nutrition information panel → custom food
// ---------------------------------------------------------------------------

const PanelSchema = z.object({
  name: z.string().nullable(),
  brand: z.string().nullable(),
  serve_size_g: z.number().nullable(),
  per100: z.object({
    energy_kj: z.number().nullable(),
    protein_g: z.number().nullable(),
    fat_g: z.number().nullable(),
    sat_fat_g: z.number().nullable(),
    carbs_g: z.number().nullable(),
    sugars_g: z.number().nullable(),
    fibre_g: z.number().nullable(),
    sodium_mg: z.number().nullable(),
    calcium_mg: z.number().nullable(),
    iron_mg: z.number().nullable(),
    potassium_mg: z.number().nullable(),
  }),
});
export type PanelReading = z.infer<typeof PanelSchema>;

export async function readNutritionPanel(imageDataUrl: string): Promise<PanelReading> {
  return ask(
    PanelSchema,
    [imageBlock(imageDataUrl), { type: "text", text: "Read this nutrition information panel." }],
    `Extract values from a food nutrition information panel (usually Australian/NZ format). Return the per 100 g (or per 100 mL) column. If only per-serve values are printed, convert using the serving size. Energy in kJ (convert from Cal/kcal × 4.184 only if kJ is absent). Sodium in mg. Use null for anything not printed — never guess or use 0 for a missing row.`,
    "low",
  );
}
