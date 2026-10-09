"use client";

import { Input, Select } from "./ui";
import type { ActivityLevel, GoalType, Profile, Sex } from "@/lib/types";
import type { EnergyUnit } from "@/lib/energy";

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary (desk job, little exercise)" },
  { value: "light", label: "Light (exercise 1–3 days/week)" },
  { value: "moderate", label: "Moderate (exercise 3–5 days/week)" },
  { value: "very", label: "Very active (hard exercise 6–7 days/week)" },
  { value: "extra", label: "Extra active (physical job + training)" },
];

export const GOAL_OPTIONS: { value: GoalType; label: string }[] = [
  { value: "cut", label: "Cut — lose fat" },
  { value: "maintain", label: "Maintain" },
  { value: "recomp", label: "Recomp — lose fat, gain muscle" },
  { value: "bulk", label: "Bulk — gain muscle" },
];

export type ProfileDraft = Omit<Profile, "user_id">;

export function ProfileFields({ value, onChange }: { value: ProfileDraft; onChange: (p: ProfileDraft) => void }) {
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <Input label="Name" value={value.name} onChange={(e) => set("name", e.target.value)} autoComplete="given-name" />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Sex"
          value={value.sex ?? ""}
          onChange={(v) => set("sex", (v || null) as Sex | null)}
          options={[
            { value: "", label: "Select…" },
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
          ]}
        />
        <Input
          label="Date of birth"
          type="date"
          value={value.birth_date ?? ""}
          onChange={(e) => set("birth_date", e.target.value || null)}
        />
      </div>
      <Input
        label="Height (cm)"
        type="number"
        inputMode="decimal"
        min={50}
        max={272}
        value={value.height_cm ?? ""}
        onChange={(e) => set("height_cm", e.target.value ? Number(e.target.value) : null)}
      />
      <Select
        label="Activity level"
        value={value.activity_level}
        onChange={(v) => set("activity_level", v as ActivityLevel)}
        options={ACTIVITY_OPTIONS}
      />
      <Select label="Goal" value={value.goal} onChange={(v) => set("goal", v as GoalType)} options={GOAL_OPTIONS} />
      <Select
        label="Energy unit"
        value={value.energy_unit}
        onChange={(v) => set("energy_unit", v as EnergyUnit)}
        options={[
          { value: "kj", label: "Kilojoules (kJ)" },
          { value: "kcal", label: "Calories (kcal)" },
        ]}
      />
    </div>
  );
}
