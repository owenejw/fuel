import { Suspense } from "react";
import { RecipeBuilder } from "./recipe-builder";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function RecipePage() {
  return (
    <Suspense>
      <RecipeBuilder />
    </Suspense>
  );
}
