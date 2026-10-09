import { Suspense } from "react";
import { TodayView } from "./today-view";

export default function TodayPage() {
  return (
    <Suspense>
      <TodayView />
    </Suspense>
  );
}
