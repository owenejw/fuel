import { Suspense } from "react";
import { PhotoLog } from "../photo/photo-log";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function PhotoLogPage() {
  return (
    <Suspense>
      <PhotoLog mode="text" />
    </Suspense>
  );
}
