"use client";

import { UserMenu } from "@repo/auth/components/user-menu";
import type { Tables } from "@repo/database";
import { StatusDot } from "@repo/design-system/components/status-pill";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/design-system/components/ui/sidebar";
import { cn } from "@repo/design-system/lib/utils";
import {
  CreditCardIcon,
  GlobeIcon,
  KeyIcon,
  LayoutGridIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  ShieldIcon,
  TagIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface SidebarSite {
  readonly consecutive_publish_failures: number;
  readonly display_name: string;
  readonly id: string;
  readonly paused: boolean;
  readonly status: string;
}

interface GlobalSidebarProperties {
  readonly children: ReactNode;
  readonly organization: Tables<"organizations">;
  readonly requireApproval: boolean;
  readonly sites: SidebarSite[];
}

const siteDotStatus = (site: SidebarSite) => {
  if (site.paused) {
    return "paused" as const;
  }
  if (site.status === "error" || site.consecutive_publish_failures >= 3) {
    return "failed" as const;
  }
  if (site.status === "connected") {
    return "ok" as const;
  }
  return "await" as const;
};

// Peach sidebar shell (--sidebar/-foreground/-accent/-border tokens in
// packages/design-system/styles/globals.css now carry the neobrutalism
// handoff's own palette). Nav matches the handoff's Workspace group
// (Runs/Sites/Topics/Quality gates) plus Guardrails, Billing, Audit log,
// and API keys as first-class items - the handoff's own top nav bar
// (which is where its "Guardrails" link lives) doesn't exist in this
// app's real architecture, so all four live here in the sidebar instead
// of nested under a Guardrails-only sub-tab-row. Webhooks (a next-forge
// Svix demo, unconfigured per PRD.md §5) stays dropped.
export const GlobalSidebar = ({
  children,
  organization,
  sites,
  requireApproval,
}: GlobalSidebarProperties) => {
  const pathname = usePathname();
  const initials = organization.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const navItems = [
    { key: "runs", label: "Runs", href: "/", icon: LayoutGridIcon },
    { key: "sites", label: "Sites", href: "/sites", icon: GlobeIcon },
    { key: "topics", label: "Topics", href: "/topics", icon: TagIcon },
    {
      key: "quality-gates",
      label: "Quality gates",
      href: "/quality-gates",
      icon: ShieldCheckIcon,
    },
    {
      key: "settings",
      label: "Guardrails",
      href: "/guardrails",
      icon: ShieldIcon,
      badge: requireApproval ? null : "off",
    },
    {
      key: "billing",
      label: "Billing",
      href: "/guardrails/billing",
      icon: CreditCardIcon,
    },
    {
      key: "audit",
      label: "Audit log",
      href: "/guardrails/audit",
      icon: ScrollTextIcon,
    },
    {
      key: "api-keys",
      label: "API keys",
      href: "/guardrails/api-keys",
      icon: KeyIcon,
    },
  ];

  // "/guardrails" is a prefix of its three siblings below, so it needs an
  // exact match now that they're separate Workspace items rather than
  // sub-pages nested under it - without this, opening Billing would light
  // up both "Guardrails" and "Billing" at once.
  const EXACT_MATCH_ROUTES = new Set(["/", "/guardrails"]);
  const isActive = (href: string) =>
    EXACT_MATCH_ROUTES.has(href)
      ? pathname === href
      : pathname.startsWith(href);
  const onSitePage = pathname.startsWith("/sites/") && pathname !== "/sites";

  return (
    <>
      <Sidebar variant="inset">
        <SidebarHeader className="gap-0 border-sidebar-border border-b-[3px] px-3 py-3.5">
          <div className="flex items-center gap-2.5 border-[3px] border-sidebar-border bg-card px-2.5 py-2">
            <div className="flex size-7 shrink-0 items-center justify-center border-2 border-sidebar-border bg-sidebar-primary font-display text-[10.5px] text-sidebar-primary-foreground">
              {initials}
            </div>
            <span className="truncate font-bold text-[13px] text-sidebar-foreground">
              {organization.name}
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-0 px-2 py-3">
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-2.5 font-mono text-[10px] text-sidebar-foreground/45 uppercase tracking-widest">
              Workspace
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "rounded-none border-2 border-transparent font-bold text-sidebar-foreground/70 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      isActive(item.href) &&
                        "border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground"
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge && (
                    <SidebarMenuBadge className="rounded-none border-2 border-sidebar-border bg-status-warning-bg font-bold text-[10px] text-status-warning-fg">
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup className="mt-3 p-0">
            <SidebarGroupLabel className="px-2.5 font-mono text-[10px] text-sidebar-foreground/45 uppercase tracking-widest">
              Sites
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {sites.length === 0 && (
                <p className="px-2.5 py-1.5 text-[12px] text-sidebar-foreground/45">
                  No sites yet
                </p>
              )}
              {sites.map((site) => (
                <SidebarMenuItem key={site.id}>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "gap-2.5 rounded-none border-2 border-transparent font-semibold text-sidebar-foreground/70 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      onSitePage &&
                        pathname.startsWith(`/sites/${site.id}`) &&
                        "border-sidebar-border bg-sidebar-accent text-sidebar-foreground"
                    )}
                    size="sm"
                  >
                    <Link href={`/sites/${site.id}`}>
                      <StatusDot status={siteDotStatus(site)} />
                      <span className="truncate">{site.display_name}</span>
                    </Link>
                  </SidebarMenuButton>
                  {site.paused && site.consecutive_publish_failures >= 3 && (
                    <SidebarMenuBadge className="font-bold text-[10px] text-status-error-fg">
                      ✕
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-2 border-sidebar-border border-t-[3px] px-3 py-3">
          <div className="min-w-0 text-sidebar-foreground/70 text-xs [&_button:hover]:text-sidebar-foreground [&_button]:text-sidebar-foreground/50 [&_span]:text-sidebar-foreground/85">
            <UserMenu />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </>
  );
};
