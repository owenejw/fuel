import type { EnergyUnit } from "./energy";
import type { Nutrients } from "./nutrients";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
  pre_workout: "Pre-workout",
  post_workout: "Post-workout",
};

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very" | "extra";
export type GoalType = "cut" | "maintain" | "recomp" | "bulk";
export type FoodSource = "off" | "afcd" | "usda";
export type LogKind = "reference" | "custom" | "recipe" | "quick";

export type Profile = {
  id: string;
  name: string;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  activity_level: ActivityLevel;
  goal: GoalType;
  energy_unit: EnergyUnit;
  training_days_per_week: number;
  ai_enabled: boolean;
  calendar_ics_url: string | null;
  calendar_keywords: string;
  calendar_synced_at: string | null;
  remind_log_time: string | null;
  remind_workouts: boolean;
};

export type ProfileSettings = Omit<Profile, "id" | "calendar_synced_at">;

/** A food as presented to the UI, regardless of where it came from. */
export type Food = {
  kind: "reference" | "custom" | "recipe";
  id: string;
  /** "history" = rebuilt from a previous log entry. */
  source: FoodSource | "custom" | "recipe" | "history";
  name: string;
  brand: string | null;
  barcode: string | null;
  serve_size_g: number | null;
  serve_label: string | null;
  per100: Nutrients;
};

export type LogEntry = {
  id: string;
  date: string;
  time: string;
  slot: MealSlot;
  kind: LogKind;
  reference_food_id: string | null;
  custom_food_id: string | null;
  recipe_id: string | null;
  name: string;
  grams: number | null;
  nutrients: Nutrients;
  created_at?: string;
};

export type SavedMealItem = {
  kind: LogKind;
  food_id: string | null;
  name: string;
  grams: number | null;
  /** Nutrients for `grams` at the time the meal was saved. */
  nutrients: Nutrients;
};

export type SavedMeal = {
  id: string;
  name: string;
  items: SavedMealItem[];
  created_at: string;
};

export type Goal = {
  id: string;
  effective_date: string;
  training_kj: number;
  training_protein_g: number;
  training_carbs_g: number;
  training_fat_g: number;
  training_fibre_g: number;
  rest_kj: number;
  rest_protein_g: number;
  rest_carbs_g: number;
  rest_fat_g: number;
  rest_fibre_g: number;
};

export type DayTargets = {
  energy_kj: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
};

export const WORKOUT_TYPES = ["soccer", "run", "long_run", "gym", "rest"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];
export const WORKOUT_LABELS: Record<WorkoutType, string> = {
  soccer: "Soccer",
  run: "Run",
  long_run: "Long run",
  gym: "Gym",
  rest: "Rest",
};
export type Intensity = "easy" | "moderate" | "hard";

export type Workout = {
  id: string;
  date: string;
  start_time: string | null;
  duration_min: number | null;
  type: WorkoutType;
  intensity: Intensity;
  is_race: boolean;
  completed: boolean;
  title: string | null;
  source: "manual" | "calendar" | "healthkit";
};

export type WorkoutInput = Omit<Workout, "id" | "source">;

export type DayType = "training" | "rest";

export type Recipe = {
  id: string;
  name: string;
  servings: number;
  total_grams: number;
  ingredients: SavedMealItem[];
  nutrients: Nutrients;
};
