"use client";

import { ChoiceCards, Input, Pills, Segmented, Stepper } from "./ui";
import { ACTIVITY_ICONS, GOAL_ICONS, IconFemale, IconMale } from "./icons";
import type { ActivityLevel, GoalType, Profile, Sex } from "@/lib/types";
import type { EnergyUnit } from "@/lib/energy";

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: "sedentary", label: "Sedentary", hint: "Desk job, little exercise" },
  { value: "light", label: "Lightly active", hint: "Exercise 1–3 days a week" },
  { value: "moderate", label: "Moderately active", hint: "Exercise 3–5 days a week" },
  { value: "very", label: "Very active", hint: "Hard exercise 6–7 days a week" },
  { value: "extra", label: "Extra active", hint: "Physical job plus training" },
];

export const GOAL_OPTIONS: { value: GoalType; label: string; hint: string }[] = [
  { value: "cut", label: "Cut", hint: "Lose fat" },
  { value: "maintain", label: "Maintain", hint: "Stay where you are" },
  { value: "recomp", label: "Recomp", hint: "Lose fat, gain muscle" },
  { value: "bulk", label: "Bulk", hint: "Gain muscle" },
];

export type ProfileDraft = Pick<
  Profile,
  "name" | "sex" | "birth_date" | "height_cm" | "activity_level" | "goal" | "energy_unit" | "training_days_per_week"
>;

type Field = "name" | "sex" | "birth_date" | "height_cm" | "goal" | "activity_level" | "training_days_per_week" | "energy_unit";
const ALL: Field[] = ["name", "sex", "birth_date", "height_cm", "goal", "activity_level", "training_days_per_week", "energy_unit"];

export function ProfileFields({
  value,
  onChange,
  fields = ALL,
}: {
  value: ProfileDraft;
  onChange: (p: ProfileDraft) => void;
  /** Show only these fields (Settings splits them across pages). */
  fields?: Field[];
}) {
  const show = (f: Field) => fields.includes(f);
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-5">
      {show("name") && <Input label="Name" value={value.name} onChange={(e) => set("name", e.target.value)} autoComplete="given-name" />}
      {show("sex") && (
        <Segmented<Sex | null>
          label="Sex (for energy and nutrient targets)"
          value={value.sex}
          onChange={(v) => set("sex", v)}
          options={[
            { value: "female", label: "Female", icon: IconFemale },
            { value: "male", label: "Male", icon: IconMale },
          ]}
        />
      )}
      {(show("birth_date") || show("height_cm")) && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date of birth"
            type="date"
            value={value.birth_date ?? ""}
            onChange={(e) => set("birth_date", e.target.value || null)}
          />
          <Stepper label="Height" unit="cm" min={50} max={272} start={170} value={value.height_cm} onChange={(v) => set("height_cm", v)} />
        </div>
      )}
      {show("goal") && (
        <ChoiceCards
          label="Goal"
          columns={2}
          value={value.goal}
          onChange={(v) => set("goal", v)}
          options={GOAL_OPTIONS.map((o) => ({ ...o, icon: GOAL_ICONS[o.value] }))}
        />
      )}
      {show("activity_level") && (
        <ChoiceCards
          label="Activity outside training"
          value={value.activity_level}
          onChange={(v) => set("activity_level", v)}
          options={ACTIVITY_OPTIONS.map((o) => ({ ...o, icon: ACTIVITY_ICONS[o.value] }))}
        />
      )}
      {show("training_days_per_week") && (
        <Pills
          label="Training days per week"
          value={value.training_days_per_week}
          onChange={(v) => set("training_days_per_week", v)}
          options={[0, 1, 2, 3, 4, 5, 6, 7] as const}
        />
      )}
      {show("energy_unit") && (
        <Segmented<EnergyUnit>
          label="Show energy in"
          value={value.energy_unit}
          onChange={(v) => set("energy_unit", v)}
          options={[
            { value: "kj", label: "Kilojoules (kJ)" },
            { value: "kcal", label: "Calories (kcal)" },
          ]}
        />
      )}
    </div>
  );
}
