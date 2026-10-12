import { Suspense } from "react";
import { NutritionView } from "./nutrition-view";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function NutritionPage() {
  return (
    <Suspense>
      <NutritionView />
    </Suspense>
  );
}
