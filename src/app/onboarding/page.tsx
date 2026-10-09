import { AppProvider } from "@/components/app-provider";
import { OnboardingForm } from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <AppProvider requireProfile={false}>
      <OnboardingForm />
    </AppProvider>
  );
}
