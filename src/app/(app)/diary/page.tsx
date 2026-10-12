import { Suspense } from "react";
import { DiaryView } from "./diary-view";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function DiaryPage() {
  return (
    <Suspense>
      <DiaryView />
    </Suspense>
  );
}
