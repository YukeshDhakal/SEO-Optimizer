import { currentUser } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../lib/organization";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Create your organization",
};

// Not inside the (authenticated) route group on purpose: that layout
// redirects here for users with no organization, so this page can't also
// live behind the same "must already have an org" gate — it does its own
// auth check instead.
const OnboardingPage = async () => {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const organization = await getCurrentOrganization();

  if (organization) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <OnboardingForm />
    </div>
  );
};

export default OnboardingPage;
