import { createClient, currentUser } from "@repo/auth/server";
import { SidebarProvider } from "@repo/design-system/components/ui/sidebar";
import { showBetaFeature } from "@repo/feature-flags";
import { secure } from "@repo/security";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { env } from "@/env";
import { getCurrentOrganization } from "../lib/organization";
import { GlobalSidebar } from "./components/sidebar";
import { NotificationsProvider } from "./components/notifications-provider";
import { StatusBar } from "./components/status-bar";

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
  const canManage =
    organization.role === "owner" || organization.role === "admin";

  // One extra round trip beyond what each page already fetches for
  // itself, so the persistent status bar (every screen) and the
  // sidebar's site list (every screen) have real data instead of being
  // per-page concerns. tenant_settings/site_connections RLS already
  // scopes both to this organization.
  const supabase = await createClient();
  const [{ data: settings }, { data: sites }, { count: runningCount }, { count: awaitingCount }] =
    await Promise.all([
      supabase
        .from("tenant_settings")
        .select("paused, require_approval")
        .eq("organization_id", organization.id)
        .maybeSingle(),
      supabase
        .from("site_connections")
        .select("id, display_name, status, paused, consecutive_publish_failures")
        .eq("organization_id", organization.id)
        .order("display_name", { ascending: true }),
      supabase
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "running")
        .neq("current_step", "approval_gate"),
      supabase
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "running")
        .eq("current_step", "approval_gate"),
    ]);

  return (
    <NotificationsProvider userId={user.id}>
      <SidebarProvider>
        <GlobalSidebar
          organization={organization}
          requireApproval={settings?.require_approval ?? false}
          sites={sites ?? []}
        >
          <StatusBar
            awaitingApprovalCount={awaitingCount ?? 0}
            canManage={canManage}
            organizationId={organization.id}
            paused={settings?.paused ?? false}
            requireApproval={settings?.require_approval ?? false}
            runningCount={runningCount ?? 0}
          />
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
