import { Suspense } from "react";
import { MicrosView } from "./micros-view";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function MicrosPage() {
  return (
    <Suspense>
      <MicrosView />
    </Suspense>
  );
}
