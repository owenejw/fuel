import { PlanView } from "./plan-view";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function PlanPage() {
  return <PlanView />;
}
