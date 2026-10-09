import { Suspense } from "react";
import { TodayView } from "./today-view";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function TodayPage() {
  return (
    <Suspense>
      <TodayView />
    </Suspense>
  );
}
