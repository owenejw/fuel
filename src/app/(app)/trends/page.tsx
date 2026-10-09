import { TrendsView } from "./trends-view";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function TrendsPage() {
  return <TrendsView />;
}
