import { Suspense } from "react";
import { LogView } from "./log-view";

export default function LogPage() {
  return (
    <Suspense>
      <LogView />
    </Suspense>
  );
}
