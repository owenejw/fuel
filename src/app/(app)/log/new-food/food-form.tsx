"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { IconChevronLeft } from "@/components/icons";
import { Button, Card, Input, PageHeader, cx } from "@/components/ui";
import { deleteCustomFood, fetchFood, saveCustomFood, type CustomFoodInput } from "@/lib/data";
import { fromUnit, toUnit, unitLabel } from "@/lib/energy";
import { NUTRIENTS, PANEL_KEYS, round, type NutrientKey, type Nutrients } from "@/lib/nutrients";
import { fileToDataUrl } from "@/lib/image";
import { readNutritionPanel } from "@/server/actions/ai";

type Basis = "100g" | "serve";

/** Create or edit a private custom food, laid out like an Australian nutrition panel. */
export function FoodForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { unit, profile } = useApp();
  const [reading, setReading] = useState(false);

  async function readPanel(file: File) {
    setReading(true);
    setError(null);
    try {
      const r = await readNutritionPanel(await fileToDataUrl(file, 1600, 0.9));
      if (r.name && !name) setName(r.name);
      if (r.brand && !brand) setBrand(r.brand);
      if (r.serve_size_g) setServeSize(String(r.serve_size_g));
      setBasis("100g");
      const v: Partial<Record<NutrientKey, string>> = {};
      for (const [k, n] of Object.entries(r.per100) as [NutrientKey, number | null][]) {
        if (n != null) v[k] = String(k === "energy_kj" ? Math.round(toUnit(n, unit)) : round(n, 2));
      }
      setValues(v);
      setMore(Object.keys(v).some((k) => !PANEL_KEYS.includes(k as NutrientKey)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the panel");
    } finally {
      setReading(false);
    }
  }
  const editId = params.get("id");

  const [name, setName] = useState(params.get("name") ?? "");
  const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState(params.get("barcode") ?? "");
  const [serveSize, setServeSize] = useState("");
  const [serveLabel, setServeLabel] = useState("");
  const [basis, setBasis] = useState<Basis>("100g");
  const [values, setValues] = useState<Partial<Record<NutrientKey, string>>>({});
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editId) return;
    fetchFood("custom", editId).then((f) => {
      if (!f) return;
      setName(f.name);
      setBrand(f.brand ?? "");
      setBarcode(f.barcode ?? "");
      setServeSize(f.serve_size_g ? String(f.serve_size_g) : "");
      setServeLabel(f.serve_label ?? "");
      const v: Partial<Record<NutrientKey, string>> = {};
      for (const [k, n] of Object.entries(f.per100) as [NutrientKey, number][]) {
        v[k] = String(k === "energy_kj" ? Math.round(toUnit(n, unit)) : round(n, 2));
      }
      setValues(v);
      setMore(Object.keys(v).some((k) => !PANEL_KEYS.includes(k as NutrientKey)));
    });
  }, [editId, unit]);

  const back = () => {
    const q = new URLSearchParams();
    for (const k of ["slot", "date"]) if (params.get(k)) q.set(k, params.get(k)!);
    return `/log?${q}`;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const serve = serveSize ? Number(serveSize) : null;
    if (basis === "serve" && !serve) return setError("Enter the serving size to use per-serve values.");
    if (!values.energy_kj) return setError(`Energy (${unitLabel(unit)}) is required.`);
    const factor = basis === "serve" && serve ? 100 / serve : 1;
    const per100: Nutrients = {};
    for (const [k, raw] of Object.entries(values) as [NutrientKey, string][]) {
      if (raw === undefined || raw.trim() === "") continue; // blank = no data
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return setError(`Check the value for ${NUTRIENTS.find((d) => d.key === k)!.label}.`);
      per100[k] = round((k === "energy_kj" ? fromUnit(n, unit) : n) * factor, 3);
    }
    const input = {
      name: name.trim(),
      brand: brand.trim() || null,
      barcode: barcode.replace(/\D/g, "") || null,
      serve_size_g: serve,
      serve_label: serveLabel.trim() || null,
    } as CustomFoodInput;
    // Explicit nulls so an edit can clear a value back to "no data".
    for (const d of NUTRIENTS) (input as Record<string, unknown>)[d.key] = per100[d.key] ?? null;

    setBusy(true);
    try {
      const food = await saveCustomFood(input, editId ?? undefined);
      router.replace(`${back()}&food=custom:${food.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  const field = (key: NutrientKey) => {
    const d = NUTRIENTS.find((n) => n.key === key)!;
    return (
      <label key={key} className="flex items-center justify-between gap-3 px-4 py-2">
        <span className={cx("text-sm", !d.macro && !PANEL_KEYS.includes(key) && "text-muted")}>
          {d.label}
          <span className="text-muted"> ({key === "energy_kj" ? unitLabel(unit) : d.unit})</span>
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={values[key] ?? ""}
          placeholder="no data"
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          className="tabular border-border bg-surface placeholder:text-muted/60 focus:border-accent h-10 w-28 rounded-lg border px-2 text-right outline-none"
        />
      </label>
    );
  };

  return (
    <>
      <PageHeader
        left={
          <button onClick={() => router.back()} className="-ml-2 rounded-full p-2" aria-label="Back">
            <IconChevronLeft />
          </button>
        }
        title={editId ? "Edit food" : "Create food"}
      />
      <form onSubmit={submit} className="space-y-4 px-4">
        {profile.ai_enabled && (
          <label className="bg-accent-soft text-accent flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl font-medium">
            {reading ? "Reading panel…" : "📷 Photograph the nutrition panel"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={reading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readPanel(f);
              }}
            />
          </label>
        )}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <Input label="Barcode (optional)" inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Serving size (g or mL)"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={serveSize}
            onChange={(e) => setServeSize(e.target.value)}
          />
          <Input
            label="Serving name (optional)"
            placeholder="e.g. 1 bar"
            value={serveLabel}
            onChange={(e) => setServeLabel(e.target.value)}
          />
        </div>

        <Card>
          <div className="border-border flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold">Nutrition information</span>
            <div className="bg-surface-2 flex rounded-lg p-0.5 text-xs">
              {(["100g", "serve"] as Basis[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBasis(b)}
                  className={cx("rounded-md px-2 py-1", basis === b && "bg-surface shadow-sm")}
                >
                  {b === "100g" ? "Per 100 g" : "Per serve"}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-border divide-y">{PANEL_KEYS.map(field)}</div>
          {more ? (
            <div className="divide-border border-border divide-y border-t">
              {NUTRIENTS.filter((d) => !PANEL_KEYS.includes(d.key)).map((d) => field(d.key))}
            </div>
          ) : (
            <button
              type="button"
              className="border-border text-accent w-full border-t px-4 py-3 text-left text-sm"
              onClick={() => setMore(true)}
            >
              + Fibre, vitamins and minerals
            </button>
          )}
        </Card>
        <p className="text-muted text-xs">Leave anything not on the label blank — it&apos;s stored as &quot;no data&quot;, not zero.</p>

        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save food"}
        </Button>
        {editId && (
          <Button
            type="button"
            variant="secondary"
            className="text-danger w-full"
            onClick={async () => {
              if (!confirm("Delete this food? Past log entries keep their values.")) return;
              await deleteCustomFood(editId);
              router.replace(back());
            }}
          >
            Delete food
          </Button>
        )}
      </form>
    </>
  );
}
