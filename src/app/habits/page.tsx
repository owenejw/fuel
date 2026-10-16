import { Suspense } from "react";
import { HabitsTodayView } from "./today-view";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function HabitsTodayPage() {
  return (
    <Suspense>
      <HabitsTodayView />
    </Suspense>
  );
}
