import { currentUser } from "@repo/auth/server";
import { SidebarProvider } from "@repo/design-system/components/ui/sidebar";
import { showBetaFeature } from "@repo/feature-flags";
import { secure } from "@repo/security";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { env } from "@/env";
import { getCurrentOrganization } from "../lib/organization";
import { NotificationsProvider } from "./components/notifications-provider";
import { GlobalSidebar } from "./components/sidebar";

interface AppLayoutProperties {
  readonly children: ReactNode;
}

const AppLayout = async ({ children }: AppLayoutProperties) => {
  if (env.ARCJET_KEY) {
    await secure(["CATEGORY:PREVIEW"]);
  }

  const user = await currentUser();

  if (!user) {
    const requestHeaders = await headers();
    const pathname = requestHeaders.get("x-pathname") ?? "/";
    const search = requestHeaders.get("x-search") ?? "";
    const next = pathname.startsWith("/") ? `${pathname}${search}` : "/";
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const betaFeature = await showBetaFeature();

  return (
    <NotificationsProvider userId={user.id}>
      <SidebarProvider>
        <GlobalSidebar organization={organization}>
          {betaFeature && (
            <div className="m-4 rounded-full bg-status-info-bg p-1.5 text-center text-sm text-status-info-fg">
              Beta feature now available
            </div>
          )}
          {children}
        </GlobalSidebar>
      </SidebarProvider>
    </NotificationsProvider>
  );
};

export default AppLayout;
