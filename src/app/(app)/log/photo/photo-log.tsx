"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconMic, IconTrash } from "@/components/icons";
import { MacroLine } from "@/components/nutrition";
import { SlotChips } from "@/components/slot-chips";
import { useToast } from "@/components/toast";
import { BackButton, Button, Card, Input, PageHeader, Spinner, cx } from "@/components/ui";
import { addEntries } from "@/lib/data";
import { isValidDate, today } from "@/lib/dates";
import { formatEnergy, fromUnit, toUnit, unitLabel } from "@/lib/energy";
import { fileToDataUrl } from "@/lib/image";
import { defaultSlot } from "@/lib/slots";
import { SLOT_LABELS, type MealSlot } from "@/lib/types";
import { estimateFromText, estimatePlate, type PlateEstimate } from "@/server/actions/ai";

type Item = PlateEstimate["items"][number];

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechRecognition(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Photo of a plate, or a typed / spoken description → estimated items and grams → you check and edit → saved as entries.
 */
export function PhotoLog({ mode = "photo" }: { mode?: "photo" | "text" }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { unit, profile } = useApp();
  const date = isValidDate(params.get("date")) ? params.get("date")! : today();
  const [slot, setSlot] = useState<MealSlot>((params.get("slot") as MealSlot) || defaultSlot());
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const [canSpeak] = useState(() => !!speechRecognition());

  function toggleListening() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Rec = speechRecognition();
    if (!Rec) return;
    const r = new Rec();
    r.lang = "en-AU";
    r.interimResults = false;
    r.continuous = false;
    const before = text.trim();
    r.onresult = (e) => {
      const said = Array.from(e.results, (res) => res[0].transcript).join(" ");
      setText(before ? `${before} ${said}` : said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      toast("Couldn't hear that — try again, or type it");
    };
    rec.current = r;
    setListening(true);
    r.start();
  }
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function analyse() {
    if (mode === "photo" ? !photo : text.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = mode === "photo" ? await estimatePlate(photo!, note) : await estimateFromText(text);
      setItems(res.items);
      setNotes(res.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyse the photo");
    } finally {
      setBusy(false);
    }
  }

  /** Changing grams rescales that item's estimate proportionally. */
  const setGrams = (i: number, grams: number) =>
    setItems((all) =>
      all!.map((it, n) => {
        if (n !== i || !it.grams) return it;
        const f = grams / it.grams;
        return {
          ...it,
          grams,
          energy_kj: it.energy_kj * f,
          protein_g: it.protein_g * f,
          carbs_g: it.carbs_g * f,
          fat_g: it.fat_g * f,
          fibre_g: it.fibre_g == null ? null : it.fibre_g * f,
        };
      }),
    );

  async function save() {
    if (!items?.length) return;
    setBusy(true);
    try {
      await addEntries(
        items.map((it) => ({
          date,
          slot,
          kind: "quick" as const,
          name: mode === "photo" ? `${it.name} (photo estimate)` : it.name,
          grams: it.grams > 0 ? Math.round(it.grams) : null,
          nutrients: {
            energy_kj: Math.round(it.energy_kj),
            protein_g: Math.round(it.protein_g * 10) / 10,
            carbs_g: Math.round(it.carbs_g * 10) / 10,
            fat_g: Math.round(it.fat_g * 10) / 10,
            ...(it.fibre_g != null ? { fibre_g: Math.round(it.fibre_g * 10) / 10 } : {}),
          },
        })),
      );
      toast(`Logged ${items.length} item${items.length === 1 ? "" : "s"} to ${SLOT_LABELS[slot]}`);
      router.replace(date === today() ? "/meals" : `/meals?date=${date}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        left={<BackButton onClick={() => router.back()} />}
        title={mode === "photo" ? "Log from a photo" : "Describe what you ate"}
      />
      <div className="space-y-3 px-4">
        {!profile.ai_enabled && (
          <Link href="/settings/meal-ideas" className="bg-surface flex items-center gap-3 rounded-2xl p-4 text-sm active:scale-[0.98]">
            <span className="flex-1">Turn on &ldquo;Meal ideas &amp; photo logging&rdquo; to use this.</span>
            <span className="text-accent font-semibold">Turn on</span>
          </Link>
        )}
        {mode === "photo" ? (
          <>
            <label className="border-border bg-surface block cursor-pointer overflow-hidden rounded-2xl border border-dashed text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photo ? (
                <img src={photo} alt="Your meal" className="max-h-72 w-full object-cover" />
              ) : (
                <div className="text-muted p-10">Tap to take or choose a photo</div>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setItems(null);
                    setPhoto(await fileToDataUrl(f));
                  }
                }}
              />
            </label>
            {photo && !items && (
              <>
                <Input
                  label="Anything else to know? (optional)"
                  placeholder="e.g. cooked in olive oil, large bowl"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button className="w-full" size="lg" onClick={analyse} disabled={busy || !profile.ai_enabled}>
                  {busy ? (
                    <>
                      <Spinner /> Estimating…
                    </>
                  ) : (
                    "Estimate this meal"
                  )}
                </Button>
              </>
            )}
          </>
        ) : (
          !items && (
            <>
              <div className="bg-surface rounded-3xl p-4">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  maxLength={600}
                  autoFocus
                  placeholder="e.g. two scrambled eggs on sourdough with butter and a flat white"
                  className="placeholder:text-muted/70 w-full resize-none bg-transparent text-[17px] leading-snug outline-none"
                />
                <div className="flex items-center justify-between gap-2 pt-2">
                  <span className="text-muted text-xs">Say amounts if you know them — &ldquo;a big bowl&rdquo;, &ldquo;200 g&rdquo;.</span>
                  {canSpeak && (
                    <button
                      onClick={toggleListening}
                      className={cx(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition active:scale-90",
                        listening ? "bg-danger animate-pulse text-white" : "bg-surface-2 text-accent",
                      )}
                      aria-label={listening ? "Stop listening" : "Speak"}
                    >
                      <IconMic width={22} height={22} />
                    </button>
                  )}
                </div>
              </div>
              <Button className="w-full" size="lg" onClick={analyse} disabled={busy || !profile.ai_enabled || text.trim().length < 2}>
                {busy ? (
                  <>
                    <Spinner /> Working it out…
                  </>
                ) : (
                  "Work it out"
                )}
              </Button>
            </>
          )
        )}
        {error && <p className="text-danger text-sm">{error}</p>}

        {items && (
          <>
            <Card>
              <ul className="divide-border divide-y">
                {items.map((it, i) => (
                  <li key={i} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <input
                        value={it.name}
                        onChange={(e) => setItems((all) => all!.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))}
                        className="w-full bg-transparent text-sm outline-none"
                      />
                      <MacroLine
                        unit={unit}
                        n={{ energy_kj: it.energy_kj, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g }}
                      />
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label="Grams"
                      value={Math.round(it.grams)}
                      onChange={(e) => setGrams(i, Number(e.target.value) || 0)}
                      className="tabular border-border bg-surface h-9 w-16 rounded-lg border px-2 text-right text-sm"
                    />
                    <span className="text-muted text-xs">g</span>
                    <button
                      onClick={() => setItems((all) => all!.filter((_, n) => n !== i))}
                      className="text-muted rounded-full p-1.5"
                      aria-label="Remove item"
                    >
                      <IconTrash width={16} height={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-border flex justify-between border-t px-4 py-2 text-sm font-medium">
                <span>Total</span>
                <span className="tabular">
                  {formatEnergy(
                    items.reduce((s, i) => s + i.energy_kj, 0),
                    unit,
                  )}
                </span>
              </div>
            </Card>
            {notes && <p className="text-muted text-xs">{notes}</p>}
            <QuickEnergyAdjust
              unit={unit}
              onAdd={(kj) =>
                setItems((all) => [
                  ...all!,
                  { name: "Extra (oil, sauce…)", grams: 0, energy_kj: kj, protein_g: 0, carbs_g: 0, fat_g: kj / 37, fibre_g: null },
                ])
              }
            />
            <SlotChips label="Meal" value={slot} onChange={setSlot} />
            {mode === "text" && (
              <button onClick={() => setItems(null)} className="text-accent w-full text-sm">
                Change what I said
              </button>
            )}
            <Button className="w-full" size="lg" onClick={save} disabled={busy || !items.length}>
              Log {items.length} item{items.length === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

function QuickEnergyAdjust({ unit, onAdd }: { unit: ReturnType<typeof useApp>["unit"]; onAdd: (kj: number) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number(v) > 0) onAdd(fromUnit(Number(v), unit));
        setV("");
      }}
    >
      <Input
        className="flex-1"
        label={`Add hidden extras (${unitLabel(unit)})`}
        type="number"
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={String(Math.round(toUnit(400, unit)))}
      />
      <Button variant="secondary" type="submit">
        Add
      </Button>
    </form>
  );
}
