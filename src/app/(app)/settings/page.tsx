import { SettingsView } from "./settings-view";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function SettingsPage() {
  return <SettingsView />;
}
