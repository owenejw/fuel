import { Suspense } from "react";
import { FoodForm } from "./food-form";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function NewFoodPage() {
  return (
    <Suspense>
      <FoodForm />
    </Suspense>
  );
}
