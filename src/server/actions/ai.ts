"use server";

import { z } from "zod";
import { addDays, isValidDate } from "@/lib/dates";
import { fmtMin } from "@/lib/fuelling";
import { sumNutrients } from "@/lib/nutrients";
import { getDayBundle, getProfile, getWorkouts } from "../repo";
import { candidatesFor } from "../suggestions";
import { requireProfileId } from "../session";

// Google Gemini, on the free tier. https://ai.google.dev/gemini-api/docs/pricing
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Whether the server has an AI key, so Settings can say so instead of failing later. */
export async function aiAvailable(): Promise<boolean> {
  return !!process.env.GEMINI_API_KEY;
}

async function requireAi() {
  const pid = await requireProfileId();
  const profile = await getProfile(pid);
  if (!process.env.GEMINI_API_KEY) throw new Error("AI features need GEMINI_API_KEY set on the server.");
  if (!profile?.ai_enabled) throw new Error("Turn on AI features in Settings first.");
  return { pid, profile };
}

/** Gemini's response schema format (an OpenAPI subset). */
type GSchema =
  | { type: "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN"; nullable?: boolean }
  | { type: "ARRAY"; items: GSchema; nullable?: boolean }
  | { type: "OBJECT"; properties: Record<string, GSchema>; required: string[]; nullable?: boolean };

const str: GSchema = { type: "STRING" };
const num: GSchema = { type: "NUMBER" };
const nullable = (t: GSchema): GSchema => ({ ...t, nullable: true });
const obj = (properties: Record<string, GSchema>): GSchema => ({ type: "OBJECT", properties, required: Object.keys(properties) });
const arr = (items: GSchema): GSchema => ({ type: "ARRAY", items });

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** One JSON-mode call, validated against the zod schema. */
async function ask<T extends z.ZodType>(schema: T, responseSchema: GSchema, parts: Part[] | string, system: string) {
  await requireAi();
  const res = await fetch(ENDPOINT(MODEL), {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: typeof parts === "string" ? [{ text: parts }] : parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.4 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status === 429) throw new Error("The free AI limit has been reached for now — try again later.");
  if (!res.ok) {
    console.error("Gemini error", res.status, (await res.text()).slice(0, 500));
    throw new Error("The AI service couldn't answer — try again.");
  }
  const body = (await res.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  if (body.promptFeedback?.blockReason) throw new Error("The AI service declined this request.");
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    return schema.parse(JSON.parse(text)) as z.infer<T>;
  } catch {
    throw new Error("Couldn't read the AI's answer — try again.");
  }
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
    obj({ summary: str, suggestions: arr(obj({ title: str, detail: str })) }),
    `Here is today's data for ${profile.name} (Australia; energy in kJ):\n${JSON.stringify(context)}`,
    `You are a sports nutrition assistant inside a personal food-tracking app. Give 2–4 short, practical suggestions for what to eat for the rest of today to hit the remaining targets, favouring the person's frequent foods and the workout fuelling timeline. Use Australian food names and kJ. Keep each suggestion to one or two sentences. Don't give medical advice.`,
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

function imagePart(dataUrl: string): Part {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("Unsupported image");
  if (m[2].length > 7_000_000) throw new Error("Image is too large");
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

export async function estimatePlate(imageDataUrl: string, note?: string): Promise<PlateEstimate> {
  return ask(
    PlateSchema,
    obj({
      items: arr(obj({ name: str, grams: num, energy_kj: num, protein_g: num, carbs_g: num, fat_g: num, fibre_g: nullable(num) })),
      notes: str,
    }),
    [imagePart(imageDataUrl), { text: `Estimate each item on this plate.${note ? ` Context from the user: ${note.slice(0, 300)}` : ""}` }],
    `You estimate food portions from photos for a nutrition tracker. List each distinct food item with an estimated edible weight in grams and the energy (kJ), protein, carbohydrate, fat and fibre for that amount. Use typical Australian composition values. Be realistic about portion sizes; say in notes what you were unsure about.`,
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
  const n = nullable(num);
  return ask(
    PanelSchema,
    obj({
      name: nullable(str),
      brand: nullable(str),
      serve_size_g: n,
      per100: obj({
        energy_kj: n,
        protein_g: n,
        fat_g: n,
        sat_fat_g: n,
        carbs_g: n,
        sugars_g: n,
        fibre_g: n,
        sodium_mg: n,
        calcium_mg: n,
        iron_mg: n,
        potassium_mg: n,
      }),
    }),
    [imagePart(imageDataUrl), { text: "Read this nutrition information panel." }],
    `Extract values from a food nutrition information panel (usually Australian/NZ format). Return the per 100 g (or per 100 mL) column. If only per-serve values are printed, convert using the serving size. Energy in kJ (convert from Cal/kcal × 4.184 only if kJ is absent). Sodium in mg. Use null for anything not printed — never guess or use 0 for a missing row.`,
  );
}
