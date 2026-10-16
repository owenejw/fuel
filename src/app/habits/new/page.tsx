import { Suspense } from "react";
import { HabitForm } from "../habit-form";

export const instant = false;

export default function NewHabitPage() {
  return (
    <Suspense>
      <HabitForm />
    </Suspense>
  );
}
