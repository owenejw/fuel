import { AppProvider } from "@/components/app-provider";
import { OnboardingForm } from "./onboarding-form";

// Rendered on the client from the device's chosen profile; nothing to prerender.
export const instant = false;

export default function OnboardingPage() {
  return (
    <AppProvider>
      <OnboardingForm />
    </AppProvider>
  );
}
