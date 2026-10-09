import { Suspense } from "react";
import { LogView } from "./log-view";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function LogPage() {
  return (
    <Suspense>
      <LogView />
    </Suspense>
  );
}
