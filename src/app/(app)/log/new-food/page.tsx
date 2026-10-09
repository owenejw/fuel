import { Suspense } from "react";
import { FoodForm } from "./food-form";

export default function NewFoodPage() {
  return (
    <Suspense>
      <FoodForm />
    </Suspense>
  );
}
